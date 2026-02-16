import { createClient } from '@/utils/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import Link from 'next/link'
import {
    Package,
    MapPin,
    Calendar,
    AlertTriangle,
    Bell,
    MessageSquare,
    Users,
    BarChart3,
    DollarSign,
    TrendingUp
} from 'lucide-react'

export default async function AdminHome() {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user?.id)
        .single()

    const adminName = profile?.full_name?.split(' ')[0] || 'Admin'

    return (
        <div className="p-6 space-y-6">
            <header className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Admin Dashboard</h1>
                    <p className="text-gray-500 text-sm">Welcome back, {adminName}</p>
                </div>
                <div className="w-10 h-10 bg-[#004d40] rounded-full flex items-center justify-center">
                    <span className="text-white font-bold text-sm">
                        {adminName.charAt(0).toUpperCase()}
                    </span>
                </div>
            </header>



            {/* Core Management Modules */}
            <section>
                <h2 className="text-lg font-bold text-gray-900 mb-4">Core Management</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    <Link href="/admin/equipment">
                        <Card className="hover:shadow-lg transition-all border-l-4 border-l-[#004d40] cursor-pointer group">
                            <CardContent className="p-6">
                                <div className="flex items-start justify-between">
                                    <div className="flex-1">
                                        <div className="flex items-center gap-3 mb-2">
                                            <div className="w-10 h-10 bg-[#004d40]/10 rounded-lg flex items-center justify-center group-hover:bg-[#004d40]/20 transition-colors">
                                                <Package className="w-5 h-5 text-[#004d40]" />
                                            </div>
                                            <h3 className="font-bold text-gray-900">Equipment Management</h3>
                                        </div>
                                        <p className="text-sm text-gray-500">
                                            Track condition, usage, and manage inventory
                                        </p>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </Link>

                    <Link href="/admin/courts">
                        <Card className="hover:shadow-lg transition-all border-l-4 border-l-blue-600 cursor-pointer group">
                            <CardContent className="p-6">
                                <div className="flex items-start justify-between">
                                    <div className="flex-1">
                                        <div className="flex items-center gap-3 mb-2">
                                            <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center group-hover:bg-blue-100 transition-colors">
                                                <MapPin className="w-5 h-5 text-blue-600" />
                                            </div>
                                            <h3 className="font-bold text-gray-900">Court Management</h3>
                                        </div>
                                        <p className="text-sm text-gray-500">
                                            Manage courts, maintenance, and availability
                                        </p>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </Link>

                    <Link href="/admin/reservations">
                        <Card className="hover:shadow-lg transition-all border-l-4 border-l-purple-600 cursor-pointer group">
                            <CardContent className="p-6">
                                <div className="flex items-start justify-between">
                                    <div className="flex-1">
                                        <div className="flex items-center gap-3 mb-2">
                                            <div className="w-10 h-10 bg-purple-50 rounded-lg flex items-center justify-center group-hover:bg-purple-100 transition-colors">
                                                <Calendar className="w-5 h-5 text-purple-600" />
                                            </div>
                                            <h3 className="font-bold text-gray-900">Reservation Viewing</h3>
                                        </div>
                                        <p className="text-sm text-gray-500">
                                            View bookings, force cancel, priority reserve
                                        </p>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </Link>

                    <Link href="/admin/defaulters">
                        <Card className="hover:shadow-lg transition-all border-l-4 border-l-red-600 cursor-pointer group">
                            <CardContent className="p-6">
                                <div className="flex items-start justify-between">
                                    <div className="flex-1">
                                        <div className="flex items-center gap-3 mb-2">
                                            <div className="w-10 h-10 bg-red-50 rounded-lg flex items-center justify-center group-hover:bg-red-100 transition-colors">
                                                <AlertTriangle className="w-5 h-5 text-red-600" />
                                            </div>
                                            <h3 className="font-bold text-gray-900">Defaulter Students</h3>
                                        </div>
                                        <p className="text-sm text-gray-500">
                                            View flagged students and violation history
                                        </p>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </Link>

                    <Link href="/admin/announcements">
                        <Card className="hover:shadow-lg transition-all border-l-4 border-l-yellow-600 cursor-pointer group">
                            <CardContent className="p-6">
                                <div className="flex items-start justify-between">
                                    <div className="flex-1">
                                        <div className="flex items-center gap-3 mb-2">
                                            <div className="w-10 h-10 bg-yellow-50 rounded-lg flex items-center justify-center group-hover:bg-yellow-100 transition-colors">
                                                <Bell className="w-5 h-5 text-yellow-600" />
                                            </div>
                                            <h3 className="font-bold text-gray-900">Announcements</h3>
                                        </div>
                                        <p className="text-sm text-gray-500">
                                            Add and edit facility announcements
                                        </p>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </Link>

                    <Link href="/admin/feedback">
                        <Card className="hover:shadow-lg transition-all border-l-4 border-l-indigo-600 cursor-pointer group">
                            <CardContent className="p-6">
                                <div className="flex items-start justify-between">
                                    <div className="flex-1">
                                        <div className="flex items-center gap-3 mb-2">
                                            <div className="w-10 h-10 bg-indigo-50 rounded-lg flex items-center justify-center group-hover:bg-indigo-100 transition-colors">
                                                <MessageSquare className="w-5 h-5 text-indigo-600" />
                                            </div>
                                            <h3 className="font-bold text-gray-900">Feedback & Complaints</h3>
                                        </div>
                                        <p className="text-sm text-gray-500">
                                            Review student feedback and complaints
                                        </p>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </Link>

                    <Link href="/admin/coordinators">
                        <Card className="hover:shadow-lg transition-all border-l-4 border-l-green-600 cursor-pointer group">
                            <CardContent className="p-6">
                                <div className="flex items-start justify-between">
                                    <div className="flex-1">
                                        <div className="flex items-center gap-3 mb-2">
                                            <div className="w-10 h-10 bg-green-50 rounded-lg flex items-center justify-center group-hover:bg-green-100 transition-colors">
                                                <Users className="w-5 h-5 text-green-600" />
                                            </div>
                                            <h3 className="font-bold text-gray-900">Sport Info</h3>
                                        </div>
                                        <p className="text-sm text-gray-500">
                                            View sport details and information
                                        </p>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </Link>
                </div>
            </section>

            {/* Analytics Dashboards */}
            <section>
                <h2 className="text-lg font-bold text-gray-900 mb-4">Analytics Dashboards</h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <Link href="/admin/analytics/financials">
                        <Card className="hover:shadow-lg transition-all bg-gradient-to-br from-[#004d40] to-[#00695c] text-white cursor-pointer group">
                            <CardContent className="p-6">
                                <div className="flex items-center gap-3 mb-3">
                                    <div className="w-12 h-12 bg-white/20 rounded-lg flex items-center justify-center group-hover:bg-white/30 transition-colors">
                                        <DollarSign className="w-6 h-6 text-white" />
                                    </div>
                                    <h3 className="font-bold text-lg">Financials</h3>
                                </div>
                                <p className="text-sm text-white/80">
                                    Equipment costs, vendor analysis, lifespan metrics
                                </p>
                            </CardContent>
                        </Card>
                    </Link>

                    <Link href="/admin/analytics/student-welfare">
                        <Card className="hover:shadow-lg transition-all bg-gradient-to-br from-blue-600 to-blue-700 text-white cursor-pointer group">
                            <CardContent className="p-6">
                                <div className="flex items-center gap-3 mb-3">
                                    <div className="w-12 h-12 bg-white/20 rounded-lg flex items-center justify-center group-hover:bg-white/30 transition-colors">
                                        <BarChart3 className="w-6 h-6 text-white" />
                                    </div>
                                    <h3 className="font-bold text-lg">Student Welfare</h3>
                                </div>
                                <p className="text-sm text-white/80">
                                    Participation stats, branch profiles, heatmaps
                                </p>
                            </CardContent>
                        </Card>
                    </Link>

                    <Link href="/admin/analytics/team-performance">
                        <Card className="hover:shadow-lg transition-all bg-gradient-to-br from-purple-600 to-purple-700 text-white cursor-pointer group">
                            <CardContent className="p-6">
                                <div className="flex items-center gap-3 mb-3">
                                    <div className="w-12 h-12 bg-white/20 rounded-lg flex items-center justify-center group-hover:bg-white/30 transition-colors">
                                        <TrendingUp className="w-6 h-6 text-white" />
                                    </div>
                                    <h3 className="font-bold text-lg">Team Performance</h3>
                                </div>
                                <p className="text-sm text-white/80">
                                    Tournaments, wins/losses, practice sessions
                                </p>
                            </CardContent>
                        </Card>
                    </Link>
                </div>
            </section>
        </div>
    )
}
