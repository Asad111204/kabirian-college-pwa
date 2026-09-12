/**
 * Permanently deleting a record, and when the college refuses to.
 *
 * The rule the college confirmed: an administrator may **erase** a student, a
 * member of staff or an account **only when nothing references it**. Where
 * there is history the delete is refused, with a list of what stands in the
 * way, and deactivation remains the answer.
 *
 * Nothing cascades. A published result card must not stop existing because
 * somebody tidied a list, and an audit entry must not lose the name of who
 * acted because that account was removed a year later. So the references
 * below are checked and refused; they are never quietly swept up.
 *
 * The one exception is a record's own *placement* — a student's enrolment
 * row, a teacher's assignment, a login session. Those exist only to say where
 * somebody sits, not what they did, and they go with the record. Everything
 * that says what happened blocks.
 *
 * Pure functions, no database: the services count, and these decide.
 */

/** One thing that stands in the way, counted, in the college's own words. */
export interface Blocker {
  /** Plural, lower case: "attendance marks", "fee vouchers". */
  what: string
  count: number
}

export type DeletionDecision =
  | { allowed: true }
  | { allowed: false; code: DeletionRefusal; reason: string; blockers: Blocker[] }

export type DeletionRefusal = 'HAS_HISTORY' | 'NOT_ALLOWED' | 'PROTECTED'

/** Reads a list of blockers as one sentence: "3 attendance marks and 1 result". */
export function describeBlockers(blockers: readonly Blocker[]): string {
  const live = blockers.filter((b) => b.count > 0).map((b) => `${b.count} ${b.what}`)
  if (live.length === 0) return ''
  if (live.length === 1) return live[0]!
  return `${live.slice(0, -1).join(', ')} and ${live[live.length - 1]}`
}

/**
 * May this record be erased?
 *
 * `noun` is what the record is, for the sentence: "student", "staff member",
 * "account". The refusal names what is in the way and says what to do instead,
 * because "cannot delete" on its own tells nobody anything.
 */
export function decideCanDelete(noun: string, blockers: readonly Blocker[]): DeletionDecision {
  const standing = blockers.filter((b) => b.count > 0)
  if (standing.length === 0) return { allowed: true }

  return {
    allowed: false,
    code: 'HAS_HISTORY',
    reason:
      `This ${noun} cannot be erased: the school's records still refer to them — ${describeBlockers(standing)}. ` +
      `Deleting them would take that history with them, so deactivate them instead; they will stop appearing in lists and keep their record.`,
    blockers: [...standing],
  }
}

/** A refusal that has nothing to do with history: the rules simply forbid it. */
export function refuseDeletion(code: 'NOT_ALLOWED' | 'PROTECTED', reason: string): DeletionDecision {
  return { allowed: false, code, reason, blockers: [] }
}

/**
 * The rules that protect the college from locking itself out, applied to a
 * permanent delete rather than a deactivation.
 *
 * Deleting your own account, the protected owner account, or the last
 * administrator would each leave somebody unable to get back in — the last
 * one leaves *nobody* able to. A staff member who also holds office access is
 * deliberately **not** counted as an administrator here: these rules refuse
 * more often than strictly necessary, which is the right direction when the
 * failure mode is nobody being able to sign in.
 */
export function decideCanDeleteAccount(
  actor: { userId: string },
  target: { userId: string; role: 'ADMIN' | 'STAFF' | 'STUDENT'; isSystemOwner: boolean; username: string },
  activeAdminCount: number,
): DeletionDecision {
  if (target.userId === actor.userId) {
    return refuseDeletion('NOT_ALLOWED', 'You cannot erase your own account. Ask another administrator.')
  }
  if (target.isSystemOwner) {
    return refuseDeletion('PROTECTED', `"${target.username}" is the protected system owner account and cannot be erased.`)
  }
  if (target.role === 'ADMIN' && activeAdminCount <= 1) {
    return refuseDeletion(
      'PROTECTED',
      `"${target.username}" is the only active administrator. Create another one before erasing this account.`,
    )
  }
  return { allowed: true }
}

/**
 * What the office has to type to prove it means it.
 *
 * A permanent delete has no undo, so the confirmation is the record's own
 * code or username rather than the word "delete": you cannot type it without
 * looking at which record you are on.
 */
export function confirmationMatches(expected: string, typed: string): boolean {
  return typed.trim().toLowerCase() === expected.trim().toLowerCase() && expected.trim().length > 0
}
