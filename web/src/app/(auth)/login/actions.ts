'use server'

import { signIn } from '@/auth'
import { AuthError } from 'next-auth'
import { db } from '@/db'
import { profiles, otpTokens } from '@/db/schema'
import { eq, and, inArray } from 'drizzle-orm'

function generateOtp(): string {
    return Math.floor(100000 + Math.random() * 900000).toString()
}

// Strips spaces, dashes, and +91/0 country prefix so "9999126976", "+91 9999126976", "09999126976" all match
function normalizePhone(phone: string): string {
    let n = phone.replace(/[\s\-()]/g, '')
    if (n.startsWith('+91')) n = n.slice(3)
    else if (n.startsWith('91') && n.length === 12) n = n.slice(2)
    else if (n.startsWith('0') && n.length === 11) n = n.slice(1)
    return n
}

export async function loginWithGoogle(_role: string = 'student') {
    await signIn('google', { redirectTo: '/' })
}

// Kept for any leftover references — not shown in UI
export async function loginWithEmail(_prevState: unknown, _formData: FormData) {
    return { error: 'Email login is not available.' }
}

export async function signUpWithEmail(_prevState: unknown, _formData: FormData) {
    return { error: 'Email sign-up is not available.' }
}

export async function signInWithPhone(_prevState: unknown, formData: FormData) {
    const rawPhone = (formData.get('phone') as string)?.trim()
    const requestedRole = (formData.get('role') as string)?.trim() || 'manager'
    if (!rawPhone) return { error: 'Phone number is required' }
    const phone = normalizePhone(rawPhone)

    // Match only profiles whose role fits the portal being logged into
    const allowedRoles =
        requestedRole === 'admin'
            ? (['admin', 'superuser'] as const)
            : (['manager', 'admin', 'superuser'] as const)

    const [profile] = await db
        .select({ id: profiles.id, role: profiles.role })
        .from(profiles)
        .where(and(eq(profiles.phone_number, phone), inArray(profiles.role, [...allowedRoles])))
        .limit(1)

    if (!profile) {
        return { error: `No ${requestedRole} account found for this phone number` }
    }

    const otp = generateOtp()
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000) // 10 minutes

    // Replace any existing OTP for this phone
    await db.delete(otpTokens).where(eq(otpTokens.phone_number, phone))
    await db.insert(otpTokens).values({ phone_number: phone, otp, expires_at: expiresAt })

    // OTP is logged to the server console — check your terminal
    console.log(`\n========================================`)
    console.log(`  DiSA OTP for ${phone}`)
    console.log(`  Code: ${otp}`)
    console.log(`  Expires in 10 minutes`)
    console.log(`========================================\n`)

    return { success: true }
}

export async function verifyOtp(_prevState: unknown, formData: FormData) {
    const phone = normalizePhone((formData.get('phone') as string)?.trim() ?? '')
    const otp = (formData.get('otp') as string)?.trim()
    const requestedRole = (formData.get('role') as string)?.trim() || 'manager'

    if (!phone || !otp) return { error: 'Phone and OTP are required' }

    try {
        await signIn('credentials', { phone, otp, requestedRole, redirectTo: '/' })
    } catch (e) {
        if (e instanceof AuthError) {
            return { error: 'Invalid or expired OTP. Please try again.' }
        }
        // Re-throw redirect errors so Next.js can handle the navigation
        throw e
    }
}
