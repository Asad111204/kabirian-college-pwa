'use client'

import * as React from 'react'

function subscribe(onChange: () => void) {
  window.addEventListener('online', onChange)
  window.addEventListener('offline', onChange)
  return () => {
    window.removeEventListener('online', onChange)
    window.removeEventListener('offline', onChange)
  }
}

const getSnapshot = () => navigator.onLine
// On the server there is no network to be off; render as online and let the
// browser correct it the moment it hydrates.
const getServerSnapshot = () => true

/**
 * Whether the browser believes it has a connection. `navigator.onLine` is a
 * hint, not a promise — a captive portal counts as "online" — so the API
 * client still fails fast on a real network error; this is for the banner
 * and for disabling a submit before it can fail.
 */
export function useOnlineStatus(): boolean {
  return React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}

/** True when the app was opened from the home screen rather than a browser tab. */
export function isStandaloneDisplay(): boolean {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true
}
