import { describe, expect, it } from 'vitest'
import {
  assertNotReferenced,
  paginate,
  paginatedResult,
  prismaErrorCode,
  withUniqueConstraintHandling,
} from '@/server/services/service-utils'
import { ConflictError } from '@/server/api/errors'

describe('assertNotReferenced — protecting academic history', () => {
  it('allows deleting something nothing points at', () => {
    expect(() =>
      assertNotReferenced('The program "Test"', [{ label: 'academic group(s)', count: 0 }]),
    ).not.toThrow()
  })

  it('blocks deleting a program that has groups', () => {
    expect(() =>
      assertNotReferenced('The program "Pre-Medical"', [{ label: 'academic group(s)', count: 4 }]),
    ).toThrow(ConflictError)
  })

  it('explains what is blocking and suggests deactivating instead', () => {
    try {
      assertNotReferenced('The program "Pre-Medical"', [
        { label: 'academic group(s)', count: 4 },
        { label: 'curriculum entr(ies)', count: 12 },
      ])
      throw new Error('should have thrown')
    } catch (error) {
      expect(error).toBeInstanceOf(ConflictError)
      const message = (error as ConflictError).message
      expect(message).toContain('4 academic group(s)')
      expect(message).toContain('12 curriculum entr(ies)')
      expect(message).toContain('Deactivate it instead')
    }
  })

  it('returns 409 Conflict, not a server error', () => {
    try {
      assertNotReferenced('X', [{ label: 'student(s)', count: 1 }])
    } catch (error) {
      expect((error as ConflictError).status).toBe(409)
    }
  })
})

describe('withUniqueConstraintHandling', () => {
  const duplicateCodeError = Object.assign(new Error('Unique constraint failed'), {
    code: 'P2002',
    meta: { target: ['code'] },
  })

  it('passes the result through when nothing goes wrong', async () => {
    const result = await withUniqueConstraintHandling(async () => 'created', {})
    expect(result).toBe('created')
  })

  it('turns a duplicate key error into a readable message', async () => {
    await expect(
      withUniqueConstraintHandling(
        async () => {
          throw duplicateCodeError
        },
        { code: 'A program with this code already exists.' },
      ),
    ).rejects.toThrow('A program with this code already exists.')
  })

  it('attaches the message to the right form field', async () => {
    try {
      await withUniqueConstraintHandling(
        async () => {
          throw duplicateCodeError
        },
        { code: 'A program with this code already exists.' },
      )
    } catch (error) {
      expect((error as ConflictError).fields?.code).toEqual([
        'A program with this code already exists.',
      ])
    }
  })

  it('reads the constraint from a Prisma 7 driver-adapter error', async () => {
    // The real shape Prisma 7 + @prisma/adapter-pg produces.
    const adapterError = Object.assign(new Error('Unique constraint failed'), {
      code: 'P2002',
      meta: {
        modelName: 'Program',
        driverAdapterError: {
          name: 'DriverAdapterError',
          cause: {
            originalCode: '23505',
            kind: 'UniqueConstraintViolation',
            constraint: { index: 'programs_name_key' },
            table: 'programs',
          },
        },
      },
    })

    try {
      await withUniqueConstraintHandling(
        async () => {
          throw adapterError
        },
        {
          name: 'A program with this name already exists.',
          code: 'A program with this code already exists.',
        },
      )
      throw new Error('should have thrown')
    } catch (error) {
      expect(error).toBeInstanceOf(ConflictError)
      expect((error as ConflictError).message).toBe('A program with this name already exists.')
      expect((error as ConflictError).fields?.name).toBeDefined()
    }
  })

  it('picks the code message when the code index is violated', async () => {
    const adapterError = Object.assign(new Error('dup'), {
      code: 'P2002',
      meta: {
        driverAdapterError: { cause: { constraint: { index: 'programs_code_key' } } },
      },
    })

    await expect(
      withUniqueConstraintHandling(
        async () => {
          throw adapterError
        },
        { code: 'A program with this code already exists.' },
      ),
    ).rejects.toThrow('A program with this code already exists.')
  })

  it('leaves unrelated errors alone', async () => {
    await expect(
      withUniqueConstraintHandling(async () => {
        throw new Error('database is on fire')
      }, {}),
    ).rejects.toThrow('database is on fire')
  })

  it('maps a snake_case column to its camelCase form field', async () => {
    const error = Object.assign(new Error('dup'), {
      code: 'P2002',
      meta: { target: ['sort_order'] },
    })
    try {
      await withUniqueConstraintHandling(
        async () => {
          throw error
        },
        { sort_order: 'Duplicate display order.' },
      )
    } catch (thrown) {
      expect((thrown as ConflictError).fields?.sortOrder).toBeDefined()
    }
  })
})

describe('prismaErrorCode', () => {
  it('reads the code from a Prisma error', () => {
    expect(prismaErrorCode({ code: 'P2002' })).toBe('P2002')
  })

  it('returns null for anything else', () => {
    expect(prismaErrorCode(new Error('plain'))).toBeNull()
    expect(prismaErrorCode(null)).toBeNull()
    expect(prismaErrorCode('P2002')).toBeNull()
  })
})

describe('pagination', () => {
  it('converts a page number into skip/take', () => {
    expect(paginate(1, 25)).toEqual({ skip: 0, take: 25 })
    expect(paginate(3, 25)).toEqual({ skip: 50, take: 25 })
  })

  it('reports the number of pages', () => {
    expect(paginatedResult([], 0, 1, 25).totalPages).toBe(1)
    expect(paginatedResult([], 25, 1, 25).totalPages).toBe(1)
    expect(paginatedResult([], 26, 1, 25).totalPages).toBe(2)
    expect(paginatedResult([], 3000, 1, 25).totalPages).toBe(120)
  })
})
