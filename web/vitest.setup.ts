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
