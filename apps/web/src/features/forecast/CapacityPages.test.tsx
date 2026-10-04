import { render, screen, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { CapacityDecisionPage, CapacityForecastPage } from './CapacityPages'

const syntheticForecast = {
  depot: 'Synthetic depot', method: 'moving_average', methodVersion: '13w.1', windowWeeks: 13,
  generatedAt: '2026-06-25T11:00:00Z', latestObservedIsoYear: 2026,
  latestObservedIsoWeek: 7, weeksSinceLastObservation: 19, historyStale: true, timeZone: 'Pacific/Auckland', advisory: true,
  capacity: { vehicles: 3, reeferVehicles: 1, volumeCapM3: 90, reeferVolumeCapM3: 20 },
  weeks: [
    { isoYear: 2026, isoWeek: 6, operatingDays: 6, observed: true, observedTotalM3: 48, observedChilledM3: 12 },
    { isoYear: 2026, isoWeek: 7, operatingDays: 6, observed: true, observedTotalM3: 54, observedChilledM3: 13 },
    { isoYear: 2026, isoWeek: 27, operatingDays: 0, observed: false, forecastTotalM3: 51,
      forecastChilledM3: 13, lowTotalM3: 45, highTotalM3: 60 },
    { isoYear: 2026, isoWeek: 28, operatingDays: 0, observed: false, forecastTotalM3: 51,
      forecastChilledM3: 13, lowTotalM3: 45, highTotalM3: 60 },
  ],
  series: [{ brand: 'Synthetic Fresh', confidence: 'low', basis: 'Average of recent completed weeks.',
    sampleWeeks: 13, forecastTotalM3: 51, forecastChilledM3: 13, chilledApplicable: true }],
}

describe('dispatcher demand outlook', () => {
  it('explains the data gap, baseline and unavailable daily value without making up figures', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(syntheticForecast), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    })))
    render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={['/dispatcher/forecast']}>
        <Routes><Route element={<Outlet context={{ depot: 'Synthetic depot' }} />}>
          <Route path="/dispatcher/forecast" element={<CapacityForecastPage />} />
        </Route></Routes>
      </MemoryRouter>
    </QueryClientProvider>)

    expect(await screen.findByText('History needs updating')).toBeVisible()
    expect(screen.getAllByText(/2026 W07, 19 weeks before/).length).toBeGreaterThan(0)
    const kpis = screen.getByRole('region', { name: 'Capacity and demand' })
    expect(within(kpis).getByText('90 m³')).toBeVisible()
    expect(within(kpis).getByText('51 m³')).toBeVisible()
    expect(within(kpis).getByText('13 m³')).toBeVisible()
    expect(within(kpis).getAllByText('Older data')).toHaveLength(2)
    expect(screen.getAllByText('Daily figure unavailable until operating days are recorded')).toHaveLength(2)
    expect(screen.getAllByRole('listitem', { name: /2026 W27, estimated/ })).toHaveLength(2)
    expect(screen.queryByRole('listitem', { name: /2026 W28, estimated/ })).not.toBeInTheDocument()
    expect(screen.getAllByText(/same estimate applies to every week through 2026 W28 \(2 weeks\)/)).toHaveLength(2)
    expect(screen.getByRole('img', { name: /Past variation from 45 m³ to 60 m³/ })).toBeInTheDocument()
    expect(screen.getByText(/Auckland time/)).toBeVisible()
    expect(screen.getByText('Why this estimate?')).toBeVisible()
    expect(screen.getByText('Refresh order history')).toBeVisible()
    expect(screen.getByText('Treat small brands with care')).toBeVisible()
    expect(screen.queryByText('moving_average')).not.toBeInTheDocument()
  })

  it('lays the decision page out as plain label and value rows without inventing a verdict', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(syntheticForecast), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    })))
    render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={['/dispatcher/capacity-decision']}>
        <Routes><Route element={<Outlet context={{ depot: 'Synthetic depot' }} />}>
          <Route path="/dispatcher/capacity-decision" element={<CapacityDecisionPage />} />
        </Route></Routes>
      </MemoryRouter>
    </QueryClientProvider>)

    const snapshot = await screen.findByLabelText('Forecast snapshot')
    expect(within(snapshot).getByText('51 m³ for the week')).toBeVisible()
    expect(within(snapshot).getByText('13 m³ for the week')).toBeVisible()
    expect(within(snapshot).getByText('Not available until operating days are recorded')).toBeVisible()
    expect(within(snapshot).getByText(/90 m³ · 3 vehicles, one trip each/)).toBeVisible()
    expect(within(snapshot).getByText(/20 m³ · 1 vehicle, one trip each/)).toBeVisible()
    expect(within(snapshot).getByText(/Latest recorded week 2026 W07 · 19 weeks before this run/)).toBeVisible()
    expect(screen.getByText('Proposed action · not available yet')).toBeVisible()
    expect(screen.queryByText(/over capacity/i)).not.toBeInTheDocument()
  })
})
