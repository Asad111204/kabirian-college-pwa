/**
 * How an attendance percentage is coloured.
 *
 * The college's bands, exactly as given:
 *
 *   below 75%   red          — short of the requirement
 *   75 to 79%   amber        — meets it, only just
 *   80 to 89%   light green  — comfortable
 *   90 to 100%  dark green   — excellent
 *
 * A pure function with no React in it, so the boundaries can be tested on their
 * own — an off-by-one here would quietly mislabel a student as failing to meet
 * a requirement they actually meet.
 *
 * Every band carries a `label` as well as its colours. Colour is emphasis, never
 * the only signal: the figure itself is always printed, and the label is read
 * out to anyone using a screen reader or looking at a black-and-white print.
 */

export type AttendanceBandKey = 'SHORT' | 'MARGINAL' | 'COMFORTABLE' | 'EXCELLENT'

export interface AttendanceBand {
  key: AttendanceBandKey
  /** Said in words, so the colour is never carrying the meaning alone. */
  label: string
  /** Colour for the figure itself. */
  text: string
  /** Background and border, for a chip or a filled cell. */
  chip: string
}

/** The college's minimum. Below this a student is short of attendance. */
export const ATTENDANCE_REQUIREMENT = 75

const BANDS: Record<AttendanceBandKey, AttendanceBand> = {
  SHORT: {
    key: 'SHORT',
    label: 'Below the 75% requirement',
    text: 'text-danger-700',
    chip: 'bg-danger-50 text-danger-700 border-danger-600/30',
  },
  MARGINAL: {
    key: 'MARGINAL',
    label: 'Meets the requirement, only just',
    text: 'text-warning-700',
    chip: 'bg-warning-50 text-warning-700 border-warning-600/30',
  },
  COMFORTABLE: {
    key: 'COMFORTABLE',
    label: 'Comfortably above the requirement',
    text: 'text-success-600',
    chip: 'bg-success-50 text-success-600 border-success-600/30',
  },
  EXCELLENT: {
    key: 'EXCELLENT',
    label: 'Excellent attendance',
    text: 'text-success-700',
    chip: 'bg-success-50 text-success-700 border-success-700/40',
  },
}

/**
 * The band a percentage falls in, or `null` when there is no percentage.
 *
 * No attendance yet is not 0% — it means no classes have been held — so it gets
 * no colour rather than a red one.
 */
export function attendanceBand(percentage: number | null): AttendanceBand | null {
  if (percentage === null || Number.isNaN(percentage)) return null
  if (percentage < 75) return BANDS.SHORT
  if (percentage < 80) return BANDS.MARGINAL
  if (percentage < 90) return BANDS.COMFORTABLE
  return BANDS.EXCELLENT
}
