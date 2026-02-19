'use client'

import { useState } from 'react'
import { AlertTriangle, Loader2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { reportStudent } from '@/actions/manager'

interface ReportStudentDialogProps {
    bookingId: string
    student: {
        id: string
        full_name: string
        student_id: string
    }
    onClose: () => void
    onSuccess: () => void
}

const REPORT_REASONS = [
    'Late arrival',
    'Misbehavior',
    'Equipment misuse',
    'Violation of rules',
    'Other'
]

export function ReportStudentDialog({ bookingId, student, onClose, onSuccess }: ReportStudentDialogProps) {
    const [selectedReasons, setSelectedReasons] = useState<string[]>([])
    const [details, setDetails] = useState('')
    const [loading, setLoading] = useState(false)

    const toggleReason = (reason: string) => {
        setSelectedReasons(prev =>
            prev.includes(reason) ? prev.filter(r => r !== reason) : [...prev, reason]
        )
    }

    const handleSubmit = async () => {
        if (selectedReasons.length === 0) {
            alert('Please select at least one reason')
            return
        }

        setLoading(true)
        try {
            const result = await reportStudent(bookingId, student.id, selectedReasons, details)
            if (result.error) {
                alert(result.error)
            } else {
                onSuccess()
            }
        } catch (e) {
            console.error(e)
            alert('Something went wrong')
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 animate-in fade-in">
            <Card className="w-full max-w-md max-h-[90vh] overflow-y-auto shadow-2xl">
                <CardHeader className="bg-red-50 border-b border-red-100 flex flex-row items-center justify-between py-4">
                    <CardTitle className="flex items-center gap-2 text-red-700 text-lg">
                        <AlertTriangle className="w-5 h-5" />
                        Report Student
                    </CardTitle>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
                        <X className="w-5 h-5" />
                    </button>
                </CardHeader>
                <CardContent className="p-4 space-y-5">
                    {/* Student Info (Read-Only) */}
                    <div className="bg-gray-50 p-3 rounded-lg">
                        <div className="text-xs font-semibold text-gray-500 uppercase mb-1">Student</div>
                        <div className="font-bold text-gray-800">{student.full_name}</div>
                        <div className="text-sm text-gray-500">ID: {student.student_id}</div>
                    </div>

                    {/* Reason Checkboxes */}
                    <div>
                        <label className="text-sm font-semibold text-gray-700 block mb-2">
                            Reason for Report *
                        </label>
                        <div className="space-y-2">
                            {REPORT_REASONS.map(reason => (
                                <label
                                    key={reason}
                                    className={cn(
                                        "flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all",
                                        selectedReasons.includes(reason)
                                            ? "border-red-300 bg-red-50"
                                            : "border-gray-200 hover:border-gray-300"
                                    )}
                                >
                                    <input
                                        type="checkbox"
                                        checked={selectedReasons.includes(reason)}
                                        onChange={() => toggleReason(reason)}
                                        className="w-4 h-4 rounded border-gray-300 text-red-600 focus:ring-red-500"
                                    />
                                    <span className="text-sm font-medium text-gray-700">{reason}</span>
                                </label>
                            ))}
                        </div>
                    </div>

                    {/* Details */}
                    <div>
                        <label className="text-sm font-semibold text-gray-700 block mb-2">
                            Additional Details
                        </label>
                        <textarea
                            value={details}
                            onChange={(e) => setDetails(e.target.value)}
                            placeholder="Provide additional context..."
                            className="w-full h-24 p-3 border border-gray-200 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
                        />
                    </div>

                    {/* Actions */}
                    <div className="flex gap-3 pt-2">
                        <Button
                            variant="outline"
                            className="flex-1"
                            onClick={onClose}
                            disabled={loading}
                        >
                            Cancel
                        </Button>
                        <Button
                            className="flex-1 bg-red-600 hover:bg-red-700 text-white"
                            onClick={handleSubmit}
                            disabled={loading || selectedReasons.length === 0}
                        >
                            {loading ? (
                                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                            ) : (
                                <AlertTriangle className="w-4 h-4 mr-2" />
                            )}
                            Submit Report
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}
