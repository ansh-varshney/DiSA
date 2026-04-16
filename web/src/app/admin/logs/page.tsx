import { getBookingLogs } from '@/actions/admin'
import { Card, CardContent } from '@/components/ui/card'
import { SportFilter } from '@/components/sport-filter'
import { PastDatePicker } from '@/components/past-date-picker'
import { BookingLogRow } from '@/components/booking-log-row'
import { ScrollText, Calendar } from 'lucide-react'
import { format } from 'date-fns'

const STATUS_COUNTS = ['completed', 'rejected', 'cancelled', 'active', 'confirmed', 'pending']
const STATUS_COLORS: Record<string, string> = {
    completed: 'bg-green-100 text-green-700',
    rejected: 'bg-red-100 text-red-700',
    cancelled: 'bg-gray-100 text-gray-600',
    active: 'bg-blue-100 text-blue-700',
    confirmed: 'bg-teal-100 text-teal-700',
    pending: 'bg-amber-100 text-amber-700',
}

export default async function BookingLogsPage({
    searchParams,
}: {
    searchParams: Promise<{ sport?: string; date?: string }>
}) {
    const params = await searchParams
    const sport = params.sport || ''
    const date = params.date || ''

    const logs = sport && date ? await getBookingLogs(sport, date) : []

    // Count by status
    const statusCounts = STATUS_COUNTS.reduce(
        (acc, s) => {
            acc[s] = logs.filter((b: any) => b.status === s).length
            return acc
        },
        {} as Record<string, number>
    )

    return (
        <div className="p-6 space-y-6">
            <header>
                <h1 className="text-2xl font-bold text-gray-900">Booking Logs</h1>
                <p className="text-gray-500 text-sm">
                    All bookings — completed, rejected, emergency ended, and more
                </p>
            </header>

            {/* Filters — BOTH required */}
            <Card>
                <CardContent className="p-4">
                    <div className="flex items-center gap-4 flex-wrap">
                        <SportFilter />
                        {sport && <PastDatePicker />}
                    </div>
                    {(!sport || !date) && (
                        <p className="text-xs text-amber-600 font-medium mt-2">
                            ⚠️ Both sport and date are required to view logs
                        </p>
                    )}
                </CardContent>
            </Card>

            {/* No selection yet */}
            {!sport || !date ? (
                <Card>
                    <CardContent className="p-12">
                        <div className="text-center space-y-3">
                            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto">
                                <ScrollText className="w-8 h-8 text-gray-400" />
                            </div>
                            <h3 className="text-lg font-semibold text-gray-900">
                                Select Sport & Date
                            </h3>
                            <p className="text-gray-500 text-sm">
                                Choose a sport and date above to view all bookings for that day
                            </p>
                        </div>
                    </CardContent>
                </Card>
            ) : (
                <>
                    {/* Status summary pills */}
                    <div className="flex flex-wrap gap-2">
                        {STATUS_COUNTS.filter((s) => statusCounts[s] > 0).map((s) => (
                            <span
                                key={s}
                                className={`px-3 py-1 rounded-full text-xs font-bold capitalize ${STATUS_COLORS[s]}`}
                            >
                                {s}: {statusCounts[s]}
                            </span>
                        ))}
                        {logs.length === 0 && (
                            <span className="text-sm text-gray-500">No bookings on this date</span>
                        )}
                    </div>

                    {/* Table */}
                    {logs.length > 0 && (
                        <div className="bg-white rounded-xl border overflow-hidden shadow-sm">
                            <div className="px-5 py-4 border-b flex items-center gap-2">
                                <Calendar className="w-4 h-4 text-[#004d40]" />
                                <span className="font-semibold text-gray-900 text-sm">
                                    {format(new Date(date), 'EEEE, MMMM d yyyy')} ·{' '}
                                    {sport.charAt(0).toUpperCase() + sport.slice(1)}
                                </span>
                                <span className="ml-auto text-xs text-gray-400">
                                    {logs.length} bookings
                                </span>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead className="bg-gray-50 border-b">
                                        <tr>
                                            <th className="px-4 py-3 w-8" />
                                            <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-gray-500">
                                                Status
                                            </th>
                                            <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-gray-500">
                                                Court
                                            </th>
                                            <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-gray-500">
                                                Booked By
                                            </th>
                                            <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-gray-500">
                                                Time
                                            </th>
                                            <th className="px-4 py-3 text-center text-xs font-bold uppercase tracking-wide text-gray-500">
                                                Players
                                            </th>
                                            <th className="px-4 py-3 text-center text-xs font-bold uppercase tracking-wide text-gray-500">
                                                Equipment
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {logs.map((booking: any) => (
                                            <BookingLogRow key={booking.id} booking={booking} />
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </>
            )}
        </div>
    )
}
