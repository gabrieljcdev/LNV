// Flow tracking (2026-10-22): how a person moves through the site and how long they listen. It runs ONLY for an account that has
// switched activity recording on (GET /api/activity/me/settings -> keep_listening, off by default); for everyone else this file
// does nothing but one settings check. Backend and rules: backend/services/flow.js.
//
// What is sent, and what never is:
//   sent    the order of steps in a visit; which view or drawer they were in and for how long; which control they clicked, as a short
//           slug (a data-track name, a stable id, or the control's fixed name like "search"); which platform played and for how many
//           milliseconds; how long the visit was
//   never   anything typed, the words on the page (post titles, names), search terms, where on the screen, an IP address, a URL
//           with a name in it (only the first part of the path). The one place visible text is read is inside a container marked
//           data-chrome (the nav strip, a drawer's header and sort chips), whose button names are fixed interface words, never content.
// The server drops anything that is not a tidy slug, so a mistake here cannot leak text.
import { authHeaders, isLoggedIn } from './auth'

const API = import.meta.env.VITE_API_URL || 'http://localhost:3001/api'
const FLUSH_MS = 8000, IDLE_NEW_SESSION_MS = 30 * 60 * 1000, MAX_QUEUE = 400

let on = false, checking = false, checkedFor = null
let sid = null, seq = 0, queue = [], timer = null
let base = 'feed', drawer = null, viewSince = 0, shownMs = 0, visibleSince = 0, startedAt = 0, hiddenAt = 0
const listens = new Set()

const slug = s => String(s ?? '').toLowerCase().replace(/[^a-z0-9:_./#-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60)
const nowMs = () => Date.now()
const newId = () => `${nowMs().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
const currentView = () => (drawer ? `drawer:${drawer}` : base)

function push(kind, props = {}) {
  if (!on) return
  if (queue.length >= MAX_QUEUE) queue.shift()
  queue.push({ t: nowMs(), seq: ++seq, kind, ...props })
}

async function send(keepalive = false) {
  if (!on || !queue.length) return
  const events = queue.splice(0, 50)
  try {
    const r = await fetch(`${API}/activity/flow`, { method: 'POST', headers: authHeaders(), body: JSON.stringify({ session: sid, events }), keepalive })
    const j = await r.json().catch(() => null)
    if (j?.off || r.status === 401) stop()      // switched off (or signed out) elsewhere: stop at once and drop what is queued
  } catch { /* a lost batch is fine: this is a picture of habits, not a ledger */ }
  if (queue.length && !keepalive) send()        // more than one batch waiting
}

function startSession() {
  sid = newId(); seq = 0; startedAt = nowMs(); visibleSince = startedAt; shownMs = 0; viewSince = startedAt
  const phone = window.matchMedia?.('(max-width: 767px)').matches
  push('session_start', { view: currentView(), meta: { device: phone ? 'phone' : 'desktop', width: Math.round(window.innerWidth / 100) * 100 } })
  push('view', { target: currentView() })
}
function endSession() {
  if (!sid) return
  for (const l of [...listens]) l.end(false)
  leaveView()
  const visible = shownMs + (document.visibilityState === 'visible' && visibleSince ? nowMs() - visibleSince : 0)
  push('session_end', { view: currentView(), ms: visible })
  send(true)
  sid = null
}

// ── views ──
// The view left carries the time spent in it; the view entered is the target.
function leaveView() { /* time is written when the next view starts (see change) or the session ends */
  if (!sid) return
  push('view', { view: currentView(), ms: nowMs() - viewSince, meta: { reason: 'leave' } })
}
function change(next, prev) {
  if (!on || !sid || next === prev) return
  push('view', { view: prev, target: next, ms: nowMs() - viewSince })
  viewSince = nowMs()
}
// The page's own place (feed, or the first part of a route: "artists", never the name after it).
export function setBase(v) {
  const prev = currentView(); base = v === '/' || !v ? 'feed' : `route:${slug(String(v).split('/').filter(Boolean)[0])}`
  change(currentView(), prev)
}
// A drawer is open (its kind: artists, labels...), or closed (null). Never the name inside it.
export function setDrawer(kind) {
  const prev = currentView(); drawer = kind ? slug(String(kind)) : null
  change(currentView(), prev)
}

// ── clicks: the control's label, never its text ──
const CONTROL = 'button, a, [role="button"], [role="tab"], [role="radio"], [role="switch"], input, select, summary, [data-track]'
function labelFor(el) {
  const t = el?.closest?.(CONTROL)
  if (!t) return null
  const dt = t.getAttribute('data-track')
  if (dt) return slug(dt)
  // A stable id: letters and dashes, not a number-bearing one (those name a post or a track).
  if (t.id && /^[a-z][a-z-]{1,30}$/i.test(t.id)) return `id:${slug(t.id)}`
  // A control's fixed name ("Search", "Theme", "Close"). Long labels or ones with digits are content (a title, a name), so not used.
  const name = t.getAttribute('aria-label') || t.getAttribute('title')
  if (name && name.length <= 22 && !/\d/.test(name)) return slug(name)
  const regionEl = t.closest('[data-region]')
  const region = regionEl?.getAttribute('data-region')
  // Inside marked UI chrome (the nav, a drawer's header and chips) the visible text is a fixed name ("labels", "Most posted"), not content.
  if (regionEl?.hasAttribute('data-chrome')) {
    const txt = (t.textContent || '').trim()
    if (txt && txt.length <= 22 && !/d/.test(txt)) return `${slug(region)}:${slug(txt)}`
  }
  return `${region ? `${slug(region)}:` : ''}${t.tagName.toLowerCase()}`
}
function onClick(e) {
  if (!on || !sid) return
  const target = labelFor(e.target)
  if (target) push('click', { view: currentView(), target })
}

// ── listening ──
// One per player. Time counts only while it is really playing when the player says so (YouTube, Spotify); players that give no signal
// (SoundCloud, Bandcamp, others) count from when they were started and are marked approx.
export function listenStart({ platform, ref, signals, autoplay }) {
  if (!on || !sid) return { state() {}, end() {} }
  let playingSince = signals ? 0 : (autoplay ? nowMs() : 0), ms = 0, done = false
  const l = {
    state(isPlaying) {
      if (done) return
      if (isPlaying && !playingSince) playingSince = nowMs()
      else if (!isPlaying && playingSince) { ms += nowMs() - playingSince; playingSince = 0 }
    },
    end(finished) {
      if (done) return
      done = true; listens.delete(l)
      if (playingSince) ms += nowMs() - playingSince
      if (ms >= 2000) push('listen', { view: currentView(), target: slug(platform), ref: ref || undefined, ms, meta: { finished: !!finished, approx: !signals } })
    },
  }
  listens.add(l)
  return l
}

// ── lifecycle ──
function onVisibility() {
  if (!on) return
  if (document.visibilityState === 'hidden') {
    shownMs += visibleSince ? nowMs() - visibleSince : 0; visibleSince = 0; hiddenAt = nowMs()
    send(true)
  } else {
    // Back after a long absence: that was a different visit.
    if (hiddenAt && nowMs() - hiddenAt > IDLE_NEW_SESSION_MS) { endSession(); startSession() }
    visibleSince = nowMs(); hiddenAt = 0
  }
}
function start() {
  if (on) return
  on = true
  startSession()
  document.addEventListener('click', onClick, true)
  document.addEventListener('visibilitychange', onVisibility)
  window.addEventListener('pagehide', endSession)
  window.addEventListener('lnv:compose', onCompose)
  timer = setInterval(() => send(), FLUSH_MS)
}
const onCompose = () => push('compose_open', { view: currentView() })
function stop() {
  if (!on) return
  on = false; queue = []; sid = null
  clearInterval(timer); timer = null
  document.removeEventListener('click', onClick, true)
  document.removeEventListener('visibilitychange', onVisibility)
  window.removeEventListener('pagehide', endSession)
  window.removeEventListener('lnv:compose', onCompose)
}

// The recording switch was just turned on or off (components/ActivityDrawer.jsx): start or stop at once, without a reload.
export function setFlowEnabled(want) {
  if (want && !on && isLoggedIn()) { checkedFor = localStorage.getItem('lnv_auth'); start() }
  else if (!want && on) { endSession(); stop() }
}

// Called on load and again whenever someone signs in or out: starts only for an account that has recording switched on.
export async function initFlow() {
  if (!isLoggedIn()) { if (on) { endSession(); stop() } checkedFor = null; return }
  const who = localStorage.getItem('lnv_auth')
  if (on || checking || checkedFor === who) return
  checking = true; checkedFor = who
  try {
    const r = await fetch(`${API}/activity/me/settings`, { headers: authHeaders() })
    const j = r.ok ? await r.json() : null
    if (j?.keep_listening) start()
  } catch { /* offline: try again next time */ } finally { checking = false }
}
