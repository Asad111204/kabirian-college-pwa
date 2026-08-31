'use client'

/**
 * The Divisions screen's configuration for ResourceManager.
 * See classes-manager.tsx for why these render callbacks live on the client.
 */
import { ResourceManager } from './resource-manager'

/**
 * The row shape this screen needs. `listDivisions` returns exactly this, and
 * `npm run typecheck` fails at the page if the two ever drift apart.
 */
export interface DivisionRow {
  id: string
  name: string
  code: string
  sortOrder: number
  isActive: boolean
  groupCount: number
}

export function DivisionsManager({ items }: { items: DivisionRow[] }) {
  return (
    <ResourceManager
      endpoint="/api/v1/academics/divisions"
      singular="division"
      items={items}
      labelOf={(item) => item.name}
      searchPlaceholder="Search divisions…"
      columns={[
        { header: 'Division', render: (item) => <span className="font-medium">{item.name}</span> },
        {
          header: 'Code',
          render: (item) => (
            <code className="rounded bg-surface-muted px-1.5 py-0.5 text-xs">{item.code}</code>
          ),
        },
        {
          header: 'In use',
          render: (item) => (
            <span className="text-sm text-foreground-muted">
              {item.groupCount} group{item.groupCount === 1 ? '' : 's'}
            </span>
          ),
        },
      ]}
      fields={[
        {
          name: 'name',
          label: 'Division name',
          type: 'text',
          required: true,
          placeholder: 'e.g. Boys',
        },
        {
          name: 'code',
          label: 'Division code',
          type: 'text',
          required: true,
          uppercase: true,
          placeholder: 'e.g. B',
        },
        {
          name: 'sortOrder',
          label: 'Display order',
          type: 'number',
          defaultValue: 0,
          min: 0,
          hint: 'Lower numbers appear first.',
        },
        { name: 'isActive', label: 'Active', type: 'checkbox', defaultValue: true },
      ]}
      toFormValues={(item) => ({
        name: item.name,
        code: item.code,
        sortOrder: String(item.sortOrder),
        isActive: item.isActive,
      })}
    />
  )
}
