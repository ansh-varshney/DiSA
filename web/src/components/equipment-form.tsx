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
import { createEquipment, updateEquipment, deleteEquipment } from '@/actions/admin'
import { useRouter } from 'next/navigation'
import { Upload, X, Image as ImageIcon } from 'lucide-react'

interface Equipment {
    id: string
    equipment_id?: string | null
    name: string
    sport: string
    condition: string | null
    vendor_name?: string | null
    cost?: string | number | null
    purchase_date?: string | null
    expected_lifespan_days?: number | null
    total_usage_count?: number | null
    pictures?: string[] | null
    notes?: string | null
}

interface EquipmentFormProps {
    mode: 'create' | 'edit' | 'delete'
    equipment?: Equipment
    sport: string
    children: React.ReactNode
}

export function EquipmentForm({ mode, equipment, sport, children }: EquipmentFormProps) {
    const [open, setOpen] = useState(false)
    const [loading, setLoading] = useState(false)
    const [selectedFiles, setSelectedFiles] = useState<File[]>([])
    const [previewUrls, setPreviewUrls] = useState<string[]>(equipment?.pictures || [])
    const router = useRouter()

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || [])

        // Validate files
        const maxFiles = 5
        const totalFiles = selectedFiles.length + previewUrls.length + files.length

        if (totalFiles > maxFiles) {
            alert(`Maximum ${maxFiles} images allowed`)
            return
        }

        // Validate each file
        for (const file of files) {
            if (!['image/jpeg', 'image/jpg', 'image/png', 'image/webp'].includes(file.type)) {
                alert(`${file.name}: Only JPEG, PNG, and WebP images are allowed`)
                return
            }
            if (file.size > 5 * 1024 * 1024) {
                alert(`${file.name}: File too large. Maximum 5MB per image`)
                return
            }
        }

        // Add files and create previews
        setSelectedFiles((prev) => [...prev, ...files])

        files.forEach((file) => {
            const reader = new FileReader()
            reader.onloadend = () => {
                setPreviewUrls((prev) => [...prev, reader.result as string])
            }
            reader.readAsDataURL(file)
        })
    }

    const removeImage = (index: number) => {
        // If it's a new file (not yet uploaded)
        if (index >= (equipment?.pictures?.length || 0)) {
            const fileIndex = index - (equipment?.pictures?.length || 0)
            setSelectedFiles((prev) => prev.filter((_, i) => i !== fileIndex))
        }
        setPreviewUrls((prev) => prev.filter((_, i) => i !== index))
    }

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault()
        setLoading(true)

        try {
            const formData = new FormData(e.currentTarget)

            // Add sport to formData
            formData.append('sport', sport)

            // Add selected image files
            selectedFiles.forEach((file) => {
                formData.append('images', file)
            })

            // For edit mode, include existing image URLs that weren't removed
            if (mode === 'edit' && equipment) {
                const existingUrls = previewUrls.filter((url) => equipment.pictures?.includes(url))
                formData.append('existingImages', JSON.stringify(existingUrls))
            }

            if (mode === 'create') {
                await createEquipment(formData)
            } else if (mode === 'edit' && equipment) {
                await updateEquipment(equipment.id, formData)
            } else if (mode === 'delete' && equipment) {
                await deleteEquipment(equipment.id)
            }

            setOpen(false)
            setSelectedFiles([])
            setPreviewUrls([])
            router.refresh()
        } catch (error) {
            console.error('Error:', error)
            alert(error instanceof Error ? error.message : 'An error occurred')
        } finally {
            setLoading(false)
        }
    }

    const handleOpenChange = (newOpen: boolean) => {
        setOpen(newOpen)
        if (!newOpen) {
            // Reset on close
            setSelectedFiles([])
            setPreviewUrls(equipment?.pictures || [])
        }
    }

    if (mode === 'delete') {
        return (
            <>
                <div onClick={() => setOpen(true)}>{children}</div>
                <Dialog open={open} onOpenChange={handleOpenChange}>
                    <DialogContent className="max-w-md">
                        <DialogHeader>
                            <DialogTitle>Delete Equipment</DialogTitle>
                            <DialogClose onClose={() => setOpen(false)} />
                        </DialogHeader>
                        <DialogBody>
                            <p className="text-gray-600">
                                Are you sure you want to delete <strong>{equipment?.name}</strong>?
                                This action cannot be undone.
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
            <Dialog open={open} onOpenChange={handleOpenChange}>
                <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                    <form onSubmit={handleSubmit}>
                        <DialogHeader>
                            <DialogTitle>
                                {mode === 'create' ? `Add Equipment (${sport})` : 'Edit Equipment'}
                            </DialogTitle>
                            <DialogClose onClose={() => setOpen(false)} />
                        </DialogHeader>
                        <DialogBody>
                            <div className="space-y-4">
                                {/* Equipment ID (Auto-generated) */}
                                <div>
                                    <label
                                        htmlFor="equipment_id"
                                        className="block text-sm font-semibold text-gray-900 mb-1"
                                    >
                                        Equipment ID (Auto-generated)
                                    </label>
                                    <input
                                        type="text"
                                        id="equipment_id"
                                        value={equipment?.equipment_id || 'Will be generated'}
                                        disabled
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-700 font-medium cursor-not-allowed"
                                    />
                                </div>

                                {/* Equipment Name */}
                                <div>
                                    <label
                                        htmlFor="name"
                                        className="block text-sm font-semibold text-gray-900 mb-1"
                                    >
                                        Equipment Name *
                                    </label>
                                    <input
                                        type="text"
                                        id="name"
                                        name="name"
                                        required
                                        defaultValue={equipment?.name}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#004d40] text-gray-900 font-medium"
                                        placeholder="e.g., Cosco Racket #1"
                                    />
                                </div>

                                {/* Condition */}
                                <div>
                                    <label
                                        htmlFor="condition"
                                        className="block text-sm font-semibold text-gray-900 mb-1"
                                    >
                                        Condition *
                                    </label>
                                    <select
                                        id="condition"
                                        name="condition"
                                        required
                                        defaultValue={equipment?.condition || 'good'}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#004d40] text-gray-900 font-medium"
                                    >
                                        <option value="good">Good</option>
                                        <option value="minor_damage">Minor Damage</option>
                                        <option value="damaged">Damaged</option>
                                        <option value="lost">Lost</option>
                                    </select>
                                </div>

                                {/* Vendor Name */}
                                <div>
                                    <label
                                        htmlFor="vendor_name"
                                        className="block text-sm font-semibold text-gray-900 mb-1"
                                    >
                                        Vendor Name *
                                    </label>
                                    <input
                                        type="text"
                                        id="vendor_name"
                                        name="vendor_name"
                                        required
                                        defaultValue={equipment?.vendor_name ?? undefined}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#004d40] text-gray-900 font-medium"
                                        placeholder="e.g., Sports Inc."
                                    />
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    {/* Cost */}
                                    <div>
                                        <label
                                            htmlFor="cost"
                                            className="block text-sm font-semibold text-gray-900 mb-1"
                                        >
                                            Cost (₹) *
                                        </label>
                                        <input
                                            type="number"
                                            id="cost"
                                            name="cost"
                                            required
                                            step="0.01"
                                            min="0"
                                            defaultValue={equipment?.cost != null ? String(equipment.cost) : undefined}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#004d40] text-gray-900 font-medium"
                                            placeholder="0.00"
                                        />
                                    </div>

                                    {/* Purchase Date */}
                                    <div>
                                        <label
                                            htmlFor="purchase_date"
                                            className="block text-sm font-semibold text-gray-900 mb-1"
                                        >
                                            Purchase Date *
                                        </label>
                                        <input
                                            type="date"
                                            id="purchase_date"
                                            name="purchase_date"
                                            required
                                            max={new Date().toISOString().split('T')[0]}
                                            defaultValue={equipment?.purchase_date ?? undefined}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#004d40] text-gray-900 font-medium"
                                        />
                                    </div>
                                </div>

                                {/* Image Upload */}
                                <div>
                                    <label className="block text-sm font-semibold text-gray-900 mb-2">
                                        Pictures (Max 5)
                                    </label>

                                    {/* Image Previews */}
                                    {previewUrls.length > 0 && (
                                        <div className="grid grid-cols-3 gap-2 mb-3">
                                            {previewUrls.map((url, index) => (
                                                <div key={index} className="relative group">
                                                    <img
                                                        src={url}
                                                        alt={`Preview ${index + 1}`}
                                                        className="w-full h-24 object-cover rounded-lg border"
                                                    />
                                                    <button
                                                        type="button"
                                                        onClick={() => removeImage(index)}
                                                        className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                                                    >
                                                        <X className="w-3 h-3" />
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {/* File Input */}
                                    {previewUrls.length < 5 && (
                                        <label className="flex items-center justify-center w-full h-24 px-4 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-[#004d40] transition-colors">
                                            <div className="text-center">
                                                <Upload className="w-6 h-6 mx-auto mb-1 text-gray-400" />
                                                <span className="text-sm font-medium text-gray-700">
                                                    Click to upload ({previewUrls.length}/5)
                                                </span>
                                                <input
                                                    type="file"
                                                    accept="image/jpeg,image/jpg,image/png,image/webp"
                                                    multiple
                                                    onChange={handleFileSelect}
                                                    className="hidden"
                                                />
                                            </div>
                                        </label>
                                    )}
                                    <p className="text-xs text-gray-700 mt-1">
                                        Supported: JPEG, PNG, WebP (Max 5MB each)
                                    </p>
                                </div>

                                {/* Notes */}
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
                                        rows={4}
                                        defaultValue={equipment?.notes || ''}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#004d40] resize-none text-gray-900 font-medium"
                                        placeholder="Add any additional notes or information..."
                                    />
                                </div>

                                {/* Read-only fields display */}
                                {mode === 'edit' && (
                                    <div className="grid grid-cols-2 gap-4 p-3 bg-gray-50 rounded-lg">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-500 mb-1">
                                                Usage Count (Read-only)
                                            </label>
                                            <p className="text-lg font-semibold text-gray-900">
                                                {equipment?.total_usage_count || 0}
                                            </p>
                                            <p className="text-xs text-gray-500">
                                                Synced from bookings
                                            </p>
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-500 mb-1">
                                                Lifespan (Read-only)
                                            </label>
                                            <p className="text-lg font-semibold text-gray-900">
                                                N/A
                                            </p>
                                            <p className="text-xs text-gray-500">
                                                Synced from ratings
                                            </p>
                                        </div>
                                    </div>
                                )}
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
