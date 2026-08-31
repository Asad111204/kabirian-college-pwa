import Link from 'next/link'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/cn'

/**
 * A single number with a label.
 *
 * When `href` is given the whole tile becomes a link. Tiles for things that
 * cannot be managed yet are rendered without a link rather than pointing at a
 * page that does not exist.
 */
export function StatTile({
  label,
  value,
  icon: Icon,
  href,
  hint,
  emphasis,
}: {
  label: string
  value: number | string
  icon: LucideIcon
  href?: string
  hint?: string
  emphasis?: boolean
}) {
  const content = (
    <>
      <div className="flex items-center gap-2 text-foreground-muted">
        <Icon className="h-4 w-4 shrink-0" aria-hidden />
        <span className="truncate text-xs font-medium">{label}</span>
      </div>
      <p
        className={cn(
          'mt-2 text-2xl font-semibold tabular-nums',
          emphasis ? 'text-primary' : 'text-foreground',
        )}
      >
        {value}
      </p>
      {hint ? <p className="mt-0.5 text-xs text-foreground-subtle">{hint}</p> : null}
    </>
  )

  const className = cn(
    'rounded-[var(--radius-card)] border border-border bg-surface p-4',
    href && 'transition-colors hover:border-border-strong hover:bg-surface-muted/40',
  )

  if (!href) return <div className={className}>{content}</div>

  return (
    <Link href={href} className={className}>
      {content}
    </Link>
  )
}

/** Small label + number pair used inside cards. */
export function StatRow({
  label,
  value,
  muted,
}: {
  label: string
  value: number | string
  muted?: boolean
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-sm text-foreground-muted">{label}</span>
      <span
        className={cn(
          'text-base font-semibold tabular-nums',
          muted ? 'text-foreground-subtle' : 'text-foreground',
        )}
      >
        {value}
      </span>
    </div>
  )
}
