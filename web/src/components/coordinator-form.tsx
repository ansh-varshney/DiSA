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
import { createCoordinator, updateCoordinator, deleteCoordinator } from '@/actions/admin'
import { useRouter } from 'next/navigation'
import { SPORTS_LIST } from '@/lib/sports'

interface Coordinator {
    id: string
    name: string
    role: string
    sport: string
    email?: string | null
    phone?: string | null
    notes?: string | null
}

interface CoordinatorFormProps {
    mode: 'create' | 'edit' | 'delete'
    coordinator?: Coordinator
    children: React.ReactNode
}

export function CoordinatorForm({ mode, coordinator, children }: CoordinatorFormProps) {
    const [open, setOpen] = useState(false)
    const [loading, setLoading] = useState(false)
    const router = useRouter()

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault()
        setLoading(true)

        try {
            const formData = new FormData(e.currentTarget)

            if (mode === 'create') {
                await createCoordinator(formData)
            } else if (mode === 'edit' && coordinator) {
                await updateCoordinator(coordinator.id, formData)
            } else if (mode === 'delete' && coordinator) {
                await deleteCoordinator(coordinator.id)
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
                            <DialogTitle>Delete Coordinator</DialogTitle>
                            <DialogClose onClose={() => setOpen(false)} />
                        </DialogHeader>
                        <DialogBody>
                            <p className="text-gray-600">
                                Are you sure you want to delete <strong>{coordinator?.name}</strong>
                                ?
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
                            <form onSubmit={handleSubmit}>
                                <Button type="submit" variant="destructive" disabled={loading}>
                                    {loading ? 'Deleting...' : 'Delete'}
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
                <DialogContent className="max-w-lg">
                    <form onSubmit={handleSubmit}>
                        <DialogHeader>
                            <DialogTitle>
                                {mode === 'create' ? 'Add Coordinator' : 'Edit Coordinator'}
                            </DialogTitle>
                            <DialogClose onClose={() => setOpen(false)} />
                        </DialogHeader>
                        <DialogBody>
                            <div className="space-y-4">
                                <div>
                                    <label
                                        htmlFor="name"
                                        className="block text-sm font-semibold text-gray-900 mb-1"
                                    >
                                        Full Name *
                                    </label>
                                    <input
                                        type="text"
                                        id="name"
                                        name="name"
                                        required
                                        defaultValue={coordinator?.name}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#004d40] text-gray-900 font-medium"
                                        placeholder="e.g., John Smith"
                                    />
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label
                                            htmlFor="role"
                                            className="block text-sm font-semibold text-gray-900 mb-1"
                                        >
                                            Role *
                                        </label>
                                        <select
                                            id="role"
                                            name="role"
                                            required
                                            defaultValue={coordinator?.role}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#004d40] text-gray-900 font-medium"
                                        >
                                            <option value="">Select Role</option>
                                            <option value="Coach">Coach</option>
                                            <option value="Assistant Coach">Assistant Coach</option>
                                            <option value="Team Captain">Team Captain</option>
                                            <option value="Trainer">Trainer</option>
                                        </select>
                                    </div>

                                    <div>
                                        <label
                                            htmlFor="sport"
                                            className="block text-sm font-semibold text-gray-900 mb-1"
                                        >
                                            Sport *
                                        </label>
                                        <select
                                            id="sport"
                                            name="sport"
                                            required
                                            defaultValue={coordinator?.sport}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#004d40] text-gray-900 font-medium"
                                        >
                                            <option value="">Select Sport</option>
                                            {SPORTS_LIST.map((s) => (
                                                <option key={s} value={s}>
                                                    {s.charAt(0).toUpperCase() + s.slice(1)}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label
                                            htmlFor="email"
                                            className="block text-sm font-semibold text-gray-900 mb-1"
                                        >
                                            Email
                                        </label>
                                        <input
                                            type="email"
                                            id="email"
                                            name="email"
                                            defaultValue={coordinator?.email ?? undefined}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#004d40] text-gray-900 font-medium"
                                            placeholder="john@example.com"
                                        />
                                    </div>

                                    <div>
                                        <label
                                            htmlFor="phone"
                                            className="block text-sm font-semibold text-gray-900 mb-1"
                                        >
                                            Phone
                                        </label>
                                        <input
                                            type="tel"
                                            id="phone"
                                            name="phone"
                                            defaultValue={coordinator?.phone ?? undefined}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#004d40] text-gray-900 font-medium"
                                            placeholder="+1 234 567 8900"
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label
                                        htmlFor="notes"
                                        className="block text-sm font-semibold text-gray-900 mb-1"
                                    >
                                        Notes
                                    </label>
                                    <textarea
                                        id="notes"
                                        name="notes"
                                        rows={3}
                                        defaultValue={coordinator?.notes ?? undefined}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#004d40] resize-none text-gray-900 font-medium"
                                        placeholder="Additional information..."
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
