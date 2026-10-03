import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PlaceOrderPage } from './PlaceOrderPage'

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const cutoff = { nextDeliveryDate: '2026-06-26', open: true, serverNow: '2026-06-25T04:30:00Z', timeZone: 'Pacific/Auckland' }
const home = { outletId: 'SYN-OUT', brand: 'Synthetic Brand', district: 'Synthetic District' }
const estimateFor = (units: number, extra = {}) => ({ tempRequirement: 'ambient', units, allowed: true, chilledAllowed: true, weightKg: units * 7.5,
  volumeM3: units * 0.04, basisOrders: 12, deliveryDate: '2026-06-26', windowOpen: '05:00:00', windowClose: '07:30:00', ...extra })

/** Answers the page's reads from a table and lets each test decide what the POST does. */
const unsized = { tempRequirement: 'ambient', allowed: true, chilledAllowed: true, sized: false, basisOrders: 0, deliveryDate: '2026-06-26',
  windowOpen: null, windowClose: null, categories: [], items: [] }
const item = (id: number, categoryId: number, categoryName: string, name: string, kg: number) =>
  ({ id, categoryId, categoryName, name, weightKgPerUnit: kg, volumeM3PerUnit: kg / 100 })
const sizedCatalog = { tempRequirement: 'ambient', allowed: true, chilledAllowed: true, sized: true, basisOrders: 40, deliveryDate: '2026-06-26',
  windowOpen: '05:00:00', windowClose: '07:30:00', categories: [{ id: 1, name: 'Pantry' }, { id: 2, name: 'Bakery' }],
  items: [item(11, 1, 'Pantry', 'Rice 5kg', 35), item(12, 1, 'Pantry', 'Salt 1kg', 7), item(21, 2, 'Bakery', 'White Bread Loaf', 3)] }

function stub(options: { post?: (request: Request) => Response | Promise<Response>; estimate?: (units: number) => unknown; cutoffs?: () => unknown; catalog?: unknown } = {}) {
  vi.stubGlobal('fetch', vi.fn(async (request: Request) => {
    const url = new URL(request.url)
    if (url.pathname.endsWith('/store/catalog')) return json(options.catalog ?? unsized)
    if (url.pathname.endsWith('/store/order-preview')) {
      const body = await request.clone().json() as { lines: { productId: number; quantity: number }[] }
      const kg = body.lines.reduce((sum, line) => sum + line.quantity * (sizedCatalog.items.find(entry => entry.id === line.productId)?.weightKgPerUnit ?? 0), 0)
      return json({ units: body.lines.reduce((sum, line) => sum + line.quantity, 0), items: body.lines.length, weightKg: kg, volumeM3: kg / 100 })
    }
    if (request.method === 'POST') return options.post ? options.post(request) : json({ id: 901, ref: 'SYN-901', orderDate: '2026-06-27' }, 201)
    if (url.pathname.endsWith('/store/order-estimate')) return json(options.estimate ? options.estimate(Number(url.searchParams.get('units'))) : estimateFor(Number(url.searchParams.get('units'))))
    if (url.pathname.endsWith('/store/home')) return json(home)
    return json(options.cutoffs ? options.cutoffs() : cutoff)
  }))
}
function setup() {
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter><PlaceOrderPage /></MemoryRouter></QueryClientProvider>)
}
async function enterUnits(units = '2') {
  await screen.findByRole('heading', { name: 'Place Order' })
  await userEvent.type(screen.getByLabelText('Units'), units)
}
async function submit() {
  await userEvent.click(await screen.findByRole('button', { name: 'Continue to Review' }))
  await userEvent.click(screen.getByRole('button', { name: 'Submit Order' }))
}

afterEach(() => vi.unstubAllGlobals())

describe('place order from the catalog', () => {
  it('builds a basket from item cards, shows the server totals and submits lines without weights', async () => {
    let submitted: Record<string, unknown> = {}
    stub({ catalog: sizedCatalog, post: async request => { submitted = await request.clone().json(); return json({ id: 903, ref: 'SYN-903', orderDate: '2026-06-26', units: 5, volumeM3: 0.38 }, 201) } })
    setup()
    await screen.findByRole('heading', { name: 'Place Order' })
    expect(await screen.findByRole('button', { name: 'Pantry' })).toBeVisible()
    await userEvent.click(screen.getByRole('button', { name: 'Bakery' }))
    expect(screen.queryByRole('listitem', { name: 'Rice 5kg' })).not.toBeInTheDocument()       // filtered by group
    await userEvent.click(screen.getByRole('button', { name: 'All' }))
    const rice = screen.getByRole('listitem', { name: 'Rice 5kg' })
    await userEvent.click(within(rice).getByRole('button', { name: 'Add' }))
    await userEvent.click(within(rice).getByRole('button', { name: 'Add one Rice 5kg' }))
    await userEvent.click(within(screen.getByRole('listitem', { name: 'White Bread Loaf' })).getByRole('button', { name: 'Add' }))
    const summary = screen.getByLabelText('Order summary')
    await waitFor(() => expect(within(summary).getByText('73.0 kg')).toBeVisible())            // 2 × 35 + 1 × 3, worked out by the server
    expect(within(summary).getByText('3')).toBeVisible()                                         // units
    expect(within(summary).getByLabelText('Basket')).toHaveTextContent('Rice 5kg×2')
    await userEvent.type(screen.getByPlaceholderText('Search products…'), 'salt')
    expect(screen.queryByRole('listitem', { name: 'Rice 5kg' })).not.toBeInTheDocument()
    await userEvent.clear(screen.getByPlaceholderText('Search products…'))

    await userEvent.click(screen.getByRole('button', { name: 'Continue to Review' }))
    expect(await screen.findByRole('cell', { name: 'White Bread Loaf' })).toBeVisible()
    await userEvent.click(screen.getByRole('button', { name: 'Submit Order' }))
    await screen.findByText(/SYN-903 · 2 items · 5 units/)
    expect(submitted).toMatchObject({ tempRequirement: 'ambient', expectedDeliveryDate: '2026-06-26', lines: [{ productId: 11, quantity: 2 }, { productId: 21, quantity: 1 }] })
    expect(submitted).not.toHaveProperty('weightKg')
  })

  it('will not continue with an empty basket', async () => {
    stub({ catalog: sizedCatalog })
    setup()
    await screen.findByRole('listitem', { name: 'Rice 5kg' })
    expect(screen.getByRole('button', { name: 'Continue to Review' })).toBeDisabled()
    expect(screen.getByText(/basket is empty/i)).toBeVisible()
  })
})

describe('place order by units when the catalog cannot be sized', () => {
  it('fills weight and volume from the server estimate and shows the server-persisted date after submitting', async () => {
    let submitted: unknown
    stub({ post: async request => { submitted = await request.clone().json(); return json({ id: 901, ref: 'SYN-901', orderDate: '2026-06-27' }, 201) } })
    setup(); await enterUnits('2')
    expect(await screen.findByText(/Estimated from 12 past orders/)).toBeVisible()
    expect(screen.getByLabelText('Weight (kg)')).toHaveValue(15)
    expect(screen.getByLabelText('Volume (m³)')).toHaveValue(0.08)
    await submit()
    await screen.findByText('SYN-901 is confirmed for the Sat 27 Jun run · window 05:00–07:30')
    expect(submitted).toMatchObject({ expectedDeliveryDate: '2026-06-26', tempRequirement: 'ambient', units: 2, weightKg: 15, volumeM3: 0.08 })
  })

  it('lets the manager override the estimate before submitting', async () => {
    let submitted: { weightKg?: number } = {}
    stub({ post: async request => { submitted = await request.clone().json(); return json({ id: 902, ref: 'SYN-902', orderDate: '2026-06-26' }, 201) } })
    setup(); await enterUnits('2')
    await screen.findByText(/Estimated from/)
    await userEvent.clear(screen.getByLabelText('Weight (kg)'))
    await userEvent.type(screen.getByLabelText('Weight (kg)'), '20')
    await submit()
    await screen.findByText(/SYN-902 is confirmed/)
    expect(submitted.weightKg).toBe(20)
  })

  it('asks for weight and volume when there is no history to estimate from, and invents nothing', async () => {
    stub({ estimate: units => estimateFor(units, { weightKg: null, volumeM3: null, basisOrders: 0 }) })
    setup(); await enterUnits('3')
    expect(await screen.findByText(/no past orders to estimate from/i)).toBeVisible()
    expect(screen.getByLabelText('Weight (kg)')).toHaveValue(null)
    await userEvent.click(screen.getByRole('button', { name: 'Continue to Review' }))
    expect(await screen.findByText(/Weight and volume must be greater than zero/)).toBeVisible()
  })

  it('disables chilled when the server says the outlet may not order it', async () => {
    stub({ catalog: { ...unsized, chilledAllowed: false }, estimate: units => estimateFor(units, { chilledAllowed: false }) })
    setup(); await enterUnits('2')
    await screen.findByText(/Estimated from/)
    expect(screen.getByRole('radio', { name: /Chilled/ })).toBeDisabled()
  })

  it('requires a new review when cutoff changes the delivery date', async () => {
    let reads = 0
    stub({ post: () => json({ code: 'DELIVERY_DATE_CHANGED' }, 409), cutoffs: () => ({ ...cutoff, nextDeliveryDate: ++reads === 1 ? '2026-06-26' : '2026-06-27' }) })
    setup(); await enterUnits('2')
    await screen.findByText(/Estimated from/)
    await submit()
    await screen.findByText('The delivery date changed. Review the updated date and confirm again.')
    expect(screen.getByText(/delivery Sat 27 Jun/)).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Submit Order' })).not.toBeInTheDocument()
  })

  it('recovers the form after a network failure', async () => {
    stub({ post: () => { throw new TypeError('Synthetic network failure') } })
    setup(); await enterUnits('2')
    await screen.findByText(/Estimated from/)
    await submit()
    await screen.findByText('The order could not be confirmed. Check your connection and try again.')
    expect(screen.getByRole('button', { name: 'Continue to Review' })).toBeEnabled()
  })
})
