import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NotificationPopup } from '@/components/notification-popup'
import type { AppNotification } from '@/actions/notifications'

// ─── Mock server actions ───────────────────────────────────────────────────────

vi.mock('@/actions/notifications', () => ({
    markNotificationRead: vi.fn().mockResolvedValue(undefined),
    acceptPlayRequest: vi.fn().mockResolvedValue({ success: true }),
    rejectPlayRequest: vi.fn().mockResolvedValue({ success: true, bookingCancelled: false }),
}))

import { markNotificationRead, acceptPlayRequest, rejectPlayRequest } from '@/actions/notifications'

// Stub global fetch — polling calls /api/notifications
const mockFetch = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve([]) })
vi.stubGlobal('fetch', mockFetch)

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeNotification(overrides: Partial<AppNotification> = {}): AppNotification {
    return {
        id: `notif-${Math.random()}`,
        recipient_id: 'user-1',
        sender_id: null,
        type: 'booking_session_active',
        title: 'Session Active',
        body: 'Head to the court!',
        data: {},
        is_read: false,
        created_at: new Date().toISOString(),
        ...overrides,
    }
}

function makePlayRequestNotif(overrides: Partial<AppNotification> = {}): AppNotification {
    return makeNotification({
        type: 'play_request_received',
        title: 'Play Request',
        body: 'Alice invited you to play',
        data: { play_request_id: 'pr-1', booking_id: 'b-1' },
        ...overrides,
    })
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('NotificationPopup', () => {
    // User setup for fake-timer-aware interactions
    let user: ReturnType<typeof userEvent.setup>

    beforeEach(() => {
        vi.clearAllMocks()
        mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve([]) })
        vi.useFakeTimers()
        // Pass advanceTimers so userEvent internals don't hang on fake clock
        user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime.bind(vi) })
    })

    afterEach(() => {
        vi.useRealTimers()
    })

    it('renders nothing when no notifications', () => {
        const { container } = render(<NotificationPopup initial={[]} />)
        expect(container.firstChild).toBeNull()
    })

    it('renders initial notifications as toasts', () => {
        const notifs = [makeNotification({ title: 'Hello World' })]
        render(<NotificationPopup initial={notifs} />)
        expect(screen.getByText('Hello World')).toBeInTheDocument()
    })

    it('renders up to 5 toasts and shows overflow badge', () => {
        const notifs = Array.from({ length: 7 }, (_, i) =>
            makeNotification({ id: `n-${i}`, title: `Notification ${i}` })
        )
        render(<NotificationPopup initial={notifs} />)

        // Only 5 shown; overflow badge for the remaining 2
        const badge = screen.getByText('+2 more')
        expect(badge).toBeInTheDocument()
    })

    it('dismiss button removes toast', async () => {
        const notif = makeNotification({ title: 'Dismiss Me' })
        render(<NotificationPopup initial={[notif]} />)

        const dismissBtn = screen.getByRole('button', { name: /dismiss/i })
        // dismiss() is synchronous — use fireEvent to avoid act() hanging on fake timers
        fireEvent.click(dismissBtn)

        // After animation delay the element should be gone
        await act(async () => {
            vi.advanceTimersByTime(400)
        })
        expect(screen.queryByText('Dismiss Me')).not.toBeInTheDocument()
    })

    it('marks notification as read when dismissed', async () => {
        const notif = makeNotification({ id: 'test-notif-1' })
        render(<NotificationPopup initial={[notif]} />)

        // markNotificationRead is called synchronously inside dismiss()
        fireEvent.click(screen.getByRole('button', { name: /dismiss/i }))
        expect(vi.mocked(markNotificationRead)).toHaveBeenCalledWith('test-notif-1')
    })

    it('play request toast shows Accept and Decline buttons', () => {
        const notif = makePlayRequestNotif()
        render(<NotificationPopup initial={[notif]} />)
        expect(screen.getByRole('button', { name: /accept/i })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: /decline/i })).toBeInTheDocument()
    })

    it('regular notifications do NOT show Accept/Decline buttons', () => {
        const notif = makeNotification({ type: 'booking_session_active' })
        render(<NotificationPopup initial={[notif]} />)
        expect(screen.queryByRole('button', { name: /accept/i })).not.toBeInTheDocument()
        expect(screen.queryByRole('button', { name: /decline/i })).not.toBeInTheDocument()
    })

    it('accept button calls acceptPlayRequest with play_request_id', async () => {
        const notif = makePlayRequestNotif({ data: { play_request_id: 'pr-42' } })
        render(<NotificationPopup initial={[notif]} />)

        // Wrap click + flush in act so the acceptPlayRequest mock resolution (state update) is handled
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: /accept/i }))
            await Promise.resolve()
        })
        expect(vi.mocked(acceptPlayRequest)).toHaveBeenCalledWith('pr-42')
    })

    it('decline button calls rejectPlayRequest with play_request_id', async () => {
        const notif = makePlayRequestNotif({ data: { play_request_id: 'pr-99' } })
        render(<NotificationPopup initial={[notif]} />)

        // Wrap click + flush in act so the rejectPlayRequest mock resolution (state update) is handled
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: /decline/i }))
            await Promise.resolve()
        })
        expect(vi.mocked(rejectPlayRequest)).toHaveBeenCalledWith('pr-99')
    })

    it('play request toast is removed after Accept', async () => {
        const notif = makePlayRequestNotif({ title: 'Play with Me' })
        render(<NotificationPopup initial={[notif]} />)

        fireEvent.click(screen.getByRole('button', { name: /accept/i }))
        // Flush the acceptPlayRequest mock resolution so onDismiss fires
        await act(async () => {
            await Promise.resolve()
        })
        // Fire the 300ms dismiss animation timer
        await act(async () => {
            vi.advanceTimersByTime(400)
        })
        expect(screen.queryByText('Play with Me')).not.toBeInTheDocument()
    })

    it('regular toast auto-dismisses after 8 seconds', async () => {
        const notif = makeNotification({ title: 'Auto Dismiss' })
        render(<NotificationPopup initial={[notif]} />)
        expect(screen.getByText('Auto Dismiss')).toBeInTheDocument()

        // Advance 8s auto-dismiss + 300ms animation
        await act(async () => {
            vi.advanceTimersByTime(8000 + 400)
        })
        expect(screen.queryByText('Auto Dismiss')).not.toBeInTheDocument()
    })

    it('play request toast does NOT auto-dismiss', async () => {
        const notif = makePlayRequestNotif({ title: 'Persistent Request' })
        render(<NotificationPopup initial={[notif]} />)

        await act(async () => {
            vi.advanceTimersByTime(30_000) // 30 seconds
        })
        expect(screen.getByText('Persistent Request')).toBeInTheDocument()
    })

    it('polls for new notifications every 8 seconds', async () => {
        render(<NotificationPopup initial={[]} />)

        // Not called immediately
        expect(mockFetch).not.toHaveBeenCalled()

        await act(async () => {
            vi.advanceTimersByTime(8_000)
        })
        expect(mockFetch).toHaveBeenCalledTimes(1)
        expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('/api/notifications'))

        await act(async () => {
            vi.advanceTimersByTime(8_000)
        })
        expect(mockFetch).toHaveBeenCalledTimes(2)
    })

    it('displays new notifications returned by polling', async () => {
        const newNotif = makeNotification({ id: 'polled-1', title: 'Polled Notification' })
        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve([newNotif]),
        })

        render(<NotificationPopup initial={[]} />)

        // Advance time to trigger polling, then flush async state updates
        await act(async () => {
            vi.advanceTimersByTime(8_000)
            // Let the resolved promise settle
            await Promise.resolve()
        })

        expect(screen.getByText('Polled Notification')).toBeInTheDocument()
    })

    it('does not duplicate notifications already shown', async () => {
        const notif = makeNotification({ id: 'existing-1', title: 'Existing' })
        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve([notif]),
        })

        render(<NotificationPopup initial={[notif]} />)

        await act(async () => {
            vi.advanceTimersByTime(8_000)
            await Promise.resolve()
        })

        // Should appear exactly once
        expect(screen.getAllByText('Existing')).toHaveLength(1)
    })

    it('shows correct icon for error-type notifications (red border)', () => {
        const notif = makeNotification({ type: 'equipment_lost', title: 'Equipment Lost' })
        render(<NotificationPopup initial={[notif]} />)
        // The body HTML should contain a red border class
        expect(document.body.innerHTML).toMatch(/border-red/)
    })

    it('Accept button is disabled while request is processing', async () => {
        // Make acceptPlayRequest hang until we resolve it
        let resolveAccept!: () => void
        vi.mocked(acceptPlayRequest).mockImplementationOnce(
            () =>
                new Promise((res) => {
                    resolveAccept = () => res({ success: true })
                })
        )

        const notif = makePlayRequestNotif()
        render(<NotificationPopup initial={[notif]} />)

        const acceptBtn = screen.getByRole('button', { name: /accept/i })
        // Use fireEvent so act() doesn't wait for the never-resolving acceptPlayRequest promise
        fireEvent.click(acceptBtn)
        // Flush setResponding(true) state update without waiting for the pending promise
        await act(async () => {})

        // Should be disabled while pending
        expect(screen.getByRole('button', { name: /accept/i })).toBeDisabled()

        // Cleanup: resolve inside act so the resulting state update is handled
        await act(async () => {
            resolveAccept()
            await Promise.resolve()
        })
    })
})
