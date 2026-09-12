/**
 * Turns the school's logo into the two sizes the app actually serves.
 *
 *   npx tsx scripts/prepare-logo.ts
 *
 * The master file is `public/brand/logo.png`: Nova School Kamalia's crest — a
 * portrait emblem on a transparent background (949×1164). Served as-is it
 * would cost half a megabyte on every login screen, so this trims the blank
 * margin and writes two optimised PNGs, both transparent:
 *
 *   brand/logo-full.png  the crest at 640px tall — login, handbook, result card
 *   brand/logo-mark.png  the crest at 192px tall — the sidebar and small places
 *
 * It prints each file's pixel size: copy those into LOGO_WIDTH / LOGO_HEIGHT
 * in components/layout/logo.tsx and features/results/result-card.tsx if they
 * change. Run it again if the school sends a new logo; then run
 * scripts/generate-icons.ts as well so the PWA icons match.
 */
import sharp from 'sharp'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

const BRAND_DIR = join(process.cwd(), 'public', 'brand')
const SOURCE = join(BRAND_DIR, 'logo.png')

const OUTPUTS = [
  { file: 'logo-full.png', height: 640 },
  { file: 'logo-mark.png', height: 192 },
]

async function main() {
  console.log('\nNova School Kamalia — logo assets')

  if (!existsSync(SOURCE)) {
    console.error(`\n  ${SOURCE} does not exist.\n  Save the official logo there first (a PNG with a transparent background), then run this again.\n`)
    process.exit(1)
  }

  // Trim the transparent margin once, so every size is cut from the same crest.
  const crest = await sharp(SOURCE).ensureAlpha().trim().png().toBuffer()
  const crestMeta = await sharp(crest).metadata()
  console.log(`  source    ${crestMeta.width}×${crestMeta.height} after trimming  brand/logo.png`)

  for (const out of OUTPUTS) {
    const png = await sharp(crest).resize({ height: out.height }).png({ compressionLevel: 9 }).toBuffer()
    const meta = await sharp(png).metadata()
    await sharp(png).toFile(join(BRAND_DIR, out.file))
    console.log(`  ${out.file.padEnd(14)} ${meta.width}×${meta.height}  ${(png.length / 1024).toFixed(1)} KB`)
  }

  console.log('\nDone. Both are transparent PNGs and safe on any background.')
  console.log('If a size printed above changed, update LOGO_WIDTH / LOGO_HEIGHT in logo.tsx and result-card.tsx.\n')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
