'use client'

import { useSearchParams } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import {
    loginWithGoogle,
    signInWithPhone,
    verifyOtp,
    loginWithEmail,
    signUpWithEmail,
} from './actions'
import { ShieldCheck, ArrowLeft, Loader2 } from 'lucide-react'
import Link from 'next/link'
import { BRANCHES, YEARS, GENDERS } from '@/lib/profile-options'

export function LoginForm() {
    const searchParams = useSearchParams()
    const role = searchParams.get('role') || 'student'

    // Auth Method State
    const [authMethod, setAuthMethod] = useState<'email' | 'phone'>('email')
    const [isSignUp, setIsSignUp] = useState(false)

    // Phone States
    const [phone, setPhone] = useState('')
    const [otp, setOtp] = useState('')
    const [step, setStep] = useState<'phone' | 'otp'>('phone')

    // Common States
    const [isPending, startTransition] = useTransition()
    const [error, setError] = useState<string | null>(null)

    const handleGoogleLogin = async () => {
        startTransition(async () => {
            await loginWithGoogle(role)
        })
    }

    const handleEmailSubmit = async (formData: FormData) => {
        setError(null)
        startTransition(async () => {
            if (isSignUp) {
                const result = await signUpWithEmail(null, formData)
                if (result?.error) setError(result.error)
            } else {
                const result = await loginWithEmail(null, formData)
                if (result?.error) setError(result.error)
            }
        })
    }

    const handlePhoneSubmit = async (formData: FormData) => {
        setError(null)
        startTransition(async () => {
            const result = await signInWithPhone(null, formData)
            if (result?.error) {
                setError(result.error)
            } else if (result?.success) {
                setStep('otp')
            }
        })
    }

    const handleOtpSubmit = async (formData: FormData) => {
        setError(null)
        startTransition(async () => {
            const result = await verifyOtp(null, formData)
            if (result?.error) {
                setError(result.error)
            }
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
                    {isSignUp
                        ? 'Create an account to get started'
                        : 'Sign in to access your account'}
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                {/* Method Switcher */}
                <div className="flex border rounded-md p-1 mb-4">
                    <button
                        onClick={() => setAuthMethod('email')}
                        className={`flex-1 py-1.5 text-sm font-medium rounded-sm transition-all ${authMethod === 'email' ? 'bg-white shadow text-black' : 'text-gray-500 hover:text-gray-900'}`}
                    >
                        Email
                    </button>
                    <button
                        onClick={() => setAuthMethod('phone')}
                        className={`flex-1 py-1.5 text-sm font-medium rounded-sm transition-all ${authMethod === 'phone' ? 'bg-white shadow text-black' : 'text-gray-500 hover:text-gray-900'}`}
                    >
                        Phone
                    </button>
                </div>

                {authMethod === 'email' ? (
                    <form
                        key={isSignUp ? 'email-signup' : 'email-signin'}
                        action={handleEmailSubmit}
                        className="space-y-4"
                    >
                        <input type="hidden" name="role" value={role} />
                        {isSignUp && (
                            <div className="space-y-2">
                                <Input
                                    name="fullName"
                                    type="text"
                                    placeholder="Full Name"
                                    required
                                    className="h-11"
                                />
                                <select
                                    name="branch"
                                    required
                                    defaultValue=""
                                    className="w-full h-11 border border-input rounded-md px-3 text-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                                >
                                    <option value="" disabled>
                                        Select Branch
                                    </option>
                                    {BRANCHES.map((b) => (
                                        <option key={b} value={b}>
                                            {b}
                                        </option>
                                    ))}
                                </select>
                                <select
                                    name="year"
                                    required
                                    defaultValue=""
                                    className="w-full h-11 border border-input rounded-md px-3 text-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                                >
                                    <option value="" disabled>
                                        Select Academic Year
                                    </option>
                                    {YEARS.map((y) => (
                                        <option key={y} value={y}>
                                            {y}
                                        </option>
                                    ))}
                                </select>
                                <div className="flex gap-3">
                                    {GENDERS.map((g) => (
                                        <label
                                            key={g}
                                            className="flex-1 flex items-center justify-center gap-2 h-11 border border-input rounded-md cursor-pointer hover:border-[#004d40] has-[:checked]:border-[#004d40] has-[:checked]:bg-[#004d40]/5 transition-colors"
                                        >
                                            <input
                                                type="radio"
                                                name="gender"
                                                value={g}
                                                required
                                                className="accent-[#004d40]"
                                            />
                                            <span className="text-sm font-medium text-gray-900">
                                                {g}
                                            </span>
                                        </label>
                                    ))}
                                </div>
                            </div>
                        )}
                        <Input
                            name="email"
                            type="email"
                            placeholder="Email@example.com"
                            required
                            className="h-11"
                        />
                        <Input
                            name="password"
                            type="password"
                            placeholder="Password"
                            required
                            className="h-11"
                        />

                        {error && <p className="text-sm text-red-500">{error}</p>}

                        <Button type="submit" className="w-full bg-[#004d40]" disabled={isPending}>
                            {isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                            {isSignUp ? 'Create Account' : 'Sign In'}
                        </Button>

                        <p
                            className="text-center text-xs text-gray-500 mt-4 cursor-pointer hover:underline"
                            onClick={() => setIsSignUp(!isSignUp)}
                        >
                            {isSignUp
                                ? 'Already have an account? Sign In'
                                : "Don't have an account? Sign Up"}
                        </p>

                        <div className="relative my-4">
                            <div className="absolute inset-0 flex items-center">
                                <span className="w-full border-t" />
                            </div>
                            <div className="relative flex justify-center text-xs uppercase">
                                <span className="bg-white px-2 text-muted-foreground">
                                    Or continue with
                                </span>
                            </div>
                        </div>

                        <Button
                            type="button"
                            onClick={handleGoogleLogin}
                            variant="outline"
                            className="w-full h-11"
                            disabled={isPending}
                        >
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
                            Google
                        </Button>
                    </form>
                ) : step === 'phone' ? (
                    <form key="phone" action={handlePhoneSubmit} className="space-y-4">
                        <input type="hidden" name="role" value={role} />
                        <div className="space-y-2">
                            <Input
                                name="phone"
                                type="tel"
                                placeholder="+91 99999 99999"
                                required
                                className="h-11"
                                value={phone}
                                onChange={(e) => setPhone(e.target.value)}
                            />
                        </div>
                        {error && <p className="text-sm text-red-500">{error}</p>}
                        <Button type="submit" className="w-full bg-[#004d40]" disabled={isPending}>
                            {isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                            Send OTP
                        </Button>
                    </form>
                ) : (
                    <form key="otp" action={handleOtpSubmit} className="space-y-4">
                        <input type="hidden" name="phone" value={phone} />
                        <div className="space-y-2">
                            <Input
                                name="token"
                                type="text"
                                placeholder="Enter 6-digit OTP"
                                required
                                className="h-11 text-center tracking-widest text-lg"
                                maxLength={6}
                                value={otp}
                                onChange={(e) => setOtp(e.target.value)}
                            />
                        </div>
                        {error && <p className="text-sm text-red-500">{error}</p>}
                        <Button type="submit" className="w-full bg-[#004d40]" disabled={isPending}>
                            {isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                            Verify & Login
                        </Button>
                        <Button
                            type="button"
                            variant="ghost"
                            className="w-full"
                            onClick={() => setStep('phone')}
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
