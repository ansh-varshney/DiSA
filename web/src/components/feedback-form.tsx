'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { MessageSquare, Send, CheckCircle } from 'lucide-react'
import { submitFeedback } from '@/actions/bookings'

export function FeedbackForm() {
    const [title, setTitle] = useState('')
    const [description, setDescription] = useState('')
    const [category, setCategory] = useState('feedback')
    const [loading, setLoading] = useState(false)
    const [submitted, setSubmitted] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setError(null)
        setLoading(true)
        const result = await submitFeedback(title, description, category)
        setLoading(false)
        if (result.error) {
            setError(result.error)
        } else {
            setSubmitted(true)
            setTitle('')
            setDescription('')
            setCategory('feedback')
        }
    }

    if (submitted) {
        return (
            <div className="flex flex-col items-center justify-center p-6 text-center space-y-2">
                <CheckCircle className="w-10 h-10 text-green-500" />
                <p className="font-semibold text-green-700">Submitted successfully!</p>
                <p className="text-sm text-gray-500">Our team will review your message soon.</p>
                <button
                    onClick={() => setSubmitted(false)}
                    className="text-sm text-[#004d40] font-medium mt-2 underline underline-offset-2"
                >
                    Submit another
                </button>
            </div>
        )
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            {/* Category */}
            <div className="flex gap-2">
                {(['feedback', 'complaint'] as const).map((cat) => (
                    <button
                        key={cat}
                        type="button"
                        onClick={() => setCategory(cat)}
                        className={`flex-1 py-2 text-sm font-semibold rounded-lg border transition-all capitalize ${
                            category === cat
                                ? 'bg-[#004d40] text-white border-[#004d40]'
                                : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
                        }`}
                    >
                        {cat}
                    </button>
                ))}
            </div>

            {/* Title */}
            <input
                type="text"
                placeholder="Subject"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#004d40] focus:border-transparent"
            />

            {/* Description */}
            <textarea
                placeholder="Describe your feedback or complaint in detail..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                required
                rows={4}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#004d40] focus:border-transparent resize-none"
            />

            {error && <p className="text-sm text-red-600 bg-red-50 p-2 rounded-lg">{error}</p>}

            <Button
                type="submit"
                disabled={loading || !title.trim() || !description.trim()}
                className="w-full bg-[#004d40] hover:bg-[#004d40]/90 font-semibold gap-2"
            >
                <Send className="w-4 h-4" />
                {loading ? 'Submitting…' : 'Submit'}
            </Button>
        </form>
    )
}
