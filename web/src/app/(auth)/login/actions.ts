'use server'

import { signIn } from '@/auth'

export async function loginWithGoogle(_role: string = 'student') {
    // Google OAuth — restricted to @iiitd.ac.in domain (enforced in auth.ts signIn callback)
    // Admin/manager accounts are handled via Credentials provider (Phase 4 step 17/19)
    await signIn('google', { redirectTo: '/' })
}

export async function loginWithEmail(_prevState: unknown, _formData: FormData) {
    // TODO Phase 4 step 17: implement after enabling the Credentials provider in auth.ts
    return {
        error: 'Email/password login is not yet configured. Use Google sign-in with your @iiitd.ac.in account.',
    }
}

export async function signUpWithEmail(_prevState: unknown, _formData: FormData) {
    return {
        error: 'Accounts are created automatically on first Google sign-in. Use your @iiitd.ac.in Google account.',
    }
}

export async function signInWithPhone(_prevState: unknown, _formData: FormData) {
    return { error: 'Phone/OTP login is not available in the current system.' }
}

export async function verifyOtp(_prevState: unknown, _formData: FormData) {
    return { error: 'Phone/OTP login is not available in the current system.' }
}
