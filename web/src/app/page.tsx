import Link from 'next/link'
import { ShieldCheck, User, GraduationCap, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'

export default async function Home() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  console.log('Home Page Debug: User ID:', user?.id)

  if (user) {
    // Determine where to send them based on role
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    console.log('Home Page Debug: Profile Role:', profile?.role)

    // Superuser gets to choose their portal (for testing)
    if (profile?.role === 'superuser') {
      // Don't redirect - show portal selector below
    } else {
      // Normal role-based redirects
      if (profile?.role === 'student') redirect('/student')
      if (profile?.role === 'manager') redirect('/manager')
      if (profile?.role === 'admin') redirect('/admin')
    }

    // If we are here, profile might be missing (e.g. sign up didn't run trigger/action correctly)
    if (!profile) {
      console.log('Home Page Debug: Profile missing, creating default student profile...')
      const { error } = await supabase.from('profiles').insert({
        id: user.id,
        email: user.email,
        full_name: 'New Student',
        role: 'student'
      })
      if (!error) {
        redirect('/student')
      } else {
        console.error('Home Page Debug: Failed to create profile', error)
      }
    }
  }

  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      {user && (
        <div className="fixed top-0 left-0 w-full bg-red-100 text-red-800 p-2 text-center z-50">
          DEBUG: User ID: {user.id} | Email: {user.email} | Role: {user?.user_metadata?.role || "In DB Check"}
          <br />
          Please tell the developer what you see here.
        </div>
      )}
      <Card className="w-full max-w-md shadow-lg border-0 bg-white/95 backdrop-blur">
        <CardHeader className="text-center space-y-4 pb-8">
          <div className="mx-auto w-16 h-16 bg-[#004d40] rounded-2xl flex items-center justify-center shadow-md transform rotate-3 hover:rotate-0 transition-transform duration-300">
            <ShieldCheck className="w-8 h-8 text-white" />
          </div>
          <div className="space-y-1">
            <h1 className="text-2xl font-bold tracking-tight text-gray-900">
              Sports Court Management
            </h1>
            <p className="text-sm text-gray-500">
              College Sports Facility Portal
            </p>
          </div>
        </CardHeader>
        {user?.user_metadata?.role === 'superuser' && (
          <div className="mb-4 bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-center">
            <p className="text-sm text-yellow-800 font-medium">🔧 Superuser Mode Active</p>
            <p className="text-xs text-yellow-600">Choose which portal to access for testing</p>
          </div>
        )}
        <CardContent className="space-y-4">
          <Link href="/student" className="w-full block">
            <Button className="w-full h-12 text-lg font-medium bg-[#004d40] hover:bg-[#004d40]/90 transition-all shadow-sm hover:shadow-md" size="lg">
              <GraduationCap className="w-5 h-5 mr-3" />
              Student Portal
            </Button>
          </Link>

          <Link href="/manager" className="w-full block">
            <Button variant="outline" className="w-full h-12 text-lg font-medium border-2 hover:bg-gray-50 transition-all text-[#004d40] border-[#004d40]/20" size="lg">
              <Users className="w-5 h-5 mr-3" />
              Manager Access
            </Button>
          </Link>

          <Link href="/admin" className="w-full block">
            <Button variant="outline" className="w-full h-12 text-lg font-medium border-2 hover:bg-gray-50 transition-all text-[#004d40] border-[#004d40]/20" size="lg">
              <User className="w-5 h-5 mr-3" />
              Admin Portal
            </Button>
          </Link>
        </CardContent>
      </Card>

      {/* Background decoration */}
      <div className="fixed inset-0 -z-10 h-full w-full bg-white [background:radial-gradient(125%_125%_at_50%_10%,#fff_40%,#004d40_100%)] opacity-5"></div>
    </main>
  )
}
