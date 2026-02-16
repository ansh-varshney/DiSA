import { getCourtsList } from '@/actions/admin'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Plus } from 'lucide-react'
import { format } from 'date-fns'
import { CourtForm } from '@/components/court-form'

export default async function CourtsManagement({ searchParams }: { searchParams: { sport?: string } }) {
    const sport = searchParams.sport || 'all'
    const courts = await getCourtsList(sport)

    const conditionVariants: Record<string, "success" | "warning" | "danger" | "info"> = {
        excellent: 'success',
        good: 'info',
        needs_maintenance: 'warning'
    }

    return (
        <div className="p-6 space-y-6">
            <header className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Court Management</h1>
                    <p className="text-gray-500 text-sm">Manage all sports courts and facilities</p>
                </div>
                <CourtForm mode="create">
                    <Button className="bg-[#004d40] hover:bg-[#004d40]/90">
                        <Plus className="w-4 h-4 mr-2" />
                        Add Court
                    </Button>
                </CourtForm>
            </header>

            {/* Filters */}
            <div className="flex items-center gap-3">
                <label htmlFor="sport-filter" className="text-sm font-medium text-gray-700">
                    Filter by Sport:
                </label>
                <select
                    id="sport-filter"
                    defaultValue={sport}
                    onChange={(e) => window.location.href = `/admin/courts?sport=${e.target.value}`}
                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#004d40] focus:border-transparent"
                >
                    <option value="all">All Sports</option>
                    <option value="badminton">Badminton</option>
                    <option value="tennis">Tennis</option>
                    <option value="basketball">Basketball</option>
                    <option value="football">Football</option>
                </select>
            </div>

            {/* Courts Table */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-lg">Courts List ({courts.length})</CardTitle>
                </CardHeader>
                <CardContent>
                    {courts.length === 0 ? (
                        <div className="text-center py-12 text-gray-500">
                            <p>No courts found.</p>
                            <CourtForm mode="create">
                                <Button variant="outline" className="mt-4">
                                    <Plus className="w-4 h-4 mr-2" />
                                    Add First Court
                                </Button>
                            </CourtForm>
                        </div>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Court Name</TableHead>
                                    <TableHead>Sport</TableHead>
                                    <TableHead>Type</TableHead>
                                    <TableHead>Condition</TableHead>
                                    <TableHead>Capacity</TableHead>
                                    <TableHead>Usage</TableHead>
                                    <TableHead>Last Maintenance</TableHead>
                                    <TableHead className="text-right">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {courts.map((court) => (
                                    <TableRow key={court.id}>
                                        <TableCell className="font-medium">{court.name}</TableCell>
                                        <TableCell className="capitalize">{court.sport}</TableCell>
                                        <TableCell className="text-gray-600">{court.type || '-'}</TableCell>
                                        <TableCell>
                                            <Badge variant={conditionVariants[court.condition || 'good'] || 'info'}>
                                                {court.condition?.replace('_', ' ') || 'Good'}
                                            </Badge>
                                        </TableCell>
                                        <TableCell>{court.capacity} players</TableCell>
                                        <TableCell className="text-gray-600">{court.usage_count || 0} bookings</TableCell>
                                        <TableCell className="text-gray-600">
                                            {court.last_maintenance_date
                                                ? format(new Date(court.last_maintenance_date), 'MMM d, yyyy')
                                                : '-'}
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <div className="flex items-center justify-end gap-2">
                                                <CourtForm mode="edit" court={court}>
                                                    <Button variant="outline" size="sm">
                                                        Edit
                                                    </Button>
                                                </CourtForm>
                                                <CourtForm mode="delete" court={court}>
                                                    <Button variant="destructive" size="sm">
                                                        Remove
                                                    </Button>
                                                </CourtForm>
                                            </div>
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
