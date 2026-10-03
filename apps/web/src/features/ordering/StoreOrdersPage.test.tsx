import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { StoreOrdersPage } from './StoreOrdersPage'
import { groupPill, storeStatusPill } from './orderDisplay'

const counts = { all: 5, submitted: 2, planned: 1, inDelivery: 0, delivered: 1, issue: 1, deferred: 0 }
const row = (id: number, group: string, extra = {}) => ({ id, ref: `SYN-${id}`, orderDate: '2026-06-26', planningDate: '2026-06-26',
  placedAt: '2026-06-25T09:00:00Z', status: 'confirmed', group, tempRequirement: 'chilled', units: id, weightKg: 10, volumeM3: 0.5,
  deliveryDate: '2026-06-27', windowOpen: null, windowClose: null, plannedArrival: null, ...extra })
const home = { outletId: 'SYN-OUT', brand: 'Synthetic Brand', district: 'Synthetic District', depot: 'D', openOrders: 0, pendingDeliveries: 0,
  openIssues: 0, completedOrders: 0, nextDelivery: null, latestOpenIssue: null }
const cutoff = { cutoffLocalTime: '16:00:00', timeZone: 'Pacific/Auckland', serverNow: '2026-06-26T02:00:00Z', nextCutoffAt: '2026-06-26T04:00:00Z',
  secondsRemaining: 100, open: true, nextDeliveryDate: '2026-06-27' }

afterEach(() => vi.unstubAllGlobals())

describe('store orders', () => {
  it('shows chip counts and the server group of each order, and asks the server for a chosen group', async () => {
    const requested: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
      requested.push(url)
      const group = new URL(url, 'http://x').searchParams.get('group')
      const items = group === 'ISSUE' ? [row(4, 'ISSUE', { status: 'delivered' })]
        : [row(1, 'SUBMITTED'), row(2, 'PLANNED', { status: 'planned', windowOpen: '05:30:00', windowClose: '07:30:00' }), row(4, 'ISSUE', { status: 'delivered' })]
      const body = url.includes('/store/order-board') ? { counts, items, total: items.length, page: 0, size: 20 }
        : url.includes('/store/home') ? home : url.includes('/store/cutoff') ? cutoff : []
      return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }))
    render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter><StoreOrdersPage /></MemoryRouter></QueryClientProvider>)

    expect(await screen.findByRole('button', { name: 'All 5' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Submitted 2' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Issue 1' })).toBeVisible()
    expect(screen.queryByRole('button', { name: /In delivery \d/ })).not.toBeInTheDocument()        // empty chips carry no number
    const table = await screen.findByRole('table')
    expect(within(table).getByText('Submitted')).toBeVisible()
    expect(within(table).getByText('Planned')).toBeVisible()
    expect(within(table).getByText('Issue')).toBeVisible()
    expect(within(table).getByText(/05:30–07:30/)).toBeVisible()

    await userEvent.click(screen.getByRole('button', { name: 'Issue 1' }))
    await waitFor(() => expect(requested.some(url => url.includes('group=ISSUE'))).toBe(true))
    await waitFor(() => expect(within(screen.getByRole('table')).queryByText('Submitted')).not.toBeInTheDocument())
  })

  it('keeps the single-order pill in step with the grouping the server applies', () => {
    for (const [status, receipt, group] of [['confirmed', null, 'SUBMITTED'], ['planned', null, 'PLANNED'], ['in_transit', null, 'IN_DELIVERY'],
      ['delivered', null, 'DELIVERED'], ['receipt_confirmed', 'CONFIRMED', 'DELIVERED'], ['delivered', 'DISPUTED', 'ISSUE'],
      ['deferred', null, 'DEFERRED'], ['failed', null, 'ISSUE']] as const) {
      expect(storeStatusPill(status, receipt)).toEqual(groupPill(group))
    }
  })
})
