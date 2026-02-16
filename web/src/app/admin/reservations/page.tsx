import { getReservations } from '@/actions/admin'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { ReservationActions } from '@/components/reservation-actions'
import { format } from 'date-fns'

export default async function ReservationsManagement() {
    const reservations = await getReservations(3) // 3-day view

    const statusVariants: Record<string, "info" | "success" | "warning" | "danger" | "secondary"> = {
        pending_confirmation: 'warning',
        confirmed: 'success',
        waiting_manager: 'info',
        active: 'info',
        completed: 'secondary',
        cancelled: 'danger',
        rejected: 'danger'
    }

    return (
        <div className="p-6 space-y-6">
            <header>
                <h1 className="text-2xl font-bold text-gray-900">Reservations Viewing</h1>
                <p className="text-gray-500 text-sm">Monitor and manage court reservations (3-day view)</p>
            </header>

            {/* Reservations Table */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-lg">Upcoming Reservations ({reservations.length})</CardTitle>
                </CardHeader>
                <CardContent>
                    {reservations.length === 0 ? (
                        <div className="text-center py-12 text-gray-500">
                            <p>No reservations found for the next 3 days.</p>
                        </div>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Date & Time</TableHead>
                                    <TableHead>Court</TableHead>
                                    <TableHead>Student</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead>Players</TableHead>
                                    <TableHead className="text-right">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {reservations.map((booking) => (
                                    <TableRow key={booking.id}>
                                        <TableCell>
                                            <div>
                                                <div className="font-medium">
                                                    {format(new Date(booking.start_time), 'MMM d, yyyy')}
                                                </div>
                                                <div className="text-xs text-gray-500">
                                                    {format(new Date(booking.start_time), 'h:mm a')} -{' '}
                                                    {format(new Date(booking.end_time), 'h:mm a')}
                                                </div>
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <div>
                                                <div className="font-medium">{booking.courts?.name}</div>
                                                <div className="text-xs text-gray-500 capitalize">
                                                    {booking.courts?.sport}
                                                </div>
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <div>
                                                <div className="font-medium">{booking.profiles?.full_name}</div>
                                                <div className="text-xs text-gray-500">
                                                    {booking.profiles?.student_id}
                                                </div>
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant={statusVariants[booking.status] || 'info'}>
                                                {booking.status.replace('_', ' ')}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="text-gray-600">
                                            {booking.players_list
                                                ? (Array.isArray(booking.players_list)
                                                    ? booking.players_list.length
                                                    : '1')
                                                : '1'} player(s)
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <ReservationActions
                                                bookingId={booking.id}
                                                currentStatus={booking.status}
                                            />
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>
        </div>
    )
}
