import { getPendingBookings, updateBookingStatus } from '@/actions/manager'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { CheckCircle, XCircle } from 'lucide-react'
import { format } from 'date-fns'
import { redirect } from 'next/navigation'

export default async function ManagerDashboard() {
    const pendingBookings = await getPendingBookings()

    // Server Action wrappers for the buttons
    async function approve(formData: FormData) {
        'use server'
        const id = formData.get('id') as string
        await updateBookingStatus(id, 'confirmed')
        redirect('/manager')
    }

    async function reject(formData: FormData) {
        'use server'
        const id = formData.get('id') as string
        await updateBookingStatus(id, 'rejected')
        redirect('/manager')
    }

    return (
        <div className="p-4 md:p-8 space-y-6">
            <header>
                <h1 className="text-2xl font-bold text-gray-900">Manager Dashboard</h1>
                <p className="text-gray-500">Overview of facility activity.</p>
            </header>

            <section>
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-bold text-[#004d40]">Pending Approvals ({pendingBookings.length})</h2>
                    <Link href="/manager/approvals" className="text-sm text-blue-600 hover:underline">View All</Link>
                </div>

                <div className="space-y-4">
                    {pendingBookings.length === 0 ? (
                        <div className="bg-white p-8 rounded-lg text-center text-gray-400 border border-dashed">
                            No pending bookings.
                        </div>
                    ) : (
                        pendingBookings.map((booking: any) => (
                            <Card key={booking.id} className="border-l-4 border-l-yellow-400">
                                <CardContent className="p-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                                    <div>
                                        <h3 className="font-bold text-lg">{booking.courts.name}</h3>
                                        <p className="text-gray-600 text-sm">
                                            {format(new Date(booking.start_time), 'MMM d, h:mm a')} - {format(new Date(booking.end_time), 'h:mm a')}
                                        </p>
                                        <div className="mt-2 flex items-center gap-2">
                                            <span className="font-medium">{booking.profiles.full_name}</span>
                                            <span className="text-xs bg-gray-100 px-2 py-0.5 rounded text-gray-500">{booking.profiles.student_id || 'No ID'}</span>
                                        </div>
                                    </div>

                                    <div className="flex gap-2 w-full md:w-auto">
                                        <form action={reject} className="flex-1 md:flex-none">
                                            <input type="hidden" name="id" value={booking.id} />
                                            <Button variant="outline" className="w-full text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200">
                                                <XCircle className="w-4 h-4 mr-2" />
                                                Reject
                                            </Button>
                                        </form>
                                        <form action={approve} className="flex-1 md:flex-none">
                                            <input type="hidden" name="id" value={booking.id} />
                                            <Button className="w-full bg-[#004d40] hover:bg-[#004d40]/90">
                                                <CheckCircle className="w-4 h-4 mr-2" />
                                                Approve
                                            </Button>
                                        </form>
                                    </div>
                                </CardContent>
                            </Card>
                        ))
                    )}
                </div>
            </section>
        </div>
    )
}

import Link from 'next/link'
