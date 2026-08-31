'use client'

import * as React from 'react'
import { Printer } from 'lucide-react'
import { Button } from '@/components/ui/button'

/**
 * Opens the browser's own print dialogue.
 *
 * Nothing more: no PDF library, no headless browser, no external service. The
 * print stylesheet in globals.css hides the portal around the card, so what the
 * browser prints is the result card on one A4 page.
 *
 * It carries `print-hide`, so the button never appears on the paper it produces.
 */
export function PrintButton({ label = 'Print Result Card' }: { label?: string }) {
  return (
    <Button className="print-hide" onClick={() => window.print()}>
      <Printer className="h-4 w-4" aria-hidden />
      {label}
    </Button>
  )
}
