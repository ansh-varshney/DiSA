'use client'

import { useState, useTransition } from 'react'
import { Loader2, Pencil, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { updateStudentProfile } from '@/actions/profile'
import { BRANCHES, YEARS, GENDERS } from '@/lib/profile-options'

interface Props {
    current: { branch: string | null; year: string | null; gender: string | null }
}

export function ProfileEditForm({ current }: Props) {
    const [editing, setEditing] = useState(false)
    const [isPending, startTransition] = useTransition()
    const [error, setError] = useState<string | null>(null)
    const [saved, setSaved] = useState(false)

    const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault()
        setError(null)
        const formData = new FormData(e.currentTarget)
        startTransition(async () => {
            const result = await updateStudentProfile(formData)
            if (result?.error) {
                setError(result.error)
            } else {
                setSaved(true)
                setEditing(false)
                setTimeout(() => setSaved(false), 3000)
            }
        })
    }

    if (!editing) {
        return (
            <div className="space-y-3">
                <div className="grid grid-cols-3 gap-3 text-sm">
                    <div className="bg-gray-50 rounded-lg p-3">
                        <p className="text-xs text-gray-400 mb-0.5">Branch</p>
                        <p className="font-semibold text-gray-900">{current.branch || '—'}</p>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-3">
                        <p className="text-xs text-gray-400 mb-0.5">Year</p>
                        <p className="font-semibold text-gray-900">{current.year || '—'}</p>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-3">
                        <p className="text-xs text-gray-400 mb-0.5">Gender</p>
                        <p className="font-semibold text-gray-900">{current.gender || '—'}</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setEditing(true)}
                        className="gap-1.5"
                    >
                        <Pencil className="w-3.5 h-3.5" />
                        Edit
                    </Button>
                    {saved && (
                        <span className="flex items-center gap-1 text-sm text-green-600">
                            <Check className="w-4 h-4" /> Saved!
                        </span>
                    )}
                </div>
            </div>
        )
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="space-y-1">
                    <label className="text-xs font-medium text-gray-600">Branch</label>
                    <select
                        name="branch"
                        required
                        defaultValue={current.branch || ''}
                        className="w-full h-10 border border-gray-300 rounded-lg px-3 text-sm bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#004d40]"
                    >
                        <option value="" disabled>Select</option>
                        {BRANCHES.map(b => <option key={b} value={b}>{b}</option>)}
                    </select>
                </div>
                <div className="space-y-1">
                    <label className="text-xs font-medium text-gray-600">Year</label>
                    <select
                        name="year"
                        required
                        defaultValue={current.year || ''}
                        className="w-full h-10 border border-gray-300 rounded-lg px-3 text-sm bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#004d40]"
                    >
                        <option value="" disabled>Select</option>
                        {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
                    </select>
                </div>
                <div className="space-y-1">
                    <label className="text-xs font-medium text-gray-600">Gender</label>
                    <select
                        name="gender"
                        required
                        defaultValue={current.gender || ''}
                        className="w-full h-10 border border-gray-300 rounded-lg px-3 text-sm bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#004d40]"
                    >
                        <option value="" disabled>Select</option>
                        {GENDERS.map(g => <option key={g} value={g}>{g}</option>)}
                    </select>
                </div>
            </div>

            {error && <p className="text-sm text-red-500">{error}</p>}

            <div className="flex gap-2">
                <Button
                    type="submit"
                    size="sm"
                    className="bg-[#004d40] hover:bg-[#004d40]/90"
                    disabled={isPending}
                >
                    {isPending && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
                    Save
                </Button>
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setEditing(false)}
                    disabled={isPending}
                >
                    Cancel
                </Button>
            </div>
        </form>
    )
}
