import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NotificationsClient } from '@/app/student/notifications/notifications-client'
import type { AppNotification } from '@/actions/notifications'

vi.mock('@/actions/notifications', () => ({
    markNotificationRead: vi.fn().mockResolvedValue(undefined),
    markAllNotificationsRead: vi.fn().mockResolvedValue(undefined),
}))

import { markNotificationRead, markAllNotificationsRead } from '@/actions/notifications'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeNotif(overrides: Partial<AppNotification> = {}): AppNotification {
    return {
        id: `n-${Math.random().toString(36).slice(2)}`,
        recipient_id: 'user-1',
        sender_id: null,
        type: 'booking_session_active',
        title: 'Session Active',
        body: 'Head to the court!',
        data: {},
        is_read: false,
        created_at: new Date(),
        ...overrides,
    }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('NotificationsClient', () => {
    beforeEach(() => vi.clearAllMocks())

    it('shows empty state when no notifications', () => {
        render(<NotificationsClient notifications={[]} />)
        expect(screen.getByText(/no notifications yet/i)).toBeInTheDocument()
    })

    it('renders all notifications', () => {
        const notifs = [
            makeNotif({ title: 'First Notification' }),
            makeNotif({ title: 'Second Notification' }),
        ]
        render(<NotificationsClient notifications={notifs} />)
        expect(screen.getByText('First Notification')).toBeInTheDocument()
        expect(screen.getByText('Second Notification')).toBeInTheDocument()
    })

    it('shows unread count badge', () => {
        const notifs = [
            makeNotif({ is_read: false }),
            makeNotif({ is_read: false }),
            makeNotif({ is_read: true }),
        ]
        render(<NotificationsClient notifications={notifs} />)
        expect(screen.getByText(/2 unread/i)).toBeInTheDocument()
    })

    it('does not show unread badge when all notifications are read', () => {
        const notifs = [makeNotif({ is_read: true })]
        render(<NotificationsClient notifications={notifs} />)
        expect(screen.queryByText(/unread/i)).not.toBeInTheDocument()
    })

    it('clicking an unread notification marks it as read', async () => {
        const notif = makeNotif({ id: 'n-target', is_read: false, title: 'Click Me' })
        render(<NotificationsClient notifications={[notif]} />)

        await userEvent.click(screen.getByText('Click Me'))
        expect(vi.mocked(markNotificationRead)).toHaveBeenCalledWith('n-target')
    })

    it('clicking an already-read notification does NOT call markNotificationRead', async () => {
        const notif = makeNotif({ id: 'n-read', is_read: true, title: 'Already Read' })
        render(<NotificationsClient notifications={[notif]} />)

        await userEvent.click(screen.getByText('Already Read'))
        expect(vi.mocked(markNotificationRead)).not.toHaveBeenCalled()
    })

    it('updates notification to read in UI immediately (optimistic)', async () => {
        const notif = makeNotif({ id: 'n-opt', is_read: false, title: 'Optimistic' })
        render(<NotificationsClient notifications={[notif]} />)

        // Unread dot should be visible before click
        const dotBefore = document.querySelector('.bg-\\[\\#004d40\\]')
        expect(dotBefore).toBeInTheDocument()

        await userEvent.click(screen.getByText('Optimistic'))

        // Unread dot should disappear immediately (optimistic update)
        await waitFor(() => {
            expect(document.querySelector('.bg-\\[\\#004d40\\]')).not.toBeInTheDocument()
        })
    })

    it('"Mark all read" button marks all notifications read', async () => {
        const notifs = [
            makeNotif({ is_read: false, title: 'N1' }),
            makeNotif({ is_read: false, title: 'N2' }),
        ]
        render(<NotificationsClient notifications={notifs} />)

        const btn = screen.getByRole('button', { name: /mark all read/i })
        await userEvent.click(btn)

        expect(vi.mocked(markAllNotificationsRead)).toHaveBeenCalledTimes(1)
    })

    it('"Mark all read" button is only shown when there are unread notifications', () => {
        const allRead = [makeNotif({ is_read: true }), makeNotif({ is_read: true })]
        render(<NotificationsClient notifications={allRead} />)
        expect(screen.queryByRole('button', { name: /mark all read/i })).not.toBeInTheDocument()
    })

    it('unread notifications have a visual indicator (unread dot)', () => {
        const notifs = [makeNotif({ is_read: false }), makeNotif({ is_read: true })]
        render(<NotificationsClient notifications={notifs} />)
        // There is exactly 1 unread dot
        const dots = document.querySelectorAll('span.rounded-full.bg-\\[\\#004d40\\]')
        expect(dots.length).toBe(1)
    })

    it('notification body text is visible', () => {
        const notif = makeNotif({ body: 'This is the notification body text' })
        render(<NotificationsClient notifications={[notif]} />)
        expect(screen.getByText('This is the notification body text')).toBeInTheDocument()
    })

    it('shows relative time for each notification', () => {
        const notif = makeNotif({ created_at: new Date() })
        render(<NotificationsClient notifications={[notif]} />)
        // date-fns formatDistanceToNow should render something like "less than a minute ago"
        expect(screen.getByText(/ago/i)).toBeInTheDocument()
    })

    it('read notifications have reduced opacity', () => {
        const notif = makeNotif({ is_read: true, title: 'Old News' })
        render(<NotificationsClient notifications={[notif]} />)
        const card = screen.getByText('Old News').closest('div[class*="opacity"]')
        expect(card?.className).toMatch(/opacity/)
    })

    it('"Mark all read" button optimistically removes all unread dots', async () => {
        const notifs = [makeNotif({ is_read: false }), makeNotif({ is_read: false })]
        render(<NotificationsClient notifications={notifs} />)

        await userEvent.click(screen.getByRole('button', { name: /mark all read/i }))

        await waitFor(() => {
            expect(document.querySelectorAll('span.rounded-full.bg-\\[\\#004d40\\]').length).toBe(0)
        })
    })
})
