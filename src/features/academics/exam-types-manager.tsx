'use client'

/**
 * The Exam Types screen's configuration for ResourceManager.
 * See classes-manager.tsx for why these render callbacks live on the client.
 */
import { ResourceManager } from './resource-manager'

/**
 * The row shape this screen needs. `listExamTypes` returns exactly this, and
 * `npm run typecheck` fails at the page if the two ever drift apart.
 */
export interface ExamTypeRow {
  id: string
  name: string
  code: string
  sortOrder: number
  isActive: boolean
  examCount: number
}

export function ExamTypesManager({ items }: { items: ExamTypeRow[] }) {
  return (
    <ResourceManager
      endpoint="/api/v1/exam-types"
      singular="exam type"
      items={items}
      labelOf={(item) => item.name}
      searchPlaceholder="Search exam types…"
      emptyTitle="No exam types yet"
      emptyDescription="Add the kinds of examination your college holds — a term test, a send-up, a final. Nothing is assumed on your behalf."
      columns={[
        {
          header: 'Exam type',
          render: (item) => <span className="font-medium">{item.name}</span>,
        },
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
              {item.examCount} exam{item.examCount === 1 ? '' : 's'}
            </span>
          ),
        },
      ]}
      fields={[
        {
          name: 'name',
          label: 'Exam type name',
          type: 'text',
          required: true,
          placeholder: 'e.g. First Term',
        },
        {
          name: 'code',
          label: 'Code',
          type: 'text',
          required: true,
          uppercase: true,
          placeholder: 'e.g. T1',
        },
        { name: 'sortOrder', label: 'Display order', type: 'number', defaultValue: 0, min: 0 },
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
