'use client'

import * as React from 'react'

/** The parts of a section this control needs to group it. */
export interface QuickSelectSection {
  id: string
  className: string
  divisionName: string
}

/**
 * Whole years and whole campuses in one click.
 *
 * Some subjects belong to everybody. English is taken by every section of 1st
 * Year, and putting one teacher against it meant ticking twelve boxes — six
 * programmes on each campus — which is the kind of chore that gets done wrong
 * on a Friday afternoon.
 *
 * The buttons are built from the sections themselves rather than written down,
 * so a new class or a new campus appears here the day the college creates it.
 * Each one is a toggle: press it when the whole set is already ticked and it
 * unticks them, which is how somebody who overshoots gets back.
 *
 * Nothing here decides anything. It only ticks boxes the person could have
 * ticked one at a time, and every one of them is checked by the server.
 */
export function SectionQuickSelect({
  sections,
  selected,
  onChange,
  disabled,
}: {
  sections: QuickSelectSection[]
  selected: string[]
  onChange: (next: string[]) => void
  disabled?: boolean
}) {
  const groups = React.useMemo(() => {
    const byClass = new Map<string, string[]>()
    const byCampus = new Map<string, string[]>()

    for (const section of sections) {
      const campus = `${section.className} ${section.divisionName}`
      byClass.set(section.className, [...(byClass.get(section.className) ?? []), section.id])
      byCampus.set(campus, [...(byCampus.get(campus) ?? []), section.id])
    }

    // A campus button is only worth showing when its year has more than one.
    const campuses = [...byCampus.entries()].filter(([label]) => {
      const className = [...byClass.keys()].find((name) => label.startsWith(name))
      return className ? (byClass.get(className)?.length ?? 0) > (byCampus.get(label)?.length ?? 0) : true
    })

    return { classes: [...byClass.entries()], campuses }
  }, [sections])

  if (sections.length === 0) return null

  const toggleSet = (ids: string[]) => {
    const allOn = ids.every((id) => selected.includes(id))
    onChange(allOn ? selected.filter((id) => !ids.includes(id)) : [...new Set([...selected, ...ids])])
  }

  const button = (label: string, ids: string[]) => {
    const allOn = ids.length > 0 && ids.every((id) => selected.includes(id))
    return (
      <button
        key={label}
        type="button"
        disabled={disabled}
        aria-pressed={allOn}
        onClick={() => toggleSet(ids)}
        className={`rounded-full border px-2.5 py-1 text-xs transition-colors disabled:opacity-50 ${
          allOn
            ? 'border-[var(--primary)] bg-[var(--primary)] text-white'
            : 'border-border text-foreground-muted hover:border-border-strong'
        }`}
      >
        {label}
      </button>
    )
  }

  return (
    <div className="mb-2 flex flex-wrap items-center gap-1.5">
      <span className="text-xs text-foreground-muted">Whole year:</span>
      {groups.classes.map(([className, ids]) => button(`All ${className}`, ids))}
      {groups.campuses.map(([campus, ids]) => button(campus, ids))}
      {selected.length > 0 ? (
        <button
          type="button"
          disabled={disabled}
          onClick={() => onChange([])}
          className="ml-1 text-xs underline disabled:opacity-50"
        >
          clear
        </button>
      ) : null}
    </div>
  )
}
