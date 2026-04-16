import { getCurrentBookings, getUnderMaintenanceCourts } from '@/actions/manager'
import { ManagerBookingCard } from '@/components/manager-booking-card'
import { MaintenanceFlashcard } from '@/components/maintenance-flashcard'
import { CalendarClock } from 'lucide-react'

export default async function ManagerDashboard() {
    // Parallel data fetching
    const [allCurrentBookings, maintenanceCourts] = await Promise.all([
        getCurrentBookings(),
        getUnderMaintenanceCourts(),
    ])

    // Filter out maintenance bookings from the main list (they are now handled by the Flashcard logic)
    const currentBookings = allCurrentBookings.filter((b: any) => !b.is_maintenance)

    return (
        <div className="p-4 space-y-6">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div className="text-center md:text-left space-y-1">
                    <h2 className="text-2xl font-bold text-gray-800">Manager Dashboard</h2>
                    <p className="text-gray-500 font-medium tracking-wide text-sm uppercase">
                        Current Bookings
                    </p>
                    <div className="h-1 w-20 bg-yellow-400 rounded-full mx-auto md:mx-0 mt-2"></div>
                </div>

                {/* Maintenance Flashcard - Positioned to the side/top-right */}
                <div className="flex justify-center md:justify-end">
                    <MaintenanceFlashcard courts={maintenanceCourts} />
                </div>
            </div>

            <div className="space-y-4">
                {currentBookings.length === 0 ? (
                    <div className="flex flex-col items-center justify-center p-12 bg-white rounded-xl shadow-sm border border-dashed border-gray-300 text-center space-y-4">
                        <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center">
                            <CalendarClock className="w-8 h-8 text-gray-400" />
                        </div>
                        <div>
                            <p className="text-lg font-medium text-gray-900">No active bookings</p>
                            <p className="text-gray-500 text-sm">
                                There are no bookings aimed for today right now.
                            </p>
                        </div>
                    </div>
                ) : (
                    currentBookings.map((booking: any) => (
                        <ManagerBookingCard key={booking.id} booking={booking} />
                    ))
                )}
            </div>

            <div className="text-center text-xs text-gray-400 mt-8">
                Showing confirmed & pending bookings for today
            </div>
        </div>
    )
}
