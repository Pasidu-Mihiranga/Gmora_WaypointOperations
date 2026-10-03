import type { ReactElement } from 'react'
import { render, screen, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { StoreNotificationsPage, notificationText } from './StoreNotificationsPage'
import { StoreProfilePage } from './StoreProfilePage'

vi.mock('../auth/auth', () => ({ useAuth: () => ({ user: { displayName: 'Synthetic Manager', username: 'SYN-USER', outletId: 'SYN-OUT', depot: null }, logout: vi.fn() }) }))
const home = { outletId: 'SYN-OUT', brand: 'Synthetic Brand', district: 'Synthetic District', depot: 'Synthetic Depot', openOrders: 3, pendingDeliveries: 0,
  openIssues: 1, completedOrders: 7, nextDelivery: null, latestOpenIssue: null }
const cutoff = { cutoffLocalTime: '16:00:00', timeZone: 'Pacific/Auckland', serverNow: '2026-06-26T02:00:00Z', nextCutoffAt: '2026-06-26T04:00:00Z', secondsRemaining: 100, open: true, nextDeliveryDate: '2026-06-27' }
const updates = [
  { kind: 'ISSUE_REPORTED', orderId: 2, orderRef: 'SYN-2', at: '2026-06-26T01:00:00Z', date: null },
  { kind: 'ORDER_DELIVERED', orderId: 1, orderRef: 'SYN-1', at: '2026-06-25T01:00:00Z', date: null },
  { kind: 'ORDER_DEFERRED', orderId: 3, orderRef: 'SYN-3', at: '2026-06-24T01:00:00Z', date: '2026-06-27' },
]

function mount(page: ReactElement, board: unknown = updates) {
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = String(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
    const body = url.includes('/store/home') ? home : url.includes('/store/cutoff') ? cutoff : url.includes('/store/notifications') ? board : []
    return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }))
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter>{page}</MemoryRouter></QueryClientProvider>)
}

afterEach(() => vi.unstubAllGlobals())

describe('store profile and notifications', () => {
  it('shows the account and outlet from the session and the API, with no prices and no edit button', async () => {
    mount(<StoreProfilePage />)
    expect(await screen.findByText('Synthetic Brand · Synthetic District · SYN-OUT', { selector: 'p' })).toBeVisible()
    const work = screen.getByLabelText('Work information')
    expect(within(work).getByText('SYN-USER')).toBeVisible()
    expect(within(work).getByText('Synthetic Depot')).toBeVisible()
    expect(within(await screen.findByLabelText('Your outlet')).getByText('7')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Log out' })).toBeVisible()
    expect(screen.queryByRole('button', { name: /edit profile/i })).not.toBeInTheDocument()
    expect(screen.queryByText(/Rs\s?\d/)).not.toBeInTheDocument()
  })

  it('lists stored events newest first in plain language, each linking to where to act', async () => {
    mount(<StoreNotificationsPage />)
    const list = await screen.findByLabelText('Order updates')
    const links = within(list).getAllByRole('link')
    expect(links.map(link => link.textContent)).toEqual([
      'You reported an issue on SYN-2.',
      'SYN-1 was delivered. Check what arrived and confirm receipt.',
      'SYN-3 was deferred to the Sat 27 Jun planning run.',
    ])
    expect(links.map(link => link.getAttribute('href'))).toEqual(['/store/issues', '/store/deliveries/1', '/store/orders/3'])
  })

  it('says so when nothing has happened yet', async () => {
    mount(<StoreNotificationsPage />, [])
    expect(await screen.findByText('No updates yet')).toBeVisible()
  })

  it('has a line for every kind the server can send', () => {
    for (const kind of ['ORDER_SUBMITTED', 'ORDER_DEFERRED', 'ORDER_DISPATCHED', 'ORDER_DELIVERED', 'RECEIPT_CONFIRMED', 'ISSUE_REPORTED', 'ISSUE_RESOLVED']) {
      expect(notificationText({ kind, orderId: 1, orderRef: 'SYN-1', at: '2026-06-26T01:00:00Z', date: '2026-06-27' })).toContain('SYN-1')
    }
  })
})
