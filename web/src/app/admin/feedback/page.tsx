import { getFeedback } from '@/actions/admin'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { FeedbackActions } from '@/components/feedback-actions'
import { StatusFilter } from '@/components/status-filter'
import { format } from 'date-fns'

const CATEGORY_LABELS: Record<string, { label: string; emoji: string; color: string }> = {
    general: { label: 'General', emoji: '💬', color: 'bg-gray-100 text-gray-700' },
    emergency_by_manager: {
        label: 'Emergency (Manager)',
        emoji: '🚨',
        color: 'bg-red-100 text-red-700',
    },
    emergency_by_student: {
        label: 'Emergency (Student)',
        emoji: '🆘',
        color: 'bg-orange-100 text-orange-700',
    },
}

export default async function FeedbackManagement({
    searchParams,
}: {
    searchParams: Promise<{ status?: string; category?: string }>
}) {
    const { status, category } = await searchParams
    const statusFilter = status || 'all'
    const categoryFilter = category || 'all'
    const feedback = await getFeedback(statusFilter, categoryFilter)

    const statusVariants: Record<string, 'info' | 'warning' | 'success' | 'danger'> = {
        open: 'danger',
        in_progress: 'warning',
        resolved: 'success',
    }

    return (
        <div className="p-6 space-y-6">
            <header>
                <h1 className="text-2xl font-bold text-gray-900">Feedback & Complaints</h1>
                <p className="text-gray-500 text-sm">
                    Monitor and resolve student feedback and manager reports
                </p>
            </header>

            {/* Filters */}
            <div className="flex flex-wrap items-center gap-4 justify-between">
                <StatusFilter />
                <span className="text-sm text-gray-500">
                    Total: <strong>{feedback.length}</strong>
                </span>
            </div>

            {/* Summary Pills */}
            <div className="flex flex-wrap gap-3">
                {Object.entries(CATEGORY_LABELS).map(([key, { label, emoji, color }]) => (
                    <a
                        key={key}
                        href={`/admin/feedback?category=${key}`}
                        className={`px-3 py-1.5 rounded-full text-xs font-semibold ${color} hover:opacity-80 transition`}
                    >
                        {emoji} {label}
                    </a>
                ))}
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
                                    <TableHead className="text-gray-900 font-semibold">
                                        Category
                                    </TableHead>
                                    <TableHead className="text-gray-900 font-semibold">
                                        Filed By
                                    </TableHead>
                                    <TableHead className="text-gray-900 font-semibold">
                                        Title
                                    </TableHead>
                                    <TableHead className="w-80 text-gray-900 font-semibold">
                                        Description
                                    </TableHead>
                                    <TableHead className="text-gray-900 font-semibold">
                                        Status
                                    </TableHead>
                                    <TableHead className="text-gray-900 font-semibold">
                                        Date
                                    </TableHead>
                                    <TableHead className="text-right text-gray-900 font-semibold">
                                        Actions
                                    </TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {feedback.map((item: any) => {
                                    const cat =
                                        CATEGORY_LABELS[item.category || 'general'] ||
                                        CATEGORY_LABELS.general
                                    return (
                                        <TableRow key={item.id}>
                                            <TableCell>
                                                <span
                                                    className={`px-2 py-1 rounded-full text-[11px] font-bold whitespace-nowrap ${cat.color}`}
                                                >
                                                    {cat.emoji} {cat.label}
                                                </span>
                                            </TableCell>
                                            <TableCell>
                                                <div>
                                                    <div className="font-semibold text-gray-900">
                                                        {item.profiles?.full_name || 'Unknown'}
                                                    </div>
                                                    <div className="text-xs text-gray-600">
                                                        {item.profiles?.student_id || '-'}
                                                    </div>
                                                </div>
                                            </TableCell>
                                            <TableCell className="font-semibold text-gray-900">
                                                {item.title}
                                            </TableCell>
                                            <TableCell className="text-gray-800 text-sm">
                                                {item.description.length > 100
                                                    ? item.description.substring(0, 100) + '...'
                                                    : item.description}
                                            </TableCell>
                                            <TableCell>
                                                <Badge
                                                    variant={statusVariants[item.status] || 'info'}
                                                >
                                                    {item.status.replace('_', ' ')}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="text-gray-800 text-sm">
                                                {format(new Date(item.created_at), 'MMM d, yyyy')}
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <FeedbackActions
                                                    feedbackId={item.id}
                                                    currentStatus={item.status}
                                                />
                                            </TableCell>
                                        </TableRow>
                                    )
                                })}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>
        </div>
    )
}
