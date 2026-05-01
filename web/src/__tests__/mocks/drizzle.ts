/**
 * Queue-based Drizzle ORM mock.
 *
 * Usage:
 *   mockDrizzleDb.enqueue([row1, row2])  // next await returns [row1, row2]
 *   mockDrizzleDb.enqueue([])            // next await returns []
 *   mockDrizzleDb.reset()               // between tests
 *
 * Every awaitable Drizzle call (select, insert, update, delete, execute)
 * pops one item from the queue. Enqueue in the order the action will call the DB.
 *
 * .returning() also pops from the queue (returns its own Promise).
 */

import { vi } from 'vitest'

const responseQueue: Array<any[] | Error> = []

function pop(): any[] {
    if (responseQueue.length > 0) {
        const item = responseQueue.shift()!
        if (item instanceof Error) throw item
        return item
    }
    return []
}

// A chainable object where every builder method returns itself,
// awaiting it pops the next queued response.
function makeChain() {
    const obj: any = {
        // Thenable — consumed when the chain is awaited directly
        then(resolve: (v: any) => any, reject: (e: any) => any) {
            return Promise.resolve(pop()).then(resolve, reject)
        },
        catch(fn: (e: any) => any) {
            return Promise.resolve(pop()).catch(fn)
        },
        finally(fn: () => void) {
            return Promise.resolve(pop()).finally(fn)
        },
        // Terminal: .returning({...})
        returning: vi.fn(() => Promise.resolve(pop())),
    }

    const builders = [
        'from',
        'where',
        'orderBy',
        'limit',
        'offset',
        'groupBy',
        'having',
        'leftJoin',
        'innerJoin',
        'rightJoin',
        'fullJoin',
        'values',
        'set',
        'onConflictDoNothing',
        'onConflictDoUpdate',
    ]
    for (const m of builders) {
        obj[m] = vi.fn(() => obj)
    }

    return obj
}

export const mockDrizzleDb = {
    // ── Drizzle API ─────────────────────────────────────────────────────────
    select: vi.fn(() => makeChain()),
    insert: vi.fn(() => makeChain()),
    update: vi.fn(() => makeChain()),
    delete: vi.fn(() => makeChain()),
    execute: vi.fn(() => Promise.resolve(pop())),

    // ── Test helpers ─────────────────────────────────────────────────────────
    /** Enqueue one or more responses (each response = one DB call's result) */
    enqueue(...responses: any[][]) {
        responseQueue.push(...responses)
    },
    /** Enqueue an empty-array response */
    enqueueEmpty(n = 1) {
        for (let i = 0; i < n; i++) responseQueue.push([])
    },
    /** Enqueue an error — next DB await will throw */
    enqueueThrow(message: string) {
        responseQueue.push(new Error(message))
    },
    /** Reset queue and clear all call tracking */
    reset() {
        responseQueue.length = 0
        vi.clearAllMocks()
        // Re-attach select/insert/update/delete so they return fresh chains
        mockDrizzleDb.select = vi.fn(() => makeChain())
        mockDrizzleDb.insert = vi.fn(() => makeChain())
        mockDrizzleDb.update = vi.fn(() => makeChain())
        mockDrizzleDb.delete = vi.fn(() => makeChain())
        mockDrizzleDb.execute = vi.fn(() => Promise.resolve(pop()))
    },
}
