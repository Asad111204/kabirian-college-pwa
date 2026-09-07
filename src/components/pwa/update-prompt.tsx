'use client'

import * as React from 'react'
import { useSerwist } from '@serwist/turbopack/react'
import { toast } from 'sonner'

/**
 * "A new version is ready — Reload."
 *
 * The service worker is built without `skipWaiting`, so a new version sits
 * and waits until the person chooses to reload; nothing is refreshed under a
 * half-entered attendance sheet. Choosing Reload tells the waiting worker to
 * take over, and the page reloads once it is in control.
 */
export function UpdatePrompt() {
  const { serwist } = useSerwist()

  React.useEffect(() => {
    if (!serwist) return
    const onWaiting = () => {
      toast.info('A new version of the app is ready.', {
        id: 'app-update',
        duration: Infinity,
        action: {
          label: 'Reload',
          onClick: () => {
            serwist.addEventListener('controlling', () => window.location.reload())
            serwist.messageSkipWaiting()
          },
        },
      })
    }
    serwist.addEventListener('waiting', onWaiting)
    return () => serwist.removeEventListener('waiting', onWaiting)
  }, [serwist])

  return null
}
