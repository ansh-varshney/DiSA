import { getReservationsByDate, getCourtsList, getEquipmentBySport } from '@/actions/admin'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { SportFilter } from '@/components/sport-filter'
import { DatePicker } from '@/components/date-picker'
import { ReservationCalendar } from '@/components/reservation-calendar'
import { Calendar } from 'lucide-react'

export default async function ReservationsManagement({
    searchParams,
}: {
    searchParams: Promise<{ sport?: string; date?: string }>
}) {
    const params = await searchParams
    const sport = params.sport || ''
    const selectedDate = params.date || ''

    // Fetch courts for the selected sport (use existing getCourtsList that accepts optional param)
    const courts = sport && sport !== 'all' ? await getCourtsList(sport) : []

    // Fetch reservations for the selected date and sport
    const reservations =
        sport && selectedDate ? await getReservationsByDate(sport, selectedDate) : []

    // Fetch available equipment for the selected sport
    const equipment = sport && sport !== 'all' ? await getEquipmentBySport(sport) : []

    return (
        <div className="p-6 space-y-6">
            <header>
                <h1 className="text-2xl font-bold text-gray-900">Reservations Management</h1>
                <p className="text-gray-500 text-sm">View and manage court reservations</p>
            </header>

            {/* Filters */}
            <Card>
                <CardContent className="p-4">
                    <div className="flex items-center gap-4 flex-wrap">
                        <SportFilter />

                        {sport && sport !== 'all' && <DatePicker />}
                    </div>
                </CardContent>
            </Card>

            {/* Main Content */}
            {!sport || sport === 'all' ? (
                <Card>
                    <CardContent className="p-12">
                        <div className="text-center space-y-3">
                            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto">
                                <Calendar className="w-8 h-8 text-gray-400" />
                            </div>
                            <h3 className="text-lg font-semibold text-gray-900">
                                Please Select a Sport
                            </h3>
                            <p className="text-gray-500 text-sm max-w-md mx-auto">
                                Choose a sport from the dropdown above to view reservations for that
                                sport&apos;s courts.
                            </p>
                        </div>
                    </CardContent>
                </Card>
            ) : !selectedDate ? (
                <Card>
                    <CardContent className="p-12">
                        <div className="text-center space-y-3">
                            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto">
                                <Calendar className="w-8 h-8 text-gray-400" />
                            </div>
                            <h3 className="text-lg font-semibold text-gray-900">
                                Please Select a Date
                            </h3>
                            <p className="text-gray-500 text-sm max-w-md mx-auto">
                                Choose a date from the date picker above to view reservations for
                                that day.
                            </p>
                        </div>
                    </CardContent>
                </Card>
            ) : (
                <ReservationCalendar
                    courts={courts}
                    reservations={reservations}
                    selectedDate={selectedDate}
                    sport={sport}
                    equipment={equipment}
                />
            )}
        </div>
    )
}
