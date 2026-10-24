import { useEffect, useState } from 'react'
import { markTourSeen } from '../lib/listening'

// "How it works" (2026-10-23, gabriel): a short walk through the site, shown first in the window after an account is made (then "where do you listen?", then
// Discogs), and again any time from the profile menu. Seen once per browser. Plain words, one idea a slide; keep it true to what the site does.
const SANS = "'Barlow', sans-serif"
const PRI = 'var(--theme-text-pri)', SEC = 'var(--theme-text-sec)', TER = 'var(--theme-text-ter)', LINE = 'var(--theme-border)'
const pill = { border: `1px solid ${LINE}`, background: 'none', color: PRI, borderRadius: 99, padding: '7px 18px', fontFamily: SANS, fontSize: 14, fontWeight: 600, cursor: 'pointer' }
const pillOn = { ...pill, border: 0, background: 'var(--theme-accent)', color: '#fff' }

const SLIDES = [
  { title: 'Welcome to Chewing the Ceiling', body: [
    'A shelf of records that people are digging. Each card is one record somebody posted, with a line on why they love it.',
    'Scroll (or swipe) to move along the shelf. Every few cards you will meet an artist or a label, with everything on Discogs by them.',
  ] },
  { title: 'Play it', body: [
    'Press any track on a card to play it, right there. The little source buttons ("plays from") let you pick YouTube, Spotify, SoundCloud or Bandcamp when a track has more than one.',
    '☆ highlights a track you love, and + puts a track in one of your playlists.',
  ] },
  { title: 'Keep it', body: [
    '♥ puts a record in your own feed, and in your followers\' feeds, with a note of where you found it. Tap it again to take it out.',
    '"hide" quietly drops a record from your view (nobody is told), and the bookmark beside an artist or label saves it for later.',
  ] },
  { title: 'Post a record', body: [
    'Press the new post button on the left strip, then paste a link: Discogs, YouTube, Bandcamp, SoundCloud, Spotify, Apple Music, Deezer or Tidal. We read the record and find the links for each track.',
    'Add a line about why it is special. Check the track links shown before you post: if one looks wrong we will say so.',
  ] },
  { title: 'Dig around', body: [
    'The left strip opens drawers: artists, labels, live sets and community. Click any artist or label name, on a card or in a list, to open it.',
    'The ▶ plays a random track, and the search finds records, artists and people.',
  ] },
  { title: 'People', body: [
    'Your home feed is you plus the people you follow. Your feed starts empty and fills as people post, so follow people you like: find them in the community drawer or with the search box there.',
    'The bell shows who followed you, tagged you (@name) or replied. Your initial at the bottom of the strip opens your profile and "Your data": nothing about how you use the site is recorded unless you switch it on.',
  ] },
]

export function WelcomeTour({ onDone }) {
  const [i, setI] = useState(0)
  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onDone(); if (e.key === 'ArrowRight') setI(n => Math.min(SLIDES.length - 1, n + 1)); if (e.key === 'ArrowLeft') setI(n => Math.max(0, n - 1)) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onDone])
  const s = SLIDES[i], last = i === SLIDES.length - 1
  return (
    <div onMouseDown={e => { if (e.target === e.currentTarget) onDone() }}
      style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(3px)', display: 'grid', placeItems: 'center', padding: 16 }}>
      <div role="dialog" aria-label="How the site works"
        style={{ width: 'min(480px, 100%)', maxHeight: '90vh', overflowY: 'auto', borderRadius: 20, padding: '24px 26px', background: 'var(--theme-dark3)', border: `1px solid ${LINE}`, color: PRI, fontFamily: SANS, boxShadow: '0 30px 80px rgba(0,0,0,0.5)' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <div style={{ fontSize: 11, letterSpacing: '0.16em', textTransform: 'uppercase', color: TER, fontWeight: 600, flex: 1 }}>How it works · {i + 1} of {SLIDES.length}</div>
          <button onClick={onDone} aria-label="Close" style={{ border: 0, background: 'none', color: SEC, fontSize: 22, cursor: 'pointer', lineHeight: 1 }}>×</button>
        </div>
        <div style={{ fontWeight: 800, fontSize: 24, lineHeight: 1.2, margin: '10px 0 12px' }}>{s.title}</div>
        {s.body.map((p, k) => <p key={k} style={{ margin: '0 0 10px', fontSize: 15.5, lineHeight: 1.55, color: SEC }}>{p}</p>)}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 18 }}>
          <div style={{ display: 'flex', gap: 6, flex: 1 }} aria-hidden="true">
            {SLIDES.map((_, k) => <span key={k} style={{ width: 8, height: 8, borderRadius: '50%', background: k === i ? 'var(--theme-accent)' : LINE }} />)}
          </div>
          {i > 0 && <button onClick={() => setI(i - 1)} style={pill}>Back</button>}
          {!last && <button onClick={() => onDone()} style={{ ...pill, border: 0, color: SEC, fontWeight: 400 }}>Skip</button>}
          <button onClick={() => (last ? onDone() : setI(i + 1))} style={pillOn}>{last ? 'Got it' : 'Next'}</button>
        </div>
      </div>
    </div>
  )
}

// Opened from the profile menu ("How it works"): any component can ask for it with this event.
export function TourOnDemand() {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    const on = () => setOpen(true)
    window.addEventListener('lnv-tour', on)
    return () => window.removeEventListener('lnv-tour', on)
  }, [])
  return open ? <WelcomeTour onDone={() => { markTourSeen(); setOpen(false) }} /> : null
}
