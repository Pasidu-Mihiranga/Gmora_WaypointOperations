import { render, screen } from '@testing-library/react'
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
function stub(options: { post?: (request: Request) => Response | Promise<Response>; estimate?: (units: number) => unknown; cutoffs?: () => unknown } = {}) {
  vi.stubGlobal('fetch', vi.fn(async (request: Request) => {
    const url = new URL(request.url)
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

describe('place order', () => {
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
    stub({ estimate: units => estimateFor(units, { chilledAllowed: false }) })
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
