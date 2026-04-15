import { createClient } from '@/utils/supabase/server'
import { Card, CardContent } from '@/components/ui/card'
import Link from 'next/link'
import { CalendarPlus, Trophy, AlertCircle, Megaphone, Clock } from 'lucide-react'
import { format } from 'date-fns'
import { cn } from '@/lib/utils'

export default async function StudentHome() {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user?.id)
        .single()

    const userName = profile?.full_name?.split(' ')[0] || 'Student'

    // Fetch upcoming bookings (today+)
    const now = new Date()
    const { data: upcomingBookings } = await supabase
        .from('bookings')
        .select('*, courts (name, sport)')
        .eq('user_id', user?.id)
        .in('status', ['pending_confirmation', 'confirmed', 'active'])
        .gte('end_time', now.toISOString())
        .order('start_time', { ascending: true })
        .limit(3)

    // Fetch announcements
    const { data: announcements } = await supabase
        .from('announcements')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(3)

    return (
        <div className="p-4 md:p-8 space-y-6">
            <header className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Welcome, {userName}</h1>
                    <p className="text-gray-500 text-sm">Let&apos;s play some sports!</p>
                </div>
                <Link href="/student/profile">
                    <div className="w-10 h-10 bg-gray-200 rounded-full overflow-hidden">
                        {profile?.avatar_url && <img src={profile.avatar_url} alt="Profile" className="w-full h-full object-cover" />}
                    </div>
                </Link>
            </header>

            {/* Quick Actions */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Link href="/student/book" className="block">
                    <Card className="bg-[#004d40] text-white hover:bg-[#004d40]/90 transition-colors border-0 shadow-lg">
                        <CardContent className="p-6 flex items-center justify-between">
                            <div>
                                <h2 className="text-xl font-bold mb-1">Book a Court</h2>
                                <p className="text-white/80 text-sm">Reserve your slot now</p>
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
                                <p className="text-gray-500 text-sm">{profile?.points || 0} pts · See your rank</p>
                            </div>
                            <Trophy className="w-10 h-10 text-yellow-500" />
                        </CardContent>
                    </Card>
                </Link>
            </div>

            {/* Upcoming Reservations */}
            <section>
                <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold text-lg">Upcoming</h3>
                    <Link href="/student/reservations" className="text-[#004d40] text-sm font-medium hover:underline">
                        View all →
                    </Link>
                </div>
                {!upcomingBookings || upcomingBookings.length === 0 ? (
                    <Card className="bg-gray-50 border-dashed">
                        <CardContent className="p-8 text-center text-gray-400">
                            <p>No upcoming bookings.</p>
                            <Link href="/student/book" className="text-[#004d40] font-medium text-sm mt-2 inline-block">
                                Book now →
                            </Link>
                        </CardContent>
                    </Card>
                ) : (
                    <div className="space-y-2">
                        {upcomingBookings.map((booking: any) => (
                            <Link key={booking.id} href="/student/reservations" className="block">
                                <Card className={cn(
                                    "transition-colors hover:shadow-sm",
                                    booking.status === 'active' && "border-l-4 border-l-green-500"
                                )}>
                                    <CardContent className="p-4 flex justify-between items-center">
                                        <div>
                                            <h4 className="font-semibold text-gray-800">{booking.courts?.name}</h4>
                                            <p className="text-xs text-gray-500 flex items-center gap-1 mt-1">
                                                <Clock className="w-3 h-3" />
                                                {format(new Date(booking.start_time), 'MMM d, h:mm a')}
                                            </p>
                                        </div>
                                        <span className={cn(
                                            "px-2 py-1 text-xs rounded-full font-semibold capitalize",
                                            booking.status === 'active' ? 'bg-green-100 text-green-800' :
                                                booking.status === 'confirmed' ? 'bg-blue-100 text-blue-800' :
                                                    'bg-yellow-100 text-yellow-800'
                                        )}>
                                            {booking.status === 'pending_confirmation' ? 'pending' : booking.status}
                                        </span>
                                    </CardContent>
                                </Card>
                            </Link>
                        ))}
                    </div>
                )}
            </section>

            {/* Announcements */}
            <section>
                <h3 className="font-semibold text-lg mb-3 flex items-center gap-2">
                    <Megaphone className="w-5 h-5 text-[#004d40]" />
                    Announcements
                </h3>
                {!announcements || announcements.length === 0 ? (
                    <Card className="bg-gray-50 border-dashed">
                        <CardContent className="p-6 text-center text-gray-400 text-sm">
                            No announcements right now
                        </CardContent>
                    </Card>
                ) : (
                    <div className="space-y-2">
                        {announcements.map((ann: any) => (
                            <Card key={ann.id}>
                                <CardContent className="p-4 flex gap-3">
                                    <AlertCircle className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
                                    <div>
                                        <p className="font-medium text-sm text-gray-800">{ann.title}</p>
                                        {ann.content && (
                                            <p className="text-xs text-gray-500 mt-1 line-clamp-2">{ann.content}</p>
                                        )}
                                        <p className="text-xs text-gray-400 mt-1">
                                            {format(new Date(ann.created_at), 'MMM d, h:mm a')}
                                        </p>
                                    </div>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                )}
            </section>
        </div>
    )
}
