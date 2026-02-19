'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Star, Loader2, CheckCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { rateStudents } from '@/actions/manager'

interface Player {
    id: string
    full_name: string
    student_id: string
    is_booker: boolean
}

interface RateStudentsScreenProps {
    bookingId: string
    players: Player[]
    onComplete: () => void
}

export function RateStudentsScreen({ bookingId, players, onComplete }: RateStudentsScreenProps) {
    const router = useRouter()
    const [ratings, setRatings] = useState<Record<string, number>>({})
    const [loading, setLoading] = useState(false)
    const [submitted, setSubmitted] = useState(false)

    const setRating = (playerId: string, rating: number) => {
        setRatings(prev => ({ ...prev, [playerId]: rating }))
    }

    const allRated = players.every(p => ratings[p.id] && ratings[p.id] > 0)

    const handleSubmit = async () => {
        if (!allRated) {
            alert('Please rate all students before submitting')
            return
        }

        setLoading(true)
        try {
            const ratingsArray = Object.entries(ratings).map(([studentId, rating]) => ({
                studentId,
                rating
            }))
            const result = await rateStudents(bookingId, ratingsArray)
            if (result.error) {
                alert(result.error)
            } else {
                setSubmitted(true)
                setTimeout(() => {
                    onComplete()
                    router.push('/manager')
                }, 1500)
            }
        } catch (e) {
            console.error(e)
            alert('Something went wrong')
        } finally {
            setLoading(false)
        }
    }

    if (submitted) {
        return (
            <div className="flex flex-col items-center justify-center p-12 space-y-4 animate-in fade-in zoom-in">
                <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center">
                    <CheckCircle className="w-10 h-10 text-green-600" />
                </div>
                <h2 className="text-xl font-bold text-gray-800">Ratings Submitted!</h2>
                <p className="text-gray-500 text-sm">Session complete. Redirecting...</p>
            </div>
        )
    }

    return (
        <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4">
            <Card>
                <CardHeader className="bg-yellow-50 border-b border-yellow-100 py-4">
                    <CardTitle className="flex items-center gap-2 text-yellow-800 text-lg">
                        <Star className="w-5 h-5 fill-yellow-500 text-yellow-500" />
                        Rate Students
                    </CardTitle>
                    <p className="text-sm text-yellow-700 mt-1">
                        Rate each student's conduct during the session (mandatory)
                    </p>
                </CardHeader>
                <CardContent className="p-4 space-y-4">
                    {players.map(player => (
                        <div
                            key={player.id}
                            className={cn(
                                "p-4 rounded-xl border transition-all",
                                ratings[player.id]
                                    ? "border-yellow-200 bg-yellow-50/50"
                                    : "border-gray-200"
                            )}
                        >
                            <div className="flex items-center justify-between mb-3">
                                <div>
                                    <h3 className="font-bold text-gray-800 flex items-center gap-2">
                                        {player.full_name}
                                        {player.is_booker && (
                                            <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">
                                                BOOKER
                                            </span>
                                        )}
                                    </h3>
                                    <p className="text-xs text-gray-500">ID: {player.student_id}</p>
                                </div>
                                {ratings[player.id] && (
                                    <span className="text-sm font-bold text-yellow-700">
                                        {ratings[player.id]}★
                                    </span>
                                )}
                            </div>

                            {/* Star Rating */}
                            <div className="flex gap-1">
                                {[1, 2, 3, 4, 5].map(star => (
                                    <button
                                        key={star}
                                        onClick={() => setRating(player.id, star)}
                                        className="p-1 transition-transform hover:scale-110 active:scale-95"
                                    >
                                        <Star
                                            className={cn(
                                                "w-8 h-8 transition-colors",
                                                star <= (ratings[player.id] || 0)
                                                    ? "fill-yellow-400 text-yellow-400"
                                                    : "text-gray-300"
                                            )}
                                        />
                                    </button>
                                ))}
                            </div>
                        </div>
                    ))}
                </CardContent>
            </Card>

            <Button
                className="w-full h-14 text-lg font-bold bg-[#004d40] hover:bg-[#003d33] text-white shadow-lg"
                onClick={handleSubmit}
                disabled={loading || !allRated}
            >
                {loading ? (
                    <Loader2 className="w-6 h-6 animate-spin mr-2" />
                ) : (
                    <>
                        <CheckCircle className="w-5 h-5 mr-2" />
                        Submit Ratings & Complete Session
                    </>
                )}
            </Button>

            {!allRated && (
                <p className="text-center text-xs text-gray-400">
                    Rate all {players.length} students to continue
                </p>
            )}
        </div>
    )
}
