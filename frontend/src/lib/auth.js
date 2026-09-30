export const getUser    = () => sessionStorage.getItem('user')
export const getUserId  = () => sessionStorage.getItem('userId')
export const isLoggedIn = () => !!getUser()
export const isAdmin    = () => getUser() === 'lnv_admin'

export function login(username, userId) {
  sessionStorage.setItem('user',   username)
  sessionStorage.setItem('userId', userId)
}

// Same as the /login page: an existing username is reused, a new one is
// created; no password. Used by the compose bar so picking a name doesn't
// leave the feed. Returns the username.
export async function pickUsername(name) {
  const API = import.meta.env.VITE_API_URL
  const get = () => fetch(`${API}/users/${encodeURIComponent(name)}`)
  let res = await get()
  if (!res.ok) {
    res = await fetch(`${API}/users`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: name }) })
    if (res.status === 409) res = await get() // created in another tab meanwhile
  }
  if (!res.ok) throw new Error('could not reach the server')
  const user = await res.json()
  login(user.username, user.id)
  return user.username
}

export function logout() {
  sessionStorage.removeItem('user')
  sessionStorage.removeItem('userId')
}
