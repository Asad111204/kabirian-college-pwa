import { cn } from '@/lib/cn'

/**
 * College logo.
 *
 * PLACEHOLDER: this draws the college initials in a rounded square. When the
 * official Kabirian College logo image is provided, drop it in
 * `public/brand/logo.svg` and replace the <svg> below with <Image ... /> —
 * nothing else in the application needs to change.
 */
export function Logo({ className, size = 36 }: { className?: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      role="img"
      aria-label="Kabirian College logo"
      className={cn('shrink-0', className)}
    >
      <rect width="48" height="48" rx="12" fill="currentColor" />
      <path
        d="M15 13v22M15 24l10-11M15 24l11 11"
        stroke="white"
        strokeWidth="3.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <circle cx="34" cy="24" r="3.4" fill="white" />
    </svg>
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
