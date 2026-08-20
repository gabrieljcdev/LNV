import { useState, useEffect, useRef, useCallback } from 'react';
import { useLayout } from '../context/LayoutContext';
import { usePlayer } from '../context/PlayerContext';

export default function OrangePlayer() {
  const { currentTrack, setCurrentTrack, scrollToPost } = useLayout();
  const { loadTrack, togglePlay, isPlaying, progress, seek } = usePlayer();

  const [visible, setVisible]   = useState(false);
  const [pos, setPos]           = useState({ x: null, y: null });
  const [dragging, setDragging] = useState(false);
  const dragStart               = useRef({ x: 0, y: 0 });
  const hideTimer               = useRef(null);
  const waveRef                 = useRef(null);
  const waveFrame               = useRef(0);
  const waveHeights             = [6,10,18,12,22,26,18,14,22,28,20,14,12,18,24,16,10,14,20,26,18,12];

  // Show player and load track when currentTrack changes
useEffect(() => {
  if (currentTrack) {
    clearTimeout(hideTimer.current);
    setVisible(true);
    loadTrack({
      title:      currentTrack.title,
      youtubeUrl: currentTrack.youtubeUrl,
      duration:   500,
    });
  }
// eslint-disable-next-line react-hooks/exhaustive-deps
}, [currentTrack]);

  // Hide player 3.5s after music stops
  useEffect(() => {
    if (!isPlaying && visible && currentTrack) {
      hideTimer.current = setTimeout(() => setVisible(false), 3500);
    } else {
      clearTimeout(hideTimer.current);
    }
    return () => clearTimeout(hideTimer.current);
  }, [isPlaying, visible]);

  // Animate waveform
  useEffect(() => {
    if (!isPlaying) return;
    const iv = setInterval(() => {
      waveFrame.current++;
      const bars = waveRef.current?.querySelectorAll('.wbar');
      bars?.forEach((b, i) => {
        const h = waveHeights[(i + waveFrame.current) % waveHeights.length];
        b.style.height  = h + 'px';
        b.style.opacity = 0.3 + (h / 28) * 0.7;
      });
    }, 110);
    return () => clearInterval(iv);
  }, [isPlaying]);

  // Drag
  const onMouseDown = useCallback((e) => {
    if (e.target.closest('button') || e.target.closest('.pl-prog')) return;
    setDragging(true);
    dragStart.current = {
      x: e.clientX - (pos.x ?? window.innerWidth - 260),
      y: e.clientY - (pos.y ?? window.innerHeight - 740),
    };
    e.preventDefault();
  }, [pos]);

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e) => setPos({
      x: Math.max(0, Math.min(e.clientX - dragStart.current.x, window.innerWidth  - 240)),
      y: Math.max(0, Math.min(e.clientY - dragStart.current.y, window.innerHeight - 240)),
    });
    const onUp = () => setDragging(false);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [dragging]);

  function close() {
    clearTimeout(hideTimer.current);
    setVisible(false);
    setCurrentTrack(null);
    if (isPlaying) togglePlay();
  }

 if (!currentTrack && !visible) return null;

  const style = {
    position:     'fixed',
    width:        '240px',
    height:       '240px',
    background:   'var(--orange)',
    zIndex:       200,
    borderRadius: '4px',
    cursor:       dragging ? 'grabbing' : 'grab',
    userSelect:   'none',
    transform:    visible ? 'translateY(0)' : 'translateY(280px)',
    opacity:      visible ? 1 : 0,
    transition:   dragging ? 'none' : 'transform 0.45s cubic-bezier(0.34,1.3,0.64,1), opacity 0.3s ease',
    ...(pos.x !== null
      ? { left: pos.x, top: pos.y, right: 'auto', bottom: 'auto' }
      : { right: '20px', bottom: '20px' }),
  };

  return (
    <div style={style} onMouseDown={onMouseDown}>
      <div style={{ padding:'14px', display:'flex', flexDirection:'column', height:'100%', position:'relative' }}>

        {/* Close */}
        <button
          onClick={close}
          style={{ position:'absolute', top:'8px', right:'8px', width:'20px', height:'20px', background:'rgba(0,0,0,0.2)', border:'none', cursor:'pointer', color:'rgba(255,255,255,0.7)', fontSize:'11px', display:'flex', alignItems:'center', justifyContent:'center', borderRadius:'2px' }}
        >
          ×
        </button>

        {/* Art */}
        <div style={{ width:'46px', height:'46px', background:'rgba(0,0,0,0.2)', borderRadius:'3px', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'18px', color:'rgba(255,255,255,0.35)', marginBottom:'10px', flexShrink:0 }}>
          {currentTrack.albumArt
            ? <img src={currentTrack.albumArt} style={{ width:'100%', height:'100%', objectFit:'cover', borderRadius:'3px' }} />
            : '◈'}
        </div>

        {/* Title — clickable to scroll to post */}
        <div
          onClick={() => currentTrack.postId && scrollToPost(currentTrack.postId)}
          style={{
            fontSize:'14px', fontWeight:900, color:'#fff', lineHeight:1.1,
            marginBottom:'2px', letterSpacing:'-0.5px',
            whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis',
            cursor: currentTrack.postId ? 'pointer' : 'default',
            textDecoration: currentTrack.postId ? 'underline' : 'none',
            textDecorationColor:'rgba(255,255,255,0.4)',
          }}
        >
          {currentTrack.title}
        </div>

        {/* Artist */}
        <div style={{ fontFamily:'VT323,monospace', fontSize:'11px', color:'rgba(255,255,255,0.55)', letterSpacing:'1px', marginBottom:'10px', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
          {currentTrack.artist}
        </div>

        {/* Waveform */}
        <div ref={waveRef} style={{ display:'flex', alignItems:'center', gap:'2px', height:'28px', marginBottom:'8px' }}>
          {waveHeights.map((h, i) => (
            <div key={i} className="wbar" style={{ width:'3px', height:h+'px', background:'rgba(255,255,255,0.45)', borderRadius:'2px', transition:'height 0.1s, opacity 0.1s' }} />
          ))}
        </div>

        {/* Progress — uses real progress from PlayerContext */}
        <div
          className="pl-prog"
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            seek(((e.clientX - r.left) / r.width) * 100);
          }}
          style={{ height:'3px', background:'rgba(0,0,0,0.2)', borderRadius:'2px', marginBottom:'10px', cursor:'pointer' }}
        >
          <div style={{ height:'100%', width: progress + '%', background:'#fff', borderRadius:'2px', transition:'width 0.5s linear' }} />
        </div>

        {/* Controls — uses togglePlay from PlayerContext */}
        <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
          <button style={{ background:'none', border:'none', color:'rgba(255,255,255,0.5)', cursor:'pointer', fontSize:'13px', fontFamily:'VT323,monospace' }}>⟨⟨</button>
          <button
            onClick={togglePlay}
            style={{ width:'32px', height:'32px', borderRadius:'50%', background:'#fff', border:'none', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'11px', color:'var(--orange)', fontWeight:900 }}
          >
            {isPlaying ? '▐▐' : '▶'}
          </button>
          <button style={{ background:'none', border:'none', color:'rgba(255,255,255,0.5)', cursor:'pointer', fontSize:'13px', fontFamily:'VT323,monospace' }}>⟩⟩</button>
        </div>

      </div>
    </div>
  );
}
