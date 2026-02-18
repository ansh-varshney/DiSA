import { getDefaulterStudents, removeStudentFromDefaulters } from '@/actions/admin'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { X, Bot, User } from 'lucide-react'
import { format } from 'date-fns'

async function handleRemoveStudent(studentId: string) {
    'use server'
    await removeStudentFromDefaulters(studentId)
}

export default async function DefaulterStudents() {
    const defaulters = await getDefaulterStudents()

    return (
        <div className="p-6 space-y-6">
            <header>
                <h1 className="text-2xl font-bold text-gray-900">Defaulter Students</h1>
                <p className="text-gray-500 text-sm">Students flagged for violations</p>
            </header>

            {/* Summary Stats */}
            <div className="flex items-center gap-4">
                <Card className="flex-1">
                    <CardContent className="p-4">
                        <div className="text-sm text-gray-600">Total Defaulters</div>
                        <div className="text-2xl font-bold text-red-600">{defaulters.length}</div>
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
                                    <TableHead>Flagging Reason</TableHead>
                                    <TableHead>Source</TableHead>
                                    <TableHead>Violations</TableHead>
                                    <TableHead>Latest Date</TableHead>
                                    <TableHead className="text-right">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {defaulters.map((student) => (
                                    <TableRow key={student.student_id}>
                                        <TableCell>
                                            <div>
                                                <div className="font-medium text-gray-900">
                                                    {student.student_name}
                                                </div>
                                                <div className="text-xs text-gray-500">
                                                    {student.student_roll}
                                                </div>
                                            </div>
                                        </TableCell>
                                        <TableCell className="max-w-md">
                                            <div className="text-sm text-gray-700 truncate">
                                                {student.latest_reason}
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <Badge
                                                variant={student.latest_source === 'system' ? 'info' : 'warning'}
                                                className="gap-1"
                                            >
                                                {student.latest_source === 'system' ? (
                                                    <>
                                                        <Bot className="w-3 h-3" />
                                                        System
                                                    </>
                                                ) : (
                                                    <>
                                                        <User className="w-3 h-3" />
                                                        Manager
                                                    </>
                                                )}
                                            </Badge>
                                        </TableCell>
                                        <TableCell>
                                            <span className="inline-flex items-center justify-center px-2 py-1 text-xs font-semibold text-red-700 bg-red-100 rounded-full">
                                                {student.total_violations}
                                            </span>
                                        </TableCell>
                                        <TableCell className="text-sm text-gray-600">
                                            {format(new Date(student.latest_date), 'MMM d, yyyy')}
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <form action={handleRemoveStudent.bind(null, student.student_id)}>
                                                <Button
                                                    type="submit"
                                                    variant="ghost"
                                                    size="sm"
                                                    className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                                    title="Remove from defaulters"
                                                >
                                                    <X className="w-4 h-4" />
                                                </Button>
                                            </form>
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
