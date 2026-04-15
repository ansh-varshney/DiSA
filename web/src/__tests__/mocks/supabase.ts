/**
 * Reusable Supabase mock builder.
 *
 * Usage:
 *   const db = makeMockDb()
 *   db.mockTable('profiles', { data: { id: 'u1', role: 'student' }, error: null })
 *   vi.mocked(createClient).mockResolvedValue(db.client as any)
 *
 * Each .from(table) call returns a chainable builder whose terminal calls
 * (.single(), implied awaits on insert/update/delete) resolve to whatever you
 * configured via mockTable() — or a safe default.
 */

import { vi } from 'vitest'

// ─── Table response store ─────────────────────────────────────────────────────

type DbResponse = { data: any; error: any; count?: number | null }

export interface MockDb {
    client: MockSupabaseClient
    /**
     * Set the response for the NEXT call to .from(table).
     * Use mockTableOnce for sequential calls to the same table.
     */
    mockTable(table: string, response: DbResponse): void
    /** Queue a one-time response — consumed in FIFO order per table. */
    mockTableOnce(table: string, response: DbResponse): void
    /** Convenience: make a table always return an empty-list success. */
    mockTableEmpty(table: string): void
    /** Clear all configured responses. */
    reset(): void
    /** Return an rpc mock for verifying RPC calls. */
    rpc: ReturnType<typeof vi.fn>
    auth: {
        getUser: ReturnType<typeof vi.fn>
    }
}

// ─── Chain builder ────────────────────────────────────────────────────────────

function makeChain(responseGetter: () => Promise<DbResponse>) {
    const chainMethods = [
        'select', 'insert', 'update', 'delete', 'upsert',
        'eq', 'neq', 'in', 'not', 'is', 'or',
        'gte', 'lte', 'lt', 'gt', 'ilike', 'like',
        'order', 'limit', 'range', 'match',
    ] as const

    const chain: Record<string, any> = {}

    for (const method of chainMethods) {
        chain[method] = vi.fn().mockReturnValue(chain)
    }

    // Terminal methods — actually resolve
    chain.single = vi.fn(async () => {
        const r = await responseGetter()
        return { data: r.data, error: r.error }
    })

    // Awaiting the chain itself (insert/update/delete without .single())
    chain.then = (resolve: any, reject: any) =>
        responseGetter().then(resolve, reject)

    // count variant
    Object.defineProperty(chain, Symbol.toStringTag, { value: 'MockChain' })

    return chain
}

// ─── Client builder ───────────────────────────────────────────────────────────

export interface MockSupabaseClient {
    from: ReturnType<typeof vi.fn>
    rpc: ReturnType<typeof vi.fn>
    auth: {
        getUser: ReturnType<typeof vi.fn>
    }
    storage: {
        from: ReturnType<typeof vi.fn>
    }
}

export function makeMockDb(): MockDb {
    const tables: Record<string, DbResponse[]> = {}

    function getResponse(table: string): DbResponse {
        const queue = tables[table]
        if (queue && queue.length > 0) {
            return queue.length === 1 ? queue[0] : queue.shift()!
        }
        // Default: empty success
        return { data: null, error: null, count: 0 }
    }

    const rpcMock = vi.fn().mockResolvedValue({ data: null, error: null })
    const getUserMock = vi.fn().mockResolvedValue({ data: { user: null }, error: null })

    const storageMock = {
        from: vi.fn().mockReturnValue({
            upload: vi.fn().mockResolvedValue({ error: null }),
            getPublicUrl: vi.fn().mockReturnValue({ data: { publicUrl: 'https://mock.url/img.jpg' } }),
            remove: vi.fn().mockResolvedValue({ error: null }),
        }),
    }

    const fromMock = vi.fn((table: string) => {
        return makeChain(() => Promise.resolve(getResponse(table)))
    })

    const client: MockSupabaseClient = {
        from: fromMock,
        rpc: rpcMock,
        auth: { getUser: getUserMock },
        storage: storageMock,
    }

    const db: MockDb = {
        client,
        rpc: rpcMock,
        auth: { getUser: getUserMock },

        mockTable(table, response) {
            tables[table] = [response]
        },

        mockTableOnce(table, response) {
            if (!tables[table]) tables[table] = []
            tables[table].push(response)
        },

        mockTableEmpty(table) {
            tables[table] = [{ data: [], error: null, count: 0 }]
        },

        reset() {
            for (const key of Object.keys(tables)) {
                delete tables[key]
            }
            rpcMock.mockReset().mockResolvedValue({ data: null, error: null })
            getUserMock.mockReset().mockResolvedValue({ data: { user: null }, error: null })
            fromMock.mockClear()
        },
    }

    return db
}

// ─── Standard fixture data ────────────────────────────────────────────────────

export const FIXTURES = {
    user: { id: 'student-1', email: 'student@iiitd.ac.in' },
    admin: { id: 'admin-1', email: 'admin@iiitd.ac.in' },
    manager: { id: 'manager-1', email: 'manager@iiitd.ac.in' },

    profile: {
        id: 'student-1',
        full_name: 'Alice Student',
        student_id: 'MT23001',
        role: 'student',
        points: 50,
        banned_until: null,
        branch: 'CSE',
        gender: 'female',
        year: '2',
        phone_number: '9876543210',
    },

    court: {
        id: 'court-1',
        name: 'Badminton Court A',
        sport: 'badminton',
        is_active: true,
    },

    booking: {
        id: 'booking-1',
        user_id: 'student-1',
        court_id: 'court-1',
        start_time: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(), // 2h from now
        end_time: new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString(),
        status: 'confirmed',
        players_list: [],
        equipment_ids: [],
        num_players: 2,
        courts: { name: 'Badminton Court A', sport: 'badminton' },
    },

    playRequest: {
        id: 'pr-1',
        booking_id: 'booking-1',
        requester_id: 'student-2',
        recipient_id: 'student-1',
        status: 'pending',
        notification_id: 'notif-1',
        bookings: {
            id: 'booking-1',
            status: 'confirmed',
            user_id: 'student-2',
            start_time: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
            num_players: 2,
            equipment_ids: [],
            players_list: [{ id: 'student-1', status: 'pending' }],
            courts: { name: 'Badminton Court A', sport: 'badminton' },
        },
    },

    notification: {
        id: 'notif-1',
        recipient_id: 'student-1',
        sender_id: null,
        type: 'booking_session_active',
        title: 'Session Active',
        body: 'Head over now!',
        data: {},
        is_read: false,
        created_at: new Date().toISOString(),
    },
}
