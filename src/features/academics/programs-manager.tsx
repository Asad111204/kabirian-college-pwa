'use client'

/**
 * The Programs screen's configuration for ResourceManager.
 * See classes-manager.tsx for why these render callbacks live on the client.
 */
import type { ProgramRecord } from '@/server/services/academic-blocks.service'
import { ResourceManager } from './resource-manager'

export function ProgramsManager({ items }: { items: ProgramRecord[] }) {
  return (
    <ResourceManager
      endpoint="/api/v1/academics/programs"
      singular="program"
      items={items}
      labelOf={(program) => program.name}
      searchPlaceholder="Search programs…"
      emptyDescription="Add your first program, for example Pre-Medical."
      columns={[
        {
          header: 'Program',
          render: (program) => (
            <div>
              <p className="font-medium">{program.name}</p>
              {program.description ? (
                <p className="text-xs text-foreground-muted">{program.description}</p>
              ) : null}
            </div>
          ),
        },
        {
          header: 'Code',
          render: (program) => (
            <code className="rounded bg-surface-muted px-1.5 py-0.5 text-xs">{program.code}</code>
          ),
        },
        {
          header: 'In use',
          render: (program) => (
            <span className="text-sm text-foreground-muted">
              {program.groupCount} group{program.groupCount === 1 ? '' : 's'}
            </span>
          ),
        },
      ]}
      fields={[
        {
          name: 'name',
          label: 'Program name',
          type: 'text',
          required: true,
          placeholder: 'e.g. I.Com',
        },
        {
          name: 'code',
          label: 'Program code',
          type: 'text',
          required: true,
          uppercase: true,
          placeholder: 'e.g. ICOM',
          hint: 'A short unique code. Letters, numbers and hyphens only.',
        },
        {
          name: 'description',
          label: 'Description',
          type: 'textarea',
          placeholder: 'e.g. Intermediate in Commerce',
        },
        {
          name: 'sortOrder',
          label: 'Display order',
          type: 'number',
          defaultValue: 0,
          min: 0,
          hint: 'Lower numbers appear first in lists.',
        },
        { name: 'isActive', label: 'Active', type: 'checkbox', defaultValue: true },
      ]}
      toFormValues={(program) => ({
        name: program.name,
        code: program.code,
        description: program.description ?? '',
        sortOrder: String(program.sortOrder),
        isActive: program.isActive,
      })}
    />
  )
}
