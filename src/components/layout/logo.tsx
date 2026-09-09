import Image from 'next/image'
import { cn } from '@/lib/cn'

/**
 * The college's own logo.
 *
 * Two assets, both trimmed from the file the college supplied and both
 * transparent, so they sit correctly on the dark sidebar and on white paper:
 *
 *   brand/logo-mark.png      the shield alone, for small square placements
 *   brand/logo-wordmark.png  the shield and the words, for a page header
 *
 * If the college ever sends a new logo, drop it in as
 * `public/brand/college-logo.jpeg` and run `npx tsx scripts/prepare-logo.ts`.
 * Nothing in the application needs to change.
 */
export function Logo({ className, size = 36 }: { className?: string; size?: number }) {
  return (
    <Image
      src="/brand/logo-mark.png"
      alt="Kabirian College"
      width={size}
      height={size}
      // The shield is a little narrower than it is tall; letting the height
      // lead keeps it the same visual weight as the square it replaced.
      className={cn('h-auto w-auto shrink-0 object-contain', className)}
      style={{ height: size, width: 'auto' }}
      priority
    />
  )
}

/**
 * The full logo: the shield and the college's words, as they were drawn.
 *
 * For a page header or a printed document, where there is room for it.
 */
export function LogoFull({ className, height = 48 }: { className?: string; height?: number }) {
  return (
    <Image
      src="/brand/logo-wordmark.png"
      alt="Kabirian College — inspiring minds, shaping future"
      width={Math.round(height * (572 / 155))}
      height={height}
      className={cn('object-contain', className)}
      priority
    />
  )
}

export function LogoWordmark({
  collegeName,
  subtitle,
  className,
}: {
  collegeName: string
  subtitle?: string
  className?: string
}) {
  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <Logo size={32} />
      <div className="min-w-0 leading-tight">
        <p className="truncate text-sm font-semibold">{collegeName}</p>
        {subtitle ? <p className="truncate text-xs opacity-70">{subtitle}</p> : null}
      </div>
    </div>
  )
}
