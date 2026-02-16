'use client'

import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogClose, DialogBody, DialogFooter } from './ui/dialog'
import { Button } from './ui/button'
import { createEquipment, updateEquipment, deleteEquipment } from '@/actions/admin'
import { useRouter } from 'next/navigation'

interface Equipment {
    id: string
    name: string
    sport: string
    condition: string
    vendor_name?: string
    cost?: number
    purchase_date?: string
    expected_lifespan_days?: number
}

interface EquipmentFormProps {
    mode: 'create' | 'edit' | 'delete'
    equipment?: Equipment
    children: React.ReactNode
}

export function EquipmentForm({ mode, equipment, children }: EquipmentFormProps) {
    const [open, setOpen] = useState(false)
    const [loading, setLoading] = useState(false)
    const router = useRouter()

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault()
        setLoading(true)

        try {
            const formData = new FormData(e.currentTarget)

            if (mode === 'create') {
                await createEquipment(formData)
            } else if (mode === 'edit' && equipment) {
                await updateEquipment(equipment.id, formData)
            } else if (mode === 'delete' && equipment) {
                await deleteEquipment(equipment.id)
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
                            <DialogTitle>Delete Equipment</DialogTitle>
                            <DialogClose onClose={() => setOpen(false)} />
                        </DialogHeader>
                        <DialogBody>
                            <p className="text-gray-600">
                                Are you sure you want to delete <strong>{equipment?.name}</strong>? This action cannot be undone.
                            </p>
                        </DialogBody>
                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={loading}>
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
                            <DialogTitle>{mode === 'create' ? 'Add Equipment' : 'Edit Equipment'}</DialogTitle>
                            <DialogClose onClose={() => setOpen(false)} />
                        </DialogHeader>
                        <DialogBody>
                            <div className="space-y-4">
                                <div>
                                    <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
                                        Equipment Name *
                                    </label>
                                    <input
                                        type="text"
                                        id="name"
                                        name="name"
                                        required
                                        defaultValue={equipment?.name}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#004d40]"
                                        placeholder="e.g., Basketball #12"
                                    />
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label htmlFor="sport" className="block text-sm font-medium text-gray-700 mb-1">
                                            Sport *
                                        </label>
                                        <select
                                            id="sport"
                                            name="sport"
                                            required
                                            defaultValue={equipment?.sport}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#004d40]"
                                        >
                                            <option value="">Select Sport</option>
                                            <option value="badminton">Badminton</option>
                                            <option value="tennis">Tennis</option>
                                            <option value="basketball">Basketball</option>
                                            <option value="football">Football</option>
                                        </select>
                                    </div>

                                    <div>
                                        <label htmlFor="condition" className="block text-sm font-medium text-gray-700 mb-1">
                                            Condition *
                                        </label>
                                        <select
                                            id="condition"
                                            name="condition"
                                            required
                                            defaultValue={equipment?.condition || 'good'}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#004d40]"
                                        >
                                            <option value="good">Good</option>
                                            <option value="minor_damage">Minor Damage</option>
                                            <option value="damaged">Damaged</option>
                                            <option value="lost">Lost</option>
                                        </select>
                                    </div>
                                </div>

                                <div>
                                    <label htmlFor="vendor_name" className="block text-sm font-medium text-gray-700 mb-1">
                                        Vendor Name
                                    </label>
                                    <input
                                        type="text"
                                        id="vendor_name"
                                        name="vendor_name"
                                        defaultValue={equipment?.vendor_name}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#004d40]"
                                        placeholder="e.g., Sports Inc."
                                    />
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label htmlFor="cost" className="block text-sm font-medium text-gray-700 mb-1">
                                            Cost ($)
                                        </label>
                                        <input
                                            type="number"
                                            id="cost"
                                            name="cost"
                                            step="0.01"
                                            min="0"
                                            defaultValue={equipment?.cost}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#004d40]"
                                            placeholder="0.00"
                                        />
                                    </div>

                                    <div>
                                        <label htmlFor="expected_lifespan_days" className="block text-sm font-medium text-gray-700 mb-1">
                                            Lifespan (days)
                                        </label>
                                        <input
                                            type="number"
                                            id="expected_lifespan_days"
                                            name="expected_lifespan_days"
                                            min="1"
                                            defaultValue={equipment?.expected_lifespan_days || 365}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#004d40]"
                                            placeholder="365"
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label htmlFor="purchase_date" className="block text-sm font-medium text-gray-700 mb-1">
                                        Purchase Date
                                    </label>
                                    <input
                                        type="date"
                                        id="purchase_date"
                                        name="purchase_date"
                                        defaultValue={equipment?.purchase_date}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#004d40]"
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
