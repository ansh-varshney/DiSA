import { getEquipmentList } from '@/actions/admin'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import Link from 'next/link'
import { EquipmentForm } from '@/components/equipment-form'

export default async function EquipmentManagement({ searchParams }: { searchParams: { sport?: string } }) {
    const sport = searchParams.sport || 'all'
    const equipment = await getEquipmentList(sport)

    const conditionVariants: Record<string, "success" | "warning" | "danger"> = {
        good: 'success',
        minor_damage: 'warning',
        damaged: 'danger',
        lost: 'danger'
    }

    return (
        <div className="p-6 space-y-6">
            <header className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Equipment Management</h1>
                    <p className="text-gray-500 text-sm">Track and manage sports equipment inventory</p>
                </div>
                <EquipmentForm mode="create">
                    <Button className="bg-[#004d40] hover:bg-[#004d40]/90">
                        <Plus className="w-4 h-4 mr-2" />
                        Add Equipment
                    </Button>
                </EquipmentForm>
            </header>

            {/* Filters */}
            <div className="flex items-center gap-3">
                <label htmlFor="sport-filter" className="text-sm font-medium text-gray-700">
                    Filter by Sport:
                </label>
                <select
                    id="sport-filter"
                    defaultValue={sport}
                    onChange={(e) => window.location.href = `/admin/equipment?sport=${e.target.value}`}
                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#004d40] focus:border-transparent"
                >
                    <option value="all">All Sports</option>
                    <option value="badminton">Badminton</option>
                    <option value="tennis">Tennis</option>
                    <option value="basketball">Basketball</option>
                    <option value="football">Football</option>
                </select>
            </div>

            {/* Equipment Table */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-lg">Equipment Inventory ({equipment.length})</CardTitle>
                </CardHeader>
                <CardContent>
                    {equipment.length === 0 ? (
                        <div className="text-center py-12 text-gray-500">
                            <p>No equipment found for this filter.</p>
                            <EquipmentForm mode="create">
                                <Button variant="outline" className="mt-4">
                                    <Plus className="w-4 h-4 mr-2" />
                                    Add First Equipment
                                </Button>
                            </EquipmentForm>
                        </div>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Name</TableHead>
                                    <TableHead>Sport</TableHead>
                                    <TableHead>Condition</TableHead>
                                    <TableHead>Usage Count</TableHead>
                                    <TableHead>Vendor</TableHead>
                                    <TableHead>Cost</TableHead>
                                    <TableHead>Lifespan (days)</TableHead>
                                    <TableHead className="text-right">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {equipment.map((item) => (
                                    <TableRow key={item.id}>
                                        <TableCell className="font-medium">{item.name}</TableCell>
                                        <TableCell className="capitalize">{item.sport}</TableCell>
                                        <TableCell>
                                            <Badge variant={conditionVariants[item.condition] || 'default'}>
                                                {item.condition.replace('_', ' ')}
                                            </Badge>
                                        </TableCell>
                                        <TableCell>{item.total_usage_count || 0}</TableCell>
                                        <TableCell className="text-gray-600">{item.vendor_name || '-'}</TableCell>
                                        <TableCell className="text-gray-600">
                                            {item.cost ? `$${item.cost.toFixed(2)}` : '-'}
                                        </TableCell>
                                        <TableCell className="text-gray-600">{item.expected_lifespan_days || '-'}</TableCell>
                                        <TableCell className="text-right">
                                            <div className="flex items-center justify-end gap-2">
                                                <EquipmentForm mode="edit" equipment={item}>
                                                    <Button variant="ghost" size="sm">
                                                        <Pencil className="w-4 h-4" />
                                                    </Button>
                                                </EquipmentForm>
                                                <EquipmentForm mode="delete" equipment={item}>
                                                    <Button variant="ghost" size="sm" className="text-red-600 hover:text-red-700">
                                                        <Trash2 className="w-4 h-4" />
                                                    </Button>
                                                </EquipmentForm>
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
