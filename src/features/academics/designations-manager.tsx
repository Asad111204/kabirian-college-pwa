'use client'

/**
 * The Designations screen's configuration for ResourceManager.
 * See classes-manager.tsx for why these render callbacks live on the client.
 */
import { ResourceManager } from './resource-manager'

/**
 * The row shape this screen needs. `listDesignations` returns exactly this, and
 * `npm run typecheck` fails at the page if the two ever drift apart.
 */
export interface DesignationRow {
  id: string
  name: string
  code: string | null
  isTeaching: boolean
  sortOrder: number
  isActive: boolean
  staffCount: number
}

export function DesignationsManager({ items }: { items: DesignationRow[] }) {
  return (
    <ResourceManager
      endpoint="/api/v1/academics/designations"
      singular="designation"
      items={items}
      labelOf={(item) => item.name}
      searchPlaceholder="Search designations…"
      emptyDescription="Add the job titles your college uses."
      columns={[
        {
          header: 'Designation',
          render: (item) => <span className="font-medium">{item.name}</span>,
        },
        {
          header: 'Code',
          render: (item) =>
            item.code ? (
              <code className="rounded bg-surface-muted px-1.5 py-0.5 text-xs">{item.code}</code>
            ) : (
              <span className="text-foreground-subtle">—</span>
            ),
        },
        {
          header: 'Teaching role',
          render: (item) => (
            <span className="text-sm text-foreground-muted">{item.isTeaching ? 'Yes' : 'No'}</span>
          ),
        },
        {
          header: 'In use',
          render: (item) => (
            <span className="text-sm text-foreground-muted">
              {item.staffCount} staff member{item.staffCount === 1 ? '' : 's'}
            </span>
          ),
        },
      ]}
      fields={[
        {
          name: 'name',
          label: 'Designation name',
          type: 'text',
          required: true,
          placeholder: 'e.g. Senior Lecturer',
        },
        { name: 'code', label: 'Code', type: 'text', uppercase: true, placeholder: 'e.g. SR-LECT' },
        {
          name: 'isTeaching',
          label: 'This is a teaching role',
          type: 'checkbox',
          defaultValue: true,
          hint: 'Used only to order the list sensibly.',
        },
        { name: 'sortOrder', label: 'Display order', type: 'number', defaultValue: 0, min: 0 },
        { name: 'isActive', label: 'Active', type: 'checkbox', defaultValue: true },
      ]}
      toFormValues={(item) => ({
        name: item.name,
        code: item.code ?? '',
        isTeaching: item.isTeaching,
        sortOrder: String(item.sortOrder),
        isActive: item.isActive,
      })}
    />
  )
}
