'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
import { headers, cookies } from 'next/headers'

export async function loginWithGoogle(role: string = 'student') {
    const supabase = await createClient()
    const origin = (await headers()).get('origin')
    const cookieStore = await cookies()

    // Store role preference in cookie for the callback to use
    cookieStore.set('auth-role-preference', role, {
        path: '/',
        maxAge: 60 * 5, // 5 minutes
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production'
    })

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
    const branch = formData.get('branch') as string || null
    const year = formData.get('year') as string || null
    const gender = formData.get('gender') as string || null

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
        const { createAdminClient } = await import('@/utils/supabase/admin')
        const supabaseAdmin = createAdminClient()

        const { error: profileError } = await supabaseAdmin
            .from('profiles')
            .upsert({
                id: user.id,
                email: email,
                full_name: fullName,
                role: role as 'student' | 'manager' | 'admin',
                branch,
                year,
                gender,
            }, { onConflict: 'id' })

        if (profileError) {
            console.error('Profile update error:', profileError)
        }
    }

    revalidatePath('/', 'layout')
    redirect('/')
}

export async function signInWithPhone(prevState: any, formData: FormData) {
    const phone = formData.get('phone') as string
    const role = formData.get('role') as string || 'student'

    if (!phone) return { error: 'Phone number is required' }

    const supabase = await createClient()
    const { error } = await supabase.auth.signInWithOtp({
        phone,
        options: {
            data: {
                role: role
            }
        }
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
    const { data: { user }, error } = await supabase.auth.verifyOtp({
        phone,
        token,
        type: 'sms',
    })

    if (error) {
        return { error: error.message }
    }

    if (user) {
        // Try getting role from metadata or default to student
        const role = user.user_metadata?.role || 'student'

        const { createAdminClient } = await import('@/utils/supabase/admin')
        const supabaseAdmin = createAdminClient()

        // Check if profile already exists to avoid overwriting fields like full_name
        const { data: existingProfile } = await supabaseAdmin
            .from('profiles')
            .select('id')
            .eq('id', user.id)
            .single()

        const upsertData: Record<string, any> = {
            id: user.id,
            email: user.email,
            role: role as 'student' | 'manager' | 'admin',
            phone_number: phone,
        }

        // Only set full_name on first-time registration — never overwrite an existing name
        if (!existingProfile) {
            upsertData.full_name = 'New User'
        }

        const { error: profileError } = await supabaseAdmin
            .from('profiles')
            .upsert(upsertData, { onConflict: 'id' })

        if (profileError) {
            console.error('Profile upsert error inside verifyOtp:', profileError)
        }
    }

    revalidatePath('/', 'layout')
    redirect('/')
}

