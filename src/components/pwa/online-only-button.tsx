'use client'

import { Button, type ButtonProps } from '@/components/ui/button'
import { useOnlineStatus } from '@/lib/pwa/use-online'

/**
 * A submit button for the actions that must reach the server — submitting
 * attendance, submitting marks. Offline it is disabled and says why, instead
 * of letting a tap fail after a wait. Everything on screen is kept; the
 * person submits once the connection is back.
 */
export function OnlineOnlyButton({ children, disabled, ...props }: ButtonProps) {
  const online = useOnlineStatus()
  return (
    <span className="flex flex-col items-end gap-1">
      <Button {...props} disabled={disabled || !online} aria-disabled={disabled || !online}>
        {children}
      </Button>
      {!online ? (
        <span className="text-xs text-warning-700" role="status">
          You are offline — this can be submitted once the connection is back.
        </span>
      ) : null}
    </span>
  )
}
