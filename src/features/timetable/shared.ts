/**
 * Who is in the room, in words.
 *
 * Nearly always one section. When the college teaches sections together it is
 * all of them, because that is who the teacher is actually standing in front
 * of — and a teacher reading their week needs to know that before they walk in.
 */
export function whoIsInTheRoom(lesson: { sections: { sectionName: string; className: string; divisionName: string; programName: string }[] }): string {
  if (lesson.sections.length === 0) return 'No section'
  if (lesson.sections.length === 1) {
    const only = lesson.sections[0]!
    return `${only.className} · ${only.divisionName} · ${only.programName} · Section ${only.sectionName}`
  }
  return lesson.sections
    .map((section) => `${section.className} ${section.programName} ${section.sectionName}`)
    .join(' + ')
}

/**
 * The same, short enough for a cell of the weekly grid.
 *
 * The grid has one narrow column per day, so the division and the programme
 * are dropped — the teacher already knows which campus they are on. Sections
 * taught together are still all named, because that is the part they cannot
 * guess.
 */
export function whoIsInTheRoomShort(lesson: { sections: { sectionName: string; className: string }[] }): string {
  if (lesson.sections.length === 0) return 'No section'
  if (lesson.sections.length === 1) {
    const only = lesson.sections[0]!
    return `${only.className} · Section ${only.sectionName}`
  }
  return `${lesson.sections[0]!.className} · Sections ${lesson.sections.map((s) => s.sectionName).join(' + ')}`
}
