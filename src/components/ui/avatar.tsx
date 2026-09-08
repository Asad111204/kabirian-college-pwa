'use client'

import * as React from 'react'
import { cn } from '@/lib/cn'

/** "AR" for Ali Raza; the first two letters for a single name; "?" for none. */
export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return (parts[0] ?? '?').slice(0, 2).toUpperCase()
  return `${parts[0]?.[0] ?? ''}${parts[parts.length - 1]?.[0] ?? ''}`.toUpperCase()
}

const SIZES = {
  sm: 'h-7 w-7 text-xs',
  md: 'h-10 w-10 text-sm',
  lg: 'h-16 w-16 text-lg',
  xl: 'h-24 w-24 text-2xl',
} as const

/**
 * A person's photograph, or their initials when there is none.
 *
 * `src` is the photo endpoint (`/api/v1/students/:id/photo?v=…`), served
 * only to people allowed to see that person's documents; the version keeps
 * the browser's cache honest when a photo is replaced. If the image fails to
 * load — no photo yet, or refused — the initials take over, so a list never
 * shows a broken picture.
 */
export function Avatar({ name, src, size = 'md', className }: { name: string; src?: string | null; size?: keyof typeof SIZES; className?: string }) {
  const [failed, setFailed] = React.useState(false)
  const showImage = Boolean(src) && !failed

  return (
    <span
      className={cn('inline-flex shrink-0 select-none items-center justify-center overflow-hidden rounded-full bg-primary font-semibold text-primary-foreground', SIZES[size], className)}
      aria-hidden={showImage ? undefined : true}
    >
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element -- a same-origin API image, not a static asset
        <img src={src!} alt={`Photo of ${name}`} className="h-full w-full object-cover" loading="lazy" onError={() => setFailed(true)} />
      ) : (
        initialsOf(name)
      )}
    </span>
  )
}
