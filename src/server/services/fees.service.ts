/**
 * Fees (Phase 25, reworked in Phase 28).
 *
 * The college charges an **annual** fee made up of named heads — tuition,
 * annual funds, a tour, a board registration — and every head is optional.
 * A family pays that fee in **instalments, whenever they can**, so a voucher
 * is one student's bill for one academic session and a due date is something
 * the college may set rather than something every bill carries.
 *
 * Two rules run through all of it. **Every amount is whole paisa** — nothing
 * here holds a floating-point number of rupees, and the database refuses a
 * negative one. And **a voucher's amounts are frozen when it is issued**,
 * line by line: changing a student's fee for next year must not rewrite what
 * this year's family was asked for.
 *
 * The one figure that is *not* stored is the late fine still owed today. It
 * is worked out from the due date on every read, so the numbers are right
 * without a nightly job. The moment money is taken against a late voucher the
 * fine is frozen onto it, because from then on it is part of what was
 * actually charged.
 */
import 'server-only'
import type { Prisma } from '@/generated/prisma/client'
import { prisma } from '../db/prisma'
import { authorize, type AuthContext } from '../auth/context'
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../api/errors'
import { writeAuditLog } from '../audit/audit'
import { assertAdminArea, paginate, paginatedResult, type PaginatedResult } from './service-utils'
import { nextCode } from './code-sequence'
import { collegeDateToStorage, storageToCollegeDate, todayInCollegeTimezone } from '../time/college-date'
import { readSetting, writeSetting } from '../settings/settings-store'
import { notify } from './notifications.service'
import {
  DEFAULT_LATE_FINE_PAISA,
  decideCanCancelVoucher,
  decideCanRecordPayment,
  decideCanVoidPayment,
  discountFor,
  feeLineLabel,
  isOverdue,
  lateFineDue,
  netPayable,
  outstanding,
  paidShare,
  statusFor,
  totalOfLines,
  type FeeHeadValue,
  type FeePaymentMethodValue,
  type FeeVoucherStatusValue,
} from '../fees/fees-policy'
import {
  SETTING_FEE_LATE_FINE,
  type FeeLineInput,
  type FeePaymentInput,
  type FeePaymentVoidInput,
  type FeeRulesInput,
  type MyFeesQuery,
  type StudentFeePlanInput,
  type VoucherCancelInput,
  type VoucherListQuery,
  type VoucherRunInput,
} from '@/validation/fees'

/* -------------------------------------------------------------------------- */
/* Shapes                                                                     */
/* -------------------------------------------------------------------------- */

export interface FeeRules {
  lateFinePaisa: number
}

export interface FeeLineView {
  id: string
  head: FeeHeadValue
  label: string | null
  /** What it is called on a screen, the office's own words for an "Others". */
  name: string
  amountPaisa: number
}

export interface StudentFeePlanView {
  studentId: string
  studentName: string
  studentCode: string
  academicSessionId: string
  academicSessionName: string
  lines: FeeLineView[]
  /** Every head added up, before the concession. */
  totalPaisa: number
  feeDiscountPaisa: number
  /** What the year comes to for this student. */
  payablePaisa: number
  /** True once a voucher has been issued for this session. */
  billed: boolean
}

export interface FeeVoucherRow {
  id: string
  voucherNumber: string
  studentId: string
  studentName: string
  studentCode: string
  sectionLabel: string | null
  academicSessionId: string
  academicSessionName: string
  dueDate: string | null
  grossPaisa: number
  discountPaisa: number
  /** The fine owed today: what was frozen on it, or what the rule says now. */
  lateFinePaisa: number
  paidPaisa: number
  netPayablePaisa: number
  outstandingPaisa: number
  /** How much of the year's fee has come in, as a whole percentage. */
  paidPercent: number
  status: FeeVoucherStatusValue
  overdue: boolean
  createdAt: string
}

export interface FeePaymentView {
  id: string
  amountPaisa: number
  paidOn: string
  method: FeePaymentMethodValue
  reference: string | null
  remarks: string | null
  receivedBy: string | null
  voidedAt: string | null
  voidReason: string | null
  createdAt: string
}

export interface FeeVoucherDetail extends FeeVoucherRow {
  /** What was charged, head by head, as it stood when the voucher was issued. */
  lines: FeeLineView[]
  payments: FeePaymentView[]
  cancelReason: string | null
  /** Decided here, so the screen never offers what the API would refuse. */
  canRecordPayment: boolean
  canCancel: boolean
  /** Why not, when it cannot. */
  blockedReason: string | null
}

export interface VoucherRunResult {
  academicSessionId: string
  academicSessionName: string
  dueDate: string | null
  /** True when nothing was written; the office asked what would happen. */
  dryRun: boolean
  issued: number
  /** Already had a live voucher for that session. */
  skippedExisting: number
  /** No fee set for the year, so there is nothing to bill. */
  skippedNoFee: number
  totalBilledPaisa: number
  /** A few examples, so the office can see it did the right thing. */
  sample: { studentName: string; studentCode: string; netPayablePaisa: number }[]
}

export interface FeeSessionSummary {
  academicSessionId: string
  academicSessionName: string
  vouchers: number
  billedPaisa: number
  collectedPaisa: number
  outstandingPaisa: number
  /** Vouchers past a due date the college set, with something still owed. */
  overdueVouchers: number
}

/* -------------------------------------------------------------------------- */
/* Guards                                                                     */
/* -------------------------------------------------------------------------- */

function requireOffice(ctx: AuthContext, permission: 'fees.view' | 'fees.manage' | 'fees.collect'): void {
  assertAdminArea(ctx, 'Fees')
  authorize(ctx, permission)
}

/* -------------------------------------------------------------------------- */
/* The rules the office sets                                                  */
/* -------------------------------------------------------------------------- */

export async function getFeeRules(): Promise<FeeRules> {
  const fine = await readSetting<number>(SETTING_FEE_LATE_FINE)
  return { lateFinePaisa: typeof fine === 'number' && Number.isInteger(fine) && fine >= 0 ? fine : DEFAULT_LATE_FINE_PAISA }
}

export async function getFeeRulesForAdmin(ctx: AuthContext): Promise<FeeRules> {
  requireOffice(ctx, 'fees.view')
  return getFeeRules()
}

export async function updateFeeRules(ctx: AuthContext, input: FeeRulesInput): Promise<FeeRules> {
  requireOffice(ctx, 'fees.manage')
  const before = await getFeeRules()

  await prisma.$transaction(async (tx) => {
    await writeSetting(SETTING_FEE_LATE_FINE, input.lateFinePaisa, ctx, {
      description: 'Flat late fine in paisa, applied after a due date the college has set',
      executor: tx,
    })
    await writeAuditLog(ctx, { action: 'fees.rules_updated', entityType: 'setting', entityLabel: 'Fee rules', before, after: input }, tx)
  })
  return getFeeRules()
}

/* -------------------------------------------------------------------------- */
/* What a student is charged for a year                                       */
/* -------------------------------------------------------------------------- */

function toLineView(line: { id: string; head: string; label: string | null; amountPaisa: number }): FeeLineView {
  const head = line.head as FeeHeadValue
  return { id: line.id, head, label: line.label, name: feeLineLabel({ head, label: line.label }), amountPaisa: line.amountPaisa }
}

/** The session a fee plan is read for: the one asked about, else the current one. */
async function resolveSession(academicSessionId?: string): Promise<{ id: string; name: string }> {
  if (academicSessionId) {
    const session = await prisma.academicSession.findUnique({ where: { id: academicSessionId }, select: { id: true, name: true } })
    if (!session) throw new NotFoundError('academic session')
    return session
  }
  const current = await prisma.academicSession.findFirst({ where: { isCurrent: true }, select: { id: true, name: true } })
  if (!current) throw new ValidationError('There is no current academic session, so there is no year to charge a fee for.')
  return current
}

export async function getStudentFeePlan(ctx: AuthContext, studentId: string, academicSessionId?: string): Promise<StudentFeePlanView> {
  requireOffice(ctx, 'fees.view')

  const student = await prisma.student.findFirst({
    where: { id: studentId, deletedAt: null },
    select: { id: true, fullName: true, studentCode: true, feeDiscountPaisa: true },
  })
  if (!student) throw new NotFoundError('student')

  const session = await resolveSession(academicSessionId)
  const [lines, voucher] = await Promise.all([
    prisma.studentFeeLine.findMany({
      where: { studentId, academicSessionId: session.id },
      orderBy: { createdAt: 'asc' },
      select: { id: true, head: true, label: true, amountPaisa: true },
    }),
    prisma.feeVoucher.findFirst({ where: { studentId, academicSessionId: session.id, status: { not: 'CANCELLED' } }, select: { id: true } }),
  ])

  const views = lines.map(toLineView)
  const totalPaisa = totalOfLines(views)
  return {
    studentId: student.id,
    studentName: student.fullName,
    studentCode: student.studentCode,
    academicSessionId: session.id,
    academicSessionName: session.name,
    lines: views,
    totalPaisa,
    feeDiscountPaisa: student.feeDiscountPaisa,
    payablePaisa: Math.max(0, totalPaisa - discountFor(totalPaisa, student.feeDiscountPaisa)),
    billed: voucher !== null,
  }
}

/**
 * Writes a student's fee for a year: the whole set of heads, replacing
 * whatever was there.
 *
 * The lines are replaced rather than merged, because the form shows every
 * head at once and an amount cleared on the screen must be a head removed in
 * the database. A voucher already issued is untouched: what it charged is
 * frozen on it.
 */
export async function setStudentFeePlan(ctx: AuthContext, studentId: string, input: StudentFeePlanInput): Promise<StudentFeePlanView> {
  requireOffice(ctx, 'fees.manage')

  const student = await prisma.student.findFirst({
    where: { id: studentId, deletedAt: null },
    select: { id: true, fullName: true, studentCode: true, feeDiscountPaisa: true },
  })
  if (!student) throw new NotFoundError('student')
  const session = await resolveSession(input.academicSessionId)

  const before = await prisma.studentFeeLine.findMany({
    where: { studentId, academicSessionId: session.id },
    select: { head: true, label: true, amountPaisa: true },
  })

  await prisma.$transaction(async (tx) => {
    await tx.studentFeeLine.deleteMany({ where: { studentId, academicSessionId: session.id } })
    if (input.lines.length > 0) {
      await tx.studentFeeLine.createMany({
        data: input.lines.map((line) => ({
          studentId,
          academicSessionId: session.id,
          head: line.head,
          label: line.head === 'OTHER' ? (line.label ?? null) : null,
          amountPaisa: line.amountPaisa,
        })),
      })
    }
    await tx.student.update({ where: { id: studentId }, data: { feeDiscountPaisa: input.feeDiscountPaisa } })

    await writeAuditLog(
      ctx,
      {
        action: 'student.fee_plan_set',
        entityType: 'student',
        entityId: studentId,
        entityLabel: `${student.fullName} (${student.studentCode})`,
        before: { lines: before, feeDiscountPaisa: student.feeDiscountPaisa },
        after: { lines: input.lines, feeDiscountPaisa: input.feeDiscountPaisa },
        metadata: { academicSession: session.name },
      },
      tx,
    )
  })

  return getStudentFeePlan(ctx, studentId, session.id)
}

/**
 * Writes a student's fee at the moment they are admitted, inside the
 * admission transaction.
 *
 * Separate from `setStudentFeePlan` because the student is being created in
 * the same breath: there is nothing to read first, nothing to replace, and
 * the admission's own audit entry already records what happened.
 */
export async function createFeeLinesForAdmission(
  tx: Prisma.TransactionClient,
  studentId: string,
  academicSessionId: string,
  lines: readonly FeeLineInput[],
  feeDiscountPaisa: number,
): Promise<void> {
  if (lines.length > 0) {
    await tx.studentFeeLine.createMany({
      data: lines.map((line) => ({
        studentId,
        academicSessionId,
        head: line.head,
        label: line.head === 'OTHER' ? (line.label ?? null) : null,
        amountPaisa: line.amountPaisa,
      })),
    })
  }
  if (feeDiscountPaisa > 0) {
    await tx.student.update({ where: { id: studentId }, data: { feeDiscountPaisa } })
  }
}

/* -------------------------------------------------------------------------- */
/* Reading vouchers                                                           */
/* -------------------------------------------------------------------------- */

const VOUCHER_INCLUDE = {
  academicSession: { select: { id: true, name: true } },
  lines: { select: { id: true, head: true, label: true, amountPaisa: true } },
  student: {
    select: {
      id: true,
      fullName: true,
      studentCode: true,
      enrollments: {
        where: { status: 'ACTIVE' as const },
        orderBy: { startDate: 'desc' as const },
        take: 1,
        select: {
          section: {
            select: { name: true, academicGroup: { select: { class: { select: { name: true, displayName: true } }, division: { select: { name: true } }, program: { select: { name: true } } } } },
          },
        },
      },
    },
  },
} satisfies Prisma.FeeVoucherInclude

type VoucherWithAll = Prisma.FeeVoucherGetPayload<{ include: typeof VOUCHER_INCLUDE }>

function sectionLabelOf(row: VoucherWithAll): string | null {
  const section = row.student.enrollments[0]?.section
  if (!section) return null
  const g = section.academicGroup
  return `${g.class.displayName ?? g.class.name} · ${g.division.name} · ${g.program.name} · ${section.name}`
}

function toRow(row: VoucherWithAll, today: string, rules: FeeRules): FeeVoucherRow {
  const dueDate = row.dueDate ? storageToCollegeDate(row.dueDate) : null
  const cancelled = row.status === 'CANCELLED'

  // What was frozen when money was taken, or what the rule says today.
  const fine =
    row.lateFinePaisa > 0
      ? row.lateFinePaisa
      : lateFineDue({ dueDate, grossPaisa: row.grossPaisa, discountPaisa: row.discountPaisa, paidPaisa: row.paidPaisa, cancelled }, today, rules.lateFinePaisa)

  const amounts = { grossPaisa: row.grossPaisa, discountPaisa: row.discountPaisa, lateFinePaisa: fine, paidPaisa: row.paidPaisa }
  const status = row.status as FeeVoucherStatusValue

  return {
    id: row.id,
    voucherNumber: row.voucherNumber,
    studentId: row.studentId,
    studentName: row.student.fullName,
    studentCode: row.student.studentCode,
    sectionLabel: sectionLabelOf(row),
    academicSessionId: row.academicSessionId,
    academicSessionName: row.academicSession.name,
    dueDate,
    grossPaisa: row.grossPaisa,
    discountPaisa: row.discountPaisa,
    lateFinePaisa: cancelled ? 0 : fine,
    paidPaisa: row.paidPaisa,
    netPayablePaisa: cancelled ? 0 : netPayable(amounts),
    outstandingPaisa: cancelled ? 0 : outstanding(amounts),
    paidPercent: cancelled ? 0 : paidShare(amounts),
    status,
    overdue: isOverdue({ dueDate, status }, today),
    createdAt: row.createdAt.toISOString(),
  }
}

export async function listVouchers(ctx: AuthContext, query: VoucherListQuery): Promise<PaginatedResult<FeeVoucherRow>> {
  requireOffice(ctx, 'fees.view')
  const today = todayInCollegeTimezone()
  const rules = await getFeeRules()

  const where: Prisma.FeeVoucherWhereInput = {
    ...(query.academicSessionId ? { academicSessionId: query.academicSessionId } : {}),
    ...(query.status ? { status: query.status } : {}),
    ...(query.studentId ? { studentId: query.studentId } : {}),
    ...(query.sectionId ? { student: { enrollments: { some: { sectionId: query.sectionId, status: 'ACTIVE' } } } } : {}),
    ...(query.owingOnly ? { status: { in: ['UNPAID', 'PARTIALLY_PAID'] } } : {}),
    ...(query.search
      ? {
          OR: [
            { voucherNumber: { contains: query.search, mode: 'insensitive' } },
            { student: { fullName: { contains: query.search, mode: 'insensitive' } } },
            { student: { studentCode: { contains: query.search, mode: 'insensitive' } } },
          ],
        }
      : {}),
  }

  const [rows, total] = await Promise.all([
    prisma.feeVoucher.findMany({ where, orderBy: [{ createdAt: 'desc' }], include: VOUCHER_INCLUDE, ...paginate(query.page, query.pageSize) }),
    prisma.feeVoucher.count({ where }),
  ])

  return paginatedResult(rows.map((row) => toRow(row, today, rules)), total, query.page, query.pageSize)
}

/** One voucher with its lines and payments, for the office or the student it belongs to. */
export async function getVoucher(ctx: AuthContext, id: string): Promise<FeeVoucherDetail> {
  authorize(ctx, 'dashboard.view')

  const row = await prisma.feeVoucher.findUnique({
    where: { id },
    include: {
      ...VOUCHER_INCLUDE,
      payments: { orderBy: { paidOn: 'asc' }, include: { receivedBy: { select: { fullName: true, username: true } } } },
    },
  })
  if (!row) throw new NotFoundError('voucher')

  const isOwner = ctx.role === 'STUDENT' && ctx.studentId !== null && ctx.studentId === row.studentId
  if (!isOwner) {
    // A student asking after somebody else's bill is told it does not exist.
    if (ctx.role === 'STUDENT') throw new NotFoundError('voucher')
    requireOffice(ctx, 'fees.view')
  }

  const today = todayInCollegeTimezone()
  const rules = await getFeeRules()
  const base = toRow(row, today, rules)

  const canPay = decideCanRecordPayment({ status: base.status })
  const canCancel = decideCanCancelVoucher({ status: base.status, paidPaisa: row.paidPaisa })
  const office = ctx.role === 'ADMIN'

  return {
    ...base,
    lines: row.lines.map(toLineView),
    cancelReason: row.cancelReason,
    payments: row.payments.map((p) => ({
      id: p.id,
      amountPaisa: p.amountPaisa,
      paidOn: storageToCollegeDate(p.paidOn),
      method: p.method as FeePaymentMethodValue,
      reference: p.reference,
      remarks: p.remarks,
      // A family sees that the college recorded it, not which clerk did.
      receivedBy: office ? (p.receivedBy?.fullName ?? p.receivedBy?.username ?? null) : null,
      voidedAt: p.voidedAt?.toISOString() ?? null,
      voidReason: p.voidReason,
      createdAt: p.createdAt.toISOString(),
    })),
    canRecordPayment: office && canPay.allowed && ctx.permissions.has('fees.collect'),
    canCancel: office && canCancel.allowed && ctx.permissions.has('fees.manage'),
    blockedReason: canPay.allowed ? null : canPay.reason,
  }
}

/** A student's own vouchers. Their own bills, so nothing is withheld. */
export async function getMyFees(ctx: AuthContext, query: MyFeesQuery): Promise<PaginatedResult<FeeVoucherRow> & { totalOutstandingPaisa: number }> {
  authorize(ctx, 'dashboard.view')
  if (ctx.role !== 'STUDENT' || !ctx.studentId) {
    throw new ForbiddenError('Only a student can read their own fee vouchers.', { userId: ctx.userId, role: ctx.role })
  }

  const today = todayInCollegeTimezone()
  const rules = await getFeeRules()
  const where: Prisma.FeeVoucherWhereInput = { studentId: ctx.studentId, status: { not: 'CANCELLED' } }

  const [rows, total, all] = await Promise.all([
    prisma.feeVoucher.findMany({ where, orderBy: { createdAt: 'desc' }, include: VOUCHER_INCLUDE, ...paginate(query.page, query.pageSize) }),
    prisma.feeVoucher.count({ where }),
    prisma.feeVoucher.findMany({ where, include: VOUCHER_INCLUDE }),
  ])

  const items = rows.map((row) => toRow(row, today, rules))
  const totalOutstandingPaisa = all.map((row) => toRow(row, today, rules)).reduce((sum, row) => sum + row.outstandingPaisa, 0)
  return { ...paginatedResult(items, total, query.page, query.pageSize), totalOutstandingPaisa }
}

/** What a year came to, for the office's summary line. */
export async function getFeeSessionSummary(ctx: AuthContext, academicSessionId?: string): Promise<FeeSessionSummary> {
  requireOffice(ctx, 'fees.view')
  const today = todayInCollegeTimezone()
  const rules = await getFeeRules()
  const session = await resolveSession(academicSessionId)

  const rows = await prisma.feeVoucher.findMany({
    where: { academicSessionId: session.id, status: { not: 'CANCELLED' } },
    include: VOUCHER_INCLUDE,
  })
  const mapped = rows.map((row) => toRow(row, today, rules))

  return {
    academicSessionId: session.id,
    academicSessionName: session.name,
    vouchers: mapped.length,
    billedPaisa: mapped.reduce((n, r) => n + r.netPayablePaisa, 0),
    collectedPaisa: mapped.reduce((n, r) => n + r.paidPaisa, 0),
    outstandingPaisa: mapped.reduce((n, r) => n + r.outstandingPaisa, 0),
    overdueVouchers: mapped.filter((r) => r.overdue).length,
  }
}

/* -------------------------------------------------------------------------- */
/* Issuing a year                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Issues a session's vouchers.
 *
 * Everybody active who has a fee set for that year and does not already have
 * a live voucher for it. Running it twice is safe: the second run finds every
 * voucher already there and issues nothing, and the database has a unique
 * index saying so as well, because "safe because the code checks" is not the
 * same as safe.
 *
 * `dryRun` answers "what would this do?" without writing anything, which is
 * how the office should look at a bill run for four hundred families.
 */
export async function runVouchers(ctx: AuthContext, input: VoucherRunInput): Promise<VoucherRunResult> {
  requireOffice(ctx, 'fees.manage')

  const session = await resolveSession(input.academicSessionId)
  const dueDate = input.dueDate ?? null

  const students = await prisma.student.findMany({
    where: {
      deletedAt: null,
      status: 'ACTIVE',
      ...(input.sectionId ? { enrollments: { some: { sectionId: input.sectionId, status: 'ACTIVE' } } } : {}),
      ...(input.classId ? { enrollments: { some: { section: { academicGroup: { classId: input.classId } }, status: 'ACTIVE' } } } : {}),
    },
    select: {
      id: true,
      fullName: true,
      studentCode: true,
      feeDiscountPaisa: true,
      userId: true,
      feeLines: { where: { academicSessionId: session.id }, select: { head: true, label: true, amountPaisa: true } },
    },
    orderBy: { studentCode: 'asc' },
  })

  const existing = await prisma.feeVoucher.findMany({
    where: { academicSessionId: session.id, status: { not: 'CANCELLED' }, studentId: { in: students.map((s) => s.id) } },
    select: { studentId: true },
  })
  const alreadyBilled = new Set(existing.map((e) => e.studentId))

  const result: VoucherRunResult = {
    academicSessionId: session.id,
    academicSessionName: session.name,
    dueDate,
    dryRun: input.dryRun,
    issued: 0,
    skippedExisting: 0,
    skippedNoFee: 0,
    totalBilledPaisa: 0,
    sample: [],
  }

  const toIssue: {
    studentId: string
    studentName: string
    studentCode: string
    userId: string | null
    gross: number
    discount: number
    lines: { head: string; label: string | null; amountPaisa: number }[]
  }[] = []

  for (const student of students) {
    if (alreadyBilled.has(student.id)) {
      result.skippedExisting += 1
      continue
    }
    if (student.feeLines.length === 0) {
      result.skippedNoFee += 1
      continue
    }

    const gross = totalOfLines(student.feeLines)
    const discount = discountFor(gross, student.feeDiscountPaisa)
    toIssue.push({
      studentId: student.id,
      studentName: student.fullName,
      studentCode: student.studentCode,
      userId: student.userId,
      gross,
      discount,
      lines: student.feeLines.map((l) => ({ head: l.head, label: l.label, amountPaisa: l.amountPaisa })),
    })
    result.totalBilledPaisa += Math.max(0, gross - discount)
  }

  result.issued = toIssue.length
  result.sample = toIssue.slice(0, 5).map((v) => ({ studentName: v.studentName, studentCode: v.studentCode, netPayablePaisa: Math.max(0, v.gross - v.discount) }))

  if (input.dryRun || toIssue.length === 0) return result

  const created: { userId: string | null; voucherId: string; voucherNumber: string }[] = []

  // A whole college at once is more than one transaction should hold. Each
  // voucher costs a code from the shared counter and an insert with its lines,
  // so a session of two hundred students is the better part of a thousand
  // round trips — over a hosted database that runs past the transaction's
  // deadline and the run fails having issued nothing. Issued in batches, each
  // one commits on its own; and because a student who already has a voucher is
  // skipped, running it again after a failure carries on where it stopped
  // rather than billing anybody twice.
  const BATCH = 25

  for (let at = 0; at < toIssue.length; at += BATCH) {
    const batch = toIssue.slice(at, at + BATCH)

    await prisma.$transaction(async (tx) => {
      let billedPaisa = 0
      for (const voucher of batch) {
        const voucherNumber = await nextCode('FEE_VOUCHER', tx)
        const row = await tx.feeVoucher.create({
          data: {
            studentId: voucher.studentId,
            academicSessionId: session.id,
            voucherNumber,
            dueDate: dueDate ? collegeDateToStorage(dueDate) : null,
            grossPaisa: voucher.gross,
            discountPaisa: voucher.discount,
            issuedByUserId: ctx.userId,
            lines: { create: voucher.lines.map((l) => ({ head: l.head as FeeHeadValue, label: l.label, amountPaisa: l.amountPaisa })) },
          },
          select: { id: true },
        })
        created.push({ userId: voucher.userId, voucherId: row.id, voucherNumber })
        billedPaisa += Math.max(0, voucher.gross - voucher.discount)
      }

      // Written with this batch rather than after all of them, so a run that
      // stops half way is still recorded for exactly what it did.
      await writeAuditLog(
        ctx,
        {
          action: 'fee_voucher.issued',
          entityType: 'fee_voucher',
          entityLabel: `Fee run · ${session.name}`,
          metadata: { academicSession: session.name, dueDate, issued: batch.length, totalBilledPaisa: billedPaisa },
        },
        tx,
      )
    })
  }

  // Each family is told, and lands on their own fees — one notification for
  // the whole run rather than one query each, because the page they open is
  // their own either way.
  await notify(
    created.map((c) => c.userId),
    {
      kind: 'FEE',
      title: `Fee voucher for ${session.name}`,
      body: 'Your fee voucher is ready. It can be paid in instalments at the college office.',
      link: '/student/fees',
      entityType: 'fee_voucher',
    },
  )

  return result
}

/* -------------------------------------------------------------------------- */
/* Money in                                                                   */
/* -------------------------------------------------------------------------- */

/** Recomputes what a voucher stands at from its live payments, inside a transaction. */
async function recomputeVoucher(tx: Prisma.TransactionClient, voucherId: string, today: string, ruleFinePaisa: number): Promise<void> {
  const voucher = await tx.feeVoucher.findUnique({
    where: { id: voucherId },
    select: { id: true, grossPaisa: true, discountPaisa: true, lateFinePaisa: true, dueDate: true, status: true, cancelledAt: true },
  })
  if (!voucher) return

  const live = await tx.feePayment.aggregate({ where: { voucherId, voidedAt: null }, _sum: { amountPaisa: true } })
  const paid = live._sum.amountPaisa ?? 0
  const cancelled = voucher.cancelledAt !== null
  const dueDate = voucher.dueDate ? storageToCollegeDate(voucher.dueDate) : null

  // Once money has been taken against a late voucher the fine is part of what
  // was charged, so it stays. With every payment voided the voucher is as it
  // was, and the fine goes back to being worked out from the due date.
  const fine =
    paid === 0
      ? 0
      : voucher.lateFinePaisa > 0
        ? voucher.lateFinePaisa
        : lateFineDue({ dueDate, grossPaisa: voucher.grossPaisa, discountPaisa: voucher.discountPaisa, paidPaisa: 0, cancelled }, today, ruleFinePaisa)

  const status = statusFor({ grossPaisa: voucher.grossPaisa, discountPaisa: voucher.discountPaisa, lateFinePaisa: fine, paidPaisa: paid }, cancelled)

  await tx.feeVoucher.update({ where: { id: voucherId }, data: { paidPaisa: paid, lateFinePaisa: fine, status } })
}

export async function recordPayment(
  ctx: AuthContext,
  voucherId: string,
  input: FeePaymentInput,
  request?: { ipAddress?: string | null; userAgent?: string | null },
): Promise<FeeVoucherDetail> {
  requireOffice(ctx, 'fees.collect')

  const voucher = await prisma.feeVoucher.findUnique({
    where: { id: voucherId },
    select: { id: true, status: true, voucherNumber: true, student: { select: { fullName: true, userId: true } } },
  })
  if (!voucher) throw new NotFoundError('voucher')

  const decision = decideCanRecordPayment({ status: voucher.status as FeeVoucherStatusValue })
  if (!decision.allowed) throw new ConflictError(decision.reason)

  const today = todayInCollegeTimezone()
  if (input.paidOn > today) throw new ValidationError('A payment cannot be dated in the future.', { paidOn: ['A payment cannot be dated in the future.'] })

  const rules = await getFeeRules()

  await prisma.$transaction(async (tx) => {
    await tx.feePayment.create({
      data: {
        voucherId,
        amountPaisa: input.amountPaisa,
        paidOn: collegeDateToStorage(input.paidOn),
        method: input.method,
        reference: input.reference ?? null,
        remarks: input.remarks ?? null,
        receivedByUserId: ctx.userId,
      },
    })
    await recomputeVoucher(tx, voucherId, today, rules.lateFinePaisa)

    await writeAuditLog(
      ctx,
      {
        action: 'fee_payment.recorded',
        entityType: 'fee_voucher',
        entityId: voucherId,
        entityLabel: `${voucher.voucherNumber} · ${voucher.student.fullName}`,
        metadata: { amountPaisa: input.amountPaisa, paidOn: input.paidOn, method: input.method },
        request,
      },
      tx,
    )
  })

  const settled = await prisma.feeVoucher.findUnique({ where: { id: voucherId }, select: { paidPaisa: true, grossPaisa: true, discountPaisa: true, lateFinePaisa: true } })
  if (voucher.student.userId && settled) {
    const left = outstanding({ ...settled })
    await notify([voucher.student.userId], {
      kind: 'FEE',
      title: 'A fee payment was recorded',
      body: left > 0 ? 'The college has recorded your payment. Your voucher shows what is left to pay.' : 'The college has recorded your payment. Your fee is settled in full.',
      link: `/student/fees/${voucherId}`,
      entityType: 'fee_voucher',
      entityId: voucherId,
    })
  }

  return getVoucher(ctx, voucherId)
}

export async function voidPayment(
  ctx: AuthContext,
  paymentId: string,
  input: FeePaymentVoidInput,
  request?: { ipAddress?: string | null; userAgent?: string | null },
): Promise<FeeVoucherDetail> {
  requireOffice(ctx, 'fees.collect')

  const payment = await prisma.feePayment.findUnique({
    where: { id: paymentId },
    select: { id: true, voucherId: true, amountPaisa: true, voidedAt: true, voucher: { select: { voucherNumber: true, student: { select: { fullName: true } } } } },
  })
  if (!payment) throw new NotFoundError('payment')

  const decision = decideCanVoidPayment({ voidedAt: payment.voidedAt })
  if (!decision.allowed) throw new ConflictError(decision.reason)

  const today = todayInCollegeTimezone()
  const rules = await getFeeRules()

  await prisma.$transaction(async (tx) => {
    await tx.feePayment.update({ where: { id: paymentId }, data: { voidedAt: new Date(), voidedByUserId: ctx.userId, voidReason: input.reason } })
    await recomputeVoucher(tx, payment.voucherId, today, rules.lateFinePaisa)

    await writeAuditLog(
      ctx,
      {
        action: 'fee_payment.voided',
        entityType: 'fee_voucher',
        entityId: payment.voucherId,
        entityLabel: `${payment.voucher.voucherNumber} · ${payment.voucher.student.fullName}`,
        metadata: { amountPaisa: payment.amountPaisa, reason: input.reason },
        request,
      },
      tx,
    )
  })

  return getVoucher(ctx, payment.voucherId)
}

export async function cancelVoucher(
  ctx: AuthContext,
  id: string,
  input: VoucherCancelInput,
  request?: { ipAddress?: string | null; userAgent?: string | null },
): Promise<FeeVoucherDetail> {
  requireOffice(ctx, 'fees.manage')

  const voucher = await prisma.feeVoucher.findUnique({
    where: { id },
    select: { id: true, status: true, paidPaisa: true, voucherNumber: true, student: { select: { fullName: true } } },
  })
  if (!voucher) throw new NotFoundError('voucher')

  const decision = decideCanCancelVoucher({ status: voucher.status as FeeVoucherStatusValue, paidPaisa: voucher.paidPaisa })
  if (!decision.allowed) throw new ConflictError(decision.reason)

  await prisma.$transaction(async (tx) => {
    await tx.feeVoucher.update({
      where: { id },
      data: { status: 'CANCELLED', cancelledAt: new Date(), cancelledByUserId: ctx.userId, cancelReason: input.reason },
    })
    await writeAuditLog(
      ctx,
      {
        action: 'fee_voucher.cancelled',
        entityType: 'fee_voucher',
        entityId: id,
        entityLabel: `${voucher.voucherNumber} · ${voucher.student.fullName}`,
        metadata: { reason: input.reason },
        request,
      },
      tx,
    )
  })

  return getVoucher(ctx, id)
}
