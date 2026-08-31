import { describe, expect, it } from 'vitest'
import {
  buildQuickActions,
  buildStructureTree,
  describeAuditEntry,
  QUICK_ACTIONS,
  relativeTime,
  summariseUserCounts,
  UPCOMING_MODULES,
  type AuditEntryInput,
  type FlatGroup,
  type UserCountRow,
} from '@/server/services/dashboard-helpers'
import { ROLE_DEFAULT_PERMISSIONS } from '@/server/auth/permissions'

/* -------------------------------------------------------------------------- */
/* User statistics                                                            */
/* -------------------------------------------------------------------------- */

function row(role: 'ADMIN' | 'STAFF' | 'STUDENT', status: 'ACTIVE' | 'INACTIVE', count: number): UserCountRow {
  return { role, status, _count: { _all: count } }
}

describe('summariseUserCounts', () => {
  it('adds up totals, active/inactive and each role from one grouped query', () => {
    const stats = summariseUserCounts([
      row('ADMIN', 'ACTIVE', 2),
      row('STAFF', 'ACTIVE', 10),
      row('STAFF', 'INACTIVE', 3),
      row('STUDENT', 'ACTIVE', 120),
      row('STUDENT', 'INACTIVE', 5),
    ])

    expect(stats.total).toBe(140)
    expect(stats.active).toBe(132)
    expect(stats.inactive).toBe(8)
    expect(stats.byRole).toEqual({ ADMIN: 2, STAFF: 13, STUDENT: 125 })
    expect(stats.activeByRole).toEqual({ ADMIN: 2, STAFF: 10, STUDENT: 120 })
  })

  it('handles a brand-new college with only one administrator', () => {
    const stats = summariseUserCounts([row('ADMIN', 'ACTIVE', 1)])
    expect(stats.total).toBe(1)
    expect(stats.active).toBe(1)
    expect(stats.inactive).toBe(0)
    expect(stats.byRole).toEqual({ ADMIN: 1, STAFF: 0, STUDENT: 0 })
  })

  it('returns zeros rather than blanks when there are no users at all', () => {
    const stats = summariseUserCounts([])
    expect(stats.total).toBe(0)
    expect(stats.byRole).toEqual({ ADMIN: 0, STAFF: 0, STUDENT: 0 })
    expect(stats.activeByRole).toEqual({ ADMIN: 0, STAFF: 0, STUDENT: 0 })
  })

  it('keeps active and total separate when every account is inactive', () => {
    const stats = summariseUserCounts([row('STUDENT', 'INACTIVE', 4)])
    expect(stats.total).toBe(4)
    expect(stats.active).toBe(0)
    expect(stats.inactive).toBe(4)
  })
})

/* -------------------------------------------------------------------------- */
/* Academic structure tree                                                    */
/* -------------------------------------------------------------------------- */

function group(
  klass: [string, string, number],
  division: [string, string],
  program: [string, string, string],
  sections: { name: string; isActive?: boolean; studentCount?: number }[] = [{ name: 'A' }],
): FlatGroup {
  return {
    id: `${klass[0]}-${division[0]}-${program[0]}`,
    classId: klass[0],
    className: klass[1],
    classDisplayName: `${klass[1]} / display`,
    classLevel: klass[2],
    divisionId: division[0],
    divisionName: division[1],
    programId: program[0],
    programName: program[1],
    programCode: program[2],
    isActive: true,
    sections: sections.map((s, i) => ({
      id: `sec-${i}`,
      name: s.name,
      isActive: s.isActive ?? true,
      studentCount: s.studentCount ?? 0,
    })),
  }
}

const CLASS_1: [string, string, number] = ['c1', '1st Year', 1]
const CLASS_2: [string, string, number] = ['c2', '2nd Year', 2]
const BOYS: [string, string] = ['d1', 'Boys']
const GIRLS: [string, string] = ['d2', 'Girls']
const PM: [string, string, string] = ['p1', 'Pre-Medical', 'PM']
const PE: [string, string, string] = ['p2', 'Pre-Engineering', 'PE']

describe('buildStructureTree', () => {
  it('nests a flat list into Class -> Division -> Program', () => {
    const tree = buildStructureTree([
      group(CLASS_1, BOYS, PM),
      group(CLASS_1, BOYS, PE),
      group(CLASS_1, GIRLS, PM),
      group(CLASS_2, BOYS, PM),
    ])

    expect(tree).toHaveLength(2)
    expect(tree[0]?.divisions).toHaveLength(2)
    expect(tree[0]?.divisions[0]?.divisionName).toBe('Boys')
    expect(tree[0]?.divisions[0]?.programs.map((p) => p.programName)).toEqual([
      'Pre-Medical',
      'Pre-Engineering',
    ])
    expect(tree[1]?.divisions).toHaveLength(1)
  })

  it('prefers the class display name when there is one', () => {
    const tree = buildStructureTree([group(CLASS_1, BOYS, PM)])
    expect(tree[0]?.className).toBe('1st Year / display')
  })

  it('counts groups, sections and students per class', () => {
    const tree = buildStructureTree([
      group(CLASS_1, BOYS, PM, [
        { name: 'A', studentCount: 30 },
        { name: 'B', studentCount: 25 },
      ]),
      group(CLASS_1, GIRLS, PM, [{ name: 'A', studentCount: 28 }]),
    ])

    expect(tree[0]?.programCount).toBe(2)
    expect(tree[0]?.sectionCount).toBe(3)
    expect(tree[0]?.studentCount).toBe(83)
  })

  it('lists only active sections but still counts their students', () => {
    const tree = buildStructureTree([
      group(CLASS_1, BOYS, PM, [
        { name: 'A', studentCount: 10 },
        { name: 'B', isActive: false, studentCount: 5 },
      ]),
    ])

    expect(tree[0]?.divisions[0]?.programs[0]?.sectionNames).toEqual(['A'])
    expect(tree[0]?.divisions[0]?.programs[0]?.studentCount).toBe(15)
    expect(tree[0]?.sectionCount).toBe(1)
  })

  it('returns an empty tree for a session with no structure', () => {
    expect(buildStructureTree([])).toEqual([])
  })

  it('shows a newly created program without any code change', () => {
    // Exactly what happens after an admin adds "I.Com" in Academic Management.
    const icom: [string, string, string] = ['p9', 'I.Com', 'ICOM']
    const tree = buildStructureTree([group(CLASS_1, BOYS, PM), group(CLASS_1, BOYS, icom)])

    expect(tree[0]?.divisions[0]?.programs.map((p) => p.programName)).toContain('I.Com')
  })

  it('preserves the order the database returned', () => {
    const tree = buildStructureTree([group(CLASS_2, BOYS, PM), group(CLASS_1, BOYS, PM)])
    expect(tree.map((c) => c.classLevel)).toEqual([2, 1])
  })
})

/* -------------------------------------------------------------------------- */
/* Recent activity — safety matters most here                                 */
/* -------------------------------------------------------------------------- */

function auditEntry(overrides: Partial<AuditEntryInput> = {}): AuditEntryInput {
  return {
    id: 'a1',
    action: 'program.created',
    entityType: 'program',
    entityLabel: 'I.Com (ICOM)',
    createdAt: new Date('2026-08-29T10:00:00Z'),
    actor: { username: 'admin', fullName: 'College Administrator' },
    ...overrides,
  }
}

describe('describeAuditEntry', () => {
  it('turns an action into a readable sentence', () => {
    const item = describeAuditEntry(auditEntry())
    expect(item.actor).toBe('College Administrator')
    expect(item.description).toBe('created the program')
    expect(item.target).toBe('I.Com (ICOM)')
  })

  it('falls back to the username when the actor has no name', () => {
    const item = describeAuditEntry(auditEntry({ actor: { username: 'admin', fullName: null } }))
    expect(item.actor).toBe('admin')
  })

  it('says "System" for actions with no actor', () => {
    expect(describeAuditEntry(auditEntry({ actor: null })).actor).toBe('System')
  })

  it('marks destructive actions as dangerous and creations as positive', () => {
    expect(describeAuditEntry(auditEntry({ action: 'program.created' })).tone).toBe('positive')
    expect(describeAuditEntry(auditEntry({ action: 'user.deactivated' })).tone).toBe('danger')
    expect(describeAuditEntry(auditEntry({ action: 'permission.revoked' })).tone).toBe('danger')
    expect(describeAuditEntry(auditEntry({ action: 'user.role_changed' })).tone).toBe('warning')
    expect(describeAuditEntry(auditEntry({ action: 'user.updated' })).tone).toBe('neutral')
  })

  it('stays readable for an action added in a future phase', () => {
    const item = describeAuditEntry(auditEntry({ action: 'attendance.corrected' }))
    expect(item.description).toBe('corrected')
  })

  /**
   * The important one: whatever the audit row contains, the dashboard line is
   * assembled only from the actor, a fixed phrase and the entity label.
   */
  it('never leaks secrets even if an audit row somehow contained them', () => {
    const hostile = {
      ...auditEntry(),
      entityLabel: 'Muhammad Ali (muhammad.ali)',
      // These fields exist on the real row but are neither selected nor read.
      beforeData: { passwordHash: '$argon2id$v=19$abc', token: 'secret-token' },
      afterData: { temporaryPassword: 'Kbr-1234-abcd' },
      metadata: { apiKey: 'sk-live-123' },
    } as unknown as AuditEntryInput

    const item = describeAuditEntry(hostile)
    const serialised = JSON.stringify(item)

    expect(serialised).not.toContain('argon2')
    expect(serialised).not.toContain('secret-token')
    expect(serialised).not.toContain('Kbr-1234-abcd')
    expect(serialised).not.toContain('sk-live-123')
    expect(Object.keys(item).sort()).toEqual([
      'action',
      'actor',
      'createdAt',
      'description',
      'id',
      'target',
      'tone',
    ])
  })
})

describe('relativeTime', () => {
  const now = new Date('2026-08-29T12:00:00Z')

  it('describes recent moments in plain words', () => {
    expect(relativeTime(new Date('2026-08-29T11:59:50Z'), now)).toBe('just now')
    expect(relativeTime(new Date('2026-08-29T11:55:00Z'), now)).toBe('5 minutes ago')
    expect(relativeTime(new Date('2026-08-29T09:00:00Z'), now)).toBe('3 hours ago')
    expect(relativeTime(new Date('2026-08-27T12:00:00Z'), now)).toBe('2 days ago')
  })

  it('uses singular wording where it should', () => {
    expect(relativeTime(new Date('2026-08-29T11:00:00Z'), now)).toBe('1 hour ago')
    expect(relativeTime(new Date('2026-08-28T12:00:00Z'), now)).toBe('1 day ago')
  })

  it('falls back to months and years for older entries', () => {
    expect(relativeTime(new Date('2026-06-29T12:00:00Z'), now)).toContain('month')
    expect(relativeTime(new Date('2024-08-29T12:00:00Z'), now)).toContain('year')
  })
})

/* -------------------------------------------------------------------------- */
/* Quick actions                                                              */
/* -------------------------------------------------------------------------- */

describe('buildQuickActions', () => {
  it('gives a full administrator every shortcut', () => {
    const actions = buildQuickActions(new Set(ROLE_DEFAULT_PERMISSIONS.ADMIN))
    expect(actions).toHaveLength(QUICK_ACTIONS.length)
  })

  it('hides user shortcuts from an admin whose user permissions were revoked', () => {
    const permissions = new Set(ROLE_DEFAULT_PERMISSIONS.ADMIN as string[])
    permissions.delete('users.view')
    permissions.delete('users.manage')

    const keys = buildQuickActions(permissions).map((a) => a.key)
    expect(keys).not.toContain('add-user')
    expect(keys).not.toContain('manage-users')
    expect(keys).toContain('programs')
  })

  it('hides academic shortcuts without academics.view', () => {
    const keys = buildQuickActions(new Set(['users.view'])).map((a) => a.key)
    expect(keys).toEqual(['manage-users'])
  })

  it('gives nothing to someone with no permissions', () => {
    expect(buildQuickActions(new Set())).toEqual([])
  })

  it('a staff member would get no admin shortcuts', () => {
    const actions = buildQuickActions(new Set(ROLE_DEFAULT_PERMISSIONS.STAFF as string[]))
    // Staff hold academics.view for their own portal, but never users.* —
    // and the dashboard itself is closed to them by role anyway.
    expect(actions.map((a) => a.key)).not.toContain('add-user')
    expect(actions.map((a) => a.key)).not.toContain('manage-users')
  })

  it('only ever links to routes that exist today', () => {
    const builtRoutes = [
      '/admin/users',
      '/admin/academics/programs',
      '/admin/academics/classes',
      '/admin/academics/divisions',
      '/admin/academics/structure',
      '/admin/academics/subjects',
      '/admin/academics/curriculum',
      '/admin/academics/sessions',
    ]
    for (const action of QUICK_ACTIONS) {
      expect(builtRoutes, `${action.key} points at a page that must exist`).toContain(action.href)
    }
  })
})

/* -------------------------------------------------------------------------- */
/* Honesty about unbuilt modules                                              */
/* -------------------------------------------------------------------------- */

describe('unbuilt modules', () => {
  it('lists the modules that have no data yet, with their phase', () => {
    const names = UPCOMING_MODULES.map((m) => m.name)
    expect(names).toContain('Attendance')
    expect(names).toContain('Exams & marks')
    expect(names).toContain('Results')
    expect(names).toContain('Documents')
    expect(names).toContain('Notices & events')
  })

  it('never carries a numeric value that could be mistaken for a statistic', () => {
    for (const entry of UPCOMING_MODULES) {
      // name, description and a phase number — and nothing that looks like a count.
      expect(Object.keys(entry).sort()).toEqual(['description', 'name', 'phase'])
      expect(typeof entry.phase).toBe('number')
      expect(entry.phase).toBeGreaterThanOrEqual(4)
    }
  })
})
