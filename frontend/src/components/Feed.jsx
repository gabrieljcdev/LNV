import { useState, useRef, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useLayout } from '../context/LayoutContext'
import ComposeModal from './ComposeModal'
import { getUserId } from '../lib/auth'
import { PALETTES, getAutoIndex, applyPalette } from '../services/themeService'

const API = import.meta.env.VITE_API_URL || 'http://localhost:3001/api'

// Fixed card widths — no hover/open resize states. Each post is ONE
// individual, self-contained card (identity header + media + tracklist +
// note + footer, all always visible) — not split across separate cards.
// Livemix cards get extra width for the embed. Spotlights use the same
// standard width so they read as "one of these cards," not a special size.
const CARD_WIDTH = 460
const CARD_WIDTH_LIVEMIX = 620
const SPOTLIGHT_CARD_WIDTH = CARD_WIDTH

// ── Helpers ────────────────────────────────────────────────────────────────────

function timeAgo(d) {
  if (!d) return ''
  const s = (Date.now() - new Date(d)) / 1000
  if (s < 60)    return 'just now'
  if (s < 3600)  return `${Math.floor(s / 60)}m`
  if (s < 86400) return `${Math.floor(s / 3600)}h`
  return `${Math.floor(s / 86400)}d`
}

function cleanNote(t)  { return (t || '').replace(/https?:\/\/\S+/g, '').trim() }
function artistName(p) { return p.artists?.[0]?.artist_name || p.artists?.[0]?.name || p.artist_name || '' }
function labelName(p)  { return p.labels?.[0]?.label_name  || p.labels?.[0]?.name  || p.label_name  || '' }
function coverSrc(p)   { return p.cover_image || p.coverImage || p.thumb_image || p.thumbImage || p.cover_art || '' }

function detectType(p) {
  if (p.post_type) return p.post_type
  const f = (p.format || '').toLowerCase()
  if (f.includes('video') || f.includes('mix') || p.is_live_mix) return 'livemix'
  const tl = p.tracks?.length || 0
  if (f.includes('single') || f.includes('7"') || (f.includes('ep') && tl <= 4)) return 'single'
  return 'album'
}

const PLATFORM_COLORS = {
  youtube: '#f00', soundcloud: '#f50', bandcamp: '#1da0c3',
  spotify: '#1db954', mixcloud: '#5000ff', deezer: '#a238ff',
  applemusic: '#fc3c44', tidal: '#000', beatport: '#01ff95',
  ra: '#f03', boilerroom: '#111', discogs: '#333',
}

const POST_BG_CYCLE = ['dark1','dark2','dark3','dark1','dark2','light1','dark3','dark1','dark2','dark3','light1','dark1','dark2']

// ── CoverArt ──────────────────────────────────────────────────────────────────

function CoverArt({ post, style = {}, children }) {
  const [err, setErr] = useState(false)
  const src = coverSrc(post || {})
  return (
    <div style={{ background: 'linear-gradient(135deg,#1e2126,#08090b)', position: 'relative', overflow: 'hidden', flexShrink: 0, ...style }}>
      {src && !err && <img src={src} alt="" onError={() => setErr(true)} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />}
      {(!src || err) && <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.1)', fontSize: 36 }}>◈</div>}
      {children}
    </div>
  )
}

// ── Comments ──────────────────────────────────────────────────────────────────

function CommentThread({ postId, onCountChange }) {
  const [comments, setComments] = useState(null) // null = not yet loaded
  const [text, setText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    fetch(`${API}/posts/${postId}/comments`)
      .then(r => r.ok ? r.json() : [])
      .then(data => { if (!cancelled) setComments(Array.isArray(data) ? data : []) })
      .catch(() => { if (!cancelled) setComments([]) })
    return () => { cancelled = true }
  }, [postId])

  const userId = getUserId()

  async function submit() {
    const content = text.trim()
    if (!content || submitting || !userId) return
    setSubmitting(true); setError('')
    try {
      const res = await fetch(`${API}/posts/${postId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, content }),
      })
      if (!res.ok) throw new Error(`${res.status}`)
      const saved = await res.json()
      setComments(prev => [...(prev || []), saved])
      onCountChange?.((comments?.length || 0) + 1)
      setText('')
    } catch {
      setError('COULD NOT POST — TRY AGAIN')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div style={{ padding: '8px 16px 12px', borderTop: '0.5px solid var(--theme-border)', flexShrink: 0, maxHeight: 140, overflowY: 'auto' }}>
      {comments === null ? (
        <div style={{ fontFamily: 'VT323, monospace', fontSize: 11, color: 'var(--theme-text-ter)' }}>loading…</div>
      ) : comments.length === 0 ? (
        <div style={{ fontFamily: 'VT323, monospace', fontSize: 11, color: 'var(--theme-text-ter)' }}>no replies yet</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 8 }}>
          {comments.map(c => (
            <div key={c.id} style={{ display: 'flex', gap: 6, fontSize: 12, fontFamily: 'Barlow, sans-serif', lineHeight: 1.4 }}>
              <span style={{ fontWeight: 700, color: 'var(--theme-text-pri)', flexShrink: 0 }}>{c.username || c.display_name || 'anon'}</span>
              <span style={{ color: 'var(--theme-text-sec)' }}>{c.content}</span>
            </div>
          ))}
        </div>
      )}
      {userId ? (
        <div style={{ display: 'flex', gap: 6 }}>
          <input
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') submit() }}
            placeholder="reply…"
            style={{ flex: 1, borderRadius: 20, border: '1px solid var(--theme-border)', padding: '5px 12px', fontFamily: 'Barlow, sans-serif', fontSize: 11, background: 'var(--theme-dark3)', color: 'var(--theme-text-pri)', outline: 'none' }}
          />
          <button onClick={submit} disabled={!text.trim() || submitting}
            style={{ borderRadius: 20, border: 'none', padding: '5px 14px', fontFamily: 'VT323, monospace', fontSize: 11, background: 'var(--theme-accent)', color: '#fff', cursor: 'pointer', opacity: (!text.trim() || submitting) ? 0.5 : 1, flexShrink: 0 }}
          >{submitting ? '···' : 'reply'}</button>
        </div>
      ) : (
        <a href="/login" style={{ fontFamily: 'VT323, monospace', fontSize: 11, color: 'var(--theme-accent)', textDecoration: 'none' }}>log in to reply →</a>
      )}
      {error && <div style={{ fontFamily: 'VT323, monospace', fontSize: 10, color: 'var(--theme-accent)', marginTop: 4 }}>{error}</div>}
    </div>
  )
}

// ── Post card — ONE individual, self-contained card per post ───────────────────
// Avantt-inspired: bold identity header (huge wordmark, minimal chrome) up top,
// like the type-specimen reference, then the reference's image-dominant lower
// zone — cover/embed, tracklist, note, footer, comments — all in the SAME card.
// Fixed width, always full detail, no hover/open resize states.

function PostCard({ post, cardBg }) {
  const { openD3, registerPostRef } = useLayout() || {}
  const [activeTrackUrl, setActiveTrackUrl] = useState(null)
  const [commentsOpen, setCommentsOpen] = useState(false)
  const [commentCount, setCommentCount] = useState(post.commentCount || post.comment_count || 0)

  const type = detectType(post)
  const artist = artistName(post)
  const label = labelName(post)
  const catNo = post.labels?.[0]?.catalogue_number || post.catNo || ''
  const genres = post.genres || []
  const note = cleanNote(post.notes || post.body)
  const tracks = post.tracks || []
  const channel = post.channel || ''
  const platform = post.platform || ''
  const isLiveMix = type === 'livemix'
  const width = isLiveMix ? CARD_WIDTH_LIVEMIX : CARD_WIDTH
  const tagLabel = isLiveMix ? 'LIVE SET' : type === 'single' ? 'SINGLE' : 'ALBUM'
  const tagColor = isLiveMix ? '#e85d04' : type === 'single' ? '#4a90d9' : '#555'

  const platformColor = PLATFORM_COLORS[platform] || 'var(--theme-accent)'
  const platformLabel = platform?.toUpperCase()

  const streamUrl = activeTrackUrl || post.stream_url || post.embed_url || tracks[0]?.youtube_url || tracks[0]?.stream_url || ''
  const ytMatch = streamUrl.match(/(?:v=|youtu\.be\/|embed\/)([^&\s?]{11})/)
  const ytId = ytMatch ? ytMatch[1] : null
  const scUrl = /soundcloud\.com/i.test(streamUrl) ? streamUrl : null
  const mcUrl = /mixcloud\.com/i.test(streamUrl) ? streamUrl : null

  const embedSrc = ytId
    ? `https://www.youtube.com/embed/${ytId}?rel=0&modestbranding=1&color=white`
    : scUrl
    ? `https://w.soundcloud.com/player/?url=${encodeURIComponent(scUrl)}&color=%23e85d04&auto_play=false&hide_related=true&show_comments=false&show_user=true`
    : mcUrl
    ? `https://www.mixcloud.com/widget/iframe/?hide_cover=1&feed=${encodeURIComponent(mcUrl.replace('https://www.mixcloud.com',''))}`
    : null

  const textSec = 'var(--theme-text-sec)'
  const textTer = 'var(--theme-text-ter)'
  const divider = 'var(--theme-border)'

  return (
    <div
      ref={el => registerPostRef?.(post.id, el)}
      style={{ flexShrink: 0, width, height: '100%', background: cardBg, borderRight: '1px solid var(--theme-border)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
    >
      {/* Identity header — huge bold name, minimal chrome */}
      <div style={{ padding: '18px 18px 14px', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', padding: '3px 8px', borderRadius: 3, background: tagColor, color: '#fff', fontFamily: 'VT323, monospace' }}>{tagLabel}</span>
          <span style={{ fontSize: 10, fontFamily: 'monospace', color: textTer }}>#{String(post.id).padStart(3, '0')}</span>
        </div>

        <div
          onClick={() => artist && openD3?.('artists', { filter: artist })}
          style={{ fontSize: 28, fontWeight: 900, lineHeight: 1.02, color: 'var(--theme-text-pri)', fontFamily: 'Barlow, sans-serif', letterSpacing: '-0.5px', cursor: artist ? 'pointer' : 'default', wordBreak: 'break-word' }}
        >{artist || post.title}</div>

        <div style={{ fontSize: 13, color: textSec, marginTop: 6, fontFamily: 'Barlow, sans-serif', lineHeight: 1.4 }}>
          {post.title}
          {label && <> · <span onClick={() => openD3?.('labels', { filter: label })} style={{ cursor: 'pointer', borderBottom: '1px dotted currentColor' }}>{label}</span></>}
          {catNo && <> · {catNo}</>}
          {post.year && <> · {post.year}</>}
        </div>

        {genres.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 10 }}>
            {genres.slice(0, 6).map(g => (
              <span key={g} onClick={() => openD3?.('genres', { filter: g })}
                style={{ fontSize: 11, background: 'var(--theme-dark3)', color: textSec, padding: '3px 10px', borderRadius: 99, fontFamily: 'Barlow, sans-serif', cursor: 'pointer' }}
              >{g}</span>
            ))}
          </div>
        )}
      </div>

      {/* Caption row — platform/source badges */}
      {(platformLabel || post.source === 'discogs') && (
        <div style={{ padding: '0 16px', display: 'flex', gap: 5, flexWrap: 'wrap', flexShrink: 0, marginBottom: 6 }}>
          {platformLabel && (
            <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', padding: '3px 8px', borderRadius: 3, background: platformColor, color: platform === 'beatport' ? '#000' : '#fff', fontFamily: 'VT323, monospace' }}>{platformLabel}</span>
          )}
          {post.source === 'discogs' && (
            <span style={{ fontSize: 9, fontWeight: 700, padding: '3px 8px', borderRadius: 3, background: 'rgba(255,255,255,0.12)', color: textSec, fontFamily: 'VT323, monospace' }}>◈ DISCOGS</span>
          )}
        </div>
      )}

      {/* Media — dominates the lower half of the card, like the reference's large photo */}
      <div style={{ flex: isLiveMix ? '0 0 40%' : '0 0 34%', margin: '0 16px', borderRadius: 6, overflow: 'hidden', position: 'relative', boxShadow: '0 8px 24px rgba(0,0,0,0.3)' }}>
        {isLiveMix ? (
          embedSrc ? (
            <iframe src={embedSrc}
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 'none' }}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen title={post.title} />
          ) : (
            <div style={{ width: '100%', height: '100%', background: '#1e2126', position: 'relative' }}>
              {coverSrc(post) && <img src={coverSrc(post)} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: 0.4 }} />}
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'VT323, monospace', fontSize: 11, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.1em' }}>NO STREAM URL</div>
              {channel && <div style={{ position: 'absolute', bottom: 8, left: 10, fontFamily: 'Barlow, sans-serif', fontSize: 11, color: 'rgba(255,255,255,0.7)' }}>{channel}</div>}
            </div>
          )
        ) : (
          <CoverArt post={post} style={{ width: '100%', height: '100%' }} />
        )}
      </div>

      {/* Everything below — scrolls internally if the card runs out of room */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflowY: 'auto', overflowX: 'hidden', marginTop: 8 }}>

        {!isLiveMix && tracks.length > 0 && (
          <div style={{ padding: '0 16px', flexShrink: 0 }}>
            {tracks.slice(0, 6).map((t, i) => {
              const tUrl = t.stream_url || t.youtube_url || null
              const isActive = activeTrackUrl && tUrl && activeTrackUrl === tUrl
              return (
                <div key={i}
                  onClick={() => { if (tUrl) setActiveTrackUrl(isActive ? null : tUrl) }}
                  style={{ display: 'flex', gap: 6, alignItems: 'baseline', padding: '3px 4px', borderRadius: 4, cursor: tUrl ? 'pointer' : 'default', background: isActive ? 'rgba(232,93,4,0.12)' : 'transparent' }}>
                  <span style={{ fontSize: 9, color: isActive ? 'var(--theme-accent)' : textTer, fontFamily: 'monospace', flexShrink: 0, minWidth: 16 }}>{tUrl ? (isActive ? '▶' : '▷') : (t.position || i + 1)}</span>
                  <span style={{ fontSize: 12, color: isActive ? 'var(--theme-text-pri)' : textSec, fontWeight: isActive ? 600 : 400, fontFamily: 'Barlow, sans-serif', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</span>
                  {t.duration && <span style={{ fontSize: 9, color: textTer, fontFamily: 'monospace', marginLeft: 'auto', flexShrink: 0 }}>{t.duration}</span>}
                </div>
              )
            })}
            {tracks.length > 6 && <div style={{ fontSize: 10, color: textTer, fontFamily: 'VT323, monospace', marginTop: 2 }}>+{tracks.length - 6} more</div>}
          </div>
        )}

        {note && (
          <div style={{ padding: '10px 16px 0', flexShrink: 0 }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <div style={{ width: 24, height: 24, borderRadius: '50%', flexShrink: 0, background: 'var(--theme-accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: '#fff', fontFamily: 'Barlow, sans-serif' }}>
                {(post.user?.username || post.username || '?').charAt(0).toUpperCase()}
              </div>
              <div style={{ flex: 1, background: 'var(--theme-dark3)', borderRadius: '0 8px 8px 8px', padding: '6px 10px', border: `0.5px solid ${divider}` }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--theme-text-pri)', marginBottom: 2, fontFamily: 'Barlow, sans-serif' }}>{post.user?.username || post.username}</div>
                <div style={{ fontSize: 12, color: textSec, lineHeight: 1.45, fontFamily: 'Barlow, sans-serif' }}>{note}</div>
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div style={{ padding: '10px 16px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 'auto', borderTop: `0.5px solid ${divider}` }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <button onClick={() => setCommentsOpen(v => !v)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: textTer, padding: 0, fontFamily: 'Barlow, sans-serif' }}>
              <span style={{ color: 'var(--theme-accent)', fontWeight: 700 }}>{commentCount}</span>&nbsp;replies
            </button>
            {post.discogs_url && (
              <a href={post.discogs_url} target="_blank" rel="noopener noreferrer"
                style={{ fontSize: 11, color: textTer, fontFamily: 'Barlow, sans-serif', textDecoration: 'none' }}>↗ discogs</a>
            )}
            {isLiveMix && streamUrl && (
              <a href={streamUrl} target="_blank" rel="noopener noreferrer"
                style={{ fontSize: 11, color: textTer, fontFamily: 'Barlow, sans-serif', textDecoration: 'none' }}>↗ {platformLabel || 'stream'}</a>
            )}
          </div>
          <span style={{ fontSize: 10, color: textTer, fontFamily: 'VT323, monospace' }}>
            <span style={{ color: textSec, fontWeight: 500 }}>{post.user?.username || post.username}</span> · {timeAgo(post.created_at)}
          </span>
        </div>

        {commentsOpen && <CommentThread postId={post.id} onCountChange={setCommentCount} />}
      </div>
    </div>
  )
}

// ── Spotlight card — one fixed-size card, not split into title/detail ──────────
// Real posts (post.is_spotlight, created server-side by posts.js's
// triggerSpotlights once a subject crosses a post-count milestone — see
// spotlightType/spotlightCount/spotlightCovers, enriched by getFullPost).
// Not a client-side random shuffle.

function SpotlightCard({ post, cardBg, flip, onFilterSubject }) {
  const { registerPostRef } = useLayout() || {}
  const name = post.spotlight_subject
  const type = post.spotlightType
  const count = post.spotlightCount || 0
  const covers = post.spotlightCovers || []

  return (
    <div
      ref={el => registerPostRef?.(post.id, el)}
      style={{ flexShrink: 0, width: SPOTLIGHT_CARD_WIDTH, height: '100%', background: cardBg, borderRight: '1px solid var(--theme-border)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
    >
      {/* TOP HALF — collage + badge avatar */}
      <div style={{ flex: '0 0 50%', background: flip ? '#fff' : cardBg, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
        {covers.slice(0, 4).map((p, i) => coverSrc(p) && (
          <img key={p.id || i} src={coverSrc(p)} alt="" style={{ position: 'absolute', width: '50%', height: '50%', left: `${(i % 2) * 50}%`, top: `${Math.floor(i / 2) * 50}%`, objectFit: 'cover', opacity: 0.2 }} />
        ))}
        {type === 'artist'
          ? <div style={{ position: 'relative', zIndex: 2, width: 80, height: 80, borderRadius: '50%', background: 'rgba(255,255,255,0.15)', border: '2px solid rgba(255,255,255,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32, fontWeight: 900, color: '#fff', fontFamily: 'Barlow, sans-serif', backdropFilter: 'blur(8px)' }}>
              {name.charAt(0).toUpperCase()}
            </div>
          : <div style={{ position: 'relative', zIndex: 2, width: 80, height: 80, borderRadius: 12, background: 'rgba(255,255,255,0.15)', border: '2px solid rgba(255,255,255,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 900, color: 'rgba(255,255,255,0.7)', fontFamily: 'Barlow, sans-serif', backdropFilter: 'blur(8px)', letterSpacing: 1 }}>
              {name.substring(0, 3).toUpperCase()}
            </div>
        }
      </div>
      {/* BOTTOM HALF — info */}
      <div style={{ flex: '0 0 50%', background: flip ? cardBg : '#fff', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '10px 12px 8px', flexShrink: 0, borderBottom: `0.5px solid ${flip ? 'rgba(255,255,255,0.15)' : '#f0ede6'}` }}>
          <span style={{ fontSize: 8, fontWeight: 700, letterSpacing: '0.09em', padding: '2px 6px', borderRadius: 3, display: 'inline-block', marginBottom: 5, background: 'var(--theme-accent)', color: '#fff', fontFamily: 'VT323, monospace' }}>
            {type === 'artist' ? 'Artist spotlight' : type === 'label' ? 'Label spotlight' : 'Genre spotlight'}
          </span>
          <div style={{ fontSize: 14, fontWeight: 700, color: flip ? '#fff' : '#111', lineHeight: 1.25, marginBottom: 2, fontFamily: 'Barlow, sans-serif' }}>{name}</div>
          <div style={{ fontSize: 11, color: flip ? 'rgba(255,255,255,0.6)' : '#777', marginBottom: 6, fontFamily: 'VT323, monospace', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>{count} post{count !== 1 ? 's' : ''} in the feed</span>
            {onFilterSubject && (
              <span onClick={() => onFilterSubject(name)} style={{ cursor: 'pointer', color: 'var(--theme-accent)', textDecoration: 'underline' }}>view all →</span>
            )}
          </div>
        </div>
        <div style={{ flex: 1, overflow: 'hidden', padding: '6px 12px' }}>
          {covers.slice(0, 3).map((p, i) => (
            <div key={p.id || i} style={{ display: 'flex', alignItems: 'center', gap: 7, paddingBottom: 5, borderBottom: `0.5px solid ${flip ? 'rgba(255,255,255,0.1)' : '#f5f5f5'}`, marginBottom: 5 }}>
              <div style={{ width: 28, height: 28, borderRadius: 3, flexShrink: 0, overflow: 'hidden', background: flip ? 'rgba(255,255,255,0.15)' : '#eee' }}>
                {coverSrc(p) && <img src={coverSrc(p)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 10, fontWeight: 600, color: flip ? '#fff' : '#222', fontFamily: 'Barlow, sans-serif', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.title}</div>
                <div style={{ fontSize: 9, color: flip ? 'rgba(255,255,255,0.4)' : '#aaa', fontFamily: 'VT323, monospace' }}>{timeAgo(p.created_at)}</div>
              </div>
            </div>
          ))}
        </div>
        <div style={{ padding: '5px 12px 8px', flexShrink: 0, borderTop: `0.5px solid ${flip ? 'rgba(255,255,255,0.15)' : '#f0ede6'}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 9, color: flip ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.3)', letterSpacing: '0.05em', fontFamily: 'VT323, monospace' }}>Spotlight · read only</span>
          <span style={{ fontSize: 9, color: flip ? 'rgba(255,255,255,0.4)' : '#ccc', fontFamily: 'VT323, monospace' }}><span style={{ color: flip ? 'rgba(255,255,255,0.7)' : '#aaa' }}>LNV</span> · editorial</span>
        </div>
      </div>
    </div>
  )
}

// ── Build shelf items ─────────────────────────────────────────────────────────
// One card per post — a spotlight post renders as a SpotlightCard, every
// other post renders as one self-contained PostCard. Spotlights are real
// posts returned by /api/posts in feed order (posts.js's triggerSpotlights)
// — no client-side injection needed.

function buildShelfItems(posts) {
  return posts.map(post => (
    post.is_spotlight
      ? { key: `p-${post.id}-spotlight`, kind: 'spotlight', post }
      : { key: `p-${post.id}`, kind: 'post', post }
  ))
}

// ── Theme Picker ──────────────────────────────────────────────────────────────

function ThemePicker({ currentIdx, onSelect }) {
  return (
    <div style={{ position: 'absolute', bottom: 60, right: 0, background: '#1a1a1a', border: '0.5px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '6px 0', width: 164, zIndex: 200, boxShadow: '0 8px 28px rgba(0,0,0,0.55)' }}>
      <div style={{ fontSize: 8, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.22)', padding: '6px 12px 3px', fontFamily: 'Barlow, sans-serif' }}>Theme</div>
      <div onClick={() => onSelect(-1)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px 8px', cursor: 'pointer', fontSize: 11, color: currentIdx === -1 ? '#fff' : 'rgba(255,255,255,0.55)', borderBottom: '0.5px solid rgba(255,255,255,0.08)', marginBottom: 4, fontFamily: 'Barlow, sans-serif' }}
        onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'}
        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
        <span style={{ fontSize: 12 }}>◐</span><span>Auto (clock)</span>
      </div>
      <div style={{ fontSize: 8, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.22)', padding: '3px 12px', fontFamily: 'Barlow, sans-serif' }}>Manual</div>
      {PALETTES.map((p, i) => (
        <div key={i} onClick={() => onSelect(i)}
          style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', cursor: 'pointer', fontSize: 11, color: currentIdx === i ? '#fff' : 'rgba(255,255,255,0.55)', fontFamily: 'Barlow, sans-serif' }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; applyPalette(i) }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; applyPalette(currentIdx === -1 ? getAutoIndex() : currentIdx) }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, background: p.accent, border: '1px solid rgba(255,255,255,0.15)' }} />
          <span style={{ flex: 1 }}>{p.name}</span>
          <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.25)', fontFamily: 'monospace' }}>{p.slot}</span>
        </div>
      ))}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN FEED
// ═══════════════════════════════════════════════════════════════════════════════

export default function Feed() {
  const [themeIdx, setThemeIdx]       = useState(-1)
  const [pickerOpen, setPickerOpen]   = useState(false)
  const [composeOpen, setComposeOpen] = useState(false)
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch]           = useState('')
  const shelfItems                    = useRef([])
  const lastPostsSignature            = useRef(null)
  const queryClient                   = useQueryClient()
  const { feedRef, handleFeedScroll, driveFeedScroll } = useLayout() || {}

  // Theme
  useEffect(() => { applyPalette(themeIdx === -1 ? getAutoIndex() : themeIdx) }, [themeIdx])
  useEffect(() => {
    const t = setInterval(() => { if (themeIdx === -1) applyPalette(getAutoIndex()) }, 60000)
    return () => clearInterval(t)
  }, [themeIdx])

  // Debounce search input → search (300ms)
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 300)
    return () => clearTimeout(t)
  }, [searchInput])

  // Data
  const { data: raw, isFetching: searching } = useQuery({
    queryKey: ['posts', search ? 'SEARCH' : 'LATEST', search],
    queryFn: async () => {
      const url = search
        ? `${API}/posts?limit=60&search=${encodeURIComponent(search)}`
        : `${API}/posts?limit=60`
      const res = await fetch(url)
      if (!res.ok) return []
      const d = await res.json()
      return Array.isArray(d) ? d : (d.posts || [])
    },
    refetchInterval: search ? false : 30000,
  })
  const posts = Array.isArray(raw) ? raw : []

  const postsSignature = posts.map(p => p.id).join(',')
  if (postsSignature !== lastPostsSignature.current) {
    shelfItems.current = buildShelfItems(posts)
    lastPostsSignature.current = postsSignature
    // New result set (e.g. a search) — jump the shelf back to the start.
    if (feedRef?.current) feedRef.current.scrollLeft = 0
  }

  // Scroll drag
  useEffect(() => {
    const el = feedRef?.current
    if (!el) return
    let down = false, sx = 0, sl = 0
    // Drag-to-scroll drives the feed through #scroll-outer (driveFeedScroll),
    // same as wheel input — the RAF ticker in LayoutProvider owns
    // feedRef.scrollLeft every frame, so writing it directly here would just
    // get overwritten on the very next tick.
    const onDown  = e => { down = true; sx = e.pageX - el.offsetLeft; sl = el.scrollLeft; el.style.cursor = 'grabbing' }
    const onUp    = () => { down = false; el.style.cursor = 'default' }
    const onMove  = e => { if (!down) return; e.preventDefault(); const ns = sl - (e.pageX - el.offsetLeft - sx) * 1.5; driveFeedScroll?.(ns) }
    el.addEventListener('mousedown', onDown); el.addEventListener('mouseleave', onUp)
    el.addEventListener('mouseup', onUp); el.addEventListener('mousemove', onMove)
    return () => { el.removeEventListener('mousedown', onDown); el.removeEventListener('mouseleave', onUp); el.removeEventListener('mouseup', onUp); el.removeEventListener('mousemove', onMove) }
  }, [feedRef, driveFeedScroll])

  // Keyboard
  useEffect(() => {
    const h = e => { if (e.key === 'Escape') setPickerOpen(false) }
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h)
  }, [])

  function getCardBg(idx, item) {
    if (item?.kind === 'spotlight') return 'var(--theme-showcase)'
    return `var(--theme-${POST_BG_CYCLE[idx % POST_BG_CYCLE.length]})`
  }

  function filterToSubject(name) {
    setSearchInput(name)
    setSearch(name)
    if (feedRef?.current) feedRef.current.scrollLeft = 0
  }

  const currentPalette = PALETTES[themeIdx === -1 ? getAutoIndex() : themeIdx]

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden', background: 'var(--theme-bg)', position: 'relative' }}>

      <div ref={feedRef} style={{ display: 'flex', flex: 1, gap: 0, overflowX: 'auto', overflowY: 'hidden', alignItems: 'stretch', scrollbarWidth: 'none' }}>
        {!posts.length && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1, fontFamily: 'VT323, monospace', fontSize: 14, color: 'var(--theme-text-sec)' }}>
            {search ? `No results for "${search}"` : 'No posts yet — share the first record.'}
          </div>
        )}
        {shelfItems.current.map((item, idx) => {
          const cardBg = getCardBg(idx, item)
          if (item.kind === 'spotlight') return <SpotlightCard key={item.key} post={item.post} cardBg={cardBg} flip={idx % 2 !== 0} onFilterSubject={filterToSubject} />
          return <PostCard key={item.key} post={item.post} cardBg={cardBg} />
        })}
      </div>

      {/* Search */}
      <div style={{ position: 'absolute', top: 16, right: 16, zIndex: 100, display: 'flex', alignItems: 'center', background: 'var(--theme-dark3)', border: '1px solid var(--theme-border)', borderRadius: 99, padding: '6px 14px', boxShadow: '0 2px 8px rgba(0,0,0,0.2)' }}>
        <span style={{ color: 'var(--theme-text-ter)', fontSize: 13, marginRight: 6 }}>{searching ? '◐' : '⌕'}</span>
        <input
          value={searchInput}
          onChange={e => setSearchInput(e.target.value)}
          placeholder="search artists, genres, labels, tracks…"
          style={{ background: 'transparent', border: 'none', outline: 'none', color: 'var(--theme-text-pri)', fontFamily: 'Barlow, sans-serif', fontSize: 12, width: 220 }}
        />
        {searchInput && (
          <button onClick={() => setSearchInput('')} style={{ background: 'none', border: 'none', color: 'var(--theme-text-ter)', cursor: 'pointer', fontSize: 13, padding: 0, marginLeft: 4 }}>×</button>
        )}
      </div>

      {/* Theme button */}
      <div style={{ position: 'absolute', bottom: 16, right: 16, zIndex: 100 }}>
        {pickerOpen && <ThemePicker currentIdx={themeIdx} onSelect={i => { setThemeIdx(i); setPickerOpen(false) }} />}
        <button onClick={() => setPickerOpen(v => !v)}
          style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--theme-dark3)', border: '1px solid var(--theme-border)', cursor: 'pointer', color: 'var(--theme-text-sec)', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.2)' }}>◐</button>
        <div style={{ fontSize: 8, textAlign: 'center', color: 'var(--theme-text-ter)', marginTop: 3, fontFamily: 'VT323, monospace', letterSpacing: '0.06em' }}>
          {themeIdx === -1 ? 'AUTO' : currentPalette?.name?.split(' ')[0].toUpperCase()}
        </div>
      </div>

      {/* Compose button */}
      <div style={{ position: 'absolute', bottom: 16, left: 16, zIndex: 100 }}>
        <button onClick={() => setComposeOpen(true)}
          style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--theme-accent)', border: 'none', cursor: 'pointer', color: '#fff', fontSize: 18, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.2)', transition: 'background 0.8s' }}>+</button>
      </div>

      {composeOpen && (
        <ComposeModal
          onClose={() => setComposeOpen(false)}
          onPosted={() => { setComposeOpen(false); queryClient.invalidateQueries({ queryKey: ['posts'] }) }}
        />
      )}
    </div>
  )
}
