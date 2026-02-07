import { getPendingBookings, updateBookingStatus } from '@/actions/manager'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { CheckCircle, XCircle } from 'lucide-react'
import { format } from 'date-fns'
import { redirect } from 'next/navigation'

export default async function ApprovalsPage() {
    // This page is identical to the dashboard widget but meant for the full list.
    // Reusing the same logic for simplicity.
    const pendingBookings = await getPendingBookings()

    async function approve(formData: FormData) {
        'use server'
        const id = formData.get('id') as string
        await updateBookingStatus(id, 'confirmed')
        redirect('/manager/approvals')
    }

    async function reject(formData: FormData) {
        'use server'
        const id = formData.get('id') as string
        await updateBookingStatus(id, 'rejected')
        redirect('/manager/approvals')
    }

    return (
        <div className="p-4 md:p-8 space-y-6">
            <h1 className="text-2xl font-bold text-gray-900">Pending Approvals</h1>

            <div className="space-y-4">
                {pendingBookings.length === 0 ? (
                    <p className="text-gray-500">No pending requests.</p>
                ) : (
                    pendingBookings.map((booking: any) => (
                        <Card key={booking.id} className="border-l-4 border-l-yellow-400">
                            <CardContent className="p-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                                <div>
                                    <h3 className="font-bold text-lg">{booking.courts.name}</h3>
                                    <p className="text-gray-600 text-sm">
                                        {format(new Date(booking.start_time), 'MMM d, h:mm a')} - {format(new Date(booking.end_time), 'h:mm a')}
                                    </p>
                                    <div className="mt-2 text-sm">
                                        <span className="font-medium">{booking.profiles.full_name}</span>
                                        <span className="text-gray-400 mx-2">|</span>
                                        <span className="text-gray-500">Phone: {booking.profiles.phone_number || 'N/A'}</span>
                                    </div>
                                </div>

                                <div className="flex gap-2">
                                    <form action={reject}>
                                        <input type="hidden" name="id" value={booking.id} />
                                        <Button variant="outline" className="text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200">
                                            <XCircle className="w-4 h-4 mr-2" />
                                            Reject
                                        </Button>
                                    </form>
                                    <form action={approve}>
                                        <input type="hidden" name="id" value={booking.id} />
                                        <Button className="bg-[#004d40] hover:bg-[#004d40]/90">
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
        </div>
    )
}
