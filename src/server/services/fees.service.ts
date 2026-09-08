/**
 * Fees (Phase 25).
 *
 * Named packages carry a monthly amount; each student is on one, with their
 * own concession on top; billing is monthly, one voucher per student per
 * month with a due date; a flat late fine applies once that day has passed.
 *
 * Two rules run through all of it. **Every amount is whole paisa** — nothing
 * here holds a floating-point number of rupees, and the database refuses a
 * negative one. And **a voucher's amounts are frozen when it is issued**:
 * changing a package's price next year must not rewrite what a family was
 * asked for last March, so the package's name and amount are copied onto the
 * voucher rather than read through a join.
 *
 * The one figure that is *not* stored is the late fine still owed today. It
 * is worked out from the due date on every read, so the numbers are right
 * without a nightly job, and nothing drifts when nobody opens the app for a
 * week. The moment money is taken against a late voucher the fine is frozen
 * onto it, because from then on it is part of what was actually charged.
 */
import 'server-only'
import type { Prisma } from '@/generated/prisma/client'
import { prisma } from '../db/prisma'
import { authorize, type AuthContext } from '../auth/context'
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../api/errors'
import { writeAuditLog } from '../audit/audit'
import { assertAdminArea, paginate, paginatedResult, withUniqueConstraintHandling, type PaginatedResult } from './service-utils'
import { nextCode } from './code-sequence'
import { collegeDateToStorage, storageToCollegeDate, todayInCollegeTimezone } from '../time/college-date'
import { readSetting, writeSetting } from '../settings/settings-store'
import {
  DEFAULT_DUE_DAY,
  DEFAULT_LATE_FINE_PAISA,
  decideCanCancelVoucher,
  decideCanRecordPayment,
  decideCanVoidPayment,
  discountFor,
  dueDateFor,
  isOverdue,
  lateFineDue,
  monthLabel,
  monthStart,
  netPayable,
  outstanding,
  shouldBillForMonth,
  statusFor,
  type FeePaymentMethodValue,
  type FeeVoucherStatusValue,
} from '../fees/fees-policy'
import {
  SETTING_FEE_DUE_DAY,
  SETTING_FEE_LATE_FINE,
  type FeePackageInput,
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
  dueDayOfMonth: number
  lateFinePaisa: number
}

export interface FeePackageView {
  id: string
  name: string
  description: string | null
  monthlyAmountPaisa: number
  isActive: boolean
  /** How many students are on it now. */
  studentCount: number
}

export interface StudentFeePlanView {
  studentId: string
  studentName: string
  studentCode: string
  feePackageId: string | null
  packageName: string | null
  packageMonthlyPaisa: number | null
  feeDiscountPaisa: number
  /** What a month would come to today, before any fine. */
  monthlyPayablePaisa: number | null
}

export interface FeeVoucherRow {
  id: string
  voucherNumber: string
  studentId: string
  studentName: string
  studentCode: string
  sectionLabel: string | null
  month: string
  monthLabel: string
  dueDate: string
  packageName: string
  grossPaisa: number
  discountPaisa: number
  /** The fine owed today: what was frozen on it, or what the rule says now. */
  lateFinePaisa: number
  paidPaisa: number
  netPayablePaisa: number
  outstandingPaisa: number
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
  payments: FeePaymentView[]
  cancelReason: string | null
  /** Decided here, so the screen never offers what the API would refuse. */
  canRecordPayment: boolean
  canCancel: boolean
  /** Why not, when it cannot. */
  blockedReason: string | null
}

export interface VoucherRunResult {
  month: string
  monthLabel: string
  dueDate: string
  /** True when nothing was written; the office asked what would happen. */
  dryRun: boolean
  issued: number
  /** Already had a live voucher for that month. */
  skippedExisting: number
  /** No fee package, so nothing to bill. */
  skippedNoPackage: number
  /** Admitted after the month ended. */
  skippedNotYetAdmitted: number
  totalBilledPaisa: number
  /** A few examples, so the office can see it did the right thing. */
  sample: { studentName: string; studentCode: string; netPayablePaisa: number }[]
}

export interface FeeMonthSummary {
  month: string
  monthLabel: string
  vouchers: number
  billedPaisa: number
  collectedPaisa: number
  outstandingPaisa: number
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
  const [day, fine] = await Promise.all([readSetting<number>(SETTING_FEE_DUE_DAY), readSetting<number>(SETTING_FEE_LATE_FINE)])
  return {
    dueDayOfMonth: typeof day === 'number' && Number.isInteger(day) && day >= 1 && day <= 31 ? day : DEFAULT_DUE_DAY,
    lateFinePaisa: typeof fine === 'number' && Number.isInteger(fine) && fine >= 0 ? fine : DEFAULT_LATE_FINE_PAISA,
  }
}

export async function getFeeRulesForAdmin(ctx: AuthContext): Promise<FeeRules> {
  requireOffice(ctx, 'fees.view')
  return getFeeRules()
}

export async function updateFeeRules(ctx: AuthContext, input: FeeRulesInput): Promise<FeeRules> {
  requireOffice(ctx, 'fees.manage')
  const before = await getFeeRules()

  await prisma.$transaction(async (tx) => {
    await writeSetting(SETTING_FEE_DUE_DAY, input.dueDayOfMonth, ctx, { description: 'Day of the month a fee voucher falls due', executor: tx })
    await writeSetting(SETTING_FEE_LATE_FINE, input.lateFinePaisa, ctx, { description: 'Flat late fine in paisa, applied after the due date', executor: tx })
    await writeAuditLog(
      ctx,
      { action: 'fees.rules_updated', entityType: 'setting', entityLabel: 'Fee rules', before, after: input },
      tx,
    )
  })
  return getFeeRules()
}

/* -------------------------------------------------------------------------- */
/* Packages                                                                   */
/* -------------------------------------------------------------------------- */

export async function listFeePackages(ctx: AuthContext, includeInactive = true): Promise<FeePackageView[]> {
  requireOffice(ctx, 'fees.view')
  const rows = await prisma.feePackage.findMany({
    where: includeInactive ? {} : { isActive: true },
    orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
    include: { _count: { select: { students: { where: { deletedAt: null } } } } },
  })
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    monthlyAmountPaisa: row.monthlyAmountPaisa,
    isActive: row.isActive,
    studentCount: row._count.students,
  }))
}

export async function createFeePackage(ctx: AuthContext, input: FeePackageInput): Promise<FeePackageView> {
  requireOffice(ctx, 'fees.manage')

  const row = await withUniqueConstraintHandling(
    () =>
      prisma.feePackage.create({
        data: {
          name: input.name,
          description: input.description ?? null,
          monthlyAmountPaisa: input.monthlyAmountPaisa,
          isActive: input.isActive,
        },
      }),
    { name: 'A fee package with that name already exists.' },
  )

  await writeAuditLog(ctx, {
    action: 'fee_package.created',
    entityType: 'fee_package',
    entityId: row.id,
    entityLabel: row.name,
    after: { name: row.name, monthlyAmountPaisa: row.monthlyAmountPaisa, isActive: row.isActive },
  })

  return { ...row, studentCount: 0 }
}

export async function updateFeePackage(ctx: AuthContext, id: string, input: FeePackageInput): Promise<FeePackageView> {
  requireOffice(ctx, 'fees.manage')

  const before = await prisma.feePackage.findUnique({ where: { id } })
  if (!before) throw new NotFoundError('fee package')

  await withUniqueConstraintHandling(
    () =>
      prisma.feePackage.update({
        where: { id },
        data: {
          name: input.name,
          description: input.description ?? null,
          monthlyAmountPaisa: input.monthlyAmountPaisa,
          isActive: input.isActive,
        },
      }),
    { name: 'A fee package with that name already exists.' },
  )

  await writeAuditLog(ctx, {
    action: 'fee_package.updated',
    entityType: 'fee_package',
    entityId: id,
    entityLabel: input.name,
    before: { name: before.name, monthlyAmountPaisa: before.monthlyAmountPaisa, isActive: before.isActive },
    after: { name: input.name, monthlyAmountPaisa: input.monthlyAmountPaisa, isActive: input.isActive },
  })

  const packages = await listFeePackages(ctx)
  return packages.find((p) => p.id === id)!
}

/* -------------------------------------------------------------------------- */
/* A student's plan                                                           */
/* -------------------------------------------------------------------------- */

export async function getStudentFeePlan(ctx: AuthContext, studentId: string): Promise<StudentFeePlanView> {
  requireOffice(ctx, 'fees.view')
  const student = await prisma.student.findFirst({
    where: { id: studentId, deletedAt: null },
    select: { id: true, fullName: true, studentCode: true, feePackageId: true, feeDiscountPaisa: true, feePackage: { select: { name: true, monthlyAmountPaisa: true } } },
  })
  if (!student) throw new NotFoundError('student')

  const gross = student.feePackage?.monthlyAmountPaisa ?? null
  return {
    studentId: student.id,
    studentName: student.fullName,
    studentCode: student.studentCode,
    feePackageId: student.feePackageId,
    packageName: student.feePackage?.name ?? null,
    packageMonthlyPaisa: gross,
    feeDiscountPaisa: student.feeDiscountPaisa,
    monthlyPayablePaisa: gross === null ? null : Math.max(0, gross - discountFor(gross, student.feeDiscountPaisa)),
  }
}

export async function setStudentFeePlan(ctx: AuthContext, studentId: string, input: StudentFeePlanInput): Promise<StudentFeePlanView> {
  requireOffice(ctx, 'fees.manage')

  const before = await prisma.student.findFirst({
    where: { id: studentId, deletedAt: null },
    select: { id: true, fullName: true, studentCode: true, feePackageId: true, feeDiscountPaisa: true },
  })
  if (!before) throw new NotFoundError('student')

  if (input.feePackageId) {
    const pkg = await prisma.feePackage.findUnique({ where: { id: input.feePackageId }, select: { id: true, isActive: true, name: true } })
    if (!pkg) throw new NotFoundError('fee package')
    if (!pkg.isActive) throw new ValidationError(`"${pkg.name}" is no longer in use, so nobody can be put on it.`, { feePackageId: ['That package is not in use.'] })
  }

  await prisma.student.update({
    where: { id: studentId },
    data: { feePackageId: input.feePackageId ?? null, feeDiscountPaisa: input.feeDiscountPaisa },
  })

  await writeAuditLog(ctx, {
    action: 'student.fee_plan_set',
    entityType: 'student',
    entityId: studentId,
    entityLabel: `${before.fullName} (${before.studentCode})`,
    before: { feePackageId: before.feePackageId, feeDiscountPaisa: before.feeDiscountPaisa },
    after: { feePackageId: input.feePackageId ?? null, feeDiscountPaisa: input.feeDiscountPaisa },
  })

  return getStudentFeePlan(ctx, studentId)
}

/* -------------------------------------------------------------------------- */
/* Reading vouchers                                                           */
/* -------------------------------------------------------------------------- */

const VOUCHER_INCLUDE = {
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

type VoucherWithStudent = Prisma.FeeVoucherGetPayload<{ include: typeof VOUCHER_INCLUDE }>

function sectionLabelOf(row: VoucherWithStudent): string | null {
  const section = row.student.enrollments[0]?.section
  if (!section) return null
  const g = section.academicGroup
  return `${g.class.displayName ?? g.class.name} · ${g.division.name} · ${g.program.name} · ${section.name}`
}

function toRow(row: VoucherWithStudent, today: string, rules: FeeRules): FeeVoucherRow {
  const month = storageToCollegeDate(row.month)
  const dueDate = storageToCollegeDate(row.dueDate)
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
    month,
    monthLabel: monthLabel(month),
    dueDate,
    packageName: row.packageName,
    grossPaisa: row.grossPaisa,
    discountPaisa: row.discountPaisa,
    lateFinePaisa: cancelled ? 0 : fine,
    paidPaisa: row.paidPaisa,
    netPayablePaisa: cancelled ? 0 : netPayable(amounts),
    outstandingPaisa: cancelled ? 0 : outstanding(amounts),
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
    ...(query.month ? { month: collegeDateToStorage(monthStart(query.month)) } : {}),
    ...(query.status ? { status: query.status } : {}),
    ...(query.studentId ? { studentId: query.studentId } : {}),
    ...(query.sectionId ? { student: { enrollments: { some: { sectionId: query.sectionId, status: 'ACTIVE' } } } } : {}),
    ...(query.overdueOnly ? { status: { in: ['UNPAID', 'PARTIALLY_PAID'] }, dueDate: { lt: collegeDateToStorage(today) } } : {}),
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
    prisma.feeVoucher.findMany({ where, orderBy: [{ month: 'desc' }, { voucherNumber: 'asc' }], include: VOUCHER_INCLUDE, ...paginate(query.page, query.pageSize) }),
    prisma.feeVoucher.count({ where }),
  ])

  return paginatedResult(rows.map((row) => toRow(row, today, rules)), total, query.page, query.pageSize)
}

/** One voucher with its payments, for the office or the student it belongs to. */
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
    prisma.feeVoucher.findMany({ where, orderBy: { month: 'desc' }, include: VOUCHER_INCLUDE, ...paginate(query.page, query.pageSize) }),
    prisma.feeVoucher.count({ where }),
    prisma.feeVoucher.findMany({ where, include: VOUCHER_INCLUDE }),
  ])

  const items = rows.map((row) => toRow(row, today, rules))
  const totalOutstandingPaisa = all.map((row) => toRow(row, today, rules)).reduce((sum, row) => sum + row.outstandingPaisa, 0)
  return { ...paginatedResult(items, total, query.page, query.pageSize), totalOutstandingPaisa }
}

/** What a month came to, for the office's summary line. */
export async function getFeeMonthSummary(ctx: AuthContext, month: string): Promise<FeeMonthSummary> {
  requireOffice(ctx, 'fees.view')
  const today = todayInCollegeTimezone()
  const rules = await getFeeRules()
  const first = monthStart(month)

  const rows = await prisma.feeVoucher.findMany({
    where: { month: collegeDateToStorage(first), status: { not: 'CANCELLED' } },
    include: VOUCHER_INCLUDE,
  })
  const mapped = rows.map((row) => toRow(row, today, rules))

  return {
    month: first,
    monthLabel: monthLabel(first),
    vouchers: mapped.length,
    billedPaisa: mapped.reduce((n, r) => n + r.netPayablePaisa, 0),
    collectedPaisa: mapped.reduce((n, r) => n + r.paidPaisa, 0),
    outstandingPaisa: mapped.reduce((n, r) => n + r.outstandingPaisa, 0),
    overdueVouchers: mapped.filter((r) => r.overdue).length,
  }
}

/* -------------------------------------------------------------------------- */
/* Issuing a month                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Issues one month's vouchers.
 *
 * Everybody active, on a package, admitted by the end of that month, who does
 * not already have a live voucher for it. Running it twice is safe: the second
 * run finds every voucher already there and issues nothing, and the database
 * has a unique index saying so as well, because "safe because the code checks"
 * is not the same as safe.
 *
 * `dryRun` answers "what would this do?" without writing anything, which is
 * how the office should look at a bill run for four hundred families.
 */
export async function runVouchers(ctx: AuthContext, input: VoucherRunInput): Promise<VoucherRunResult> {
  requireOffice(ctx, 'fees.manage')

  const month = monthStart(input.month)
  const rules = await getFeeRules()
  const dueDate = dueDateFor(month, input.dueDay ?? rules.dueDayOfMonth)

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
      admissionDate: true,
      feeDiscountPaisa: true,
      feePackage: { select: { id: true, name: true, monthlyAmountPaisa: true, isActive: true } },
      enrollments: { where: { status: 'ACTIVE' }, orderBy: { startDate: 'desc' }, take: 1, select: { academicSessionId: true } },
    },
    orderBy: { studentCode: 'asc' },
  })

  const existing = await prisma.feeVoucher.findMany({
    where: { month: collegeDateToStorage(month), status: { not: 'CANCELLED' }, studentId: { in: students.map((s) => s.id) } },
    select: { studentId: true },
  })
  const alreadyBilled = new Set(existing.map((e) => e.studentId))

  const result: VoucherRunResult = {
    month,
    monthLabel: monthLabel(month),
    dueDate,
    dryRun: input.dryRun,
    issued: 0,
    skippedExisting: 0,
    skippedNoPackage: 0,
    skippedNotYetAdmitted: 0,
    totalBilledPaisa: 0,
    sample: [],
  }

  const toIssue: { studentId: string; studentName: string; studentCode: string; packageId: string; packageName: string; gross: number; discount: number; sessionId: string | null }[] = []

  for (const student of students) {
    if (alreadyBilled.has(student.id)) {
      result.skippedExisting += 1
      continue
    }
    const pkg = student.feePackage
    if (!pkg) {
      result.skippedNoPackage += 1
      continue
    }
    const admissionDate = storageToCollegeDate(student.admissionDate)
    if (!shouldBillForMonth({ admissionDate, hasPackage: true }, month)) {
      result.skippedNotYetAdmitted += 1
      continue
    }

    const gross = pkg.monthlyAmountPaisa
    const discount = discountFor(gross, student.feeDiscountPaisa)
    toIssue.push({
      studentId: student.id,
      studentName: student.fullName,
      studentCode: student.studentCode,
      packageId: pkg.id,
      packageName: pkg.name,
      gross,
      discount,
      sessionId: student.enrollments[0]?.academicSessionId ?? null,
    })
    result.totalBilledPaisa += Math.max(0, gross - discount)
  }

  result.issued = toIssue.length
  result.sample = toIssue.slice(0, 5).map((v) => ({ studentName: v.studentName, studentCode: v.studentCode, netPayablePaisa: Math.max(0, v.gross - v.discount) }))

  if (input.dryRun || toIssue.length === 0) return result

  await prisma.$transaction(async (tx) => {
    for (const voucher of toIssue) {
      const voucherNumber = await nextCode('FEE_VOUCHER', tx)
      await tx.feeVoucher.create({
        data: {
          studentId: voucher.studentId,
          academicSessionId: voucher.sessionId,
          feePackageId: voucher.packageId,
          packageName: voucher.packageName,
          voucherNumber,
          month: collegeDateToStorage(month),
          dueDate: collegeDateToStorage(dueDate),
          grossPaisa: voucher.gross,
          discountPaisa: voucher.discount,
          issuedByUserId: ctx.userId,
        },
      })
    }

    await writeAuditLog(
      ctx,
      {
        action: 'fee_voucher.issued',
        entityType: 'fee_voucher',
        entityLabel: `Fee run · ${result.monthLabel}`,
        metadata: { month, dueDate, issued: result.issued, totalBilledPaisa: result.totalBilledPaisa },
      },
      tx,
    )
  })

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
  const dueDate = storageToCollegeDate(voucher.dueDate)

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
    select: { id: true, status: true, voucherNumber: true, dueDate: true, grossPaisa: true, discountPaisa: true, paidPaisa: true, cancelledAt: true, student: { select: { fullName: true, studentCode: true } } },
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
    await tx.feePayment.update({
      where: { id: paymentId },
      data: { voidedAt: new Date(), voidedByUserId: ctx.userId, voidReason: input.reason },
    })
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
