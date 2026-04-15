import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PlayRequestsClient } from '@/app/student/play-requests/play-requests-client'

vi.mock('@/actions/notifications', () => ({
    acceptPlayRequest: vi.fn().mockResolvedValue({ success: true }),
    rejectPlayRequest: vi.fn().mockResolvedValue({ success: true, bookingCancelled: false }),
}))

import { acceptPlayRequest, rejectPlayRequest } from '@/actions/notifications'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const futureTime = (h = 2) => new Date(Date.now() + h * 60 * 60 * 1000).toISOString()

function makeRequest(overrides: any = {}) {
    return {
        id: 'pr-1',
        status: 'pending' as const,
        created_at: new Date().toISOString(),
        bookings: {
            id: 'b-1',
            start_time: futureTime(2),
            end_time: futureTime(3),
            status: 'confirmed',
            courts: { name: 'Badminton Court A', sport: 'badminton' },
        },
        requester: { full_name: 'Bob Smith', student_id: 'MT23002' },
        ...overrides,
    }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('PlayRequestsClient', () => {
    beforeEach(() => vi.clearAllMocks())

    it('shows empty state when no requests', () => {
        render(<PlayRequestsClient requests={[]} />)
        expect(screen.getByText(/no play requests yet/i)).toBeInTheDocument()
    })

    it('renders pending requests in a Pending section', () => {
        render(<PlayRequestsClient requests={[makeRequest()]} />)
        // Section heading "Pending (1)" — use heading role to avoid ambiguity with the status badge
        expect(screen.getByRole('heading', { name: /pending/i })).toBeInTheDocument()
        expect(screen.getByText('Bob Smith')).toBeInTheDocument()
    })

    it('renders court name and sport for each request', () => {
        render(<PlayRequestsClient requests={[makeRequest()]} />)
        expect(screen.getByText(/Badminton Court A/)).toBeInTheDocument()
        expect(screen.getByText(/Badminton/i)).toBeInTheDocument()
    })

    it('shows Accept and Decline buttons for pending requests', () => {
        render(<PlayRequestsClient requests={[makeRequest()]} />)
        expect(screen.getByRole('button', { name: /accept/i })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: /decline/i })).toBeInTheDocument()
    })

    it('does NOT show Accept/Decline for accepted requests', () => {
        render(<PlayRequestsClient requests={[makeRequest({ status: 'accepted' })]} />)
        expect(screen.queryByRole('button', { name: /accept/i })).not.toBeInTheDocument()
        expect(screen.queryByRole('button', { name: /decline/i })).not.toBeInTheDocument()
    })

    it('does NOT show Accept/Decline for rejected requests', () => {
        render(<PlayRequestsClient requests={[makeRequest({ status: 'rejected' })]} />)
        expect(screen.queryByRole('button', { name: /accept/i })).not.toBeInTheDocument()
    })

    it('calls acceptPlayRequest with correct id on Accept click', async () => {
        render(<PlayRequestsClient requests={[makeRequest({ id: 'pr-77' })]} />)
        await userEvent.click(screen.getByRole('button', { name: /accept/i }))
        expect(vi.mocked(acceptPlayRequest)).toHaveBeenCalledWith('pr-77')
    })

    it('calls rejectPlayRequest with correct id on Decline click', async () => {
        render(<PlayRequestsClient requests={[makeRequest({ id: 'pr-88' })]} />)
        await userEvent.click(screen.getByRole('button', { name: /decline/i }))
        expect(vi.mocked(rejectPlayRequest)).toHaveBeenCalledWith('pr-88')
    })

    it('updates request status to accepted in UI after Accept', async () => {
        render(<PlayRequestsClient requests={[makeRequest({ id: 'pr-1' })]} />)
        await userEvent.click(screen.getByRole('button', { name: /accept/i }))

        await waitFor(() => {
            expect(screen.queryByRole('button', { name: /accept/i })).not.toBeInTheDocument()
        })
    })

    it('updates request status to rejected in UI after Decline', async () => {
        render(<PlayRequestsClient requests={[makeRequest({ id: 'pr-1' })]} />)
        await userEvent.click(screen.getByRole('button', { name: /decline/i }))

        await waitFor(() => {
            expect(screen.queryByRole('button', { name: /decline/i })).not.toBeInTheDocument()
        })
    })

    it('shows error alert when acceptPlayRequest returns an error', async () => {
        vi.mocked(acceptPlayRequest).mockResolvedValueOnce({ error: 'Already responded' } as any)
        const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {})

        render(<PlayRequestsClient requests={[makeRequest()]} />)
        await userEvent.click(screen.getByRole('button', { name: /accept/i }))

        await waitFor(() => {
            expect(alertSpy).toHaveBeenCalledWith('Already responded')
        })
        alertSpy.mockRestore()
    })

    it('shows Processing… label while request is in flight', async () => {
        let resolveAccept!: (v: any) => void
        vi.mocked(acceptPlayRequest).mockImplementationOnce(
            () => new Promise((res) => { resolveAccept = res }),
        )

        render(<PlayRequestsClient requests={[makeRequest()]} />)
        await userEvent.click(screen.getByRole('button', { name: /accept/i }))

        // Both Accept and Decline show "Processing…" while in-flight
        const processingBtns = screen.getAllByText(/processing/i)
        expect(processingBtns.length).toBeGreaterThanOrEqual(1)

        // Resolve inside act so the resulting state update is handled
        await act(async () => {
            resolveAccept({ success: true })
        })
    })

    it('disables both buttons while one action is in flight', async () => {
        let resolveReject!: (v: any) => void
        vi.mocked(rejectPlayRequest).mockImplementationOnce(
            () => new Promise((res) => { resolveReject = res }),
        )

        render(<PlayRequestsClient requests={[makeRequest()]} />)
        const declineBtn = screen.getByRole('button', { name: /decline/i })
        await userEvent.click(declineBtn)

        // Both buttons should be disabled while in-flight (both show "Processing…")
        const allButtons = screen.getAllByRole('button')
        const allDisabled = allButtons.every(btn => btn.hasAttribute('disabled'))
        expect(allDisabled).toBe(true)

        // Resolve inside act so the resulting state update is handled
        await act(async () => {
            resolveReject({ success: true, bookingCancelled: false })
        })
    })

    it('separates pending and historical requests into sections', () => {
        const requests = [
            makeRequest({ id: 'pr-1', status: 'pending' }),
            makeRequest({ id: 'pr-2', status: 'accepted' }),
            makeRequest({ id: 'pr-3', status: 'rejected' }),
        ]
        render(<PlayRequestsClient requests={requests} />)
        expect(screen.getByText(/pending \(1\)/i)).toBeInTheDocument()
        expect(screen.getByText(/history/i)).toBeInTheDocument()
    })

    it('shows requester student_id', () => {
        render(<PlayRequestsClient requests={[makeRequest()]} />)
        expect(screen.getByText('MT23002')).toBeInTheDocument()
    })

    it('shows correct status badge for each status', () => {
        const statuses: Array<'pending' | 'accepted' | 'rejected' | 'expired'> = [
            'pending', 'accepted', 'rejected', 'expired',
        ]
        for (const status of statuses) {
            const { unmount } = render(<PlayRequestsClient requests={[makeRequest({ id: 'x', status })]} />)
            const expectedLabel =
                status === 'rejected' ? 'Declined' : status.charAt(0).toUpperCase() + status.slice(1)
            expect(screen.getByText(expectedLabel)).toBeInTheDocument()
            unmount()
        }
    })
})
