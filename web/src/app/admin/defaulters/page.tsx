import { getViolations } from '@/actions/admin'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { format } from 'date-fns'

export default async function DefaulterStudents({ searchParams }: { searchParams: { severity?: string } }) {
    const severityFilter = searchParams.severity
    const violations = await getViolations({ severity: severityFilter })

    const severityVariants: Record<string, "info" | "warning" | "danger"> = {
        minor: 'info',
        moderate: 'warning',
        severe: 'danger'
    }

    return (
        <div className="p-6 space-y-6">
            <header>
                <h1 className="text-2xl font-bold text-gray-900">Defaulter Students</h1>
                <p className="text-gray-500 text-sm">Track student violations and warnings</p>
            </header>

            {/* Filters */}
            <div className="flex items-center gap-4">
                <label htmlFor="severity-filter" className="text-sm font-medium text-gray-700">
                    Filter by Severity:
                </label>
                <select
                    id="severity-filter"
                    defaultValue={severityFilter || 'all'}
                    onChange={(e) => window.location.href = `/admin/defaulters?severity=${e.target.value}`}
                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#004d40] focus:border-transparent"
                >
                    <option value="all">All Severities</option>
                    <option value="minor">Minor</option>
                    <option value="moderate">Moderate</option>
                    <option value="severe">Severe</option>
                </select>

                <div className="ml-auto flex gap-2 text-sm">
                    <span className="text-gray-600">Total Violations: <strong>{violations.length}</strong></span>
                </div>
            </div>

            {/* Violations Table */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-lg">Violations List</CardTitle>
                </CardHeader>
                <CardContent>
                    {violations.length === 0 ? (
                        <div className="text-center py-12 text-gray-500">
                            <p>No violations found for this filter.</p>
                        </div>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Student</TableHead>
                                    <TableHead>Violation Type</TableHead>
                                    <TableHead>Severity</TableHead>
                                    <TableHead className="w-96">Reason</TableHead>
                                    <TableHead>Reported By</TableHead>
                                    <TableHead>Points Deducted</TableHead>
                                    <TableHead>Date</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {violations.map((violation) => (
                                    <TableRow key={violation.id}>
                                        <TableCell>
                                            <div>
                                                <div className="font-medium">
                                                    {violation.profiles?.full_name || 'Unknown'}
                                                </div>
                                                <div className="text-xs text-gray-500">
                                                    {violation.profiles?.student_id || '-'}
                                                </div>
                                            </div>
                                        </TableCell>
                                        <TableCell className="font-medium capitalize">
                                            {violation.violation_type.replace('_', ' ')}
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant={severityVariants[violation.severity] || 'info'}>
                                                {violation.severity}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="text-gray-600 text-sm">
                                            {violation.reason}
                                        </TableCell>
                                        <TableCell className="text-gray-600">
                                            {violation.reported_by_profile?.full_name || 'System'}
                                        </TableCell>
                                        <TableCell className="text-red-600 font-semibold">
                                            -{violation.points_deducted || 0}
                                        </TableCell>
                                        <TableCell className="text-gray-600 text-sm">
                                            {format(new Date(violation.created_at), 'MMM d, yyyy')}
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
