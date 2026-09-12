'use client'

/**
 * The Classes screen's configuration for ResourceManager.
 *
 * Why this file exists: `ResourceManager` is a client component, and its
 * `columns[].render`, `labelOf` and `toFormValues` props are functions. A server
 * component cannot pass a function to a client component — props have to be
 * serialisable, and only a Server Action (`'use server'`) may cross that line.
 * These are ordinary render callbacks, so they have to be *defined* on the
 * client side of the boundary. That is all this file does.
 *
 * The page stays a server component: it still checks the administrator's access
 * and loads the data, then passes plain rows across. Authorisation is untouched
 * and still entirely server-side.
 */
import type { ClassRecord } from '@/server/services/academic-blocks.service'
import { ResourceManager } from './resource-manager'

export function ClassesManager({ items }: { items: ClassRecord[] }) {
  return (
    <ResourceManager
      endpoint="/api/v1/academics/classes"
      singular="class"
      items={items}
      labelOf={(item) => item.displayName ?? item.name}
      searchPlaceholder="Search classes…"
      columns={[
        {
          header: 'Class',
          render: (item) => (
            <div>
              <p className="font-medium">{item.name}</p>
              {item.displayName && item.displayName !== item.name ? (
                <p className="text-xs text-foreground-muted">{item.displayName}</p>
              ) : null}
            </div>
          ),
        },
        {
          header: 'Code',
          render: (item) => (
            <code className="rounded bg-surface-muted px-1.5 py-0.5 text-xs">{item.code}</code>
          ),
        },
        { header: 'Level', render: (item) => item.level },
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
          label: 'Class name',
          type: 'text',
          required: true,
          placeholder: 'e.g. 1st Year',
        },
        {
          name: 'displayName',
          label: 'Display name',
          type: 'text',
          placeholder: 'e.g. 1st Year / 11th Class',
          hint: 'Optional longer name shown on reports and result cards.',
        },
        {
          name: 'code',
          label: 'Class code',
          type: 'text',
          required: true,
          uppercase: true,
          placeholder: 'e.g. 11',
        },
        {
          name: 'level',
          label: 'Level',
          type: 'number',
          required: true,
          defaultValue: 1,
          min: 1,
          hint: 'Promotion order: 1st Year = 1, 2nd Year = 2, and so on.',
        },
        { name: 'isActive', label: 'Active', type: 'checkbox', defaultValue: true },
      ]}
      toFormValues={(item) => ({
        name: item.name,
        displayName: item.displayName ?? '',
        code: item.code,
        level: String(item.level),
        isActive: item.isActive,
      })}
    />
  )
}
