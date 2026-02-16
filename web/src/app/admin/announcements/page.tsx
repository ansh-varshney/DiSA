import { getAnnouncements } from '@/actions/admin'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Plus } from 'lucide-react'
import { format } from 'date-fns'
import { AnnouncementForm } from '@/components/announcement-form'

export default async function AnnouncementsManagement() {
    const announcements = await getAnnouncements()

    return (
        <div className="p-6 space-y-6">
            <header className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Announcements Management</h1>
                    <p className="text-gray-500 text-sm">Manage facility announcements for all students</p>
                </div>
                <AnnouncementForm mode="create">
                    <Button className="bg-[#004d40] hover:bg-[#004d40]/90">
                        <Plus className="w-4 h-4 mr-2" />
                        New Announcement
                    </Button>
                </AnnouncementForm>
            </header>

            {/* Announcements List */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-lg">All Announcements ({announcements.length})</CardTitle>
                </CardHeader>
                <CardContent>
                    {announcements.length === 0 ? (
                        <div className="text-center py-12 text-gray-500">
                            <p>No announcements yet.</p>
                            <AnnouncementForm mode="create">
                                <Button variant="outline" className="mt-4">
                                    <Plus className="w-4 h-4 mr-2" />
                                    Create First Announcement
                                </Button>
                            </AnnouncementForm>
                        </div>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="w-1/4">Title</TableHead>
                                    <TableHead className="w-1/2">Content</TableHead>
                                    <TableHead>Created By</TableHead>
                                    <TableHead>Date</TableHead>
                                    <TableHead className="text-right">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {announcements.map((announcement) => (
                                    <TableRow key={announcement.id}>
                                        <TableCell className="font-medium">{announcement.title}</TableCell>
                                        <TableCell className="text-gray-600">
                                            {announcement.content.length > 100
                                                ? announcement.content.substring(0, 100) + '...'
                                                : announcement.content}
                                        </TableCell>
                                        <TableCell className="text-gray-600">
                                            {announcement.profiles?.full_name || 'Unknown'}
                                        </TableCell>
                                        <TableCell className="text-gray-600">
                                            {format(new Date(announcement.created_at), 'MMM d, yyyy')}
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <div className="flex items-center justify-end gap-2">
                                                <AnnouncementForm mode="edit" announcement={announcement}>
                                                    <Button variant="outline" size="sm">
                                                        Edit
                                                    </Button>
                                                </AnnouncementForm>
                                                <AnnouncementForm mode="delete" announcement={announcement}>
                                                    <Button variant="destructive" size="sm">
                                                        Delete
                                                    </Button>
                                                </AnnouncementForm>
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
