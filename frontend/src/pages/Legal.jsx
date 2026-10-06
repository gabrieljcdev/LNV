import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { applyPalette, getAutoIndex } from '../services/themeService'

// Privacy and Terms (2026-10-06, the legal pass) — /privacy and /terms.
// FIRST DRAFTS written from what the code actually does; not legal advice.
// Have them checked before launch. [Square brackets] are blanks to fill:
// who runs the site, an address, the final name and domain.
// Keep in step with: backend services/accountService.js (export/delete),
// routes/reports.js (takedowns), logService (30-day log, shortened IPs),
// authService (30-day sessions, scrypt passwords).

const SANS = "'Barlow', sans-serif", MONO = "'IBM Plex Mono', monospace"
const PRI = 'var(--theme-text-pri)', SEC = 'var(--theme-text-sec)', TER = 'var(--theme-text-ter)'
const CONTACT = 'hello@latenightvibes.com'
const UPDATED = '6 October 2026'

const h2 = { fontFamily: SANS, fontSize: 20, fontWeight: 800, margin: '30px 0 8px', color: PRI }
const p = { fontFamily: SANS, fontSize: 16, lineHeight: 1.6, color: SEC, margin: '0 0 10px' }
const li = { ...p, margin: '0 0 6px' }
const a = { color: 'var(--theme-accent)' }

function Page({ title, children }) {
  useEffect(() => { applyPalette(getAutoIndex()); document.title = `${title} · Late Night Vibes` }, [title])
  return (
    <div style={{ minHeight: '100vh', background: 'var(--theme-bg)', color: PRI, padding: '40px 16px 64px', boxSizing: 'border-box', transition: 'background 0.8s' }}>
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        <Link to="/" style={{ textDecoration: 'none', color: PRI }}>
          <div style={{ fontFamily: SANS, fontWeight: 900, fontSize: 36, letterSpacing: '-0.03em', lineHeight: 0.9 }}>Late Night Vibes</div>
          <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: TER, marginTop: 10 }}>← back to the feed</div>
        </Link>
        <article style={{ marginTop: 28, background: 'var(--theme-sidebar)', borderRadius: 32, padding: 'clamp(22px, 5vw, 44px)', boxShadow: '0 0 48px rgba(0,0,0,0.08), 0 30px 60px -12px rgba(0,0,0,0.15)' }}>
          <h1 style={{ fontFamily: SANS, fontWeight: 900, fontSize: 'clamp(32px, 6vw, 46px)', letterSpacing: '-0.02em', lineHeight: 1, margin: 0 }}>{title}</h1>
          <div style={{ fontFamily: MONO, fontSize: 11.5, color: TER, margin: '10px 0 0' }}>Last updated {UPDATED}</div>
          {children}
          <nav style={{ marginTop: 34, paddingTop: 16, borderTop: '1px solid var(--theme-border)', display: 'flex', gap: 18, flexWrap: 'wrap', fontFamily: SANS, fontSize: 14 }}>
            <Link to="/privacy" style={a}>Privacy</Link>
            <Link to="/terms" style={a}>Terms</Link>
            <a href={`mailto:${CONTACT}`} style={a}>{CONTACT}</a>
          </nav>
        </article>
      </div>
    </div>
  )
}

export function Privacy() {
  return (
    <Page title="Privacy">
      <p style={{ ...p, marginTop: 20, color: PRI, fontSize: 17.5 }}>Late Night Vibes is a place to share records. We collect as little as we can, never sell it, and show no ads of our own. Here’s exactly what we keep and why.</p>
      <p style={p}>Late Night Vibes is run by [YOUR NAME OR COMPANY], [ADDRESS], United Kingdom — the “data controller” under UK data protection law (UK GDPR). Questions: <a href={`mailto:${CONTACT}`} style={a}>{CONTACT}</a>.</p>

      <h2 style={h2}>What we keep</h2>
      <ul style={{ paddingLeft: 20, margin: 0 }}>
        <li style={li}><b style={{ color: PRI }}>Your account:</b> username, email address and password. The password is stored scrambled (scrypt) — nobody, us included, can read it.</li>
        <li style={li}><b style={{ color: PRI }}>What you do here:</b> your posts, the records you ♥, replies, who you follow, your favourites, playlists, your profile bio, and your choices for introductions and the community boards.</li>
        <li style={li}><b style={{ color: PRI }}>Signing in:</b> a sign-in token, kept for 30 days, stored scrambled on our side.</li>
        <li style={li}><b style={{ color: PRI }}>A short technical log</b> of errors, sign-ins and changes, kept for 30 days to keep the site running and safe. It holds a shortened IP address (the last part removed), so it can’t pinpoint you.</li>
        <li style={li}><b style={{ color: PRI }}>Reports</b> you send us, with the email you give for a reply.</li>
      </ul>
      <p style={p}>We don’t use advertising or tracking cookies, and no analytics. Your browser stores only what keeps you signed in and which feed you were on.</p>

      <h2 style={h2}>Why (our legal basis)</h2>
      <p style={p}>To run the account you asked for (contract), and to keep the site secure and working (legitimate interests). We email you only about your account — confirming your address or resetting your password.</p>

      <h2 style={h2}>Who can see what</h2>
      <p style={p}>Your username, profile, posts, the records you keep, your replies, who you follow and your playlists are public — that’s what the site is. Your email, password and settings are never shown to anyone.</p>

      <h2 style={h2}>Other services</h2>
      <p style={p}>The players on cards are the platforms’ own (YouTube, SoundCloud, Bandcamp, Mixcloud, Spotify and others). When you press play, that platform may set its own cookies and record what you play, under its own privacy policy. We look up record details from Discogs, Spotify, Last.fm and YouTube — we send them the music being looked up, never anything about you.</p>
      <p style={p}>YouTube’s players and data are provided under the <a href="https://www.youtube.com/t/terms" style={a} target="_blank" rel="noopener noreferrer">YouTube Terms of Service</a>; Google’s privacy policy is at <a href="https://policies.google.com/privacy" style={a} target="_blank" rel="noopener noreferrer">policies.google.com/privacy</a>.</p>
      <p style={p}>Emails are sent through [EMAIL PROVIDER]. The site is hosted by [HOSTING PROVIDER]. [Say where data is stored, e.g. UK / EU.]</p>

      <h2 style={h2}>Your rights</h2>
      <ul style={{ paddingLeft: 20, margin: 0 }}>
        <li style={li}><b style={{ color: PRI }}>Download your data</b> any time — on your profile, “Download my data” gives you everything we hold about you as a file.</li>
        <li style={li}><b style={{ color: PRI }}>Delete your account</b> — on your profile. It removes your account and everything you made, straight away.</li>
        <li style={li}><b style={{ color: PRI }}>Correct it</b> — edit your profile, posts and playlists yourself, or ask us.</li>
        <li style={li}>You can also object, or ask us to restrict what we do, by emailing <a href={`mailto:${CONTACT}`} style={a}>{CONTACT}</a>. If you’re not happy with our answer you can complain to the UK Information Commissioner’s Office (<a href="https://ico.org.uk" style={a} target="_blank" rel="noopener noreferrer">ico.org.uk</a>).</li>
      </ul>

      <h2 style={h2}>How long we keep it</h2>
      <p style={p}>Your account and what you made, until you delete them. Sign-ins and the technical log, 30 days. Reports, until they’re dealt with and for [12 MONTHS] after, in case a dispute comes back.</p>

      <h2 style={h2}>Age</h2>
      <p style={p}>You need to be at least 13 to make an account.</p>

      <h2 style={h2}>Changes</h2>
      <p style={p}>If this changes in a way that matters, we’ll say so on the site before it takes effect.</p>
    </Page>
  )
}

export function Terms() {
  return (
    <Page title="Terms">
      <p style={{ ...p, marginTop: 20, color: PRI, fontSize: 17.5 }}>The short version: share music you love, be decent, don’t upload anything — link to it. These terms are between you and [YOUR NAME OR COMPANY], who runs Late Night Vibes.</p>

      <h2 style={h2}>Your account</h2>
      <p style={p}>You need to be 13 or over. Keep your password to yourself; you’re responsible for what’s posted from your account. You can delete it any time from your profile.</p>

      <h2 style={h2}>What you post</h2>
      <p style={p}>Posts are links to music on other platforms, with your own notes. You keep the rights to what you write; you let us show it on the site and in other people’s feeds. Don’t post anything illegal, hateful, harassing, sexually explicit, or spam — and don’t pretend to be someone else.</p>
      <p style={p}>We don’t host the music. Players are the platforms’ own, and their terms apply when you use them.</p>

      <h2 style={h2}>Rights holders and takedowns</h2>
      <p style={p}>If something here uses your work without permission, use <b style={{ color: PRI }}>report</b> on the post and choose “Copyright / takedown”, or email <a href={`mailto:${CONTACT}`} style={a}>{CONTACT}</a>. Tell us who you are, what you own, where it is here, and that you’re the rights holder or allowed to act for them. We take down infringing posts promptly and tell the person who posted it. If you think your post was taken down by mistake, reply to us and we’ll look again.</p>

      <h2 style={h2}>Reports and moderation</h2>
      <p style={p}>Anyone can report a post. We may remove posts or accounts that break these terms, and we’ll try to say why.</p>

      <h2 style={h2}>Record data and credits</h2>
      <p style={p}>Record details come from Discogs, Spotify, Last.fm, YouTube and the platforms themselves. This application uses Discogs’ API but is not affiliated with, sponsored or endorsed by Discogs. “Discogs” is a trademark of Zink Media, LLC. YouTube players and data are provided under the <a href="https://www.youtube.com/t/terms" style={a} target="_blank" rel="noopener noreferrer">YouTube Terms of Service</a>. Spotify and Last.fm data is used under their developer terms.</p>

      <h2 style={h2}>The service</h2>
      <p style={p}>Late Night Vibes is free and offered as it is, while it’s being built — features (marked α alpha) may change or go. We’re not responsible for other platforms’ content or players. Nothing in these terms limits rights you have by law.</p>

      <h2 style={h2}>Changes and law</h2>
      <p style={p}>If these terms change in a way that matters, we’ll say so on the site first. They’re governed by the law of England and Wales.</p>
    </Page>
  )
}
