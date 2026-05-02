export { auth as middleware } from '@/auth'

export const config = {
    matcher: [
        /*
         * Match all request paths except:
         * - _next/static, _next/image (Next.js internals)
         * - favicon.ico and static assets
         * - /api/auth (NextAuth's own routes — must not be intercepted by itself)
         */
        '/((?!_next/static|_next/image|favicon.ico|api/auth|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
    ],
}
