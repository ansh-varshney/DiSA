import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeMockDb } from '../mocks/supabase'

vi.mock('@/utils/supabase/server')

import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'

import { signOut } from '@/actions/auth'

describe('signOut', () => {
    beforeEach(() => vi.clearAllMocks())

    it('calls supabase.auth.signOut', async () => {
        const db = makeMockDb()
        const signOutMock = vi.fn().mockResolvedValue({ error: null })
        ;(db.client as any).auth.signOut = signOutMock
        vi.mocked(createClient).mockResolvedValue(db.client as any)

        await signOut()

        expect(signOutMock).toHaveBeenCalledOnce()
    })

    it('calls revalidatePath with layout scope', async () => {
        const db = makeMockDb()
        ;(db.client as any).auth.signOut = vi.fn().mockResolvedValue({ error: null })
        vi.mocked(createClient).mockResolvedValue(db.client as any)

        await signOut()

        expect(revalidatePath).toHaveBeenCalledWith('/', 'layout')
    })

    it('calls redirect to /login', async () => {
        const db = makeMockDb()
        ;(db.client as any).auth.signOut = vi.fn().mockResolvedValue({ error: null })
        vi.mocked(createClient).mockResolvedValue(db.client as any)

        await signOut()

        expect(redirect).toHaveBeenCalledWith('/login')
    })
})
