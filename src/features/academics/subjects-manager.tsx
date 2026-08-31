'use client'

/**
 * The Subjects screen's configuration for ResourceManager.
 * See classes-manager.tsx for why these render callbacks live on the client.
 */
import { ResourceManager } from './resource-manager'

/**
 * The row shape this screen needs. `listSubjects` returns exactly this, and
 * `npm run typecheck` fails at the page if the two ever drift apart.
 */
export interface SubjectRow {
  id: string
  name: string
  code: string | null
  description: string | null
  isActive: boolean
  curriculumCount: number
}

export function SubjectsManager({ items }: { items: SubjectRow[] }) {
  return (
    <ResourceManager
      endpoint="/api/v1/academics/subjects"
      singular="subject"
      items={items}
      labelOf={(item) => item.name}
      searchPlaceholder="Search subjects…"
      emptyDescription="Add subjects such as English, Biology or Computer Science."
      columns={[
        {
          header: 'Subject',
          render: (item) => (
            <div>
              <p className="font-medium">{item.name}</p>
              {item.description ? (
                <p className="text-xs text-foreground-muted">{item.description}</p>
              ) : null}
            </div>
          ),
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
          header: 'In curriculum',
          render: (item) => (
            <span className="text-sm text-foreground-muted">
              {item.curriculumCount} time{item.curriculumCount === 1 ? '' : 's'}
            </span>
          ),
        },
      ]}
      fields={[
        {
          name: 'name',
          label: 'Subject name',
          type: 'text',
          required: true,
          placeholder: 'e.g. Biology',
        },
        {
          name: 'code',
          label: 'Subject code',
          type: 'text',
          uppercase: true,
          placeholder: 'e.g. BIO',
          hint: 'Optional, but useful on result cards.',
        },
        { name: 'description', label: 'Description', type: 'textarea' },
        { name: 'isActive', label: 'Active', type: 'checkbox', defaultValue: true },
      ]}
      toFormValues={(item) => ({
        name: item.name,
        code: item.code ?? '',
        description: item.description ?? '',
        isActive: item.isActive,
      })}
    />
  )
}
