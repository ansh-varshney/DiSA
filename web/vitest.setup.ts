import '@testing-library/jest-dom'

// Silence Next.js server-action directive warnings in test output
vi.mock('next/cache', () => ({
    revalidatePath: vi.fn(),
    revalidateTag: vi.fn(),
}))

// next/navigation stubs
vi.mock('next/navigation', () => ({
    redirect: vi.fn(),
    usePathname: vi.fn(() => '/'),
    useRouter: vi.fn(() => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() })),
}))

// Default session stub — returns student-1 so action auth checks pass.
// Individual tests can override with vi.mocked(getCurrentUser).mockResolvedValueOnce(...)
vi.mock('@/lib/session', () => ({
    getCurrentUser: vi.fn().mockResolvedValue({ id: 'student-1', email: 'student@iiitd.ac.in' }),
}))

// Mock Drizzle db — prevents real PostgreSQL connections in tests.
// Use mockDrizzleDb.enqueue([...rows]) to configure responses per test.
vi.mock('@/db', async () => {
    const { mockDrizzleDb } = await import('./src/__tests__/mocks/drizzle')
    return { db: mockDrizzleDb }
})
