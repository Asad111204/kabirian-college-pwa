/**
 * Generates the PWA app icons from an SVG.
 *
 *   npx tsx scripts/generate-icons.ts
 *
 * Run this again after dropping the official Kabirian College logo into
 * `public/brand/logo.svg` — point SOURCE_SVG at it and every icon size is
 * regenerated consistently.
 */
import sharp from 'sharp'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const BRAND = '#134e4a' // brand-800, matches the manifest theme colour
const OUT_DIR = join(process.cwd(), 'public', 'icons')

/** The placeholder mark: a "K" monogram, same shape as components/layout/logo.tsx */
function logoSvg(size: number, padding: number): string {
  const inner = size - padding * 2
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" fill="${BRAND}"/>
  <g transform="translate(${padding} ${padding}) scale(${inner / 48})">
    <path d="M15 13v22M15 24l10-11M15 24l11 11" stroke="white" stroke-width="3.2"
          stroke-linecap="round" stroke-linejoin="round" fill="none"/>
    <circle cx="34" cy="24" r="3.4" fill="white"/>
  </g>
</svg>`
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true })

  const targets = [
    // Normal icons: the mark fills most of the square.
    { file: 'icon-192.png', size: 192, padding: 20 },
    { file: 'icon-512.png', size: 512, padding: 54 },
    { file: 'apple-touch-icon.png', size: 180, padding: 18 },
    // Maskable: Android may crop to a circle, so keep the mark inside the
    // "safe zone" (the middle 80%) by using far more padding.
    { file: 'icon-maskable-512.png', size: 512, padding: 110 },
  ]

  for (const target of targets) {
    const png = await sharp(Buffer.from(logoSvg(target.size, target.padding)))
      .png({ compressionLevel: 9 })
      .toBuffer()

    await writeFile(join(OUT_DIR, target.file), png)
    console.log(`  ${target.file.padEnd(26)} ${target.size}x${target.size}  ${(png.length / 1024).toFixed(1)} KB`)
  }

  // Also keep the source SVG so the logo can be replaced later.
  await mkdir(join(process.cwd(), 'public', 'brand'), { recursive: true })
  await writeFile(join(process.cwd(), 'public', 'brand', 'logo-placeholder.svg'), logoSvg(48, 0))

  console.log('\n  Icons written to public/icons/')
  console.log('  Replace public/brand/logo-placeholder.svg with the real logo and re-run.\n')
}

main().catch((error) => {
  console.error('Icon generation failed:', error)
  process.exit(1)
})
