import { useState, useRef, useEffect } from 'react'
import { usePlayer } from '../context/PlayerContext'
// ─── Helpers ────────────────────────────────────────────────────────────────

function timeAgo(dateStr) {
  if (!dateStr) return ''
  const diff = (Date.now() - new Date(dateStr)) / 1000
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`
  return `${Math.floor(diff / 86400)}d`
}

function cleanBody(text) {
  if (!text) return ''
  return text.replace(/https?:\/\/\S+/g, '').trim()
}

function detectPostType(post) {
  if (post.post_type) return post.post_type
  const fmt = (post.format || '').toLowerCase()
  if (fmt.includes('video') || fmt.includes('mix') || post.youtube_url?.includes('youtu')) {
    if (post.is_live_mix || fmt.includes('mix')) return 'livemix'
    return 'livemix'
  }
  if (fmt.includes('single') || fmt.includes('7"') || fmt.includes('12"') || fmt.includes('ep')) {
    const trackCount = post.tracks?.length || 0
    if (trackCount <= 4) return 'single'
  }
  return 'album'
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function CoverArt({ post, size = 'medium', onClick }) {
  const [err, setErr] = useState(false)
  const sizeMap = { small: 48, medium: 140, large: 200, full: '100%' }
  const dim = sizeMap[size] || sizeMap.medium
  const style = typeof dim === 'number'
    ? { width: dim, height: dim }
    : { width: '100%', aspectRatio: '1 / 1' }

  return (
    <div
      onClick={onClick}
      style={{
        ...style,
        borderRadius: 4,
        overflow: 'hidden',
        background: 'linear-gradient(135deg, #2a2d32 0%, #1e2126 100%)',
        position: 'relative',
        flexShrink: 0,
        cursor: onClick ? 'pointer' : 'default',
      }}
    >
      {post.cover_art && !err ? (
        <img
          src={post.cover_art}
          alt={post.album_title}
          onError={() => setErr(true)}
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        />
      ) : (
        <div style={{
          width: '100%', height: '100%', display: 'flex',
          alignItems: 'center', justifyContent: 'center',
          fontSize: typeof dim === 'number' ? dim * 0.35 : 32,
          color: 'rgba(255,255,255,0.15)', fontFamily: 'Barlow, sans-serif',
          userSelect: 'none',
        }}>◈</div>
      )}
      {post.year && (
        <div style={{
          position: 'absolute', bottom: 4, left: 4,
          background: 'rgba(0,0,0,0.72)', color: '#fff',
          fontFamily: 'VT323, monospace', fontSize: 11,
          padding: '1px 5px', borderRadius: 3,
        }}>{post.year}</div>
      )}
    </div>
  )
}

function TagPill({ label, variant = 'pastel' }) {
  const styles = {
    pastel: { background: '#c8daf0', color: '#2a2d32' },
    orange: { background: '#e85d04', color: '#fff' },
    dark: { background: '#1e2126', color: '#fff' },
    outlined: { border: '1.5px solid rgba(0,0,0,0.12)', background: 'transparent', color: '#6a7480' },
  }
  return (
    <span style={{
      ...styles[variant],
      borderRadius: 20, padding: '2px 10px',
      fontFamily: 'VT323, monospace', fontSize: 12,
      letterSpacing: '0.04em', flexShrink: 0,
    }}>{label}</span>
  )
}

function ActionRow({ post, onLike, onCrate, onPlay, watchLabel = 'PLAY', extraRight }) {
  const [liked, setLiked] = useState(false)
  const [cosigned, setCosigned] = useState(false)

  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginTop: 6 }}>
      <button
        onClick={() => { setLiked(l => !l); onLike?.() }}
        style={{
          ...pillBtn(liked ? 'dark' : 'outlined'),
          display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer',
        }}
      >
        <span>{liked ? '♥' : '♡'}</span>
        <span>{(post.likes || 0) + (liked ? 1 : 0)}</span>
      </button>
      <button
        onClick={() => setCosigned(c => !c)}
        style={{ ...pillBtn(cosigned ? 'pastel' : 'outlined'), cursor: 'pointer' }}
      >✦ CO-SIGN</button>
      <button
        onClick={() => onCrate?.()}
        style={{ ...pillBtn('outlined'), cursor: 'pointer' }}
      >+ CRATE</button>
      <button style={{ ...pillBtn('outlined'), cursor: 'pointer' }}>↗</button>
      {extraRight}
      <button
        onClick={() => onPlay?.()}
        style={{ ...pillBtn('orange'), cursor: 'pointer', marginLeft: 'auto' }}
      >▶ {watchLabel}</button>
    </div>
  )
}

function CommentInline({ comments = [] }) {
  const [comment, setComment] = useState('')
  const shown = comments.slice(-2)
  return (
    <div style={{ borderTop: '1px solid rgba(0,0,0,0.07)', paddingTop: 8, marginTop: 8 }}>
      {shown.map((c, i) => (
        <div key={i} style={{ marginBottom: 4, display: 'flex', gap: 6, alignItems: 'flex-start' }}>
          <span style={{ fontFamily: 'VT323, monospace', fontSize: 12, color: '#6a7480', flexShrink: 0 }}>
            @{c.username}
          </span>
          <span style={{ fontFamily: 'Barlow, sans-serif', fontSize: 12, color: '#3a3d42', lineHeight: 1.4 }}>
            {c.body}
          </span>
        </div>
      ))}
      <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
        <input
          value={comment}
          onChange={e => setComment(e.target.value)}
          placeholder="Add a comment…"
          style={{
            flex: 1, border: '1.5px solid rgba(0,0,0,0.10)', borderRadius: 20,
            padding: '4px 12px', fontFamily: 'Barlow, sans-serif', fontSize: 12,
            color: '#3a3d42', outline: 'none', background: '#fff',
          }}
        />
        <button style={{ ...pillBtn('dark'), fontSize: 11, cursor: 'pointer' }}>POST</button>
      </div>
      <button style={{
        marginTop: 6, background: 'none', border: 'none', cursor: 'pointer',
        fontFamily: 'VT323, monospace', fontSize: 12, color: '#6a7480', padding: 0,
      }}>
        OPEN FULL THREAD →
      </button>
    </div>
  )
}

// ─── Pill button style helper ────────────────────────────────────────────────

function pillBtn(variant = 'outlined') {
  const base = {
    borderRadius: 20, padding: '4px 12px',
    fontFamily: 'VT323, monospace', fontSize: 12,
    letterSpacing: '0.04em', border: 'none',
    lineHeight: 1.4,
  }
  const variants = {
    dark: { background: '#1e2126', color: '#fff' },
    orange: { background: '#e85d04', color: '#fff' },
    outlined: { border: '1.5px solid rgba(0,0,0,0.12)', background: 'transparent', color: '#6a7480' },
    pastel: { background: '#c8daf0', color: '#2a2d32' },
  }
  return { ...base, ...variants[variant] }
}

// ─── Card Header ─────────────────────────────────────────────────────────────

function CardHeader({ post, badge }) {
  return (
    <div style={{
      background: '#e8ecf0', borderBottom: '1px solid rgba(0,0,0,0.07)',
      padding: '5px 12px', display: 'flex', alignItems: 'center', gap: 8,
      flexShrink: 0,
    }}>
      {badge && <TagPill label={badge} variant="orange" />}
      <span style={{ fontFamily: 'VT323, monospace', fontSize: 12, color: '#6a7480' }}>
        #{String(post.id || '001').padStart(3, '0')}
      </span>
      {post.subject && (
        <span style={{
          fontFamily: 'Barlow, sans-serif', fontWeight: 700, fontSize: 12,
          color: '#3a3d42', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{post.subject}</span>
      )}
      <span style={{ fontFamily: 'VT323, monospace', fontSize: 12, color: '#6a7480', flexShrink: 0 }}>
        @{post.username} · {timeAgo(post.created_at)}
      </span>
    </div>
  )
}

// ─── Tracklist ────────────────────────────────────────────────────────────────

function Tracklist({ tracks = [], onPlay }) {
  if (!tracks.length) return null
  return (
    <div style={{ marginTop: 6 }}>
      {tracks.map((t, i) => (
        <div key={i} style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '2px 0', borderBottom: '1px solid rgba(0,0,0,0.04)',
        }}>
          <span style={{ fontFamily: 'VT323, monospace', fontSize: 11, color: '#6a7480', width: 24, flexShrink: 0 }}>
            {t.position || `${i + 1}`}
          </span>
          <span style={{ fontFamily: 'Barlow, sans-serif', fontSize: 12, color: '#3a3d42', flex: 1 }}>
            {t.title}
          </span>
          {t.youtube_url && (
            <button
              onClick={() => onPlay?.(t)}
              style={{ ...pillBtn('orange'), padding: '2px 8px', fontSize: 11, cursor: 'pointer' }}
            >▶ YT</button>
          )}
        </div>
      ))}
    </div>
  )
}

// ─── VIDEO EMBED ──────────────────────────────────────────────────────────────

function VideoEmbed({ post, isLive }) {
  const [playing, setPlaying] = useState(false)
  return (
    <div style={{
      width: '100%', aspectRatio: '16 / 9',
      background: '#1e2126', position: 'relative', overflow: 'hidden',
      borderRadius: 4,
    }}>
      {playing && post.youtube_url ? (
        <iframe
          src={`https://www.youtube.com/embed/${extractYTId(post.youtube_url)}?autoplay=1`}
          style={{ width: '100%', height: '100%', border: 'none' }}
          allow="autoplay; encrypted-media"
          title={post.title}
        />
      ) : (
        <>
          {post.cover_art && (
            <img src={post.cover_art} alt="" style={{
              width: '100%', height: '100%', objectFit: 'cover', opacity: 0.4,
            }} />
          )}
          <button
            onClick={() => setPlaying(true)}
            style={{
              position: 'absolute', top: '50%', left: '50%',
              transform: 'translate(-50%,-50%)',
              width: 52, height: 52, borderRadius: '50%',
              background: '#e85d04', border: 'none', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 20, color: '#fff',
            }}
          >▶</button>
          {post.duration && (
            <div style={{
              position: 'absolute', bottom: 6, right: 6,
              background: 'rgba(0,0,0,0.72)', color: '#fff',
              fontFamily: 'VT323, monospace', fontSize: 12, padding: '1px 6px', borderRadius: 3,
            }}>{post.duration}</div>
          )}
          {isLive && (
            <div style={{ position: 'absolute', top: 8, left: 8 }}>
              <TagPill label="LIVE SET" variant="orange" />
            </div>
          )}
          <div style={{
            position: 'absolute', bottom: 6, left: 6,
            fontFamily: 'VT323, monospace', fontSize: 11, color: 'rgba(255,255,255,0.5)',
          }}>YouTube</div>
        </>
      )}
    </div>
  )
}

function extractYTId(url) {
  if (!url) return ''
  const m = url.match(/(?:v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/)
  return m ? m[1] : ''
}

// ═══════════════════════════════════════════════════════════════════════════════
// CARD TYPES
// ═══════════════════════════════════════════════════════════════════════════════

// ─── ALBUM CARD ───────────────────────────────────────────────────────────────

function AlbumCard({ post, expanded, onExpand }) {
  const { loadTrack } = usePlayer() || {}
  const note = cleanBody(post.notes || post.body || '')
  const genres = post.genres || []

  return (
    <div style={cardShell(expanded, 'white')}>
      <CardHeader post={post} />
      <div style={{ padding: '10px 12px', flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {/* Cover */}
        <CoverArt
          post={post}
          size={expanded ? 'large' : 'medium'}
          onClick={onExpand}
        />
        {/* Artist / Label */}
        <div>
          <div style={{ fontFamily: 'Barlow, sans-serif', fontWeight: 700, fontSize: 13, color: '#3a3d42' }}>
            {post.artist_name || post.artist}
          </div>
          <div style={{ fontFamily: 'VT323, monospace', fontSize: 12, color: '#6a7480', marginTop: 1 }}>
            {post.label_name || post.label}
            {post.cat_no && ` · ${post.cat_no}`}
          </div>
        </div>
        {/* Tracklist (expanded only) */}
        {expanded && (
          <Tracklist
            tracks={post.tracks || []}
            onPlay={t => loadTrack?.({ title: t.title, youtubeUrl: t.youtube_url })}
          />
        )}
        {/* Note */}
        {note && (
          <div style={{
            fontFamily: 'Barlow, sans-serif', fontStyle: 'italic', fontSize: 12,
            color: '#3a3d42', background: '#f4f6f9',
            borderLeft: '3px solid #c8daf0', padding: '6px 10px', borderRadius: '0 4px 4px 0',
          }}>{note}</div>
        )}
        {/* Tags */}
        {genres.length > 0 && (
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {genres.map(g => <TagPill key={g} label={g} />)}
          </div>
        )}
        {/* Actions */}
        <ActionRow
          post={post}
          watchLabel="PLAY"
          onPlay={() => {
            const t = post.tracks?.[0]
            if (t) loadTrack?.({ title: t.title, youtubeUrl: t.youtube_url })
          }}
        />
        <CommentInline comments={post.comments} />
      </div>
    </div>
  )
}

// ─── SINGLE CARD ─────────────────────────────────────────────────────────────

function SingleCard({ post, expanded, onExpand }) {
 const { loadTrack } = usePlayer() || {}

  const note = cleanBody(post.notes || post.body || '')
  const genres = post.genres || []
  const trackTitle = post.tracks?.[0]?.title || post.title || post.album_title

  return (
    <div style={cardShell(expanded, 'white')}>
      <CardHeader post={post} />
      <div style={{ padding: '10px 12px', flex: 1, display: 'flex', flexDirection: 'column', gap: 8, overflow: 'hidden' }}>
        {/* Square art */}
        <div style={{ position: 'relative' }}>
          <CoverArt post={post} size="full" onClick={onExpand} />
          {/* Play button top-right */}
          <button
            onClick={() => {
              const t = post.tracks?.[0]
              if (t) loadTrack?.({ title: t.title, youtubeUrl: t.youtube_url })
            }}
            style={{
              position: 'absolute', top: 8, right: 8,
              width: 28, height: 28, borderRadius: '50%',
              background: '#e85d04', border: 'none', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 12, color: '#fff',
            }}
          >▶</button>
        </div>
        {/* Title + artist */}
        <div>
          <div style={{ fontFamily: 'Barlow, sans-serif', fontWeight: 900, fontSize: 13, color: '#3a3d42', lineHeight: 1.2 }}>
            {trackTitle}
          </div>
          <div style={{ fontFamily: 'VT323, monospace', fontSize: 12, color: '#6a7480', marginTop: 2 }}>
            {post.artist_name || post.artist}
          </div>
        </div>
        {note && (
          <div style={{
            fontFamily: 'Barlow, sans-serif', fontStyle: 'italic', fontSize: 12,
            color: '#3a3d42', background: '#f4f6f9',
            borderLeft: '3px solid #c8daf0', padding: '6px 10px', borderRadius: '0 4px 4px 0',
          }}>{note}</div>
        )}
        {genres.length > 0 && (
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {genres.map(g => <TagPill key={g} label={g} />)}
          </div>
        )}
        <ActionRow post={post} watchLabel="PLAY" onPlay={() => {
          const t = post.tracks?.[0]
          if (t) loadTrack?.({ title: t.title, youtubeUrl: t.youtube_url })
        }} />
        <CommentInline comments={post.comments} />
      </div>
    </div>
  )
}

// ─── LIVE MIX CARD ───────────────────────────────────────────────────────────

function LiveMixCard({ post, expanded, onExpand }) {
  const note = cleanBody(post.notes || post.body || '')
  const genres = post.genres || []

  return (
    <div style={cardShell(expanded, 'white')}>
      <CardHeader post={post} />
      <div style={{ padding: '10px 12px', flex: 1, display: 'flex', flexDirection: 'column', gap: 8, overflow: 'hidden' }}>
        <VideoEmbed post={post} isLive={true} />
        <div>
          <div style={{ fontFamily: 'Barlow, sans-serif', fontWeight: 900, fontSize: 13, color: '#3a3d42' }}>
            {post.album_title || post.title}
          </div>
          <div style={{ fontFamily: 'VT323, monospace', fontSize: 12, color: '#6a7480', marginTop: 2 }}>
            {post.artist_name || post.artist}
            {post.venue && ` · ${post.venue}`}
            {post.year && ` · ${post.year}`}
          </div>
        </div>
        {note && (
          <div style={{
            fontFamily: 'Barlow, sans-serif', fontStyle: 'italic', fontSize: 12,
            color: '#3a3d42', background: '#f4f6f9',
            borderLeft: '3px solid #e85d04', padding: '6px 10px', borderRadius: '0 4px 4px 0',
          }}>{note}</div>
        )}
        {genres.length > 0 && (
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {genres.map(g => <TagPill key={g} label={g} />)}
            <TagPill label="Live Set" variant="orange" />
          </div>
        )}
        <ActionRow post={post} watchLabel="WATCH" />
        <CommentInline comments={post.comments} />
      </div>
    </div>
  )
}

// ─── TRACK ID CARD ────────────────────────────────────────────────────────────

function TrackIDCard({ post, expanded }) {
  return (
    <div style={cardShell(expanded, 'white')}>
      <div style={{
        background: '#e8ecf0', padding: '5px 12px',
        display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0,
      }}>
        <TagPill label="TRACK ID" variant="dark" />
        <span style={{ fontFamily: 'VT323, monospace', fontSize: 12, color: '#6a7480' }}>
          @{post.username} · {timeAgo(post.created_at)}
        </span>
      </div>
      <div style={{ padding: '10px 12px', flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ fontFamily: 'Barlow, sans-serif', fontWeight: 700, fontSize: 13, color: '#3a3d42' }}>
          Can you ID this track?
        </div>
        <VideoEmbed post={post} isLive={false} />
        <CommentInline comments={post.comments} />
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// SPOTLIGHT CARDS
// ═══════════════════════════════════════════════════════════════════════════════

function ArtistSpotlightCard({ data }) {
  return (
    <div style={{
      ...cardShell(true, '#1e2126'),
      minWidth: 380, maxWidth: 460,
      backgroundImage: 'repeating-linear-gradient(45deg, rgba(255,255,255,0.01) 0px, rgba(255,255,255,0.01) 1px, transparent 1px, transparent 8px)',
    }}>
      {/* Badges */}
      <div style={{ padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 8, borderBottom: '1px solid rgba(255,255,255,0.07)', flexShrink: 0 }}>
        <TagPill label="✦ ARTIST SPOTLIGHT" variant="orange" />
        <span style={{ fontFamily: 'VT323, monospace', fontSize: 11, color: 'rgba(255,255,255,0.25)', marginLeft: 'auto' }}>
          GENERATED BY LNV
        </span>
      </div>
      <div style={{ padding: '12px', flex: 1, display: 'flex', flexDirection: 'column', gap: 10, overflow: 'auto' }}>
        {/* Avatar + name */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 52, height: 52, borderRadius: '50%',
            background: 'linear-gradient(135deg, #c8daf0, #7aa8d8)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: 'Barlow, sans-serif', fontWeight: 900, fontSize: 20, color: '#1e2126',
            flexShrink: 0,
          }}>
            {(data.name || 'A').charAt(0).toUpperCase()}
          </div>
          <div>
            <div style={{ fontFamily: 'Barlow, sans-serif', fontWeight: 900, fontSize: 18, color: '#fff' }}>
              {data.name}
            </div>
            <div style={{ fontFamily: 'VT323, monospace', fontSize: 12, color: 'rgba(255,255,255,0.45)' }}>
              {data.genres?.join(' · ')} {data.country && `· ${data.country}`}
            </div>
          </div>
        </div>
        {/* Bio */}
        {data.bio && (
          <div style={{
            fontFamily: 'Barlow, sans-serif', fontSize: 12, lineHeight: 1.5,
            color: 'rgba(255,255,255,0.55)',
            borderLeft: '3px solid #c8daf0', paddingLeft: 10,
          }}>{data.bio}</div>
        )}
        {/* Records mini grid */}
        {data.records?.length > 0 && (
          <div>
            <div style={{ fontFamily: 'VT323, monospace', fontSize: 11, color: 'rgba(255,255,255,0.35)', marginBottom: 6 }}>
              IN COLLECTION
            </div>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {data.records.slice(0, 8).map((r, i) => (
                <div key={i} style={{
                  width: 48, height: 48, borderRadius: 3,
                  background: 'linear-gradient(135deg, #2a2d32, #3a3d42)',
                  overflow: 'hidden',
                }}>
                  {r.cover_art && (
                    <img src={r.cover_art} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
        {/* Shows */}
        {data.shows?.length > 0 && (
          <div>
            <div style={{ fontFamily: 'VT323, monospace', fontSize: 11, color: 'rgba(255,255,255,0.35)', marginBottom: 4 }}>
              UPCOMING SHOWS
            </div>
            {data.shows.slice(0, 3).map((s, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <span style={{ fontFamily: 'VT323, monospace', fontSize: 12, color: '#e85d04', width: 48, flexShrink: 0 }}>{s.date}</span>
                <span style={{ fontFamily: 'Barlow, sans-serif', fontWeight: 700, fontSize: 12, color: '#fff', flex: 1 }}>{s.venue}</span>
                <span style={{ fontFamily: 'VT323, monospace', fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{s.city}</span>
                <button style={{ ...pillBtn('outlined'), border: '1px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.4)', fontSize: 10 }}>RA →</button>
              </div>
            ))}
          </div>
        )}
        {/* Social + follow */}
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center', marginTop: 2 }}>
          {['DISCOGS', 'RA', 'SOUNDCLOUD', 'BANDCAMP'].map(s => (
            <button key={s} style={{
              ...pillBtn('outlined'),
              border: '1px solid rgba(255,255,255,0.12)',
              color: 'rgba(255,255,255,0.4)', fontSize: 10,
              cursor: 'pointer',
            }}>{s}</button>
          ))}
          <button style={{ ...pillBtn('pastel'), marginLeft: 'auto', cursor: 'pointer' }}>+ FOLLOW</button>
        </div>
        <button style={{ ...pillBtn('outlined'), border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', textAlign: 'center' }}>
          + ADD A RELEASE
        </button>
        {data.release_count != null && (
          <div style={{ fontFamily: 'VT323, monospace', fontSize: 11, color: 'rgba(255,255,255,0.25)', textAlign: 'right' }}>
            {data.release_count} releases suggested this week
          </div>
        )}
      </div>
    </div>
  )
}

function LabelSpotlightCard({ data }) {
  return (
    <div style={{ ...cardShell(true, '#fff'), minWidth: 340, maxWidth: 420 }}>
      {/* Top stripe */}
      <div style={{ height: 6, background: 'linear-gradient(90deg, #c8daf0, #3a3d42)', flexShrink: 0 }} />
      <div style={{ padding: '8px 12px', borderBottom: '1px solid rgba(0,0,0,0.07)', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <TagPill label="✦ LABEL SPOTLIGHT" variant="pastel" />
      </div>
      <div style={{ padding: '12px', flex: 1, display: 'flex', flexDirection: 'column', gap: 10, overflow: 'auto' }}>
        {/* Logo + name */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 48, height: 48, background: '#1e2126', borderRadius: 4,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: 'Barlow, sans-serif', fontWeight: 900, fontSize: 16, color: '#fff',
            flexShrink: 0,
          }}>
            {(data.name || 'L').substring(0, 2).toUpperCase()}
          </div>
          <div>
            <div style={{ fontFamily: 'Barlow, sans-serif', fontWeight: 900, fontSize: 16, color: '#3a3d42' }}>{data.name}</div>
            <div style={{ fontFamily: 'VT323, monospace', fontSize: 12, color: '#6a7480' }}>
              {data.location} {data.year && `· Est. ${data.year}`}
            </div>
          </div>
        </div>
        {data.bio && (
          <div style={{
            fontFamily: 'Barlow, sans-serif', fontSize: 12, lineHeight: 1.5, color: '#6a7480',
            borderLeft: '3px solid #c8daf0', paddingLeft: 10,
          }}>{data.bio}</div>
        )}
        {data.artists?.length > 0 && (
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {data.artists.map(a => <TagPill key={a} label={a} variant="outlined" />)}
          </div>
        )}
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
          {['DISCOGS', 'BANDCAMP', 'RA'].map(s => (
            <button key={s} style={{ ...pillBtn('outlined'), fontSize: 10, cursor: 'pointer' }}>{s}</button>
          ))}
          <button style={{ ...pillBtn('dark'), marginLeft: 'auto', cursor: 'pointer' }}>+ FOLLOW</button>
        </div>
        <button style={{ ...pillBtn('outlined'), cursor: 'pointer', textAlign: 'center' }}>+ ADD A RELEASE</button>
      </div>
    </div>
  )
}

function HotPostCard({ post }) {
  return (
    <div style={{ ...cardShell(true, '#1e2126'), minWidth: 300, maxWidth: 380 }}>
      <div style={{ padding: '8px 12px', borderBottom: '1px solid rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <TagPill label="✦ TRENDING" variant="orange" />
        <span style={{ fontFamily: 'VT323, monospace', fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>
          HOT POST
        </span>
      </div>
      <div style={{ padding: '12px', flex: 1, display: 'flex', flexDirection: 'column', gap: 8, overflow: 'auto' }}>
        {/* Cover + info */}
        <div style={{ display: 'flex', gap: 10 }}>
          <CoverArt post={post} size="small" />
          <div>
            <div style={{ fontFamily: 'Barlow, sans-serif', fontWeight: 900, fontSize: 13, color: '#fff' }}>
              {post.album_title || post.title}
            </div>
            <div style={{ fontFamily: 'VT323, monospace', fontSize: 12, color: 'rgba(255,255,255,0.45)' }}>
              {post.artist_name || post.artist}
            </div>
            {/* Stats */}
            <div style={{ fontFamily: 'VT323, monospace', fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 4 }}>
              {post.likes || 0} ♥ · {post.comment_count || 0} comments · {post.crate_adds || 0} crates
            </div>
          </div>
        </div>
        {/* Top comment pull quote */}
        {post.top_comment && (
          <div style={{
            fontFamily: 'Barlow, sans-serif', fontStyle: 'italic', fontSize: 12,
            color: 'rgba(255,255,255,0.55)', borderLeft: '3px solid #e85d04', paddingLeft: 10,
          }}>"{post.top_comment}"</div>
        )}
        <CommentInline comments={post.comments} />
        <button style={{ ...pillBtn('orange'), textAlign: 'center', cursor: 'pointer' }}>
          OPEN FULL THREAD →
        </button>
      </div>
    </div>
  )
}

function RecordOfDayCard({ data }) {
  return (
    <div style={{ ...cardShell(true, '#c8daf0'), minWidth: 260, maxWidth: 320 }}>
      <div style={{ padding: '8px 12px', borderBottom: '1px solid rgba(0,0,0,0.07)', flexShrink: 0 }}>
        <TagPill label="✦ RECORD OF THE DAY" />
      </div>
      <div style={{ padding: '12px', flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <CoverArt post={data} size="full" />
        <div>
          <div style={{ fontFamily: 'Barlow, sans-serif', fontWeight: 900, fontSize: 13, color: '#2a2d32' }}>
            {data.album_title || data.title}
          </div>
          <div style={{ fontFamily: 'VT323, monospace', fontSize: 12, color: '#6a7480' }}>
            {data.artist_name || data.artist} · {data.year}
          </div>
        </div>
        {data.label_name && (
          <div style={{ fontFamily: 'VT323, monospace', fontSize: 11, color: '#6a7480' }}>
            On this day in {data.year}, this was released on {data.label_name}
          </div>
        )}
        <button style={{ ...pillBtn('dark'), cursor: 'pointer', textAlign: 'center' }}>▶ PLAY</button>
      </div>
    </div>
  )
}

// ─── Card shell ───────────────────────────────────────────────────────────────

function cardShell(expanded, bg = '#fff') {
  return {
    background: bg,
    borderRadius: 8,
    border: expanded ? '2px solid #e85d04' : '1px solid rgba(0,0,0,0.07)',
    boxShadow: expanded
      ? '0 0 0 4px rgba(232,93,4,0.12), 0 4px 20px rgba(0,0,0,0.12)'
      : '0 2px 8px rgba(0,0,0,0.06)',
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    overflow: 'hidden',
    transition: 'box-shadow 0.2s, border-color 0.2s',
    flexShrink: 0,
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN EXPORT — PostCard router
// ═══════════════════════════════════════════════════════════════════════════════

export default function PostCard({ post, expanded, onExpand }) {
  const type = detectPostType(post)

  // Spotlight types
  if (post.spotlight_type === 'artist') return <ArtistSpotlightCard data={post.spotlight_data || post} />
  if (post.spotlight_type === 'label') return <LabelSpotlightCard data={post.spotlight_data || post} />
  if (post.spotlight_type === 'hot') return <HotPostCard post={post.spotlight_data || post} />
  if (post.spotlight_type === 'rotd') return <RecordOfDayCard data={post.spotlight_data || post} />

  // Regular post types
  if (type === 'livemix' || type === 'trackid') {
    if (type === 'trackid') return <TrackIDCard post={post} expanded={expanded} />
    return <LiveMixCard post={post} expanded={expanded} onExpand={onExpand} />
  }
  if (type === 'single') return <SingleCard post={post} expanded={expanded} onExpand={onExpand} />
  return <AlbumCard post={post} expanded={expanded} onExpand={onExpand} />
}

// Re-export spotlight cards for direct use
export { ArtistSpotlightCard, LabelSpotlightCard, HotPostCard, RecordOfDayCard }
