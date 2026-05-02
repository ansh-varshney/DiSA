import Link from 'next/link'
import { ShieldCheck, User, GraduationCap, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { db } from '@/db'
import { profiles } from '@/db/schema'
import { eq } from 'drizzle-orm'

export default async function Home() {
    const session = await auth()

    if (session?.user?.id) {
        const [profile] = await db
            .select({ role: profiles.role })
            .from(profiles)
            .where(eq(profiles.id, session.user.id))
            .limit(1)

        if (profile?.role === 'student') redirect('/student')
        if (profile?.role === 'manager') redirect('/manager')
        if (profile?.role === 'admin') redirect('/admin')
        // superuser: fall through to show portal selector
    }

    return (
        <main className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
            <Card className="w-full max-w-md shadow-lg border-0 bg-white/95 backdrop-blur">
                <CardHeader className="text-center space-y-4 pb-8">
                    <div className="mx-auto w-16 h-16 bg-[#004d40] rounded-2xl flex items-center justify-center shadow-md transform rotate-3 hover:rotate-0 transition-transform duration-300">
                        <ShieldCheck className="w-8 h-8 text-white" />
                    </div>
                    <div className="space-y-1">
                        <h1 className="text-2xl font-bold tracking-tight text-gray-900">
                            Sports Court Management
                        </h1>
                        <p className="text-sm text-gray-500">College Sports Facility Portal</p>
                    </div>
                </CardHeader>
                <CardContent className="space-y-4">
                    <Link href="/student" className="w-full block">
                        <Button
                            className="w-full h-12 text-lg font-medium bg-[#004d40] hover:bg-[#004d40]/90 transition-all shadow-sm hover:shadow-md"
                            size="lg"
                        >
                            <GraduationCap className="w-5 h-5 mr-3" />
                            Student Portal
                        </Button>
                    </Link>

                    <Link href="/manager" className="w-full block">
                        <Button
                            variant="outline"
                            className="w-full h-12 text-lg font-medium border-2 hover:bg-gray-50 transition-all text-[#004d40] border-[#004d40]/20"
                            size="lg"
                        >
                            <Users className="w-5 h-5 mr-3" />
                            Manager Access
                        </Button>
                    </Link>

                    <Link href="/admin" className="w-full block">
                        <Button
                            variant="outline"
                            className="w-full h-12 text-lg font-medium border-2 hover:bg-gray-50 transition-all text-[#004d40] border-[#004d40]/20"
                            size="lg"
                        >
                            <User className="w-5 h-5 mr-3" />
                            Admin Portal
                        </Button>
                    </Link>
                </CardContent>
            </Card>

            <div className="fixed inset-0 -z-10 h-full w-full bg-white [background:radial-gradient(125%_125%_at_50%_10%,#fff_40%,#004d40_100%)] opacity-5"></div>
        </main>
    )
}
