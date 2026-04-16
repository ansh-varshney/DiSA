import { getCourtsList } from '@/actions/admin'
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
import { Button } from '@/components/ui/button'
import { Plus, Pencil, Trash2, Dribbble } from 'lucide-react'
import { CourtForm } from '@/components/court-form'
import { SportFilter } from '@/components/sport-filter'
import { ImageGallery } from '@/components/image-gallery'

export default async function CourtsManagement({
    searchParams,
}: {
    searchParams: Promise<{ sport?: string }>
}) {
    const params = await searchParams
    const sport = params.sport || ''

    // Only fetch courts if sport is selected
    const courts = sport && sport !== 'all' ? await getCourtsList(sport) : []

    const conditionVariants: Record<string, 'success' | 'warning' | 'danger'> = {
        good: 'success',
        minor_damage: 'warning',
        damaged: 'danger',
    }

    return (
        <div className="p-6 space-y-6">
            <header className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Court Management</h1>
                    <p className="text-gray-500 text-sm">Manage all sports courts and facilities</p>
                </div>
                {sport && sport !== 'all' && (
                    <CourtForm mode="create" sport={sport}>
                        <Button className="bg-[#004d40] hover:bg-[#004d40]/90">
                            <Plus className="w-4 h-4 mr-2" />
                            Add Court
                        </Button>
                    </CourtForm>
                )}
            </header>

            {/* Filters */}
            <SportFilter />

            {/* No Sport Selected State */}
            {!sport || sport === 'all' ? (
                <Card>
                    <CardContent className="p-12">
                        <div className="text-center space-y-3">
                            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto">
                                <Dribbble className="w-8 h-8 text-gray-400" />
                            </div>
                            <h3 className="text-lg font-semibold text-gray-900">
                                Please Select a Sport
                            </h3>
                            <p className="text-gray-500 text-sm max-w-md mx-auto">
                                Choose a sport from the dropdown above to view and manage courts for
                                that sport.
                            </p>
                        </div>
                    </CardContent>
                </Card>
            ) : (
                /* Courts Table */
                <Card>
                    <CardHeader>
                        <CardTitle className="text-lg font-bold text-gray-900">
                            Courts List ({courts.length})
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        {courts.length === 0 ? (
                            <div className="text-center py-12 text-gray-500">
                                <p>No courts found for {sport}.</p>
                                <CourtForm mode="create" sport={sport}>
                                    <Button variant="outline" className="mt-4">
                                        <Plus className="w-4 h-4 mr-2" />
                                        Add First Court
                                    </Button>
                                </CourtForm>
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead className="font-semibold">ID/Name</TableHead>
                                            <TableHead className="font-semibold">
                                                Condition
                                            </TableHead>
                                            <TableHead className="font-semibold">
                                                Usage Count
                                            </TableHead>
                                            <TableHead className="font-semibold">
                                                Pictures
                                            </TableHead>
                                            <TableHead className="font-semibold">
                                                Maintenance Info
                                            </TableHead>
                                            <TableHead className="font-semibold">Notes</TableHead>
                                            <TableHead className="text-right font-semibold">
                                                Actions
                                            </TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {courts.map((court) => (
                                            <TableRow key={court.id}>
                                                <TableCell>
                                                    <div>
                                                        <div className="font-semibold text-gray-900">
                                                            {court.court_id || 'N/A'}
                                                        </div>
                                                        <div className="text-sm text-gray-600">
                                                            {court.name}
                                                        </div>
                                                    </div>
                                                </TableCell>
                                                <TableCell>
                                                    <Badge
                                                        variant={
                                                            conditionVariants[court.condition] ||
                                                            'default'
                                                        }
                                                    >
                                                        {court.condition.replace('_', ' ')}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell>
                                                    <span className="inline-flex items-center px-2 py-1 bg-blue-50 text-blue-700 rounded text-sm font-medium">
                                                        {court.usage_count || 0}
                                                    </span>
                                                </TableCell>
                                                <TableCell>
                                                    {court.pictures && court.pictures.length > 0 ? (
                                                        <ImageGallery
                                                            images={court.pictures}
                                                            equipmentName={court.name}
                                                        >
                                                            <button className="text-sm text-blue-600 hover:text-blue-800 font-medium underline">
                                                                {court.pictures.length} image
                                                                {court.pictures.length > 1
                                                                    ? 's'
                                                                    : ''}
                                                            </button>
                                                        </ImageGallery>
                                                    ) : (
                                                        <span className="text-xs text-gray-400">
                                                            None
                                                        </span>
                                                    )}
                                                </TableCell>
                                                <TableCell>
                                                    <div className="text-sm">
                                                        <div className="text-gray-900 font-medium">
                                                            Repaired:{' '}
                                                            {court.last_maintenance_date
                                                                ? new Date(
                                                                      court.last_maintenance_date
                                                                  ).toLocaleDateString()
                                                                : 'N/A'}
                                                        </div>
                                                        <div className="text-gray-600">
                                                            Checked:{' '}
                                                            {court.next_check_date
                                                                ? new Date(
                                                                      court.next_check_date
                                                                  ).toLocaleDateString()
                                                                : 'N/A'}
                                                        </div>
                                                    </div>
                                                </TableCell>
                                                <TableCell className="max-w-xs truncate text-sm text-gray-900">
                                                    {court.notes || '-'}
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    <div className="flex items-center justify-end gap-2">
                                                        <CourtForm
                                                            mode="edit"
                                                            court={court}
                                                            sport={sport}
                                                        >
                                                            <Button variant="ghost" size="sm">
                                                                <Pencil className="w-4 h-4" />
                                                            </Button>
                                                        </CourtForm>
                                                        <CourtForm
                                                            mode="delete"
                                                            court={court}
                                                            sport={sport}
                                                        >
                                                            <Button
                                                                variant="ghost"
                                                                size="sm"
                                                                className="text-red-600 hover:text-red-700"
                                                            >
                                                                <Trash2 className="w-4 h-4" />
                                                            </Button>
                                                        </CourtForm>
                                                    </div>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>
                        )}
                    </CardContent>
                </Card>
            )}
        </div>
    )
}
