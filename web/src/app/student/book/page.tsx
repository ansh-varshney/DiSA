import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import { db } from '@/db'
import { profiles, studentViolations } from '@/db/schema'
import { eq, count } from 'drizzle-orm'
import BookingUI from './booking-ui'
import { getActiveCourts } from '@/actions/courts'
import { AlertTriangle } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import Link from 'next/link'

export default async function BookingPage() {
    const session = await auth()
    if (!session?.user?.id) redirect('/login')
    const userId = session.user.id

    const [violationResult] = await db
        .select({ count: count() })
        .from(studentViolations)
        .where(eq(studentViolations.student_id, userId))

    const isBanned = (violationResult?.count ?? 0) >= 3

    const [profileData] = await db
        .select({ priority_booking_remaining: profiles.priority_booking_remaining })
        .from(profiles)
        .where(eq(profiles.id, userId))
        .limit(1)

    const hasPriorityBooking = (profileData?.priority_booking_remaining ?? 0) > 0

    const courts = await getActiveCourts()

    return (
        <div className="p-4 md:p-8 space-y-6">
            <header>
                <h1 className="text-2xl font-bold text-gray-900">Book a Court</h1>
                <p className="text-gray-500 text-sm">Select a court and time to start playing.</p>
            </header>

            {isBanned ? (
                <Card className="border-2 border-red-500 bg-red-50">
                    <CardContent className="p-6 flex flex-col items-center text-center gap-4">
                        <AlertTriangle className="w-12 h-12 text-red-500" />
                        <div>
                            <h2 className="text-lg font-bold text-red-700">Booking Suspended</h2>
                            <p className="text-sm text-red-600 mt-1">
                                Your account has 3 or more violations. You cannot make new bookings.
                                Please contact admin or your manager to resolve this.
                            </p>
                        </div>
                        <Link
                            href="/student/profile"
                            className="text-sm font-semibold text-[#004d40] underline underline-offset-2"
                        >
                            View my violations →
                        </Link>
                    </CardContent>
                </Card>
            ) : courts.length === 0 ? (
                <div className="p-8 text-center text-gray-500 border-2 border-dashed rounded-lg">
                    No courts available. Please ask an admin to add courts.
                </div>
            ) : (
                <BookingUI initialCourts={courts} hasPriorityBooking={hasPriorityBooking} />
            )}
        </div>
    )
}
