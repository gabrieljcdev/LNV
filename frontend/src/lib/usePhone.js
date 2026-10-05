import { useSyncExternalStore } from 'react'

// Phone layout (2026-10-05): below this width the site switches from the
// horizontal shelf of 800px cards to the phone layout — one post per
// screen, swiped sideways (PhoneFeed in Feed.jsx), with a bottom nav instead of the
// strip (PhoneNav.jsx) and drawers as full-screen sheets.
// Also phones held sideways: a touch screen under 500px tall (a landscape
// phone is wider than 767px, and the desktop cards are 820px tall).
export const PHONE_QUERY = '(max-width: 767px), (pointer: coarse) and (max-height: 500px)'

const mq = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(PHONE_QUERY) : null

export const isPhone = () => !!mq?.matches

export function usePhone() {
  return useSyncExternalStore(
    cb => { mq?.addEventListener('change', cb); return () => mq?.removeEventListener('change', cb) },
    isPhone,
    () => false,
  )
}
