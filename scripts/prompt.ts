/**
 * Asking for the administrator's credentials on the terminal.
 *
 * The password must not appear on the screen. Node's readline can be talked
 * into hiding it, but only when it decides the input is a terminal, and on
 * Windows `cmd.exe` it does not always decide that — a user once sent a
 * screenshot with the password sitting in plain view to prove it. So the
 * password is read from the raw input stream instead, one keystroke at a time,
 * and nothing is echoed at all.
 *
 * Neither value is written anywhere. The harness drill supplies them through
 * the environment instead, so nothing has to be typed there.
 */
import { createInterface } from 'node:readline/promises'
import { stdin, stdout } from 'node:process'

const ENTER = ['\r', '\n']
const END_OF_TRANSMISSION = '\u0004'
const INTERRUPT = '\u0003'
const BACKSPACE = ['\u007f', '\b']

/** Reads a line without showing it. Backspace works; Ctrl-C still quits. */
function readSecret(prompt: string): Promise<string> {
  stdout.write(prompt)

  // Not a terminal — a pipe, or a shell that has already taken the input.
  // There is nothing to echo, so an ordinary line read is right.
  if (!stdin.isTTY || typeof stdin.setRawMode !== 'function') {
    const rl = createInterface({ input: stdin, output: stdout })
    return rl.question('').then((value) => {
      rl.close()
      return value
    })
  }

  return new Promise<string>((resolve, reject) => {
    let value = ''

    const finish = (settle: () => void) => {
      stdin.off('data', onData)
      stdin.setRawMode(false)
      stdin.pause()
      stdout.write('\n')
      settle()
    }

    const onData = (chunk: Buffer) => {
      for (const ch of chunk.toString('utf8')) {
        if (ENTER.includes(ch) || ch === END_OF_TRANSMISSION) return finish(() => resolve(value))
        if (ch === INTERRUPT) return finish(() => reject(new Error('Cancelled.')))
        if (BACKSPACE.includes(ch)) {
          value = value.slice(0, -1)
          continue
        }
        // Control characters are not part of a password; everything else is.
        if (ch >= ' ') value += ch
      }
    }

    stdin.setRawMode(true)
    stdin.resume()
    stdin.on('data', onData)
  })
}

export interface Credentials {
  username: string
  password: string
}

/** From the environment when it is there, from the terminal when it is not. */
export async function askCredentials(): Promise<Credentials> {
  const fromEnv = { username: process.env.KC_ADMIN_USERNAME ?? '', password: process.env.KC_ADMIN_PASSWORD ?? '' }
  if (fromEnv.username && fromEnv.password) return fromEnv

  const rl = createInterface({ input: stdin, output: stdout })
  const username = await rl.question('Administrator username: ')
  rl.close()

  const password = await readSecret('Password (nothing appears as you type): ')
  return { username, password }
}
