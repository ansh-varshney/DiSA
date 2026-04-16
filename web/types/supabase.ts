export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
    public: {
        Tables: {
            profiles: {
                Row: {
                    id: string
                    email: string | null
                    full_name: string | null
                    role: 'student' | 'manager' | 'admin'
                    phone_number: string | null
                    avatar_url: string | null
                    student_id: string | null
                    branch: string | null
                    points: number
                    is_eligible_for_consecutive: boolean
                    created_at: string
                }
                Insert: {
                    id: string
                    email?: string | null
                    full_name?: string | null
                    role?: 'student' | 'manager' | 'admin'
                    phone_number?: string | null
                    avatar_url?: string | null
                    student_id?: string | null
                    branch?: string | null
                    points?: number
                    is_eligible_for_consecutive?: boolean
                    created_at?: string
                }
                Update: {
                    id?: string
                    email?: string | null
                    full_name?: string | null
                    role?: 'student' | 'manager' | 'admin'
                    phone_number?: string | null
                    avatar_url?: string | null
                    student_id?: string | null
                    branch?: string | null
                    points?: number
                    is_eligible_for_consecutive?: boolean
                    created_at?: string
                }
            }
            courts: {
                Row: {
                    id: string
                    name: string
                    sport: string
                    type: string | null
                    capacity: number
                    is_active: boolean
                    maintenance_notes: string | null
                    created_at: string
                }
                Insert: {
                    id?: string
                    name: string
                    sport: string
                    type?: string | null
                    capacity?: number
                    is_active?: boolean
                    maintenance_notes?: string | null
                    created_at?: string
                }
                Update: {
                    id?: string
                    name?: string
                    sport?: string
                    type?: string | null
                    capacity?: number
                    is_active?: boolean
                    maintenance_notes?: string | null
                    created_at?: string
                }
            }
            equipment: {
                Row: {
                    id: string
                    name: string
                    sport: string
                    condition: 'good' | 'minor_damage' | 'damaged' | 'lost'
                    is_available: boolean
                    total_usage_count: number
                    created_at: string
                }
                Insert: {
                    id?: string
                    name: string
                    sport: string
                    condition?: 'good' | 'minor_damage' | 'damaged' | 'lost'
                    is_available?: boolean
                    total_usage_count?: number
                    created_at?: string
                }
                Update: {
                    id?: string
                    name?: string
                    sport?: string
                    condition?: 'good' | 'minor_damage' | 'damaged' | 'lost'
                    is_available?: boolean
                    total_usage_count?: number
                    created_at?: string
                }
            }
            bookings: {
                Row: {
                    id: string
                    user_id: string
                    court_id: string
                    start_time: string
                    end_time: string
                    status:
                        | 'pending_confirmation'
                        | 'confirmed'
                        | 'waiting_manager'
                        | 'active'
                        | 'completed'
                        | 'cancelled'
                        | 'rejected'
                    players_list: Json | null
                    equipment_ids: string[] | null
                    created_at: string
                }
                Insert: {
                    id?: string
                    user_id: string
                    court_id: string
                    start_time: string
                    end_time: string
                    status?:
                        | 'pending_confirmation'
                        | 'confirmed'
                        | 'waiting_manager'
                        | 'active'
                        | 'completed'
                        | 'cancelled'
                        | 'rejected'
                    players_list?: Json | null
                    equipment_ids?: string[] | null
                    created_at?: string
                }
                Update: {
                    id?: string
                    user_id?: string
                    court_id?: string
                    start_time?: string
                    end_time?: string
                    status?:
                        | 'pending_confirmation'
                        | 'confirmed'
                        | 'waiting_manager'
                        | 'active'
                        | 'completed'
                        | 'cancelled'
                        | 'rejected'
                    players_list?: Json | null
                    equipment_ids?: string[] | null
                    created_at?: string
                }
            }
            announcements: {
                Row: {
                    id: string
                    title: string
                    content: string
                    created_by: string | null
                    created_at: string
                }
                Insert: {
                    id?: string
                    title: string
                    content: string
                    created_by?: string | null
                    created_at?: string
                }
                Update: {
                    id?: string
                    title?: string
                    content?: string
                    created_by?: string | null
                    created_at?: string
                }
            }
        }
    }
}
