import { render, screen, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { StoreHomePage } from './StoreHomePage'

const home = {
  outletId: 'SYN-OUT', brand: 'Synthetic Brand', district: 'Synthetic District', depot: 'Synthetic Depot',
  openOrders: 3, pendingDeliveries: 2, openIssues: 1, completedOrders: 7,
  nextDelivery: { orderId: 11, orderRef: 'SYN-11', planDate: '2026-06-27', phase: 'PENDING', receipt: 'NONE', tempRequirement: 'chilled',
    units: 12, windowOpen: '05:30:00', windowClose: '07:30:00', driverName: 'Synthetic Driver', vehicleId: 'SYN-VEH', tripIndex: 1,
    plannedArrival: '06:10:00', outcome: null, deliveredUnits: null, deliveredAt: null },
  latestOpenIssue: { id: 1, receiptId: 1, orderId: 12, orderRef: 'SYN-12', outletId: 'SYN-OUT', depot: 'Synthetic Depot', deliveredUnits: 10,
    kind: 'SHORT', affectedUnits: 2, note: null, vehicleId: null, driverName: null, deliveredAt: null, reportedByName: 'Synthetic',
    reportedAt: '2026-06-26T10:00:00Z', status: 'OPEN', decision: null, decisionNote: null, resolvedByName: null, resolvedAt: null, version: 0 },
}
const cutoff = { cutoffLocalTime: '16:00:00', timeZone: 'Pacific/Auckland', serverNow: '2026-06-26T02:00:00Z', nextCutoffAt: '2026-06-26T04:00:00Z',
  secondsRemaining: 7200, open: true, nextDeliveryDate: '2026-06-27' }
const counts = { all: 2, submitted: 0, planned: 1, inDelivery: 0, delivered: 0, issue: 1, deferred: 0 }
const orders = { counts, total: 2, page: 0, size: 5, items: [
  { id: 11, ref: 'SYN-11', orderDate: '2026-06-26', planningDate: '2026-06-26', deliveryDate: '2026-06-27', status: 'planned', group: 'PLANNED', units: 12, tempRequirement: 'chilled' },
  { id: 12, ref: 'SYN-12', orderDate: '2026-06-25', planningDate: '2026-06-25', deliveryDate: '2026-06-26', status: 'delivered', group: 'ISSUE', units: 10, tempRequirement: 'ambient' },
] }

afterEach(() => vi.unstubAllGlobals())

describe('store home', () => {
  it('shows only what the API returns: counts, recent orders, the next delivery and the open issue', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
      const body = url.includes('/store/home') ? home : url.includes('/store/cutoff') ? cutoff : url.includes('/store/order-board') ? orders : []
      return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }))
    render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter><StoreHomePage /></MemoryRouter></QueryClientProvider>)

    expect(await screen.findByText('Synthetic Brand · Synthetic District · SYN-OUT')).toBeVisible()
    const kpis = screen.getByRole('region', { name: 'Outlet summary' })
    for (const [value, label] of [['3', 'Open orders'], ['2', 'Pending deliveries'], ['1', 'Open issues'], ['7', 'Completed orders']]) {
      expect(within(kpis).getByText(label).previousElementSibling).toHaveTextContent(value)
    }
    expect(screen.getByText(/Ordering open · 2h 0m left/)).toBeVisible()

    const recent = screen.getByLabelText('Recent orders')
    expect(within(recent).getByText('Planned')).toBeVisible()
    expect(within(recent).getByText('Issue')).toBeVisible()          // the server grouped this delivered order as an Issue
    expect(within(recent).getByText('12 units · Refrigerated')).toBeVisible()

    expect(screen.getByLabelText('Arrival')).toHaveTextContent('06:10')
    expect(screen.getByLabelText('Arrival')).toHaveTextContent('Window 05:30–07:30')
    expect(screen.getByLabelText('Next delivery')).toHaveTextContent('SYN-11 · Tomorrow, 05:30–07:30')
    expect(screen.getByLabelText('Next delivery')).toHaveTextContent('Driver Synthetic Driver')
    expect(screen.getByLabelText('Open issue')).toHaveTextContent('SYN-12 · Short · 2 of 10 units')
    expect(screen.queryByText(/Rs\s?\d/)).not.toBeInTheDocument()  // the data has no prices, so none are shown
  })
})
