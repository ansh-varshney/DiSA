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
import { createCourt, updateCourt, deleteCourt } from '@/actions/admin'
import { useRouter } from 'next/navigation'
import { Upload, X } from 'lucide-react'

interface Court {
    id: string
    court_id?: string | null
    name: string
    sport: string
    condition: string | null
    usage_count?: number | null
    pictures?: string[] | null
    last_maintenance_date?: string | null
    next_check_date?: string | null
    notes?: string | null
}

interface CourtFormProps {
    mode: 'create' | 'edit' | 'delete'
    court?: Court
    sport: string
    children: React.ReactNode
}

export function CourtForm({ mode, court, sport, children }: CourtFormProps) {
    const [open, setOpen] = useState(false)
    const [loading, setLoading] = useState(false)
    const [selectedFiles, setSelectedFiles] = useState<File[]>([])
    const [previewUrls, setPreviewUrls] = useState<string[]>(court?.pictures || [])
    const router = useRouter()

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || [])

        // Validate total count
        if (previewUrls.length + files.length > 5) {
            alert('Maximum 5 images allowed')
            return
        }

        // Validate each file
        for (const file of files) {
            const maxSize = 5 * 1024 * 1024 // 5MB
            const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']

            if (!allowedTypes.includes(file.type)) {
                alert(`${file.name}: Invalid file type. Only JPEG, PNG, and WebP are allowed.`)
                return
            }
            if (file.size > maxSize) {
                alert(`${file.name}: File too large. Maximum size is 5MB.`)
                return
            }
        }

        setSelectedFiles((prev) => [...prev, ...files])

        // Create preview URLs
        files.forEach((file) => {
            const reader = new FileReader()
            reader.onloadend = () => {
                setPreviewUrls((prev) => [...prev, reader.result as string])
            }
            reader.readAsDataURL(file)
        })
    }

    const removeImage = (index: number) => {
        if (index < (court?.pictures?.length || 0)) {
            // Removing existing image
            setPreviewUrls((prev) => prev.filter((_, i) => i !== index))
        } else {
            // Removing newly selected file
            const newFileIndex = index - (court?.pictures?.length || 0)
            setSelectedFiles((prev) => prev.filter((_, i) => i !== newFileIndex))
            setPreviewUrls((prev) => prev.filter((_, i) => i !== index))
        }
    }

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault()
        setLoading(true)

        try {
            const formData = new FormData(e.currentTarget)
            formData.append('sport', sport)

            // For edit mode, send existing images that weren't removed
            if (mode === 'edit') {
                const existingImages = previewUrls.filter((url) => court?.pictures?.includes(url))
                formData.append('existingImages', JSON.stringify(existingImages))
            }

            // Add new image files
            selectedFiles.forEach((file) => {
                formData.append('images', file)
            })

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
                            <DialogTitle>Delete Court</DialogTitle>
                            <DialogClose onClose={() => setOpen(false)} />
                        </DialogHeader>
                        <DialogBody>
                            <p className="text-gray-600">
                                Are you sure you want to delete <strong>{court?.name}</strong>? This
                                action cannot be undone.
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
                <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                    <form onSubmit={handleSubmit}>
                        <DialogHeader>
                            <DialogTitle>
                                {mode === 'create' ? `Add Court (${sport})` : 'Edit Court'}
                            </DialogTitle>
                            <DialogClose onClose={() => setOpen(false)} />
                        </DialogHeader>
                        <DialogBody>
                            <div className="space-y-4">
                                {/* Court ID (Auto-generated) */}
                                <div>
                                    <label
                                        htmlFor="court_id"
                                        className="block text-sm font-semibold text-gray-900 mb-1"
                                    >
                                        Court ID (Auto-generated)
                                    </label>
                                    <input
                                        type="text"
                                        id="court_id"
                                        value={court?.court_id || 'Will be generated'}
                                        disabled
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-700 font-medium cursor-not-allowed"
                                    />
                                </div>

                                {/* Court Name */}
                                <div>
                                    <label
                                        htmlFor="name"
                                        className="block text-sm font-semibold text-gray-900 mb-1"
                                    >
                                        Court Name *
                                    </label>
                                    <input
                                        type="text"
                                        id="name"
                                        name="name"
                                        required
                                        defaultValue={court?.name}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#004d40] text-gray-900 font-medium"
                                        placeholder="e.g., Main Court"
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
                                        defaultValue={court?.condition || 'good'}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#004d40] text-gray-900 font-medium"
                                    >
                                        <option value="good">Good</option>
                                        <option value="minor_damage">Minor Damage</option>
                                        <option value="damaged">Damaged</option>
                                    </select>
                                </div>

                                {/* Maintenance Dates */}
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label
                                            htmlFor="last_maintenance_date"
                                            className="block text-sm font-semibold text-gray-900 mb-1"
                                        >
                                            Last Repaired
                                        </label>
                                        <input
                                            type="date"
                                            id="last_maintenance_date"
                                            name="last_maintenance_date"
                                            max={new Date().toISOString().split('T')[0]}
                                            defaultValue={court?.last_maintenance_date ?? undefined}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#004d40] text-gray-900 font-medium"
                                        />
                                    </div>

                                    <div>
                                        <label
                                            htmlFor="next_check_date"
                                            className="block text-sm font-semibold text-gray-900 mb-1"
                                        >
                                            Last Checked
                                        </label>
                                        <input
                                            type="date"
                                            id="next_check_date"
                                            name="next_check_date"
                                            max={new Date().toISOString().split('T')[0]}
                                            defaultValue={court?.next_check_date ?? undefined}
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
                                        <div className="grid grid-cols-5 gap-2 mb-3">
                                            {previewUrls.map((url, index) => (
                                                <div key={index} className="relative aspect-square">
                                                    <img
                                                        src={url}
                                                        alt={`Preview ${index + 1}`}
                                                        className="w-full h-full object-cover rounded-lg border border-gray-300"
                                                    />
                                                    <button
                                                        type="button"
                                                        onClick={() => removeImage(index)}
                                                        className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 hover:bg-red-600"
                                                    >
                                                        <X className="w-3 h-3" />
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {/* Upload Button */}
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
                                        defaultValue={court?.notes ?? undefined}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#004d40] resize-none text-gray-900 font-medium"
                                        placeholder="Additional notes about this court..."
                                    />
                                </div>

                                {/* Read-only Usage Count */}
                                {mode === 'edit' && (
                                    <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                                        <div className="grid grid-cols-1 gap-3">
                                            <div>
                                                <label className="block text-sm font-medium text-gray-500 mb-1">
                                                    Usage Count (Read-only)
                                                </label>
                                                <p className="text-lg font-semibold text-gray-900">
                                                    {court?.usage_count || 0} bookings
                                                </p>
                                                <p className="text-xs text-gray-500">
                                                    Auto-tracked from bookings
                                                </p>
                                            </div>
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
