import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * Joins CSS class names and resolves Tailwind conflicts.
 * `cn('p-2', condition && 'p-4')` gives 'p-4' rather than both.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}
