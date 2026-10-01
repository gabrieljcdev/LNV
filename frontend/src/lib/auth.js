// Accounts (2026-10-01): username + email + password, email confirmed
// before first sign-in (backend: routes/auth.js). Signing in returns a
// session token, kept in localStorage with the user and sent as
// `Authorization: Bearer …` on every request that changes something
// (authHeaders below). The backend decides who you are from that token —
// nothing the browser claims about itself is trusted.

const API = import.meta.env.VITE_API_URL || 'http://localhost:3001/api'
const KEY = 'lnv_auth'

// The old password-less identity lived in sessionStorage; drop it.
try { sessionStorage.removeItem('user'); sessionStorage.removeItem('userId') } catch { /* ignore */ }

function read() {
  try { return JSON.parse(localStorage.getItem(KEY) || 'null') } catch { return null }
}
function write(v) {
  try { v ? localStorage.setItem(KEY, JSON.stringify(v)) : localStorage.removeItem(KEY) } catch { /* ignore */ }
}

export const getToken   = () => read()?.token || null
export const getUser    = () => read()?.user?.username || null
export const getUserId  = () => (read()?.user?.id != null ? String(read().user.id) : null)
export const isLoggedIn = () => !!getToken()
export const isAdmin    = () => !!read()?.user?.admin

// Headers for any request that writes: JSON + the session token.
export function authHeaders(extra = {}) {
  const t = getToken()
  return { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}), ...extra }
}

async function call(path, body) {
  const r = await fetch(`${API}/auth/${path}`, { method: 'POST', headers: authHeaders(), body: JSON.stringify(body || {}) })
  const data = await r.json().catch(() => ({}))
  if (!r.ok) { const e = new Error(data.error || 'Something went wrong. Try again.'); Object.assign(e, data, { status: r.status }); throw e }
  return data
}

// → { email, devVerifyUrl? }  (devVerifyUrl only when the backend has no email set up)
export const register = (username, email, password) => call('register', { username, email, password })
export const resendConfirmation = email => call('resend', { email })

export async function signIn(login, password) {
  const { token, user } = await call('login', { login, password })
  write({ token, user })
  return user
}

export async function logout() {
  try { await call('logout') } catch { /* already gone */ }
  write(null)
}

// Check the stored session is still good (expired / signed out elsewhere);
// clears it if not. Call once on load.
export async function refreshSession() {
  if (!getToken()) return null
  try {
    const r = await fetch(`${API}/auth/me`, { headers: authHeaders() })
    if (r.status === 401) { write(null); return null }
    if (!r.ok) return read()?.user || null
    const { user } = await r.json()
    write({ token: getToken(), user })
    return user
  } catch { return read()?.user || null }
}
