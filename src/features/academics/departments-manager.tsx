'use client'

/**
 * The Departments screen's configuration for ResourceManager.
 * See classes-manager.tsx for why these render callbacks live on the client.
 */
import { ResourceManager } from './resource-manager'

/**
 * The row shape this screen needs. `listDepartments` returns exactly this, and
 * `npm run typecheck` fails at the page if the two ever drift apart.
 */
export interface DepartmentRow {
  id: string
  name: string
  code: string | null
  sortOrder: number
  isActive: boolean
  staffCount: number
}

export function DepartmentsManager({ items }: { items: DepartmentRow[] }) {
  return (
    <ResourceManager
      endpoint="/api/v1/academics/departments"
      singular="department"
      items={items}
      labelOf={(item) => item.name}
      searchPlaceholder="Search departments…"
      emptyDescription="Add the departments your college is organised into."
      columns={[
        {
          header: 'Department',
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
          label: 'Department name',
          type: 'text',
          required: true,
          placeholder: 'e.g. Biology',
        },
        { name: 'code', label: 'Code', type: 'text', uppercase: true, placeholder: 'e.g. BIO' },
        { name: 'sortOrder', label: 'Display order', type: 'number', defaultValue: 0, min: 0 },
        { name: 'isActive', label: 'Active', type: 'checkbox', defaultValue: true },
      ]}
      toFormValues={(item) => ({
        name: item.name,
        code: item.code ?? '',
        sortOrder: String(item.sortOrder),
        isActive: item.isActive,
      })}
    />
  )
}
