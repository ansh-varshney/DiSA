import NextAuth from 'next-auth'
import Google from 'next-auth/providers/google'
import Credentials from 'next-auth/providers/credentials'
import type { DefaultSession } from 'next-auth'
import { db } from '@/db'
import { profiles, otpTokens } from '@/db/schema'
import { eq, and, gt, inArray } from 'drizzle-orm'

// ─── Type augmentation ────────────────────────────────────────────────────────

declare module 'next-auth' {
    interface Session {
        user: {
            id: string
            role: string
        } & DefaultSession['user']
    }
}

// ─── NextAuth configuration ───────────────────────────────────────────────────

export const { handlers, signIn, signOut, auth } = NextAuth({
    providers: [
        Google,

        // Phone OTP provider for manager/admin login
        Credentials({
            credentials: {
                phone: { label: 'Phone', type: 'tel' },
                otp: { label: 'OTP', type: 'text' },
                requestedRole: { label: 'Role', type: 'text' },
            },
            async authorize(credentials) {
                let phone = (credentials?.phone ?? '') as string
                const otp = (credentials?.otp ?? '') as string
                const requestedRole = (credentials?.requestedRole ?? 'manager') as string
                if (!phone || !otp) return null
                // Normalize to match how numbers are stored (e.g. strip +91)
                phone = phone.replace(/[\s\-()]/g, '')
                if (phone.startsWith('+91')) phone = phone.slice(3)
                else if (phone.startsWith('91') && phone.length === 12) phone = phone.slice(2)

                const [token] = await db
                    .select()
                    .from(otpTokens)
                    .where(
                        and(
                            eq(otpTokens.phone_number, phone),
                            eq(otpTokens.otp, otp),
                            gt(otpTokens.expires_at, new Date())
                        )
                    )
                    .limit(1)

                if (!token) return null

                // Consume token (single-use)
                await db.delete(otpTokens).where(eq(otpTokens.id, token.id))

                // Respect which portal the user logged into
                const allowedRoles =
                    requestedRole === 'admin'
                        ? (['admin', 'superuser'] as const)
                        : (['manager', 'admin', 'superuser'] as const)

                const [profile] = await db
                    .select({
                        id: profiles.id,
                        email: profiles.email,
                        full_name: profiles.full_name,
                    })
                    .from(profiles)
                    .where(
                        and(
                            eq(profiles.phone_number, phone),
                            inArray(profiles.role, [...allowedRoles])
                        )
                    )
                    .limit(1)

                if (!profile) return null

                return { id: profile.id, email: profile.email ?? '', name: profile.full_name ?? '' }
            },
        }),
    ],

    session: { strategy: 'jwt' },

    callbacks: {
        async signIn({ user, account }) {
            if (account?.provider === 'google') {
                // Restrict to @iiitd.ac.in email domain only
                if (!user.email?.endsWith('@iiitd.ac.in')) {
                    return false
                }

                // Upsert profile: create on first login, update avatar on subsequent logins
                await db
                    .insert(profiles)
                    .values({
                        email: user.email,
                        full_name: user.name ?? 'New User',
                        avatar_url: user.image ?? null,
                        role: 'student',
                    })
                    .onConflictDoUpdate({
                        target: profiles.email,
                        set: {
                            avatar_url: user.image ?? null,
                            updated_at: new Date(),
                        },
                    })
            }
            return true
        },

        async jwt({ token, account }) {
            if (account) {
                if (account.provider === 'google') {
                    const [profile] = await db
                        .select({ id: profiles.id, role: profiles.role })
                        .from(profiles)
                        .where(eq(profiles.email, token.email!))
                        .limit(1)

                    if (profile) {
                        token.sub = profile.id
                        token.role = profile.role ?? 'student'
                    }
                } else if (account.provider === 'credentials') {
                    // token.sub is already the profile.id from authorize's return value
                    const [profile] = await db
                        .select({ role: profiles.role })
                        .from(profiles)
                        .where(eq(profiles.id, token.sub!))
                        .limit(1)

                    if (profile) {
                        token.role = profile.role ?? 'student'
                    }
                }
            }
            return token
        },

        async session({ session, token }) {
            session.user.id = token.sub!
            session.user.role = (token.role ?? 'student') as string
            return session
        },
    },

    pages: {
        signIn: '/login',
        error: '/login',
    },
})
