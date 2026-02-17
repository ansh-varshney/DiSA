import { getFeedback } from '@/actions/admin'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { FeedbackActions } from '@/components/feedback-actions'
import { StatusFilter } from '@/components/status-filter'
import { format } from 'date-fns'

export default async function FeedbackManagement({ searchParams }: { searchParams: { status?: string } }) {
    const statusFilter = searchParams.status || 'all'
    const feedback = await getFeedback(statusFilter)

    const statusVariants: Record<string, "info" | "warning" | "success" | "danger"> = {
        open: 'danger',
        in_progress: 'warning',
        resolved: 'success'
    }

    return (
        <div className="p-6 space-y-6">
            <header>
                <h1 className="text-2xl font-bold text-gray-900">Feedback & Complaints</h1>
                <p className="text-gray-500 text-sm">Monitor and resolve student feedback</p>
            </header>

            {/* Filters */}
            <div className="flex items-center gap-4">
                <StatusFilter />

                <div className="ml-auto flex gap-2 text-sm">
                    <span className="text-gray-600">Total: <strong>{feedback.length}</strong></span>
                </div>
            </div>

            {/* Feedback Table */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-lg text-gray-900">Complaints List</CardTitle>
                </CardHeader>
                <CardContent>
                    {feedback.length === 0 ? (
                        <div className="text-center py-12 text-gray-500">
                            <p>No feedback found for this filter.</p>
                        </div>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="text-gray-900 font-semibold">Student</TableHead>
                                    <TableHead className="text-gray-900 font-semibold">Title</TableHead>
                                    <TableHead className="w-96 text-gray-900 font-semibold">Description</TableHead>
                                    <TableHead className="text-gray-900 font-semibold">Status</TableHead>
                                    <TableHead className="text-gray-900 font-semibold">Date</TableHead>
                                    <TableHead className="text-right text-gray-900 font-semibold">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {feedback.map((item) => (
                                    <TableRow key={item.id}>
                                        <TableCell>
                                            <div>
                                                <div className="font-semibold text-gray-900">{item.profiles?.full_name || 'Unknown'}</div>
                                                <div className="text-xs text-gray-600">{item.profiles?.student_id || '-'}</div>
                                            </div>
                                        </TableCell>
                                        <TableCell className="font-semibold text-gray-900">{item.title}</TableCell>
                                        <TableCell className="text-gray-800 text-sm">
                                            {item.description.length > 100
                                                ? item.description.substring(0, 100) + '...'
                                                : item.description}
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant={statusVariants[item.status] || 'info'}>
                                                {item.status.replace('_', ' ')}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="text-gray-800 text-sm">
                                            {format(new Date(item.created_at), 'MMM d, yyyy')}
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <FeedbackActions feedbackId={item.id} currentStatus={item.status} />
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
