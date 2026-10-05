import { useState, useRef, useEffect } from 'react';
import { PlayerContext } from './usePlayer';

// Runs `create` once YouTube's player script is ready (now, or when it
// calls back).
function whenYouTubeReady(create) {
  if (window.YT && window.YT.Player) create();
  else window.onYouTubeIframeAPIReady = create;
}

export function PlayerProvider({ children }) {
  const [currentTrack, setCurrentTrack] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const playerRef = useRef(null);
  const intervalRef = useRef(null);

  // Load YouTube IFrame API once
  useEffect(() => {
    if (window.YT) return;
    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(tag);
  }, []);

  function initPlayer(videoId) {
    const create = () => {
      if (playerRef.current) {
        playerRef.current.loadVideoById(videoId);
        playerRef.current.playVideo();
        return;
      }
      playerRef.current = new window.YT.Player('yt-player', {
        height: '1',
        width: '1',
        videoId,
        playerVars: { autoplay: 1, controls: 0 },
        events: {
          onReady: (e) => { e.target.playVideo(); startTracking(); },
          onStateChange: (e) => {
            if (e.data === window.YT.PlayerState.PLAYING) {
              setIsPlaying(true);
              startTracking();
            }
            if (e.data === window.YT.PlayerState.PAUSED) {
              setIsPlaying(false);
            }
            if (e.data === window.YT.PlayerState.ENDED) {
              setIsPlaying(false);
              setProgress(0);
            }
          },
        },
      });
    };

    whenYouTubeReady(create);
  }

  function startTracking() {
    clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => {
      if (!playerRef.current) return;
      const cur = playerRef.current.getCurrentTime?.() || 0;
      const dur = playerRef.current.getDuration?.() || 0;
      if (dur > 0) {
        setProgress((cur / dur) * 100);
        setDuration(dur);
      }
    }, 500);
  }

  function loadTrack(track) {
    setCurrentTrack(track);
    setIsPlaying(true);
    setProgress(0);
    const videoId = extractVideoId(track.youtubeUrl);
    if (videoId) initPlayer(videoId);
  }

  function togglePlay() {
    if (!playerRef.current) return;
    if (isPlaying) {
      playerRef.current.pauseVideo();
    } else {
      playerRef.current.playVideo();
    }
    setIsPlaying(p => !p);
  }

  function seek(pct) {
    if (!playerRef.current || !duration) return;
    const seconds = (pct / 100) * duration;
    playerRef.current.seekTo(seconds, true);
    setProgress(pct);
  }

  function extractVideoId(url) {
    if (!url) return null;
    const match = url.match(/(?:v=|youtu\.be\/)([^&\s]+)/);
    return match ? match[1] : null;
  }

  return (
    <PlayerContext.Provider value={{
      currentTrack, isPlaying, progress, duration,
      loadTrack, togglePlay, seek, setProgress,
    }}>
      {children}
      {/* Hidden YouTube player div — must be in the DOM */}
      <div id="yt-player" style={{ position: 'fixed', bottom: 0, left: '-9999px', width: 1, height: 1 }} />
    </PlayerContext.Provider>
  );
}
