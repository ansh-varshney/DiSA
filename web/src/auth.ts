import NextAuth from 'next-auth'
import Google from 'next-auth/providers/google'
import Credentials from 'next-auth/providers/credentials'
import type { DefaultSession } from 'next-auth'
import { db } from '@/db'
import { profiles } from '@/db/schema'
import { eq } from 'drizzle-orm'
// import bcrypt from 'bcryptjs'  // TODO Phase 4 step 17: uncomment when implementing Credentials

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

        // TODO Phase 4 step 17: Credentials provider for admin/manager login
        // After creating accounts (step 19), uncomment the authorize body below.
        Credentials({
            credentials: {
                email: { label: 'Email', type: 'email' },
                password: { label: 'Password', type: 'password' },
            },
            async authorize(_credentials) {
                // TODO Phase 4 step 17 + 19: implement after creating admin/manager accounts
                //
                // const credentials = _credentials as { email: string; password: string }
                // const [profile] = await db
                //     .select()
                //     .from(profiles)
                //     .where(eq(profiles.email, credentials.email))
                //     .limit(1)
                //
                // if (!profile?.password_hash) return null
                //
                // const valid = await bcrypt.compare(credentials.password, profile.password_hash)
                // if (!valid) return null
                //
                // return { id: profile.id, email: profile.email!, name: profile.full_name }
                return null
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
            // On first sign-in (account is present), fetch our profile UUID and role
            if (account) {
                const [profile] = await db
                    .select({ id: profiles.id, role: profiles.role })
                    .from(profiles)
                    .where(eq(profiles.email, token.email!))
                    .limit(1)

                if (profile) {
                    // Overwrite provider sub with our profile UUID so session.user.id is correct
                    token.sub = profile.id
                    token.role = profile.role ?? 'student'
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
