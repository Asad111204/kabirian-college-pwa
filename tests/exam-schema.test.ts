import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'

/**
 * The exam and result schema, tested against a real PostgreSQL.
 *
 * These check what the *database* refuses, by applying every migration in order
 * to a throwaway instance and then trying to break each rule. Two of them —
 * `NULLS NOT DISTINCT` on the paper key, and the mark status/value rule — are
 * hand-written SQL that Prisma cannot express, so without a test nothing would
 * notice if a future migration dropped them.
 */

const MIGRATIONS_DIR = join(process.cwd(), 'prisma', 'migrations')
let db: PGlite

const ID = {
  session: '11111111-1111-1111-1111-111111111111',
  otherSession: '11111111-1111-1111-1111-111111111112',
  class: '22222222-2222-2222-2222-222222222221',
  division: '22222222-2222-2222-2222-222222222222',
  program: '22222222-2222-2222-2222-222222222223',
  program2: '22222222-2222-2222-2222-222222222224',
  group: '33333333-3333-3333-3333-333333333331',
  otherGroup: '33333333-3333-3333-3333-333333333332',
  section: '44444444-4444-4444-4444-444444444441',
  otherSection: '44444444-4444-4444-4444-444444444442',
  biology: '55555555-5555-5555-5555-555555555551',
  chemistry: '55555555-5555-5555-5555-555555555552',
  student: '66666666-6666-6666-6666-666666666661',
  student2: '66666666-6666-6666-6666-666666666662',
  designation: '77777777-7777-7777-7777-777777777771',
  staff: '88888888-8888-8888-8888-888888888881',
  user: '99999999-9999-9999-9999-999999999991',
  examType: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1',
  exam: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1',
  otherExam: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2',
  paper: 'cccccccc-cccc-cccc-cccc-ccccccccccc1',
  sheet: 'dddddddd-dddd-dddd-dddd-ddddddddddd1',
  scale: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee1',
}

let counter = 0
const uid = () => `f0000000-0000-0000-0000-${String(++counter).padStart(12, '0')}`

/** Runs a statement and reports whether the database refused it. */
async function refused(fn: () => Promise<unknown>): Promise<boolean> {
  try {
    await fn()
    return false
  } catch {
    return true
  }
}

beforeAll(async () => {
  db = await PGlite.create()

  for (const dir of readdirSync(MIGRATIONS_DIR).sort()) {
    await db.exec(readFileSync(join(MIGRATIONS_DIR, dir, 'migration.sql'), 'utf8'))
  }

  await db.exec(`
    INSERT INTO academic_sessions (id, name, start_date, end_date, is_current, status, created_at, updated_at) VALUES
      ('${ID.session}', '2026-27', '2026-04-01', '2027-03-31', true, 'ACTIVE', now(), now()),
      ('${ID.otherSession}', '2027-28', '2027-04-01', '2028-03-31', false, 'UPCOMING', now(), now());
    INSERT INTO classes (id, name, code, level, is_active, created_at, updated_at)
      VALUES ('${ID.class}', '1st Year', '11', 1, true, now(), now());
    INSERT INTO divisions (id, name, code, sort_order, is_active, created_at, updated_at)
      VALUES ('${ID.division}', 'Boys', 'B', 1, true, now(), now());
    INSERT INTO programs (id, name, code, sort_order, is_active, created_at, updated_at) VALUES
      ('${ID.program}', 'Pre-Medical', 'PM', 1, true, now(), now()),
      ('${ID.program2}', 'Pre-Engineering', 'PE', 2, true, now(), now());
    INSERT INTO subjects (id, name, code, is_active, created_at, updated_at) VALUES
      ('${ID.biology}', 'Biology', 'BIO', true, now(), now()),
      ('${ID.chemistry}', 'Chemistry', 'CHEM', true, now(), now());
    INSERT INTO academic_groups (id, academic_session_id, class_id, division_id, program_id, is_active, created_at, updated_at) VALUES
      ('${ID.group}', '${ID.session}', '${ID.class}', '${ID.division}', '${ID.program}', true, now(), now()),
      ('${ID.otherGroup}', '${ID.otherSession}', '${ID.class}', '${ID.division}', '${ID.program}', true, now(), now());
    INSERT INTO sections (id, academic_group_id, academic_session_id, name, is_active, created_at, updated_at) VALUES
      ('${ID.section}', '${ID.group}', '${ID.session}', 'A', true, now(), now()),
      ('${ID.otherSection}', '${ID.otherGroup}', '${ID.otherSession}', 'A', true, now(), now());
    INSERT INTO students (id, student_code, admission_number, full_name, father_name, gender, admission_date, admission_session_id, status, created_at, updated_at) VALUES
      ('${ID.student}', 'STU-0001', 'ADM-1', 'Ali Raza', 'Raza', 'MALE', '2026-04-01', '${ID.session}', 'ACTIVE', now(), now()),
      ('${ID.student2}', 'STU-0002', 'ADM-2', 'Bilal Ahmed', 'Ahmed', 'MALE', '2026-04-01', '${ID.session}', 'ACTIVE', now(), now());
    INSERT INTO designations (id, name, code, is_active, sort_order, created_at, updated_at)
      VALUES ('${ID.designation}', 'Lecturer', 'LEC', true, 1, now(), now());
    INSERT INTO staff (id, staff_code, full_name, designation_id, staff_type, employment_status, joining_date, created_at, updated_at)
      VALUES ('${ID.staff}', 'STF-0001', 'Sara Khan', '${ID.designation}', 'TEACHING', 'ACTIVE', '2026-04-01', now(), now());
    INSERT INTO users (id, username, password_hash, role, status, must_change_password, failed_login_attempts, is_system_owner, created_at, updated_at)
      VALUES ('${ID.user}', 'admin', 'x', 'ADMIN', 'ACTIVE', false, 0, true, now(), now());

    INSERT INTO exam_types (id, name, code, sort_order, is_active, created_at, updated_at)
      VALUES ('${ID.examType}', 'First Term', 'T1', 1, true, now(), now());
    INSERT INTO exams (id, name, exam_type_id, academic_session_id, status, created_at, updated_at) VALUES
      ('${ID.exam}', 'First Term 2026', '${ID.examType}', '${ID.session}', 'DRAFT', now(), now()),
      ('${ID.otherExam}', 'Second Term 2027', '${ID.examType}', '${ID.otherSession}', 'DRAFT', now(), now());
    INSERT INTO exam_papers (id, exam_id, academic_session_id, class_id, subject_id, max_marks, passing_percentage, is_active, created_at, updated_at)
      VALUES ('${ID.paper}', '${ID.exam}', '${ID.session}', '${ID.class}', '${ID.biology}', 100, 50, true, now(), now());
    INSERT INTO exam_mark_sheets (id, exam_paper_id, academic_session_id, section_id, status, entered_by_staff_id, created_at, updated_at)
      VALUES ('${ID.sheet}', '${ID.paper}', '${ID.session}', '${ID.section}', 'DRAFT', '${ID.staff}', now(), now());
    INSERT INTO grade_scales (id, name, is_default, is_active, created_at, updated_at)
      VALUES ('${ID.scale}', 'Kabirian College', true, true, now(), now());
  `)
}, 90_000)

/* -------------------------------------------------------------------------- */

describe('exams', () => {
  it('refuses two exams with the same name in one session', async () => {
    expect(
      await refused(() =>
        db.query(
          `INSERT INTO exams (id, name, exam_type_id, academic_session_id, status, created_at, updated_at)
           VALUES ($1, 'First Term 2026', $2, $3, 'DRAFT', now(), now())`,
          [uid(), ID.examType, ID.session],
        ),
      ),
    ).toBe(true)
  })

  it('allows the same exam name in a different session', async () => {
    await expect(
      db.query(
        `INSERT INTO exams (id, name, exam_type_id, academic_session_id, status, created_at, updated_at)
         VALUES ($1, 'First Term 2026', $2, $3, 'DRAFT', now(), now())`,
        [uid(), ID.examType, ID.otherSession],
      ),
    ).resolves.toBeTruthy()
  })
})

describe('exam papers', () => {
  const insertPaper = (over: Record<string, unknown> = {}) => {
    const v = {
      id: uid(),
      exam: ID.exam,
      session: ID.session,
      cls: ID.class,
      subject: ID.chemistry,
      program: null as string | null,
      max: 100,
      pass: 50,
      start: null as string | null,
      ...over,
    }
    return db.query(
      `INSERT INTO exam_papers (id, exam_id, academic_session_id, class_id, subject_id, program_id, max_marks, passing_percentage, start_time, is_active, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,true,now(),now())`,
      [v.id, v.exam, v.session, v.cls, v.subject, v.program, v.max, v.pass, v.start],
    )
  }

  it('accepts a paper covering every program in the class', async () => {
    await expect(insertPaper({ subject: ID.chemistry })).resolves.toBeTruthy()
  })

  it('refuses a duplicate paper even though program_id is NULL', async () => {
    // This is the NULLS NOT DISTINCT rule. Without it PostgreSQL treats each
    // NULL as unique and this second insert would succeed.
    expect(await refused(() => insertPaper({ subject: ID.chemistry }))).toBe(true)
  })

  it('allows the same subject for two different programs', async () => {
    await expect(insertPaper({ subject: ID.biology, program: ID.program })).resolves.toBeTruthy()
    await expect(insertPaper({ subject: ID.biology, program: ID.program2 })).resolves.toBeTruthy()
  })

  it('refuses a paper whose exam belongs to a different session', async () => {
    expect(await refused(() => insertPaper({ session: ID.otherSession, subject: ID.chemistry }))).toBe(true)
  })

  it('refuses zero or negative maximum marks', async () => {
    expect(await refused(() => insertPaper({ max: 0, subject: ID.chemistry, program: ID.program }))).toBe(true)
    expect(await refused(() => insertPaper({ max: -5, subject: ID.chemistry, program: ID.program }))).toBe(true)
  })

  it('refuses a passing percentage outside 0–100', async () => {
    expect(await refused(() => insertPaper({ pass: 150, subject: ID.chemistry, program: ID.program }))).toBe(true)
    expect(await refused(() => insertPaper({ pass: -1, subject: ID.chemistry, program: ID.program }))).toBe(true)
  })

  it('accepts a well-formed date-sheet time and refuses anything else', async () => {
    await expect(
      insertPaper({ subject: ID.chemistry, program: ID.program2, start: '09:00' }),
    ).resolves.toBeTruthy()
    for (const bad of ['9:00', '25:00', '09:60', 'morning']) {
      expect(await refused(() => insertPaper({ subject: ID.biology, start: bad }))).toBe(true)
    }
  })
})

describe('mark sheets', () => {
  const insertSheet = (over: Record<string, unknown> = {}) => {
    const v = { id: uid(), paper: ID.paper, session: ID.session, section: ID.section, ...over }
    return db.query(
      `INSERT INTO exam_mark_sheets (id, exam_paper_id, academic_session_id, section_id, status, entered_by_staff_id, created_at, updated_at)
       VALUES ($1,$2,$3,$4,'DRAFT',$5,now(),now())`,
      [v.id, v.paper, v.session, v.section, ID.staff],
    )
  }

  it('refuses a second sheet for the same paper and section', async () => {
    expect(await refused(() => insertSheet())).toBe(true)
  })

  it('refuses a section that belongs to a different academic session', async () => {
    expect(await refused(() => insertSheet({ section: ID.otherSection }))).toBe(true)
  })
})

describe('marks — the status and value rule', () => {
  // Every case here inserts into the same sheet, so each test starts clean.
  afterEach(async () => {
    await db.query(`DELETE FROM marks`)
  })

  const insertMark = (status: string, marks: number | null, student = ID.student, sheet = ID.sheet, paper = ID.paper) =>
    db.query(
      `INSERT INTO marks (id, mark_sheet_id, exam_paper_id, student_id, status, obtained_marks, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5::mark_status,$6,now(),now())`,
      [uid(), sheet, paper, student, status, marks],
    )

  it('accepts PENDING with no mark', async () => {
    await expect(insertMark('PENDING', null)).resolves.toBeTruthy()
  })

  it('refuses PENDING with a mark — a missing mark is never a zero', async () => {
    expect(await refused(() => insertMark('PENDING', 0))).toBe(true)
    expect(await refused(() => insertMark('PENDING', 42))).toBe(true)
  })

  it('accepts ENTERED with a mark, including a decimal one', async () => {
    await expect(insertMark('ENTERED', 82.5)).resolves.toBeTruthy()
    const row = await db.query<{ obtained_marks: string }>(
      `SELECT obtained_marks FROM marks WHERE student_id = $1`,
      [ID.student],
    )
    expect(String(row.rows[0]?.obtained_marks)).toBe('82.50')
  })

  it('refuses ENTERED with no mark', async () => {
    expect(await refused(() => insertMark('ENTERED', null))).toBe(true)
  })

  it('accepts ABSENT scoring exactly zero', async () => {
    await expect(insertMark('ABSENT', 0)).resolves.toBeTruthy()
  })

  it('refuses ABSENT with any other value, including NULL', async () => {
    expect(await refused(() => insertMark('ABSENT', null))).toBe(true)
    expect(await refused(() => insertMark('ABSENT', 40))).toBe(true)
  })

  it('refuses a negative mark', async () => {
    expect(await refused(() => insertMark('ENTERED', -1))).toBe(true)
  })

  it('refuses two marks for the same student on one paper', async () => {
    await insertMark('ENTERED', 60)
    expect(await refused(() => insertMark('ENTERED', 70))).toBe(true)
  })

  it('refuses a mark whose paper disagrees with its sheet', async () => {
    const otherPaper = await db.query<{ id: string }>(
      `SELECT id FROM exam_papers WHERE id <> $1 LIMIT 1`,
      [ID.paper],
    )
    expect(
      await refused(() => insertMark('ENTERED', 50, ID.student, ID.sheet, otherPaper.rows[0]!.id)),
    ).toBe(true)
  })

  it('refuses an unknown status', async () => {
    expect(await refused(() => insertMark('EXCUSED', 0))).toBe(true)
  })
})

describe('grading scales', () => {
  it('allows only one default scale', async () => {
    expect(
      await refused(() =>
        db.query(
          `INSERT INTO grade_scales (id, name, is_default, is_active, created_at, updated_at)
           VALUES ($1, 'Another scale', true, true, now(), now())`,
          [uid()],
        ),
      ),
    ).toBe(true)
  })

  it('allows any number of non-default scales', async () => {
    await expect(
      db.query(
        `INSERT INTO grade_scales (id, name, is_default, is_active, created_at, updated_at)
         VALUES ($1, 'Old scale', false, false, now(), now())`,
        [uid()],
      ),
    ).resolves.toBeTruthy()
  })

  it('refuses a band whose range is impossible', async () => {
    const band = (min: number, max: number, grade: string) =>
      db.query(
        `INSERT INTO grade_bands (id, grade_scale_id, grade, min_percentage, max_percentage, sort_order, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,1,now(),now())`,
        [uid(), ID.scale, grade, min, max],
      )
    await expect(band(90, 100, 'A+')).resolves.toBeTruthy()
    expect(await refused(() => band(80, 70, 'X'))).toBe(true) // min above max
    expect(await refused(() => band(-1, 50, 'Y'))).toBe(true)
    expect(await refused(() => band(50, 120, 'Z'))).toBe(true)
  })

  it('refuses two bands with the same grade in one scale', async () => {
    expect(
      await refused(() =>
        db.query(
          `INSERT INTO grade_bands (id, grade_scale_id, grade, min_percentage, max_percentage, sort_order, created_at, updated_at)
           VALUES ($1,$2,'A+',85,95,2,now(),now())`,
          [uid(), ID.scale],
        ),
      ),
    ).toBe(true)
  })
})

describe('results', () => {
  const insertResult = (over: Record<string, unknown> = {}) => {
    const v = {
      id: uid(),
      student: ID.student,
      version: 1,
      current: true,
      max: 500,
      obtained: 412.5,
      pct: 82.5 as number | null,
      outcome: 'PASS',
      position: 1 as number | null,
      ...over,
    }
    return db.query(
      `INSERT INTO results (id, exam_id, student_id, version, is_current, academic_session_id, section_id, academic_group_id,
         student_code, student_name, exam_name, exam_type_name, session_name, class_name, division_name, program_name, section_name,
         total_max_marks, total_obtained_marks, percentage, outcome, subject_breakdown, position, status, generated_at, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'STU-0001','Ali Raza','First Term 2026','First Term','2026-27','1st Year','Boys','Pre-Medical','A',
         $9,$10,$11,$12::result_outcome,'[]'::jsonb,$13,'DRAFT',now(),now(),now())`,
      [v.id, ID.exam, v.student, v.version, v.current, ID.session, ID.section, ID.group, v.max, v.obtained, v.pct, v.outcome, v.position],
    )
  }

  it('accepts a result and keeps the percentage exact', async () => {
    await insertResult()
    const row = await db.query<{ percentage: string }>(
      `SELECT percentage FROM results WHERE student_id = $1`,
      [ID.student],
    )
    expect(String(row.rows[0]?.percentage)).toBe('82.50')
  })

  it('refuses a second CURRENT version for the same student and exam', async () => {
    expect(await refused(() => insertResult({ version: 2 }))).toBe(true)
  })

  it('accepts a superseding version once the old one stops being current', async () => {
    await db.query(`UPDATE results SET is_current = false WHERE student_id = $1`, [ID.student])
    await expect(insertResult({ version: 2 })).resolves.toBeTruthy()
    const rows = await db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM results WHERE student_id = $1`,
      [ID.student],
    )
    // Both versions remain on record.
    expect(rows.rows[0]?.n).toBe(2)
  })

  it('refuses obtained marks above the maximum', async () => {
    expect(await refused(() => insertResult({ student: ID.student2, obtained: 600 }))).toBe(true)
  })

  it('refuses a percentage outside 0–100', async () => {
    expect(await refused(() => insertResult({ student: ID.student2, pct: 101 }))).toBe(true)
  })

  it('refuses an INCOMPLETE result that carries a position', async () => {
    expect(
      await refused(() =>
        insertResult({ student: ID.student2, outcome: 'INCOMPLETE', position: 1, pct: null }),
      ),
    ).toBe(true)
  })

  it('accepts an INCOMPLETE result with no position and no percentage', async () => {
    await expect(
      insertResult({ student: ID.student2, outcome: 'INCOMPLETE', position: null, pct: null }),
    ).resolves.toBeTruthy()
  })

  it('refuses a percentage on an INCOMPLETE result', async () => {
    // The figure a part-marked student has scored so far is not a result.
    expect(
      await refused(() =>
        insertResult({ student: ID.student, outcome: 'INCOMPLETE', position: null, pct: 60 }),
      ),
    ).toBe(true)
  })

  it('refuses a PASS or a FAIL with no percentage', async () => {
    // Nullable does not mean optional: only INCOMPLETE may be without one.
    for (const outcome of ['PASS', 'FAIL']) {
      expect(
        await refused(() => insertResult({ student: ID.student, outcome, pct: null })),
      ).toBe(true)
    }
  })

  it('still refuses a position on an INCOMPLETE result', async () => {
    expect(
      await refused(() =>
        insertResult({ student: ID.student, outcome: 'INCOMPLETE', pct: null, position: 1 }),
      ),
    ).toBe(true)
  })
})

describe('history is protected', () => {
  it('refuses to delete a student who has a result', async () => {
    expect(await refused(() => db.query(`DELETE FROM students WHERE id = $1`, [ID.student]))).toBe(true)
  })

  it('refuses to delete an exam that has papers', async () => {
    expect(await refused(() => db.query(`DELETE FROM exams WHERE id = $1`, [ID.exam]))).toBe(true)
  })

  it('refuses to delete a subject that has a paper', async () => {
    expect(await refused(() => db.query(`DELETE FROM subjects WHERE id = $1`, [ID.biology]))).toBe(true)
  })

  it('refuses to delete the teacher who entered a mark sheet', async () => {
    expect(await refused(() => db.query(`DELETE FROM staff WHERE id = $1`, [ID.staff]))).toBe(true)
  })
})

describe('the hand-written SQL survives', () => {
  it('keeps NULLS NOT DISTINCT on the exam paper key', async () => {
    const result = await db.query<{ def: string }>(
      `SELECT indexdef AS def FROM pg_indexes
        WHERE indexname = 'exam_papers_exam_id_class_id_subject_id_program_id_key'`,
    )
    expect(result.rows[0]?.def).toContain('NULLS NOT DISTINCT')
  })

  it('keeps the partial unique indexes', async () => {
    const result = await db.query<{ indexname: string; def: string }>(
      `SELECT indexname, indexdef AS def FROM pg_indexes
        WHERE indexname IN ('grade_scales_one_default_key', 'results_exam_id_student_id_current_key')`,
    )
    expect(result.rows).toHaveLength(2)
    for (const row of result.rows) expect(row.def).toContain('WHERE')
  })

  it('keeps every check constraint', async () => {
    const result = await db.query<{ conname: string }>(
      `SELECT conname FROM pg_constraint
        WHERE contype = 'c'
          AND conrelid IN ('exam_papers'::regclass,'marks'::regclass,'grade_bands'::regclass,'results'::regclass)`,
    )
    const names = result.rows.map((r) => r.conname)
    for (const expected of [
      'exam_papers_max_marks_positive',
      'exam_papers_passing_percentage_valid',
      'exam_papers_start_time_format',
      'marks_status_matches_value',
      'marks_not_negative',
      'grade_bands_range_valid',
      'results_totals_sane',
      'results_incomplete_has_no_position',
      'results_percentage_matches_outcome',
    ]) {
      expect(names).toContain(expected)
    }
  })
})
