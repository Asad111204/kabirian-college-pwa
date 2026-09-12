import Image from 'next/image'
import { cn } from '@/lib/cn'

/**
 * The school's logo: Nova School Kamalia's crest.
 *
 * The crest is a portrait emblem — the pen and book under NOVA, the laurel,
 * and the "Gleam of Knowledge" ribbon — so both assets are the same artwork
 * at two sizes, trimmed and transparent (scripts/prepare-logo.ts):
 *
 *   brand/logo-mark.png  149×192, for the sidebar and other small places
 *   brand/logo-full.png  495×640, for a page header or a printed document
 *
 * If the school sends a new logo, save it as `public/brand/logo.png`, run
 * `npx tsx scripts/prepare-logo.ts` and `npx tsx scripts/generate-icons.ts`,
 * and correct the pixel sizes below if the script prints different ones.
 */
const MARK_SRC = '/brand/logo-mark.png'
const FULL_SRC = '/brand/logo-full.png'
/** width / height of the crest, so next/image reserves the right box. */
const LOGO_RATIO = 495 / 640

export function Logo({ className, size = 36 }: { className?: string; size?: number }) {
  return (
    <Image
      src={MARK_SRC}
      alt="Nova School Kamalia"
      width={Math.round(size * LOGO_RATIO)}
      height={size}
      className={cn('h-auto w-auto shrink-0 object-contain', className)}
      style={{ height: size, width: 'auto' }}
      priority
    />
  )
}

/**
 * The crest at a size that can be read: for the login page, the handbook and
 * anywhere else there is room for it.
 */
export function LogoFull({ className, height = 96 }: { className?: string; height?: number }) {
  return (
    <Image
      src={FULL_SRC}
      alt="Nova School Kamalia — Gleam of Knowledge"
      width={Math.round(height * LOGO_RATIO)}
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
      {/* The crest's maroon and gold sink into the dark sidebar, so it sits on
          a small white tile there — the way it is printed on paper. */}
      <span className="shrink-0 rounded-md bg-white p-1">
        <Logo size={34} />
      </span>
      <div className="min-w-0 leading-tight">
        <p className="truncate text-sm font-semibold">{collegeName}</p>
        {subtitle ? <p className="truncate text-xs opacity-70">{subtitle}</p> : null}
      </div>
    </div>
  )
}
