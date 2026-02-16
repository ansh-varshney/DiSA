'use client'

import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogClose, DialogBody, DialogFooter } from './ui/dialog'
import { Button } from './ui/button'
import { createCourt, updateCourt, deleteCourt } from '@/actions/admin'
import { useRouter } from 'next/navigation'

interface Court {
    id: string
    name: string
    sport: string
    type?: string
    capacity: number
    condition?: string
    maintenance_notes?: string
    last_maintenance_date?: string
}

interface CourtFormProps {
    mode: 'create' | 'edit' | 'delete'
    court?: Court
    children: React.ReactNode
}

export function CourtForm({ mode, court, children }: CourtFormProps) {
    const [open, setOpen] = useState(false)
    const [loading, setLoading] = useState(false)
    const router = useRouter()

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault()
        setLoading(true)

        try {
            const formData = new FormData(e.currentTarget)

            if (mode === 'create') {
                await createCourt(formData)
            } else if (mode === 'edit' && court) {
                await updateCourt(court.id, formData)
            } else if (mode === 'delete' && court) {
                await deleteCourt(court.id)
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
                            <DialogTitle>Remove Court</DialogTitle>
                            <DialogClose onClose={() => setOpen(false)} />
                        </DialogHeader>
                        <DialogBody>
                            <p className="text-gray-600">
                                Are you sure you want to remove <strong>{court?.name}</strong>? This will mark it as inactive.
                            </p>
                        </DialogBody>
                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={loading}>
                                Cancel
                            </Button>
                            <form onSubmit={handleSubmit}>
                                <Button type="submit" variant="destructive" disabled={loading}>
                                    {loading ? 'Removing...' : 'Remove'}
                                </Button>
                            </form>
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
                <DialogContent className="max-w-2xl">
                    <form onSubmit={handleSubmit}>
                        <DialogHeader>
                            <DialogTitle>{mode === 'create' ? 'Add Court' : 'Edit Court'}</DialogTitle>
                            <DialogClose onClose={() => setOpen(false)} />
                        </DialogHeader>
                        <DialogBody>
                            <div className="space-y-4">
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
                                            Court Name *
                                        </label>
                                        <input
                                            type="text"
                                            id="name"
                                            name="name"
                                            required
                                            defaultValue={court?.name}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#004d40]"
                                            placeholder="e.g., Badminton Court 1"
                                        />
                                    </div>

                                    <div>
                                        <label htmlFor="sport" className="block text-sm font-medium text-gray-700 mb-1">
                                            Sport *
                                        </label>
                                        <select
                                            id="sport"
                                            name="sport"
                                            required
                                            defaultValue={court?.sport}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#004d40]"
                                        >
                                            <option value="">Select Sport</option>
                                            <option value="badminton">Badminton</option>
                                            <option value="tennis">Tennis</option>
                                            <option value="basketball">Basketball</option>
                                            <option value="football">Football</option>
                                        </select>
                                    </div>
                                </div>

                                <div className="grid grid-cols-3 gap-4">
                                    <div>
                                        <label htmlFor="type" className="block text-sm font-medium text-gray-700 mb-1">
                                            Court Type
                                        </label>
                                        <input
                                            type="text"
                                            id="type"
                                            name="type"
                                            defaultValue={court?.type}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#004d40]"
                                            placeholder="e.g., Synthetic"
                                        />
                                    </div>

                                    <div>
                                        <label htmlFor="capacity" className="block text-sm font-medium text-gray-700 mb-1">
                                            Capacity *
                                        </label>
                                        <input
                                            type="number"
                                            id="capacity"
                                            name="capacity"
                                            required
                                            min="1"
                                            defaultValue={court?.capacity || 4}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#004d40]"
                                        />
                                    </div>

                                    <div>
                                        <label htmlFor="condition" className="block text-sm font-medium text-gray-700 mb-1">
                                            Condition *
                                        </label>
                                        <select
                                            id="condition"
                                            name="condition"
                                            required
                                            defaultValue={court?.condition || 'good'}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#004d40]"
                                        >
                                            <option value="excellent">Excellent</option>
                                            <option value="good">Good</option>
                                            <option value="needs_maintenance">Needs Maintenance</option>
                                        </select>
                                    </div>
                                </div>

                                <div>
                                    <label htmlFor="last_maintenance_date" className="block text-sm font-medium text-gray-700 mb-1">
                                        Last Maintenance Date
                                    </label>
                                    <input
                                        type="date"
                                        id="last_maintenance_date"
                                        name="last_maintenance_date"
                                        defaultValue={court?.last_maintenance_date}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#004d40]"
                                    />
                                </div>

                                <div>
                                    <label htmlFor="maintenance_notes" className="block text-sm font-medium text-gray-700 mb-1">
                                        Maintenance Notes
                                    </label>
                                    <textarea
                                        id="maintenance_notes"
                                        name="maintenance_notes"
                                        rows={3}
                                        defaultValue={court?.maintenance_notes}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#004d40]"
                                        placeholder="e.g., Floor resurfaced"
                                    />
                                </div>
                            </div>
                        </DialogBody>
                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={loading}>
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
