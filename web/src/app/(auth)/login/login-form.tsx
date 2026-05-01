'use client'

import { useSearchParams } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { loginWithGoogle, signInWithPhone, verifyOtp } from './actions'
import { ShieldCheck, ArrowLeft, Loader2 } from 'lucide-react'
import Link from 'next/link'

export function LoginForm() {
    const searchParams = useSearchParams()
    const role = searchParams.get('role') || 'student'

    const [phone, setPhone] = useState('')
    const [otp, setOtp] = useState('')
    const [step, setStep] = useState<'phone' | 'otp'>('phone')

    const [isPending, startTransition] = useTransition()
    const [error, setError] = useState<string | null>(null)

    const handleGoogleLogin = () => {
        startTransition(async () => {
            await loginWithGoogle(role)
        })
    }

    const handlePhoneSubmit = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault()
        setError(null)
        const formData = new FormData(e.currentTarget)
        startTransition(async () => {
            const result = await signInWithPhone(null, formData)
            if (result?.error) {
                setError(result.error)
            } else {
                setStep('otp')
            }
        })
    }

    const handleOtpSubmit = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault()
        setError(null)
        const formData = new FormData(e.currentTarget)
        startTransition(async () => {
            const result = await verifyOtp(null, formData)
            if (result?.error) setError(result.error)
        })
    }

    const roleTitle = role === 'admin' ? 'Admin' : role === 'manager' ? 'Manager' : 'Student'

    return (
        <Card className="w-full max-w-md shadow-lg border-0 bg-white">
            <CardHeader className="text-center pb-6">
                <Link href="/" className="absolute left-6 top-6 text-gray-400 hover:text-gray-600">
                    <ArrowLeft className="w-5 h-5" />
                </Link>
                <div className="mx-auto w-12 h-12 bg-[#004d40]/10 rounded-xl flex items-center justify-center mb-4">
                    <ShieldCheck className="w-6 h-6 text-[#004d40]" />
                </div>
                <CardTitle className="text-xl font-bold text-gray-900">{roleTitle} Login</CardTitle>
                <CardDescription>
                    {role === 'student'
                        ? 'Sign in with your @iiitd.ac.in Google account'
                        : 'Enter your registered phone number to receive an OTP'}
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                {role === 'student' ? (
                    <Button
                        type="button"
                        onClick={handleGoogleLogin}
                        variant="outline"
                        className="w-full h-11"
                        disabled={isPending}
                    >
                        {isPending ? (
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        ) : (
                            <svg className="w-5 h-5 mr-3" viewBox="0 0 24 24">
                                <path
                                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                                    fill="#4285F4"
                                />
                                <path
                                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                                    fill="#34A853"
                                />
                                <path
                                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                                    fill="#FBBC05"
                                />
                                <path
                                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                                    fill="#EA4335"
                                />
                            </svg>
                        )}
                        Continue with Google
                    </Button>
                ) : step === 'phone' ? (
                    <form onSubmit={handlePhoneSubmit} className="space-y-4">
                        <input type="hidden" name="role" value={role} />
                        <Input
                            name="phone"
                            type="tel"
                            placeholder="+91 99999 99999"
                            required
                            className="h-11"
                            value={phone}
                            onChange={(e) => setPhone(e.target.value)}
                        />
                        {error && <p className="text-sm text-red-500">{error}</p>}
                        <Button
                            type="submit"
                            className="w-full h-11 bg-[#004d40]"
                            disabled={isPending}
                        >
                            {isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                            Send OTP
                        </Button>
                    </form>
                ) : (
                    <form onSubmit={handleOtpSubmit} className="space-y-4">
                        <input type="hidden" name="phone" value={phone} />
                        <input type="hidden" name="role" value={role} />
                        <p className="text-sm text-gray-500 text-center">
                            OTP sent to <span className="font-medium text-gray-900">{phone}</span>
                        </p>
                        <Input
                            name="otp"
                            type="text"
                            placeholder="Enter 6-digit OTP"
                            required
                            className="h-11 text-center tracking-widest text-lg"
                            maxLength={6}
                            value={otp}
                            onChange={(e) => setOtp(e.target.value)}
                        />
                        {error && <p className="text-sm text-red-500">{error}</p>}
                        <Button
                            type="submit"
                            className="w-full h-11 bg-[#004d40]"
                            disabled={isPending}
                        >
                            {isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                            Verify & Login
                        </Button>
                        <Button
                            type="button"
                            variant="ghost"
                            className="w-full"
                            onClick={() => {
                                setStep('phone')
                                setError(null)
                            }}
                            disabled={isPending}
                        >
                            Change Phone Number
                        </Button>
                    </form>
                )}
            </CardContent>
        </Card>
    )
}
