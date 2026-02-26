import { getDefaulterStudents, removeStudentFromDefaulters } from '@/actions/admin'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { X, Bot, User, Phone } from 'lucide-react'
import { format } from 'date-fns'

async function handleRemoveStudent(studentId: string) {
    'use server'
    await removeStudentFromDefaulters(studentId)
}

const VIOLATION_LABELS: Record<string, { label: string; emoji: string; color: string }> = {
    lost_equipment: { label: 'Lost Equipment', emoji: '📦', color: 'bg-orange-100 text-orange-700' },
    inappropriate_behaviour: { label: 'Inappropriate Behaviour', emoji: '⚠️', color: 'bg-yellow-100 text-yellow-700' },
    vandalism: { label: 'Vandalism', emoji: '🏚️', color: 'bg-red-100 text-red-700' },
    late_end: { label: 'Late Finish', emoji: '⏰', color: 'bg-blue-100 text-blue-700' },
    students_late: { label: 'Students Late', emoji: '🕐', color: 'bg-blue-100 text-blue-700' },
    improper_gear: { label: 'Improper Gear', emoji: '🎽', color: 'bg-purple-100 text-purple-700' },
    other: { label: 'Other', emoji: '📋', color: 'bg-gray-100 text-gray-600' },
}

export default async function DefaulterStudents() {
    const defaulters = await getDefaulterStudents()

    return (
        <div className="p-6 space-y-6">
            <header>
                <h1 className="text-2xl font-bold text-gray-900">Defaulter Students</h1>
                <p className="text-gray-500 text-sm">Students flagged for violations by managers</p>
            </header>

            {/* Summary Stats */}
            <div className="flex items-center gap-4">
                <Card className="flex-1">
                    <CardContent className="p-4">
                        <div className="text-sm text-gray-600">Total Defaulters</div>
                        <div className="text-2xl font-bold text-red-600">{defaulters.length}</div>
                    </CardContent>
                </Card>
                <Card className="flex-1">
                    <CardContent className="p-4">
                        <div className="text-sm text-gray-600">Lost Equipment Cases</div>
                        <div className="text-2xl font-bold text-orange-600">
                            {defaulters.filter(d => d.latest_violation_type === 'lost_equipment').length}
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Defaulters List */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-lg">Flagged Students</CardTitle>
                </CardHeader>
                <CardContent>
                    {defaulters.length === 0 ? (
                        <div className="text-center py-12 text-gray-500">
                            <p className="text-lg font-medium">No defaulter students</p>
                            <p className="text-sm mt-1">All students are in good standing!</p>
                        </div>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Student</TableHead>
                                    <TableHead>Violation Type</TableHead>
                                    <TableHead>Reason / Details</TableHead>
                                    <TableHead>Source</TableHead>
                                    <TableHead>Count</TableHead>
                                    <TableHead>Date</TableHead>
                                    <TableHead className="text-right">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {defaulters.map((student) => {
                                    const vt = VIOLATION_LABELS[student.latest_violation_type] || VIOLATION_LABELS.other
                                    return (
                                        <TableRow key={student.student_id}>
                                            {/* Student info */}
                                            <TableCell>
                                                <div className="space-y-0.5">
                                                    <div className="font-semibold text-gray-900">{student.student_name}</div>
                                                    <div className="text-xs text-gray-500">Roll: {student.student_roll}</div>
                                                    {student.student_email && (
                                                        <div className="text-xs text-gray-400">{student.student_email}</div>
                                                    )}
                                                    {student.student_phone && (
                                                        <a
                                                            href={`tel:${student.student_phone}`}
                                                            className="inline-flex items-center gap-1 text-xs text-[#004d40] hover:underline"
                                                        >
                                                            <Phone className="w-3 h-3" />
                                                            {student.student_phone}
                                                        </a>
                                                    )}
                                                </div>
                                            </TableCell>

                                            {/* Violation type badge */}
                                            <TableCell>
                                                <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-bold whitespace-nowrap ${vt.color}`}>
                                                    {vt.emoji} {vt.label}
                                                </span>
                                            </TableCell>

                                            {/* Reason */}
                                            <TableCell className="max-w-xs">
                                                <div className="text-sm text-gray-700 line-clamp-2">
                                                    {student.latest_reason}
                                                </div>
                                            </TableCell>

                                            {/* Source */}
                                            <TableCell>
                                                <Badge
                                                    variant={student.latest_source === 'system' ? 'info' : 'warning'}
                                                    className="gap-1"
                                                >
                                                    {student.latest_source === 'system' ? (
                                                        <><Bot className="w-3 h-3" /> System</>
                                                    ) : (
                                                        <><User className="w-3 h-3" /> Manager</>
                                                    )}
                                                </Badge>
                                            </TableCell>

                                            {/* Total violations */}
                                            <TableCell>
                                                <span className="inline-flex items-center justify-center w-7 h-7 text-xs font-bold text-red-700 bg-red-100 rounded-full">
                                                    {student.total_violations}
                                                </span>
                                            </TableCell>

                                            {/* Date */}
                                            <TableCell className="text-sm text-gray-600 whitespace-nowrap">
                                                {format(new Date(student.latest_date), 'MMM d, yyyy')}
                                            </TableCell>

                                            {/* Actions */}
                                            <TableCell className="text-right">
                                                <form action={handleRemoveStudent.bind(null, student.student_id)}>
                                                    <Button
                                                        type="submit"
                                                        variant="ghost"
                                                        size="sm"
                                                        className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                                        title="Clear all violations for this student"
                                                    >
                                                        <X className="w-4 h-4" />
                                                    </Button>
                                                </form>
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
