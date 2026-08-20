import { useState, useRef, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { usePlayer } from '../context/PlayerContext'
import { useLayout } from '../context/LayoutContext'
import ComposeModal from './ComposeModal'
import { getUserId } from '../lib/auth'
import { PALETTES, getAutoIndex, applyPalette } from '../services/themeService'

const API = import.meta.env.VITE_API_URL || 'http://localhost:3001/api'

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

function ytId(url) {
  if (!url) return null
  const m = url.match(/(?:v=|youtu\.be\/)([^&\s]{11})/)
  return m ? m[1] : null
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

// ── Open card — split layout (top: palette colour + media, bottom: theme colour + meta)

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
    <div onClick={e => e.stopPropagation()} style={{ padding: '8px 14px 12px', borderTop: '0.5px solid var(--theme-border)', flexShrink: 0, maxHeight: 160, overflowY: 'auto' }}>
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

function OpenCardContent({ post, cardBg, flip }) {
  const { openD3 } = useLayout() || {}
  const [activeTrackUrl, setActiveTrackUrl] = useState(null)
  const [commentsOpen, setCommentsOpen] = useState(false)
  const [commentCount, setCommentCount] = useState(post.commentCount || post.comment_count || 0)
  const type   = detectType(post)
  const note   = cleanNote(post.notes || post.body)
  const genres = post.genres || []
  const tracks = post.tracks || []
  const artist = artistName(post)
  const label  = labelName(post)
  const catNo  = post.labels?.[0]?.catalogue_number || post.catNo || ''
  const channel = post.channel || ''
  const platform = post.platform || ''

  const topFlex = type === 'livemix' ? '0 0 62%' : '0 0 50%'
  const botFlex = type === 'livemix' ? '0 0 38%' : '0 0 50%'

  const tagLabel = type === 'livemix' ? 'LIVE SET' : type === 'single' ? 'SINGLE' : 'ALBUM'
  const tagColor = type === 'livemix' ? '#e85d04' : type === 'single' ? '#4a90d9' : '#555'

  // Platform badge colours
  const platformColors = {
    youtube: '#f00', soundcloud: '#f50', bandcamp: '#1da0c3',
    spotify: '#1db954', mixcloud: '#5000ff', deezer: '#a238ff',
    applemusic: '#fc3c44', tidal: '#000', beatport: '#01ff95',
    ra: '#f03', boilerroom: '#111', discogs: '#333',
  }
  const platformColor = platformColors[platform] || 'var(--theme-accent)'
  const platformLabel = platform?.toUpperCase()

  // Build embed URL — activeTrackUrl (track click) overrides post stream_url
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

  const textPri = 'var(--theme-text-pri)'
  const textSec = 'var(--theme-text-sec)'
  const textTer = 'var(--theme-text-ter)'
  const pillBg  = 'var(--theme-dark3)'
  const pillTxt = 'var(--theme-text-sec)'
  const divider = 'var(--theme-border)'
  const noteBg  = 'var(--theme-dark3)'
  const noteBdr = 'var(--theme-border)'
  const botBg   = 'var(--theme-dark2)'
  const topBg   = cardBg

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

      {/* TOP — media */}
      <div style={{ flex: topFlex, background: topBg, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
        {type === 'livemix' ? (
          embedSrc ? (
            <iframe src={embedSrc}
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 'none' }}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen title={post.title} />
          ) : (
            <>
              {coverSrc(post) && <img src={coverSrc(post)} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: 0.4 }} />}
              <div style={{ position: 'relative', zIndex: 2, fontFamily: 'VT323, monospace', fontSize: 11, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.1em' }}>NO STREAM URL</div>
            </>
          )
        ) : (
          <div style={{ width: '72%', aspectRatio: '1', position: 'relative', borderRadius: 4, overflow: 'hidden', boxShadow: '0 8px 32px rgba(0,0,0,0.4)' }}>
            <CoverArt post={post} style={{ width: '100%', height: '100%' }} />
          </div>
        )}
      </div>

      {/* BOTTOM — metadata */}
      <div style={{ flex: botFlex, background: botBg, display: 'flex', flexDirection: 'column', overflowY: 'auto', overflowX: 'hidden' }}>

        {/* Meta block */}
        <div style={{ padding: '12px 14px 8px', flexShrink: 0, borderBottom: `0.5px solid ${divider}` }}>

          {/* Tags row — type + platform */}
          <div style={{ display: 'flex', gap: 5, marginBottom: 7, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', padding: '3px 8px', borderRadius: 3, background: tagColor, color: '#fff', fontFamily: 'VT323, monospace' }}>{tagLabel}</span>
            {platformLabel && (
              <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', padding: '3px 8px', borderRadius: 3, background: platformColor, color: platform === 'beatport' ? '#000' : '#fff', fontFamily: 'VT323, monospace' }}>{platformLabel}</span>
            )}
            {post.source === 'discogs' && (
              <span style={{ fontSize: 9, fontWeight: 700, padding: '3px 8px', borderRadius: 3, background: 'rgba(255,255,255,0.12)', color: textSec, fontFamily: 'VT323, monospace' }}>◈ DISCOGS</span>
            )}
          </div>

          {/* Artist */}
          <div
            onClick={e => { e.stopPropagation(); artist && openD3?.('artists', { filter: artist }) }}
            style={{ fontSize: 18, fontWeight: 900, color: textPri, lineHeight: 1.15, marginBottom: 2, fontFamily: 'Barlow, sans-serif', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: artist ? 'pointer' : 'default' }}
          >{artist || post.title}</div>

          {/* Title / channel */}
          <div style={{ fontSize: 13, color: textSec, marginBottom: 6, fontFamily: 'Barlow, sans-serif', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {type === 'livemix'
              ? [post.title, channel].filter(Boolean).join(' · ')
              : <>
                  {post.title}
                  {label && <> · <span onClick={e => { e.stopPropagation(); openD3?.('labels', { filter: label }) }} style={{ cursor: 'pointer', borderBottom: '1px dotted currentColor' }}>{label}</span></>}
                  {catNo && <> · {catNo}</>}
                  {post.year && <> · {post.year}</>}
                </>
            }
          </div>

          {/* Genres */}
          {genres.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 6 }}>
              {genres.slice(0, 6).map(g => (
                <span key={g}
                  onClick={e => { e.stopPropagation(); openD3?.('genres', { filter: g }) }}
                  style={{ fontSize: 11, background: pillBg, color: pillTxt, padding: '3px 10px', borderRadius: 99, fontFamily: 'Barlow, sans-serif', cursor: 'pointer' }}
                >{g}</span>
              ))}
            </div>
          )}

          {/* Tracklist — albums/singles only, compact */}
          {type !== 'livemix' && tracks.length > 0 && (
            <div style={{ marginTop: 4, maxHeight: 80, overflowY: 'auto' }}>
              {tracks.slice(0, 6).map((t, i) => {
                const tUrl = t.stream_url || t.youtube_url || null
                const isActive = activeTrackUrl && tUrl && activeTrackUrl === tUrl
                return (
                  <div key={i}
                    onClick={e => { e.stopPropagation(); if (tUrl) setActiveTrackUrl(isActive ? null : tUrl) }}
                    style={{ display: 'flex', gap: 6, alignItems: 'baseline', padding: '2px 4px', borderRadius: 4, cursor: tUrl ? 'pointer' : 'default', background: isActive ? 'rgba(232,93,4,0.12)' : 'transparent' }}>
                    <span style={{ fontSize: 9, color: isActive ? 'var(--theme-accent)' : textTer, fontFamily: 'monospace', flexShrink: 0, minWidth: 16 }}>{tUrl ? (isActive ? '▶' : '▷') : (t.position || i + 1)}</span>
                    <span style={{ fontSize: 11, color: isActive ? textPri : textSec, fontWeight: isActive ? 600 : 400, fontFamily: 'Barlow, sans-serif', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</span>
                    {t.duration && <span style={{ fontSize: 9, color: textTer, fontFamily: 'monospace', marginLeft: 'auto', flexShrink: 0 }}>{t.duration}</span>}
                  </div>
                )
              })}
              {tracks.length > 6 && <div style={{ fontSize: 10, color: textTer, fontFamily: 'VT323, monospace', marginTop: 2 }}>+{tracks.length - 6} more</div>}
            </div>
          )}
        </div>

        {/* Poster note */}
        {note && (
          <div style={{ padding: '8px 14px', flexShrink: 0, borderBottom: `0.5px solid ${divider}` }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <div style={{ width: 24, height: 24, borderRadius: '50%', flexShrink: 0, background: 'var(--theme-accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: '#fff', fontFamily: 'Barlow, sans-serif' }}>
                {(post.user?.username || post.username || '?').charAt(0).toUpperCase()}
              </div>
              <div style={{ flex: 1, background: noteBg, borderRadius: '0 8px 8px 8px', padding: '6px 10px', border: `0.5px solid ${noteBdr}` }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: textPri, marginBottom: 2, fontFamily: 'Barlow, sans-serif' }}>{post.user?.username || post.username}</div>
                <div style={{ fontSize: 12, color: textSec, lineHeight: 1.45, fontFamily: 'Barlow, sans-serif', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' }}>{note}</div>
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div style={{ padding: '6px 14px 10px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: commentsOpen ? 0 : 'auto' }}>
          <div style={{ display: 'flex', gap: 12 }}>
            <button onClick={e => { e.stopPropagation(); setCommentsOpen(v => !v) }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: textTer, padding: 0, fontFamily: 'Barlow, sans-serif' }}>
              <span style={{ color: 'var(--theme-accent)', fontWeight: 700 }}>{commentCount}</span>&nbsp;replies
            </button>
            {post.discogs_url && (
              <a href={post.discogs_url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
                style={{ fontSize: 11, color: textTer, fontFamily: 'Barlow, sans-serif', textDecoration: 'none' }}>↗ discogs</a>
            )}
            {type === 'livemix' && streamUrl && (
              <a href={streamUrl} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
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

// ── Showcase open content ─────────────────────────────────────────────────────

// Spotlight cards are real posts (post.is_spotlight, created server-side by
// posts.js's triggerSpotlights once a subject crosses a post-count
// milestone — see spotlightType/spotlightCount/spotlightCovers on the post,
// enriched by getFullPost). Not a client-side random shuffle.
function SpotlightOpenContent({ post, cardBg, flip, onFilterSubject }) {
  const name = post.spotlight_subject
  const type = post.spotlightType
  const count = post.spotlightCount || 0
  const covers = post.spotlightCovers || []
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* TOP HALF — avatar always on top, bg colour alternates */}
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
      {/* BOTTOM HALF — info always bottom, bg colour alternates */}
      <div style={{ flex: '0 0 50%', background: flip ? cardBg : '#fff', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '10px 12px 8px', flexShrink: 0, borderBottom: `0.5px solid ${flip ? 'rgba(255,255,255,0.15)' : '#f0ede6'}` }}>
          <span style={{ fontSize: 8, fontWeight: 700, letterSpacing: '0.09em', padding: '2px 6px', borderRadius: 3, display: 'inline-block', marginBottom: 5, background: 'var(--theme-accent)', color: '#fff', fontFamily: 'VT323, monospace' }}>
            {type === 'artist' ? 'Artist spotlight' : type === 'label' ? 'Label spotlight' : 'Genre spotlight'}
          </span>
          <div style={{ fontSize: 14, fontWeight: 700, color: flip ? '#fff' : '#111', lineHeight: 1.25, marginBottom: 2, fontFamily: 'Barlow, sans-serif' }}>{name}</div>
          <div style={{ fontSize: 11, color: flip ? 'rgba(255,255,255,0.6)' : '#777', marginBottom: 6, fontFamily: 'VT323, monospace', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>{count} post{count !== 1 ? 's' : ''} in the feed</span>
            <span onClick={e => { e.stopPropagation(); onFilterSubject?.(name) }} style={{ color: 'var(--theme-accent)', cursor: 'pointer', textDecoration: 'underline' }}>view all →</span>
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

// ── Three-state Feed Card ─────────────────────────────────────────────────────

function FeedCard({ item, isOpen, isHovered, cardBg, flip, onHoverStart, onHoverEnd, onClick, onFilterSubject }) {
  const { post } = item
  const isShowcase = !!post?.is_spotlight

  const restW  = isShowcase ? 300 : 160
  const hoverW = isShowcase ? 400 : 240
  const openW  = isShowcase ? 500
    : !isShowcase && detectType(post) === 'livemix' ? 560
    : 340
  const isLiveMix = !isShowcase && detectType(post) === 'livemix'
  const width  = isOpen
    ? (isLiveMix ? 'calc((100vw - 108px) * 0.5)' : openW)
    : isHovered ? hoverW : restW

  const typeLabel = !isShowcase ? (() => {
    const t = detectType(post)
    return t === 'livemix' ? 'Live set' : t === 'single' ? 'Single' : 'Album'
  })() : null

  const idLabel = isShowcase ? `S–${String(post.id).padStart(3, '0')}` : `#${String(post?.id || '').padStart(3, '0')}`
  const subLabel = isShowcase ? (post.spotlightType === 'artist' ? 'Artist spotlight' : post.spotlightType === 'label' ? 'Label spotlight' : 'Genre spotlight') : 'Post'

  return (
    <div
      style={{ flexShrink: 0, position: 'relative', width, height: '100%', background: cardBg, borderRight: '1px solid var(--theme-border)', overflow: 'hidden', cursor: 'pointer', transition: 'width 0.38s cubic-bezier(0.4,0,0.2,1)' }}
      onMouseEnter={onHoverStart}
      onMouseLeave={onHoverEnd}
      onClick={onClick}
    >

      {/* REST */}
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '22px 16px', opacity: isHovered || isOpen ? 0 : 1, transform: isHovered || isOpen ? 'translateX(-12px)' : 'none', transition: 'opacity 0.15s, transform 0.32s', pointerEvents: 'none' }}>
        <span style={{ fontSize: 8, fontWeight: 600, letterSpacing: '0.11em', textTransform: 'uppercase', color: 'var(--theme-text-ter)', fontFamily: 'Barlow, sans-serif' }}>{subLabel}</span>
        {isShowcase && <span style={{ fontSize: 12, fontWeight: 700, lineHeight: 1.3, color: 'var(--theme-text-sec)', fontFamily: 'Barlow, sans-serif' }}>{post.spotlight_subject}</span>}
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 10, fontFamily: 'monospace', color: 'var(--theme-text-ter)' }}>{idLabel}</span>
          {!isShowcase && typeLabel && <span style={{ writingMode: 'vertical-rl', fontSize: 8, fontWeight: 500, letterSpacing: '0.09em', textTransform: 'uppercase', color: 'var(--theme-text-ter)', fontFamily: 'Barlow, sans-serif' }}>{typeLabel}</span>}
        </div>
      </div>

      {/* HOVER */}
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', opacity: isHovered && !isOpen ? 1 : 0, transform: isHovered && !isOpen ? 'none' : isOpen ? 'translateX(-14px)' : 'translateX(14px)', transition: 'opacity 0.18s, transform 0.38s', pointerEvents: isHovered && !isOpen ? 'all' : 'none' }}>
        {isShowcase
          ? <div style={{ flex: 1, background: cardBg, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', overflow: 'hidden' }}>
              {(post.spotlightCovers || []).slice(0, 4).map((p, i) => coverSrc(p) && <img key={p.id || i} src={coverSrc(p)} alt="" style={{ position: 'absolute', width: '50%', height: '50%', left: `${(i % 2) * 50}%`, top: `${Math.floor(i / 2) * 50}%`, objectFit: 'cover', opacity: 0.25 }} />)}
              <div style={{ position: 'relative', zIndex: 2, width: 72, height: 72, borderRadius: post.spotlightType === 'artist' ? '50%' : 10, background: 'rgba(255,255,255,0.15)', border: '2px solid rgba(255,255,255,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, fontWeight: 900, color: '#fff', fontFamily: 'Barlow, sans-serif' }}>
                {post.spotlight_subject.charAt(0).toUpperCase()}
              </div>
            </div>
          : <CoverArt post={post} style={{ flex: 1 }} />
        }
        <div style={{ padding: '12px 14px 14px', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', gap: 3, background: 'var(--theme-dark2)', flexShrink: 0, height: 88 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--theme-text-pri)', lineHeight: 1.25, fontFamily: 'Barlow, sans-serif', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {isShowcase ? post.spotlight_subject : (artistName(post) || post?.title)}
          </div>
          <div style={{ fontSize: 11, color: 'var(--theme-text-sec)', fontFamily: 'Barlow, sans-serif', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {isShowcase ? `${post.spotlightCount || 0} posts in feed` : post?.title}
          </div>
          <div style={{ fontSize: 8, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--theme-text-ter)', marginTop: 3, fontFamily: 'Barlow, sans-serif' }}>click to open</div>
        </div>
      </div>

      {/* OPEN */}
      <div style={{ position: 'absolute', inset: 0, opacity: isOpen ? 1 : 0, transform: isOpen ? 'none' : 'translateX(14px)', transition: 'opacity 0.2s 0.06s, transform 0.38s', pointerEvents: isOpen ? 'all' : 'none' }}>
        {isShowcase
          ? <SpotlightOpenContent post={post} cardBg={cardBg} flip={flip} onFilterSubject={onFilterSubject} />
          : <OpenCardContent post={post} cardBg={cardBg} flip={flip} />
        }
      </div>
    </div>
  )
}

// ── Build shelf items ─────────────────────────────────────────────────────────
// One item per post, in feed order. Spotlight cards (post.is_spotlight) are
// real posts returned by /api/posts alongside everything else — server-side
// (posts.js's triggerSpotlights), not a client-side shuffle — so no separate
// injection pass is needed here.

function buildShelfItems(posts) {
  return posts.map(post => ({ key: `p-${post.id}`, post }))
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
  const [openKey, setOpenKey]         = useState(null)
  const [hoverId, setHoverId]         = useState(null)
  const [themeIdx, setThemeIdx]       = useState(-1)
  const [pickerOpen, setPickerOpen]   = useState(false)
  const [composeOpen, setComposeOpen] = useState(false)
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch]           = useState('')
  const hoverTimers                   = useRef({})
  const shelfItems                    = useRef([])
  const lastPostsSignature             = useRef(null)
  const userInteracted                = useRef(false)
  const queryClient                   = useQueryClient()
  const { feedRef, handleFeedScroll } = useLayout() || {}

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
    // On first load (or a new search result set): open the first post, hover the first item
    if (shelfItems.current.length > 0 && (!userInteracted.current || search)) {
      const firstKey = shelfItems.current[0].key
      setHoverId(firstKey)
      setOpenKey(firstKey)
    }
  }

  // Scroll drag
  useEffect(() => {
    const el = feedRef?.current
    if (!el) return
    let down = false, sx = 0, sl = 0
    const onDown  = e => { down = true; sx = e.pageX - el.offsetLeft; sl = el.scrollLeft; el.style.cursor = 'grabbing' }
    const onUp    = () => { down = false; el.style.cursor = 'default' }
    const onMove  = e => { if (!down) return; e.preventDefault(); const ns = sl - (e.pageX - el.offsetLeft - sx) * 1.5; el.scrollLeft = ns; handleFeedScroll?.(ns) }
    const onScroll = () => handleFeedScroll?.(el.scrollLeft)
    el.addEventListener('mousedown', onDown); el.addEventListener('mouseleave', onUp)
    el.addEventListener('mouseup', onUp); el.addEventListener('mousemove', onMove); el.addEventListener('scroll', onScroll)
    return () => { el.removeEventListener('mousedown', onDown); el.removeEventListener('mouseleave', onUp); el.removeEventListener('mouseup', onUp); el.removeEventListener('mousemove', onMove); el.removeEventListener('scroll', onScroll) }
  }, [feedRef, handleFeedScroll])

  // Keyboard
  useEffect(() => {
    const h = e => { if (e.key === 'Escape') { setOpenKey(null); setPickerOpen(false) } }
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h)
  }, [])

  // Hover
  function startHover(key) {
    clearTimeout(hoverTimers.current[key + 'c'])
    userInteracted.current = true
    if (hoverId !== key) setHoverId(null)
    hoverTimers.current[key + 'o'] = setTimeout(() => { if (openKey !== key) setHoverId(key) }, 100)
  }
  function endHover(key) {
    clearTimeout(hoverTimers.current[key + 'o'])
    hoverTimers.current[key + 'c'] = setTimeout(() => setHoverId(prev => prev === key ? null : prev), 260)
  }
  function handleClick(key) {
    if (openKey === key) return  // stay open — only another card click closes
    setOpenKey(key)
    userInteracted.current = true
    const items = shelfItems.current
    const idx = items.findIndex(item => item.key === key)
    const nextItem = items[idx + 1]
    setHoverId(nextItem ? nextItem.key : null)
  }

  function getCardBg(item, idx) {
    if (item.post?.is_spotlight) return 'var(--theme-showcase)'
    return `var(--theme-${POST_BG_CYCLE[idx % POST_BG_CYCLE.length]})`
  }

  // Spotlight card → "view all" filters the feed to that subject, reusing
  // the search bar (Phase 7) rather than a separate filter mechanism.
  function filterToSubject(name) {
    setSearchInput(name)
    setSearch(name)
    userInteracted.current = true
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
        {shelfItems.current.map((item, idx) => (
          <FeedCard key={item.key} item={item} isOpen={openKey === item.key} isHovered={hoverId === item.key}
            cardBg={getCardBg(item, idx)} flip={idx % 2 !== 0} onHoverStart={() => startHover(item.key)}
            onHoverEnd={() => endHover(item.key)} onClick={() => handleClick(item.key)} onFilterSubject={filterToSubject} />
        ))}
      </div>

      {/* Search */}
      <div style={{ position: 'absolute', top: 16, right: 16, zIndex: 100, display: 'flex', alignItems: 'center', background: 'var(--theme-dark3)', border: '1px solid var(--theme-border)', borderRadius: 99, padding: '6px 14px', boxShadow: '0 2px 8px rgba(0,0,0,0.2)' }}>
        <span style={{ color: 'var(--theme-text-ter)', fontSize: 13, marginRight: 6 }}>{searching ? '◐' : '⌕'}</span>
        <input
          value={searchInput}
          onChange={e => { setSearchInput(e.target.value); userInteracted.current = true }}
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
