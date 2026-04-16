import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'

export async function GET(request: Request) {
    const { searchParams, origin } = new URL(request.url)
    const code = searchParams.get('code')
    // if "next" is in param, use it as the redirect URL
    const next = searchParams.get('next') ?? '/'

    if (code) {
        const supabase = await createClient()
        const { data, error } = await supabase.auth.exchangeCodeForSession(code)

        if (!error && data?.session?.user) {
            const user = data.session.user

            // Always try to update/insert profile to ensure role matches preference
            // (This handles cases where a DB trigger created a default profile)
            const { cookies } = await import('next/headers')
            const cookieStore = await cookies()
            const rolePref = cookieStore.get('auth-role-preference')?.value

            if (rolePref) {
                const { createAdminClient } = await import('@/utils/supabase/admin')
                const supabaseAdmin = createAdminClient()

                await supabaseAdmin.from('profiles').upsert(
                    {
                        id: user.id,
                        email: user.email,
                        full_name: user_metadata(user).full_name || 'New User',
                        role: rolePref as 'student' | 'manager' | 'admin',
                        avatar_url: user_metadata(user).avatar_url,
                    },
                    { onConflict: 'id' }
                ) // Upsert based on ID

                // Cleanup cookie
                cookieStore.delete('auth-role-preference')
            } else {
                // Check if a profile already exists for the user
                const { data: profile, error: profileError } = await supabase
                    .from('profiles')
                    .select('id')
                    .eq('id', user.id)
                    .single()

                if (profileError && profileError.code === 'PGRST116') {
                    // No rows found
                    // No preference, and no profile? Default to student
                    await supabase.from('profiles').insert({
                        id: user.id,
                        email: user.email,
                        full_name: user_metadata(user).full_name || 'New User',
                        role: 'student',
                        avatar_url: user_metadata(user).avatar_url,
                    })
                }
            }
            return NextResponse.redirect(`${origin}${next}`)
        }
    }

    // return the user to an error page with instructions
    return NextResponse.redirect(`${origin}/auth/auth-code-error`)
}

// Helper to safely access user metadata
function user_metadata(user: any) {
    return user.user_metadata || {}
}
