'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import { headers } from 'next/headers'

export async function loginWithGoogle() {
    const supabase = await createClient()
    const origin = (await headers()).get('origin')

    const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
            redirectTo: `${origin}/auth/callback`,
            queryParams: {
                access_type: 'offline',
                prompt: 'consent',
            },
        },
    })

    if (error) {
        console.error(error)
        redirect('/error?message=Could not authenticate with Google')
    }

    if (data.url) {
        redirect(data.url)
    }
}

// ... existing phone logic ...

export async function loginWithEmail(prevState: any, formData: FormData) {
    const email = formData.get('email') as string
    const password = formData.get('password') as string

    const supabase = await createClient()
    const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
    })

    if (error) {
        return { error: error.message }
    }

    revalidatePath('/', 'layout')
    redirect('/')
}

export async function signUpWithEmail(prevState: any, formData: FormData) {
    const email = formData.get('email') as string
    const password = formData.get('password') as string
    const fullName = formData.get('fullName') as string
    const role = formData.get('role') as string

    const supabase = await createClient()

    // 1. Sign Up
    const { data: { user }, error } = await supabase.auth.signUp({
        email,
        password,
    })

    if (error) {
        return { error: error.message }
    }

    if (user) {
        // 2. Create Profile (Trigger usually handles this, but we can double check or update extra fields)
        // If you have a Trigger for 'on_auth_user_created', it inserts the row.
        // We might want to update the full_name and role immediately if the trigger only inserts ID.
        // For simplicity now, let's assume the trigger handles basic insertion or we manually upsert.

        // Manual profile update to ensure Role is set (security note: usually done via secure admin function or trusted metadata, but for MVP client-side role pick is ok if validated)
        const { error: profileError } = await supabase
            .from('profiles')
            .upsert({
                id: user.id,
                email: email,
                full_name: fullName,
                role: role as 'student' | 'manager' | 'admin'
            })

        if (profileError) {
            console.error('Profile update error:', profileError)
        }
    }

    revalidatePath('/', 'layout')
    redirect('/')
}

export async function signInWithPhone(prevState: any, formData: FormData) {
    const phone = formData.get('phone') as string

    if (!phone) return { error: 'Phone number is required' }

    const supabase = await createClient()
    const { error } = await supabase.auth.signInWithOtp({
        phone,
    })

    if (error) {
        return { error: error.message }
    }

    return { success: true, phone }
}

export async function verifyOtp(prevState: any, formData: FormData) {
    const phone = formData.get('phone') as string
    const token = formData.get('token') as string

    const supabase = await createClient()
    const { error } = await supabase.auth.verifyOtp({
        phone,
        token,
        type: 'sms',
    })

    if (error) {
        return { error: error.message }
    }

    revalidatePath('/', 'layout')
    redirect('/')
}
