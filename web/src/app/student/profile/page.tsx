import { createClient } from '@/utils/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { redirect } from 'next/navigation'
import { format, formatDistanceToNow } from 'date-fns'
import { AlertTriangle, CheckCircle, Star, Calendar, Shield, MessageSquare, Clock, GraduationCap, Ban, Trophy } from 'lucide-react'
import { cn } from '@/lib/utils'
import { FeedbackForm } from '@/components/feedback-form'
import { ProfileEditForm } from '@/components/profile-edit-form'

// Helper: turn snake_case violation_type into readable label
function readableViolationType(type: string) {
    return type
        .replace(/_/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase())
}

const statusColors: Record<string, string> = {
    open: 'bg-red-100 text-red-700',
    in_progress: 'bg-yellow-100 text-yellow-700',
    resolved: 'bg-green-100 text-green-700',
}

export default async function ProfilePage() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) redirect('/login')

    const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single()

    // Fetch violations — only past 2 months
    const twoMonthsAgo = new Date()
    twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2)

    const { data: violations } = await supabase
        .from('student_violations')
        .select('*')
        .eq('student_id', user.id)
        .gte('created_at', twoMonthsAgo.toISOString())
        .order('created_at', { ascending: false })
        .limit(10)

    // Count total completed sessions
    const { count: totalSessions } = await supabase
        .from('bookings')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('status', 'completed')

    // Fetch past feedbacks/complaints
    const { data: feedbacks } = await supabase
        .from('feedback_complaints')
        .select('*')
        .eq('student_id', user.id)
        .order('created_at', { ascending: false })
        .limit(20)

    const violationCount = violations?.length || 0
    // Active time-ban (3 late arrivals → 14 days)
    const isBanned = profile?.banned_until && new Date(profile.banned_until) > new Date()
    // Suspension from 3+ total violations
    const isSuspended = violationCount >= 3
    // Late arrival strike count (from the last 2-month window already fetched)
    const lateArrivalCount = (violations || []).filter((v: any) => v.violation_type === 'students_late').length

    return (
        <div className="p-4 md:p-8 space-y-6">
            <h1 className="text-2xl font-bold text-gray-900">My Profile</h1>

            {/* Profile Card */}
            <Card>
                <CardContent className="p-6 space-y-4">
                    <div className="flex items-center space-x-4">
                        <div className="w-16 h-16 bg-[#004d40] rounded-full flex items-center justify-center text-2xl font-bold text-white">
                            {profile?.full_name?.[0]?.toUpperCase() || 'U'}
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-gray-900">{profile?.full_name}</h2>
                            <p className="text-gray-500 text-sm">{profile?.email}</p>
                            {profile?.student_id && (
                                <p className="text-gray-400 text-xs mt-0.5">Roll: {profile.student_id}</p>
                            )}
                            {profile?.phone_number && (
                                <p className="text-gray-400 text-xs">{profile.phone_number}</p>
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
                            <p className="text-xl font-black text-gray-800 capitalize">{profile?.role}</p>
                            <p className="text-xs text-gray-500 font-medium">Role</p>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Monthly leaderboard reward — top-5 priority booking */}
            {(profile?.priority_booking_remaining ?? 0) > 0 && (
                <Card className="border-2 border-yellow-400 bg-yellow-50">
                    <CardContent className="p-4 flex items-start gap-3">
                        <Trophy className="w-6 h-6 text-yellow-600 shrink-0 mt-0.5" />
                        <div>
                            <p className="font-bold text-yellow-700">Monthly Top-5 Reward Active!</p>
                            <p className="text-sm text-yellow-600 mt-0.5">
                                You finished in the top 5 last month. You have{' '}
                                <span className="font-semibold">1 priority booking</span>{' '}
                                available — book a{' '}
                                <span className="font-semibold">90-minute session</span>{' '}
                                anytime this month. The 90-min option will appear in the booking screen.
                                This reward is one-time and expires at the next monthly reset.
                            </p>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Academic Profile (editable) */}
            <Card>
                <CardHeader className="py-3">
                    <CardTitle className="text-lg flex items-center gap-2 text-gray-800">
                        <GraduationCap className="w-5 h-5 text-[#004d40]" />
                        Academic Profile
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <ProfileEditForm
                        current={{
                            branch: profile?.branch ?? null,
                            year: profile?.year ?? null,
                            gender: profile?.gender ?? null,
                        }}
                    />
                </CardContent>
            </Card>

            {/* Active 14-day ban (repeated late arrivals) */}
            {isBanned && (
                <Card className="border-2 border-orange-500 bg-orange-50">
                    <CardContent className="p-4 flex items-center gap-3">
                        <Ban className="w-6 h-6 text-orange-600 shrink-0" />
                        <div>
                            <p className="font-bold text-orange-700">Temporarily Banned — Late Arrivals</p>
                            <p className="text-sm text-orange-600">
                                You have accumulated 3 late-arrival strikes. Booking is disabled until{' '}
                                <span className="font-semibold">
                                    {format(new Date(profile!.banned_until), 'MMMM d, yyyy')}
                                </span>{' '}
                                ({formatDistanceToNow(new Date(profile!.banned_until), { addSuffix: true })}).
                                Contact admin for early clearance.
                            </p>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Suspension warning (3+ total violations) */}
            {!isBanned && isSuspended && (
                <Card className="border-2 border-red-500 bg-red-50">
                    <CardContent className="p-4 flex items-center gap-3">
                        <AlertTriangle className="w-6 h-6 text-red-600 shrink-0" />
                        <div>
                            <p className="font-bold text-red-700">Account Suspended</p>
                            <p className="text-sm text-red-600">
                                {violationCount} violations recorded. Booking is disabled. Contact admin to resolve.
                            </p>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Late arrival strike tracker (show if any strikes but not yet banned) */}
            {!isBanned && lateArrivalCount > 0 && (
                <Card className={cn(
                    'border',
                    lateArrivalCount >= 2 ? 'border-orange-300 bg-orange-50' : 'border-yellow-200 bg-yellow-50'
                )}>
                    <CardContent className="p-4 flex items-center gap-3">
                        <Clock className={cn('w-5 h-5 shrink-0', lateArrivalCount >= 2 ? 'text-orange-500' : 'text-yellow-500')} />
                        <div>
                            <p className={cn('font-semibold text-sm', lateArrivalCount >= 2 ? 'text-orange-700' : 'text-yellow-700')}>
                                Late Arrival Strikes: {lateArrivalCount} / 3
                            </p>
                            <p className="text-xs text-gray-600 mt-0.5">
                                3 strikes will result in a 14-day booking ban.
                                {lateArrivalCount === 2 && ' One more and you will be banned!'}
                            </p>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Warnings & Violations */}
            <Card className={cn(violationCount > 0 ? 'border-red-200' : 'border-green-200')}>
                <CardHeader className="py-3">
                    <CardTitle className={cn(
                        'text-lg flex items-center gap-2',
                        violationCount > 0 ? 'text-red-700' : 'text-green-700'
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
                            {violations?.map((v: any) => {
                                const message = v.reason || v.description || readableViolationType(v.violation_type || 'Unknown')
                                const severityColors: Record<string, string> = {
                                    critical: 'bg-red-200 text-red-800',
                                    severe: 'bg-red-200 text-red-800',
                                    major: 'bg-orange-200 text-orange-800',
                                    minor: 'bg-yellow-200 text-yellow-800',
                                }
                                return (
                                    <div key={v.id} className="p-3 bg-red-50 rounded-lg border border-red-100">
                                        <div className="flex items-center justify-between mb-1">
                                            <div className="flex items-center gap-2">
                                                <span className={cn(
                                                    'text-xs font-bold uppercase px-2 py-0.5 rounded-full',
                                                    severityColors[v.severity] || 'bg-yellow-200 text-yellow-800'
                                                )}>
                                                    {v.severity || 'minor'}
                                                </span>
                                                <span className="text-xs text-gray-500 font-medium">
                                                    {readableViolationType(v.violation_type || '')}
                                                </span>
                                            </div>
                                            <span className="text-xs text-gray-400">
                                                {format(new Date(v.created_at), 'MMM d, yyyy')}
                                            </span>
                                        </div>
                                        <p className="text-sm text-gray-700">{message}</p>
                                    </div>
                                )
                            })}
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Feedback & Complaints */}
            <Card>
                <CardHeader className="py-3">
                    <CardTitle className="text-lg flex items-center gap-2 text-gray-800">
                        <MessageSquare className="w-5 h-5 text-[#004d40]" />
                        Submit Feedback / Complaint
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <FeedbackForm />
                </CardContent>
            </Card>

            {/* Past Feedback History */}
            {feedbacks && feedbacks.length > 0 && (
                <Card>
                    <CardHeader className="py-3">
                        <CardTitle className="text-lg flex items-center gap-2 text-gray-800">
                            <Clock className="w-5 h-5 text-gray-500" />
                            My Past Feedbacks ({feedbacks.length})
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-3">
                            {feedbacks.map((fb: any) => (
                                <div key={fb.id} className="p-3 bg-gray-50 rounded-lg border border-gray-100">
                                    <div className="flex items-center justify-between mb-1">
                                        <div className="flex items-center gap-2">
                                            <span className={cn(
                                                'text-xs font-bold uppercase px-2 py-0.5 rounded-full',
                                                statusColors[fb.status] || 'bg-gray-100 text-gray-600'
                                            )}>
                                                {(fb.status || 'open').replace('_', ' ')}
                                            </span>
                                            <span className="text-xs text-gray-400 capitalize">{fb.category || 'feedback'}</span>
                                        </div>
                                        <span className="text-xs text-gray-400">
                                            {format(new Date(fb.created_at), 'MMM d, yyyy')}
                                        </span>
                                    </div>
                                    <p className="text-sm font-semibold text-gray-900">{fb.title}</p>
                                    <p className="text-sm text-gray-600 mt-0.5">{fb.description}</p>
                                    {fb.admin_notes && (
                                        <div className="mt-2 p-2 bg-blue-50 rounded border border-blue-100">
                                            <p className="text-xs font-semibold text-blue-700">Admin Response:</p>
                                            <p className="text-sm text-blue-800">{fb.admin_notes}</p>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            )}
        </div>
    )
}
