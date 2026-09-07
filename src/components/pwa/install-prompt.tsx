'use client'

import * as React from 'react'
import { Share } from 'lucide-react'
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { isStandaloneDisplay } from '@/lib/pwa/use-online'

/** Chrome's install event, which the browser hands us to replay on our own button. */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export type InstallMethod = 'prompt' | 'ios' | null

/** iOS Safari never fires the install event; the person adds the app by hand. */
export function isIosSafari(userAgent: string): boolean {
  return /iPhone|iPad|iPod/.test(userAgent) && /Safari/.test(userAgent) && !/CriOS|FxiOS|EdgiOS/.test(userAgent)
}

/**
 * How this browser can install the app, if at all: through the browser's
 * own prompt (Chrome, Edge, Samsung Internet), by hand on iOS, or not
 * offered because it is already installed or the browser cannot.
 */
export function useInstallMethod(): { method: InstallMethod; install: () => Promise<void> } {
  const [deferred, setDeferred] = React.useState<BeforeInstallPromptEvent | null>(null)
  const [ios, setIos] = React.useState(false)

  React.useEffect(() => {
    if (isStandaloneDisplay()) return
    // Decided once, from the browser: not derivable during render on the server.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIos(isIosSafari(navigator.userAgent))
    const onPrompt = (event: Event) => {
      event.preventDefault()
      setDeferred(event as BeforeInstallPromptEvent)
    }
    const onInstalled = () => setDeferred(null)
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  const install = React.useCallback(async () => {
    if (!deferred) return
    await deferred.prompt()
    const { outcome } = await deferred.userChoice
    if (outcome === 'accepted') setDeferred(null)
  }, [deferred])

  return { method: deferred ? 'prompt' : ios ? 'ios' : null, install }
}

/** The by-hand instructions for iPhone and iPad. */
export function IosInstallDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Add to your home screen" description="On an iPhone or iPad the app is installed from Safari's share menu.">
        <ol className="list-decimal space-y-2 pl-5 text-sm text-foreground">
          <li>
            Tap the <Share className="inline h-4 w-4 align-text-bottom" aria-label="Share" /> <span className="font-medium">Share</span> button at the
            bottom of Safari.
          </li>
          <li>
            Choose <span className="font-medium">Add to Home Screen</span>.
          </li>
          <li>
            Tap <span className="font-medium">Add</span>. The app opens full-screen from your home screen from then on.
          </li>
        </ol>
        <DialogFooter>
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
