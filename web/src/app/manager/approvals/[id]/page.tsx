import { getBookingDetails } from '@/actions/manager'
import { ManagerApprovalScreen } from '@/components/manager-approval-screen'
import { notFound } from 'next/navigation'

export default async function ManagerApprovalPage({
    params
}: {
    params: { id: string }
}) {
    const booking = await getBookingDetails(params.id)

    if (!booking) {
        notFound()
    }

    return (
        <div className="min-h-screen bg-gray-50 pb-8">
            <header className="bg-white border-b border-gray-200 sticky top-0 z-10 px-4 h-14 flex items-center justify-center">
                <span className="font-bold text-gray-900">Session Details</span>
            </header>

            <main className="p-4">
                <ManagerApprovalScreen booking={booking} />
            </main>
        </div>
    )
}
