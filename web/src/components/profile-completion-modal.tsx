'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, UserCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { updateStudentProfile } from '@/actions/profile'
import { BRANCHES, YEARS, GENDERS } from '@/lib/profile-options'

export function ProfileCompletionModal() {
    const router = useRouter()
    const [isPending, startTransition] = useTransition()
    const [error, setError] = useState<string | null>(null)

    const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault()
        setError(null)
        const formData = new FormData(e.currentTarget)
        startTransition(async () => {
            const result = await updateStudentProfile(formData)
            if (result?.error) {
                setError(result.error)
            } else {
                // Refresh server components — layout will re-check profile and remove this modal
                router.refresh()
            }
        })
    }

    return (
        /* Backdrop — pointer-events-none on children not needed since there's no close button */
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-5">
                {/* Header */}
                <div className="text-center space-y-2">
                    <div className="mx-auto w-12 h-12 bg-[#004d40]/10 rounded-xl flex items-center justify-center">
                        <UserCircle className="w-6 h-6 text-[#004d40]" />
                    </div>
                    <h2 className="text-xl font-bold text-gray-900">Complete Your Profile</h2>
                    <p className="text-sm text-gray-500">
                        Please fill in these details to continue. This is a one-time step.
                    </p>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} className="space-y-4">
                    {/* Phone Number */}
                    <div className="space-y-1.5">
                        <label className="block text-sm font-medium text-gray-700">
                            Phone Number <span className="text-red-500">*</span>
                        </label>
                        <input
                            name="phone_number"
                            type="tel"
                            placeholder="+91 99999 99999"
                            required
                            className="w-full h-11 border border-gray-300 rounded-lg px-3 text-sm bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#004d40]"
                        />
                    </div>

                    {/* Branch */}
                    <div className="space-y-1.5">
                        <label className="block text-sm font-medium text-gray-700">
                            Branch <span className="text-red-500">*</span>
                        </label>
                        <select
                            name="branch"
                            required
                            defaultValue=""
                            className="w-full h-11 border border-gray-300 rounded-lg px-3 text-sm bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#004d40]"
                        >
                            <option value="" disabled>
                                Select your branch
                            </option>
                            {BRANCHES.map((b) => (
                                <option key={b} value={b}>
                                    {b}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Academic Year */}
                    <div className="space-y-1.5">
                        <label className="block text-sm font-medium text-gray-700">
                            Academic Year <span className="text-red-500">*</span>
                        </label>
                        <select
                            name="year"
                            required
                            defaultValue=""
                            className="w-full h-11 border border-gray-300 rounded-lg px-3 text-sm bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#004d40]"
                        >
                            <option value="" disabled>
                                Select your year
                            </option>
                            {YEARS.map((y) => (
                                <option key={y} value={y}>
                                    {y}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Gender */}
                    <div className="space-y-1.5">
                        <label className="block text-sm font-medium text-gray-700">
                            Gender <span className="text-red-500">*</span>
                        </label>
                        <div className="flex gap-3">
                            {GENDERS.map((g) => (
                                <label
                                    key={g}
                                    className="flex-1 flex items-center justify-center gap-2 h-11 border border-gray-300 rounded-lg cursor-pointer hover:border-[#004d40] has-[:checked]:border-[#004d40] has-[:checked]:bg-[#004d40]/5 transition-colors"
                                >
                                    <input
                                        type="radio"
                                        name="gender"
                                        value={g}
                                        required
                                        className="accent-[#004d40]"
                                    />
                                    <span className="text-sm font-medium text-gray-700">{g}</span>
                                </label>
                            ))}
                        </div>
                    </div>

                    {error && (
                        <p className="text-sm text-red-500 bg-red-50 p-2 rounded-lg">{error}</p>
                    )}

                    <Button
                        type="submit"
                        className="w-full h-11 bg-[#004d40] hover:bg-[#004d40]/90 text-white font-semibold"
                        disabled={isPending}
                    >
                        {isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                        Save & Continue
                    </Button>
                </form>
            </div>
        </div>
    )
}
