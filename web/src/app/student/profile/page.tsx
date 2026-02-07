import { createClient } from '@/utils/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export default async function ProfilePage() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user?.id)
        .single()

    return (
        <div className="p-6 space-y-6">
            <h1 className="text-2xl font-bold">My Profile</h1>

            <Card>
                <CardContent className="p-6 space-y-4">
                    <div className="flex items-center space-x-4">
                        <div className="w-16 h-16 bg-gray-200 rounded-full flex items-center justify-center text-2xl font-bold text-gray-500">
                            {profile?.full_name?.[0] || 'U'}
                        </div>
                        <div>
                            <h2 className="text-xl font-bold">{profile?.full_name}</h2>
                            <p className="text-gray-500">{profile?.email}</p>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 mt-6">
                        <div className="bg-gray-50 p-4 rounded-lg">
                            <p className="text-sm text-gray-500">Points</p>
                            <p className="text-2xl font-bold text-[#004d40]">{profile?.points || 0}</p>
                        </div>
                        <div className="bg-gray-50 p-4 rounded-lg">
                            <p className="text-sm text-gray-500">Role</p>
                            <p className="text-xl font-medium capitalize">{profile?.role}</p>
                        </div>
                    </div>
                </CardContent>
            </Card>

            <Card className="border-red-100 bg-red-50">
                <CardHeader>
                    <CardTitle className="text-red-700 text-lg">Warnings & Violations</CardTitle>
                </CardHeader>
                <CardContent>
                    <p className="text-sm text-red-600">No active warnings. Keep up the good sportsmanship!</p>
                </CardContent>
            </Card>
        </div>
    )
}
