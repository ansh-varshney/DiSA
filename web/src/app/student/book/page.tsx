import { getActiveCourts } from '@/actions/courts'
import BookingUI from './booking-ui'

export default async function BookingPage() {
    const courts = await getActiveCourts()

    return (
        <div className="p-4 md:p-8 space-y-6">
            <header>
                <h1 className="text-2xl font-bold text-gray-900">Book a Court</h1>
                <p className="text-gray-500">Select a court and time to start playing.</p>
            </header>

            {courts.length === 0 ? (
                <div className="p-8 text-center text-gray-500 border-2 border-dashed rounded-lg">
                    No courts available. Please ask an admin to add courts.
                </div>
            ) : (
                <BookingUI initialCourts={courts} />
            )}
        </div>
    )
}
