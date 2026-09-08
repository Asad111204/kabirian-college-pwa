// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { Avatar, initialsOf } from '@/components/ui/avatar'

afterEach(cleanup)

/** A face where there is one, initials where there is not — and never a broken picture. */
describe('Avatar', () => {
  it('shows the photo when there is a source', () => {
    render(<Avatar name="Ali Raza" src="/api/v1/students/abc/photo?v=1" />)
    const img = screen.getByRole('img', { name: 'Photo of Ali Raza' })
    expect(img.getAttribute('src')).toBe('/api/v1/students/abc/photo?v=1')
  })

  it('shows initials when there is none', () => {
    const { container } = render(<Avatar name="Ali Raza" src={null} />)
    expect(container.textContent).toBe('AR')
    expect(screen.queryByRole('img')).toBeNull()
  })

  it('falls back to initials when the image fails to load', () => {
    const { container } = render(<Avatar name="Sara Khan" src="/api/v1/staff/x/photo" />)
    fireEvent.error(screen.getByRole('img'))
    expect(container.textContent).toBe('SK')
    expect(screen.queryByRole('img')).toBeNull()
  })
})

describe('initialsOf', () => {
  it('takes the first and last name, two letters of a single name, and ? for nothing', () => {
    expect(initialsOf('Muhammad Ali Raza')).toBe('MR')
    expect(initialsOf('Ayesha')).toBe('AY')
    expect(initialsOf('   ')).toBe('?')
  })
})
