'use client'

import * as React from 'react'
import { cn } from '@/lib/cn'

/* -------------------------------------------------------------------------- */
/* Form controls                                                              */
/* -------------------------------------------------------------------------- */

const controlClasses =
  'w-full rounded-[var(--radius-control)] border border-border-strong bg-surface px-3 text-sm text-foreground ' +
  'placeholder:text-foreground-subtle disabled:cursor-not-allowed disabled:opacity-60 ' +
  'aria-[invalid=true]:border-danger-600'

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return <input ref={ref} className={cn(controlClasses, 'h-10', className)} {...props} />
  },
)

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ className, ...props }, ref) {
  return <textarea ref={ref} className={cn(controlClasses, 'min-h-20 py-2', className)} {...props} />
})

/**
 * A native <select>. Deliberate choice: on phones the operating system's own
 * picker is faster and more accessible than any JavaScript dropdown.
 */
export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(function Select({ className, children, ...props }, ref) {
  return (
    <select ref={ref} className={cn(controlClasses, 'h-10 pr-8', className)} {...props}>
      {children}
    </select>
  )
})

export function Checkbox({
  className,
  label,
  description,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string; description?: string }) {
  const id = React.useId()
  return (
    <div className="flex items-start gap-3">
      <input
        id={id}
        type="checkbox"
        className={cn(
          'mt-0.5 h-4 w-4 shrink-0 rounded border-border-strong accent-[var(--primary)]',
          className,
        )}
        {...props}
      />
      <div className="min-w-0">
        <label htmlFor={id} className="cursor-pointer text-sm font-medium text-foreground">
          {label}
        </label>
        {description ? (
          <p className="text-xs text-foreground-muted">{description}</p>
        ) : null}
      </div>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Field wrapper: label + control + hint + error                              */
/* -------------------------------------------------------------------------- */

export interface FieldProps {
  label: string
  htmlFor?: string
  required?: boolean
  hint?: string
  error?: string | string[]
  className?: string
  children: React.ReactNode
}

export function Field({ label, htmlFor, required, hint, error, className, children }: FieldProps) {
  const messages = Array.isArray(error) ? error : error ? [error] : []

  return (
    <div className={cn('space-y-1.5', className)}>
      <label htmlFor={htmlFor} className="block text-sm font-medium text-foreground">
        {label}
        {required ? (
          <span className="ml-0.5 text-danger-600" aria-hidden>
            *
          </span>
        ) : null}
      </label>

      {children}

      {hint && messages.length === 0 ? (
        <p className="text-xs text-foreground-muted">{hint}</p>
      ) : null}

      {messages.map((message) => (
        <p key={message} className="text-xs font-medium text-danger-600">
          {message}
        </p>
      ))}
    </div>
  )
}
