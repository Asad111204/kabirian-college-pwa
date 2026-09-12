# Brand assets — Nova School Kamalia

| File | What it is | Used by |
|---|---|---|
| `logo.png` | **Master.** The school's crest as supplied (949×1164, transparent). Not served by the app; everything below is cut from it. | `scripts/prepare-logo.ts`, `scripts/generate-icons.ts` |
| `logo-full.png` | The crest trimmed and resized to 495×640 | login, change-password, switch, offline and not-found pages; the handbook cover and closing page; the printed result card |
| `logo-mark.png` | The crest at 149×192 | the sidebar and the handbook's page headings (`Logo` in `src/components/layout/logo.tsx`) |
| `../icons/*.png` | PWA / home-screen icons: the crest centred on white | `src/app/manifest.ts`, `src/app/layout.tsx` |

## Colours taken from the crest

| Colour | Hex | Where |
|---|---|---|
| Pen / book / stars blue | `#0393dc` | `--color-brand-500` in `src/app/globals.css`; the whole `brand-*` ramp is built around it, and `#104b78` (brand-800) is the PWA theme colour |
| NOVA / ribbon maroon | `#92221c` | `--color-college` — the printed result card's headings and rules |
| Laurel gold | `#ac7739` | `--color-crest-gold` — available as a utility, not used yet |

## If the school sends a new logo

1. Save it as `public/brand/logo.png` (PNG, transparent background).
2. `npx tsx scripts/prepare-logo.ts` — rewrites `logo-full.png` and `logo-mark.png` and prints their pixel sizes.
3. `npx tsx scripts/generate-icons.ts` — rebuilds `public/icons/`.
4. If the printed sizes changed, update `LOGO_RATIO` in `src/components/layout/logo.tsx` and `LOGO_WIDTH` / `LOGO_HEIGHT` in `src/features/results/result-card.tsx`.
5. If the colours changed, re-sample them and update the three tokens above.
