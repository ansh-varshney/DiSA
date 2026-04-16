'use client'

import { useState } from 'react'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogClose,
    DialogBody,
    DialogFooter,
} from './ui/dialog'
import { Button } from './ui/button'
import { createAnnouncement, updateAnnouncement, deleteAnnouncement } from '@/actions/admin'
import { useRouter } from 'next/navigation'

interface Announcement {
    id: string
    title: string
    content: string
}

interface AnnouncementFormProps {
    mode: 'create' | 'edit' | 'delete'
    announcement?: Announcement
    children: React.ReactNode
}

export function AnnouncementForm({ mode, announcement, children }: AnnouncementFormProps) {
    const [open, setOpen] = useState(false)
    const [loading, setLoading] = useState(false)
    const [title, setTitle] = useState(announcement?.title || '')
    const [content, setContent] = useState(announcement?.content || '')
    const router = useRouter()

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)

        try {
            if (mode === 'create') {
                await createAnnouncement(title, content)
            } else if (mode === 'edit' && announcement) {
                await updateAnnouncement(announcement.id, title, content)
            } else if (mode === 'delete' && announcement) {
                await deleteAnnouncement(announcement.id)
            }

            setOpen(false)
            router.refresh()
        } catch (error) {
            console.error('Error:', error)
            alert(error instanceof Error ? error.message : 'An error occurred')
        } finally {
            setLoading(false)
        }
    }

    if (mode === 'delete') {
        return (
            <>
                <div onClick={() => setOpen(true)}>{children}</div>
                <Dialog open={open} onOpenChange={setOpen}>
                    <DialogContent className="max-w-md">
                        <DialogHeader>
                            <DialogTitle>Delete Announcement</DialogTitle>
                            <DialogClose onClose={() => setOpen(false)} />
                        </DialogHeader>
                        <DialogBody>
                            <p className="text-gray-600">
                                Are you sure you want to delete{' '}
                                <strong>{announcement?.title}</strong>? This will remove it from the
                                student portal.
                            </p>
                        </DialogBody>
                        <DialogFooter>
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => setOpen(false)}
                                disabled={loading}
                            >
                                Cancel
                            </Button>
                            <Button
                                type="button"
                                variant="destructive"
                                onClick={handleSubmit}
                                disabled={loading}
                            >
                                {loading ? 'Deleting...' : 'Delete'}
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </>
        )
    }

    return (
        <>
            <div onClick={() => setOpen(true)}>{children}</div>
            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent className="max-w-lg">
                    <form onSubmit={handleSubmit}>
                        <DialogHeader>
                            <DialogTitle>
                                {mode === 'create' ? 'New Announcement' : 'Edit Announcement'}
                            </DialogTitle>
                            <DialogClose onClose={() => setOpen(false)} />
                        </DialogHeader>
                        <DialogBody>
                            <div className="space-y-4">
                                <div>
                                    <label
                                        htmlFor="title"
                                        className="block text-sm font-medium text-gray-700 mb-1"
                                    >
                                        Title *
                                    </label>
                                    <input
                                        type="text"
                                        id="title"
                                        value={title}
                                        onChange={(e) => setTitle(e.target.value)}
                                        required
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#004d40] text-gray-900 placeholder:text-gray-500"
                                        placeholder="e.g., Tennis Court Maintenance"
                                    />
                                </div>

                                <div>
                                    <label
                                        htmlFor="content"
                                        className="block text-sm font-medium text-gray-700 mb-1"
                                    >
                                        Content *
                                    </label>
                                    <textarea
                                        id="content"
                                        value={content}
                                        onChange={(e) => setContent(e.target.value)}
                                        required
                                        rows={5}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#004d40] text-gray-900 placeholder:text-gray-500"
                                        placeholder="Write your announcement details..."
                                    />
                                </div>
                            </div>
                        </DialogBody>
                        <DialogFooter>
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => setOpen(false)}
                                disabled={loading}
                            >
                                Cancel
                            </Button>
                            <Button type="submit" disabled={loading}>
                                {loading ? 'Saving...' : mode === 'create' ? 'Create' : 'Update'}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </>
    )
}
