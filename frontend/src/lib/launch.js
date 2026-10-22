// The launch lock (2026-10-22): scrolling is held until everything the first moments depend on has loaded, so the page never lurches while it is still filling in.
// The lock is a set of named holds. It starts with the reveal animation and the fonts; the feed adds its own when it mounts and lets it go once its first page has
// arrived and every card is on the page. When the last hold goes the lock opens, once, for good (later loads, feed switches and searches never re-lock).
// A plain timer opens it regardless after LAUNCH_FAILSAFE_MS, so a failed request, an offline start or a hidden tab can never leave the page stuck.
import { useSyncExternalStore } from 'react'

export const LAUNCH_FAILSAFE_MS = 8000
const holds = new Set(['animation', 'fonts'])
const listeners = new Set()
let locked = true

const open = () => { holds.clear(); if (locked) { locked = false; listeners.forEach(f => f()) } }
export function holdLaunch(name) { if (locked) holds.add(name) }
export function releaseLaunch(name) { if (!locked) return; holds.delete(name); if (!holds.size) open() }
// For the shield and key guard in Preloader.
export function useLaunchLocked() {
  return useSyncExternalStore(f => { listeners.add(f); return () => listeners.delete(f) }, () => locked, () => false)
}
// What is still holding the lock (for checking it works).
export const launchState = () => ({ locked, holding: [...holds] })

if (typeof window !== 'undefined') {
  setTimeout(open, LAUNCH_FAILSAFE_MS)
  try { document.fonts?.ready.then(() => releaseLaunch('fonts')) } catch { releaseLaunch('fonts') }
}
