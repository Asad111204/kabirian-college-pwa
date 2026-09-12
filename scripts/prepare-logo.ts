/**
 * Turns the college's supplied logo into the two assets the app actually uses.
 *
 *   npx tsx scripts/prepare-logo.ts
 *
 * The file the college sent (`public/brand/college-logo.jpeg`) is a wordmark
 * sitting in a wide white field. Used as-is it would show as a postage stamp
 * in a 32-pixel corner, so this trims the white away and writes two PNGs with
 * transparent backgrounds:
 *
 *   brand/logo-wordmark.png  the shield and the words, for a page header
 *   brand/logo-mark.png      the shield alone, square, for small placements
 *
 * Run it again if the college sends a new logo. Nothing else changes.
 */
import sharp from 'sharp'
import { join } from 'node:path'

const BRAND_DIR = join(process.cwd(), 'public', 'brand')
const SOURCE = join(BRAND_DIR, 'college-logo.jpeg')

/**
 * White becomes transparent.
 *
 * The source is a JPEG, so the "white" around the mark is not exactly
 * #ffffff — compression leaves it a few shades off. Anything above the
 * threshold on all three channels is treated as background.
 */
async function toTransparent(input: Buffer, threshold = 235): Promise<Buffer> {
  const image = sharp(input).ensureAlpha()
  const { data, info } = await image.raw().toBuffer({ resolveWithObject: true })

  for (let i = 0; i < data.length; i += info.channels) {
    if (data[i]! >= threshold && data[i + 1]! >= threshold && data[i + 2]! >= threshold) {
      data[i + 3] = 0
    }
  }

  return sharp(data, { raw: { width: info.width, height: info.height, channels: info.channels as 4 } })
    .png()
    .toBuffer()
}

async function main() {
  console.log('\nKabirian College — logo assets')

  const source = await sharp(SOURCE).toBuffer()
  const transparent = await toTransparent(source)

  // The wordmark: everything the college drew, with the white field removed.
  const wordmark = await sharp(transparent).trim().png().toBuffer()
  const wordmarkMeta = await sharp(wordmark).metadata()
  await sharp(wordmark).toFile(join(BRAND_DIR, 'logo-wordmark.png'))
  console.log(`  wordmark  ${wordmarkMeta.width}×${wordmarkMeta.height}  brand/logo-wordmark.png`)

  // The mark alone: the shield sits at the left of the wordmark, a little
  // narrower than it is tall. Cut inside the gap before the "K" of KABIRIAN
  // and let `trim` tighten the edges from there.
  const height = wordmarkMeta.height ?? 0
  const mark = await sharp(wordmark)
    .extract({ left: 0, top: 0, width: Math.round(height * 0.8), height })
    .trim()
    .png()
    .toBuffer()
  const markMeta = await sharp(mark).metadata()
  await sharp(mark).toFile(join(BRAND_DIR, 'logo-mark.png'))
  console.log(`  mark      ${markMeta.width}×${markMeta.height}  brand/logo-mark.png`)

  console.log('\nDone. Both are transparent PNGs and safe on any background.\n')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
