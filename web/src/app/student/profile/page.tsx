import { createClient } from '@/utils/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { redirect } from 'next/navigation'
import { format } from 'date-fns'
import { AlertTriangle, CheckCircle, Star, Calendar, Shield } from 'lucide-react'
import { cn } from '@/lib/utils'

export default async function ProfilePage() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) redirect('/login')

    const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single()

    // Fetch violations
    const { data: violations } = await supabase
        .from('student_violations')
        .select('*')
        .eq('student_id', user.id)
        .order('created_at', { ascending: false })
        .limit(10)

    // Count total sessions
    const { count: totalSessions } = await supabase
        .from('bookings')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('status', 'completed')

    const violationCount = violations?.length || 0
    const isBanned = violationCount >= 3

    return (
        <div className="p-4 md:p-8 space-y-6">
            <h1 className="text-2xl font-bold text-gray-900">My Profile</h1>

            {/* Profile Card */}
            <Card>
                <CardContent className="p-6 space-y-4">
                    <div className="flex items-center space-x-4">
                        <div className="w-16 h-16 bg-[#004d40] rounded-full flex items-center justify-center text-2xl font-bold text-white">
                            {profile?.full_name?.[0] || 'U'}
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-gray-900">{profile?.full_name}</h2>
                            <p className="text-gray-500 text-sm">{profile?.email}</p>
                            {profile?.phone_number && (
                                <p className="text-gray-400 text-xs mt-0.5">{profile?.phone_number}</p>
                            )}
                        </div>
                    </div>

                    {/* Stats Grid */}
                    <div className="grid grid-cols-3 gap-3 mt-4">
                        <div className="bg-[#004d40]/5 p-4 rounded-xl text-center">
                            <Star className="w-5 h-5 text-yellow-500 mx-auto mb-1" />
                            <p className="text-2xl font-black text-[#004d40]">{profile?.points || 0}</p>
                            <p className="text-xs text-gray-500 font-medium">Points</p>
                        </div>
                        <div className="bg-gray-50 p-4 rounded-xl text-center">
                            <Calendar className="w-5 h-5 text-blue-500 mx-auto mb-1" />
                            <p className="text-2xl font-black text-gray-800">{totalSessions || 0}</p>
                            <p className="text-xs text-gray-500 font-medium">Sessions</p>
                        </div>
                        <div className="bg-gray-50 p-4 rounded-xl text-center">
                            <Shield className="w-5 h-5 text-gray-400 mx-auto mb-1" />
                            <p className="text-2xl font-black text-gray-800 capitalize">{profile?.role}</p>
                            <p className="text-xs text-gray-500 font-medium">Role</p>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Ban Warning */}
            {isBanned && (
                <Card className="border-2 border-red-500 bg-red-50">
                    <CardContent className="p-4 flex items-center gap-3">
                        <AlertTriangle className="w-6 h-6 text-red-600 shrink-0" />
                        <div>
                            <p className="font-bold text-red-700">Account Suspended</p>
                            <p className="text-sm text-red-600">3+ violations recorded. 14-day booking ban in effect.</p>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Warnings & Violations */}
            <Card className={cn(
                violationCount > 0 ? "border-red-200" : "border-green-200"
            )}>
                <CardHeader className="py-3">
                    <CardTitle className={cn(
                        "text-lg flex items-center gap-2",
                        violationCount > 0 ? "text-red-700" : "text-green-700"
                    )}>
                        <AlertTriangle className="w-5 h-5" />
                        Warnings & Violations ({violationCount})
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {violationCount === 0 ? (
                        <div className="flex items-center gap-2 text-green-600">
                            <CheckCircle className="w-5 h-5" />
                            <p className="text-sm font-medium">No violations. Keep up the good sportsmanship!</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {violations?.map((v: any) => (
                                <div key={v.id} className="p-3 bg-red-50 rounded-lg border border-red-100">
                                    <div className="flex items-center justify-between">
                                        <span className={cn(
                                            "text-xs font-bold uppercase px-2 py-0.5 rounded-full",
                                            v.severity === 'critical' ? 'bg-red-200 text-red-800' :
                                                v.severity === 'major' ? 'bg-orange-200 text-orange-800' :
                                                    'bg-yellow-200 text-yellow-800'
                                        )}>
                                            {v.severity}
                                        </span>
                                        <span className="text-xs text-gray-400">
                                            {format(new Date(v.created_at), 'MMM d, yyyy')}
                                        </span>
                                    </div>
                                    <p className="text-sm text-gray-700 mt-1">{v.description}</p>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    )
}
