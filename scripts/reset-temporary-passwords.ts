/**
 * Puts every account still on a temporary password onto the school's one
 * temporary password.
 *
 *   npx tsx scripts/reset-temporary-passwords.ts --url https://school.example.com
 *   …same again with --apply once the report reads correctly.
 *
 * The school asked for one password to hand out rather than a slip per
 * person. **It is not a secret**: anyone who knows it can sign into any
 * account still on it, and the only thing standing in the way is that each
 * person must set their own the first time they sign in. An account nobody has
 * touched stays open until they do. The office was told this before it was
 * asked for.
 *
 * Only accounts that are ALREADY on a temporary password are touched. Somebody
 * who has chosen their own password keeps it: this never takes a real password
 * away from anyone.
 *
 * Each reset goes through the same endpoint the office's own button uses, so
 * every one of them is in the audit log under the administrator who ran it.
 */
import { writeFileSync } from 'node:fs'
import { askCredentials } from './prompt'

const transcript: string[] = []

function say(line = ''): void {
  transcript.push(line)
  console.log(line)
}

function complain(line: string): void {
  transcript.push(line)
  console.error(line)
}

const NEWLINE = String.fromCharCode(10)

function writeReport(path: string): void {
  try {
    writeFileSync(path, transcript.join(NEWLINE) + NEWLINE, 'utf8')
    console.log(`${NEWLINE}A copy of this run is in ${path}${NEWLINE}`)
  } catch {
    // A report that cannot be written is not worth failing the run over.
  }
}

function argValue(flag: string): string | undefined {
  const index = process.argv.indexOf(flag)
  return index === -1 ? undefined : process.argv[index + 1]
}

/** A request that survives the network having a bad moment. */
async function request(input: string, init?: RequestInit, attempts = 4): Promise<Response> {
  let lastError: unknown
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fetch(input, init)
    } catch (error) {
      lastError = error
      if (attempt === attempts) break
      await new Promise((resolve) => setTimeout(resolve, attempt * 1500))
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError))
}

interface UserRow {
  id: string
  username: string
  fullName: string | null
  role: string
  mustChangePassword: boolean
  status: string
}

async function main() {
  const url = (argValue('--url') ?? 'http://localhost:3000').replace(/\/$/, '')
  const apply = process.argv.includes('--apply')
  const onlyRole = argValue('--role')
  const reportPath = argValue('--report') ?? 'password-reset-report.txt'

  const { username, password } = await askCredentials()

  const loginRes = await request(`${url}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: url },
    body: JSON.stringify({ username, password }),
    redirect: 'manual',
  })
  const cookie = (loginRes.headers.get('set-cookie') ?? '').split(';')[0] ?? ''
  if (!cookie.startsWith('kc_session=')) {
    complain(`${NEWLINE}Sign-in failed (${loginRes.status}). Check the username and password.${NEWLINE}`)
    process.exit(1)
  }
  const headers = { cookie, origin: url, 'content-type': 'application/json' }

  // Everyone, a page at a time.
  const users: UserRow[] = []
  for (let page = 1; page < 50; page += 1) {
    const res = await request(`${url}/api/v1/users?page=${page}&pageSize=100`, { headers })
    const body = (await res.json()) as { data?: { items: UserRow[]; totalPages: number }; error?: { message?: string } }
    if (!res.ok) {
      complain(`${NEWLINE}Could not read the accounts: ${body.error?.message ?? res.status}${NEWLINE}`)
      process.exit(1)
    }
    users.push(...(body.data?.items ?? []))
    if (page >= (body.data?.totalPages ?? 1)) break
  }

  const waiting = users.filter(
    (user) => user.mustChangePassword && (!onlyRole || user.role === onlyRole.toUpperCase()),
  )

  say(`${NEWLINE}Accounts on a temporary password${apply ? '' : ' — DRY RUN, nothing will be changed'}`)
  say(`  ${users.length} accounts in all; ${waiting.length} still on a temporary password`)
  if (onlyRole) say(`  narrowed to role ${onlyRole.toUpperCase()}`)

  const byRole = new Map<string, number>()
  for (const user of waiting) byRole.set(user.role, (byRole.get(user.role) ?? 0) + 1)
  for (const [role, count] of [...byRole].sort()) say(`    ${role.padEnd(10)} ${count}`)

  say('')
  say('  Anyone who has already chosen their own password is not touched.')

  if (!apply) {
    say(`${NEWLINE}Nothing has been changed. Add --apply to set them all to the school password.${NEWLINE}`)
    writeReport(reportPath)
    return
  }

  let done = 0
  const problems: string[] = []

  for (const user of waiting) {
    try {
      const res = await request(`${url}/api/v1/users/${user.id}/reset-password`, { method: 'POST', headers })
      if (!res.ok) {
        const body = (await res.json()) as { error?: { message?: string } }
        problems.push(`${user.username}: ${body.error?.message ?? res.status}`)
        continue
      }
      done += 1
      if (done % 25 === 0) say(`  ${done} of ${waiting.length} reset…`)
    } catch (error) {
      problems.push(`${user.username}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  say(`${NEWLINE}  ${done} account${done === 1 ? '' : 's'} put on the school temporary password.`)
  say('  Each of them must set their own the first time they sign in.')

  if (problems.length > 0) {
    say(`${NEWLINE}${problems.length} could not be reset:`)
    for (const problem of problems) say(`  - ${problem}`)
  }
  say('')
  process.exitCode = problems.length > 0 ? 1 : 0
  writeReport(reportPath)
}

main().catch((error) => {
  complain(`${NEWLINE}Reset failed: ${error instanceof Error ? error.message : String(error)}`)
  if (error instanceof Error && error.stack) transcript.push(error.stack)
  writeReport(argValue('--report') ?? 'password-reset-report.txt')
  process.exitCode = 1
})
