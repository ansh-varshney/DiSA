import { createClient } from '@/utils/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { CalendarPlus, Trophy, AlertCircle } from 'lucide-react'

export default async function StudentHome() {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user?.id)
        .single()

    const userName = profile?.full_name?.split(' ')[0] || 'Student'

    return (
        <div className="p-6 space-y-6">
            <header className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Welcome, {userName}</h1>
                    <p className="text-gray-500 text-sm">Let's play some sports!</p>
                </div>
                <div className="w-10 h-10 bg-gray-200 rounded-full overflow-hidden">
                    {profile?.avatar_url && <img src={profile.avatar_url} alt="Profile" className="w-full h-full object-cover" />}
                </div>
            </header>

            {/* Main Action Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Link href="/student/book" className="block">
                    <Card className="bg-[#004d40] text-white hover:bg-[#004d40]/90 transition-colors border-0 shadow-lg">
                        <CardContent className="p-6 flex items-center justify-between">
                            <div>
                                <h2 className="text-xl font-bold mb-1">Book a Court</h2>
                                <p className="text-white/80 text-sm">Reserve badminton, tennis, etc.</p>
                            </div>
                            <CalendarPlus className="w-10 h-10 text-white/90" />
                        </CardContent>
                    </Card>
                </Link>

                <Link href="/student/leaderboard" className="block">
                    <Card className="hover:border-[#004d40]/20 transition-colors">
                        <CardContent className="p-6 flex items-center justify-between">
                            <div>
                                <h2 className="text-xl font-bold text-gray-900 mb-1">Leaderboard</h2>
                                <p className="text-gray-500 text-sm">See where you rank.</p>
                            </div>
                            <Trophy className="w-10 h-10 text-yellow-500" />
                        </CardContent>
                    </Card>
                </Link>
            </div>

            {/* Today's Reservations Stub */}
            <section>
                <h3 className="font-semibold text-lg mb-3">Your Reservations</h3>
                <Card className="bg-gray-50 border-dashed">
                    <CardContent className="p-8 text-center text-gray-400">
                        <p>No active reservations.</p>
                        <Link href="/student/book" className="text-[#004d40] font-medium text-sm mt-2 inline-block">Book now &rarr;</Link>
                    </CardContent>
                </Card>
            </section>

            {/* Announcements Stub */}
            <section>
                <h3 className="font-semibold text-lg mb-3">Announcements</h3>
                <Card>
                    <CardContent className="p-4 flex gap-3">
                        <AlertCircle className="w-5 h-5 text-blue-500 shrink-0" />
                        <div>
                            <p className="font-medium text-sm">Tennis Court Maintenance</p>
                            <p className="text-xs text-gray-500 mt-1">Court 2 will be closed tomorrow for repairs.</p>
                        </div>
                    </CardContent>
                </Card>
            </section>
        </div>
    )
}
