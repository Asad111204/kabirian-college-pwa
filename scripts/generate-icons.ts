/**
 * Generates the PWA app icons from the school's logo.
 *
 *   npx tsx scripts/generate-icons.ts
 *
 * The source is `public/brand/logo.png` — Nova School Kamalia's crest on a
 * transparent background. Home-screen icons cannot be transparent (Android
 * paints black behind them, iOS grey), so the crest is centred on white, which
 * is how the school prints it. Each size is regenerated consistently, so run
 * this again whenever the logo changes (after scripts/prepare-logo.ts).
 */
import sharp from 'sharp'
import { existsSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const SOURCE = join(process.cwd(), 'public', 'brand', 'logo.png')
const OUT_DIR = join(process.cwd(), 'public', 'icons')

/** The icon's ground; the crest's own colours sit on it. */
const BACKGROUND = '#ffffff'

async function main() {
  if (!existsSync(SOURCE)) {
    console.error(`\n  ${SOURCE} does not exist. Save the school's logo there first.\n`)
    process.exit(1)
  }
  await mkdir(OUT_DIR, { recursive: true })

  const crest = await sharp(SOURCE).ensureAlpha().trim().png().toBuffer()

  const targets = [
    // Normal icons: the crest fills most of the square.
    { file: 'icon-192.png', size: 192, padding: 14 },
    { file: 'icon-512.png', size: 512, padding: 36 },
    { file: 'apple-touch-icon.png', size: 180, padding: 14 },
    // Maskable: Android may crop to a circle, so keep the crest inside the
    // "safe zone" (the middle 80%) by using far more padding.
    { file: 'icon-maskable-512.png', size: 512, padding: 72 },
  ]

  for (const target of targets) {
    const inner = target.size - target.padding * 2
    const scaled = await sharp(crest).resize({ width: inner, height: inner, fit: 'inside' }).png().toBuffer()
    const png = await sharp({
      create: { width: target.size, height: target.size, channels: 4, background: BACKGROUND },
    })
      .composite([{ input: scaled, gravity: 'centre' }])
      .png({ compressionLevel: 9 })
      .toBuffer()

    await writeFile(join(OUT_DIR, target.file), png)
    console.log(`  ${target.file.padEnd(26)} ${target.size}x${target.size}  ${(png.length / 1024).toFixed(1)} KB`)
  }

  console.log('\n  Icons written to public/icons/\n')
}

main().catch((error) => {
  console.error('Icon generation failed:', error)
  process.exit(1)
})
