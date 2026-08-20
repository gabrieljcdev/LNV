export const getUser    = () => sessionStorage.getItem('user')
export const getUserId  = () => sessionStorage.getItem('userId')
export const isLoggedIn = () => !!getUser()
export const isAdmin    = () => getUser() === 'lnv_admin'

export function login(username, userId) {
  sessionStorage.setItem('user',   username)
  sessionStorage.setItem('userId', userId)
}

export function logout() {
  sessionStorage.removeItem('user')
  sessionStorage.removeItem('userId')
}
