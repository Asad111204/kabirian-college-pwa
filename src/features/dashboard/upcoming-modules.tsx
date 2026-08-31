import { Clock } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import type { UpcomingModule } from '@/server/services/dashboard-helpers'

/**
 * Modules that do not exist yet.
 *
 * These are listed honestly instead of being shown as cards reading "0".
 * A zero would say "no attendance was taken today" — but attendance has not
 * been built, and a misleading figure on an administrator's dashboard is worse
 * than no figure at all.
 */
export function UpcomingModules({ modules }: { modules: UpcomingModule[] }) {
  return (
    <Card>
      <CardHeader>
        <div className="min-w-0">
          <CardTitle>Not built yet</CardTitle>
          <p className="mt-0.5 text-sm text-foreground-muted">
            These modules have no data to report until they are built, so nothing is shown for them
            above.
          </p>
        </div>
      </CardHeader>

      <CardContent>
        <ul className="grid gap-2 sm:grid-cols-2">
          {modules.map((module) => (
            <li
              key={module.name}
              className="flex items-start justify-between gap-3 rounded-[var(--radius-control)] border border-dashed border-border p-3"
            >
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 text-sm font-medium text-foreground-muted">
                  <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  {module.name}
                </p>
                <p className="mt-0.5 text-xs text-foreground-subtle">{module.description}</p>
              </div>
              <Badge variant="neutral" className="shrink-0">
                Phase {module.phase}
              </Badge>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}
