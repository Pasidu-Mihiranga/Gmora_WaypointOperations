import { Fragment } from 'react'
import { Link } from 'react-router-dom'
import { Badge, Card, ErrorState, LoadingState, MetricCard, PageHeader } from '../../components'
import { UnavailablePanel } from '../../components/UnavailablePanel'
import { useDemandForecast, type DemandForecast } from './forecastQueries'
import { useDispatcherScope } from '../shell/useDispatcherScope'
import './forecast.css'

type Week = DemandForecast['weeks'][number]

/** The API owns the figures; these helpers only format its values and dates. */
const m3 = (value: number | null | undefined) =>
  value == null ? '—' : `${Number(value).toLocaleString(undefined, { maximumFractionDigits: 0 })} m³`
const weekLabel = (week: Week) => `${week.isoYear} W${String(week.isoWeek).padStart(2, '0')}`
/** ISO weeks start on Monday; the date makes "W27" readable without knowing the week numbering. */
const weekStart = (week: Week) => {
  const jan4 = new Date(Date.UTC(week.isoYear, 0, 4))
  const monday = new Date(jan4.getTime() + ((week.isoWeek - 1) * 7 - ((jan4.getUTCDay() + 6) % 7)) * 86_400_000)
  return monday.toLocaleDateString(undefined, { day: 'numeric', month: 'short', timeZone: 'UTC' })
}
const recordedWeek = (data: DemandForecast) => data.latestObservedIsoYear != null && data.latestObservedIsoWeek != null
  ? `${data.latestObservedIsoYear} W${String(data.latestObservedIsoWeek).padStart(2, '0')}` : 'Not available'
const runTime = (timestamp: string) => new Date(timestamp).toLocaleString(undefined, {
  dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Colombo',
})
const perDay = (value: number | null | undefined) => value == null
  ? 'Daily figure unavailable until operating days are recorded'
  : `${m3(value)} per operating day`

/** One projected bar represents a flat baseline; a visible gap separates old records from it. */
function DemandChart({ title, weeks, gapWeeks, pick }: {
  title: string
  weeks: Week[]
  gapWeeks: number | null | undefined
  pick: (week: Week) => number | null | undefined
}) {
  const observed = weeks.filter(week => week.observed)
  const projected = weeks.filter(week => !week.observed && pick(week) != null)
  const first = projected[0]
  const flat = first != null && projected.every(week => pick(week) === pick(first))
  const shown = [...observed, ...(flat ? projected.slice(0, 1) : projected)]
  const peak = Math.max(...shown.map(week => Number(pick(week) ?? 0)), 1)
  return <Card className="forecast-chart-card">
    <h2 className="text-heading-s">{title}</h2>
    <p className="lo-sub">Solid bars are recorded demand. Stripes show the first estimated week after the forecast run.</p>
    <div className="forecast-chart">
      <ul className="forecast-legend">
        <li className="forecast-legend-item"><span className="forecast-legend-swatch observed" aria-hidden="true" />Recorded</li>
        <li className="forecast-legend-item"><span className="forecast-legend-swatch projected" aria-hidden="true" />Estimated</li>
      </ul>
      <div className="forecast-bars" role="list" aria-label={title}>
        {shown.map((week, index) => {
          const value = pick(week)
          const height = `${Math.round((Number(value ?? 0) / peak) * 100)}%`
          return <Fragment key={`${week.isoYear}-${week.isoWeek}`}>
            {index === observed.length && gapWeeks != null && gapWeeks > 1 &&
              <div className="forecast-gap" role="note">
                <strong>{gapWeeks} weeks</strong>
                <span>no recorded orders</span>
              </div>}
            <div className="forecast-bar-group">
              <div className="forecast-bar" role="listitem"
                aria-label={`Week of ${weekStart(week)}, ${weekLabel(week)}, ${week.observed ? 'recorded' : 'estimated'} ${m3(value)}`}>
                <span className="forecast-bar-value">{m3(value)}</span>
                <div className="forecast-bar-track">
                  <div className={`forecast-bar-fill ${week.observed ? 'observed' : 'projected'}`}
                    style={{ height }} />
                </div>
                <span className={`forecast-bar-label ${week.observed ? '' : 'projected'}`}>
                  W{String(week.isoWeek).padStart(2, '0')}<small>{weekStart(week)}</small>
                </span>
              </div>
            </div>
          </Fragment>
        })}
      </div>
      {flat && projected.length > 1 && <p className="forecast-chart-note">
        The same estimate applies to every week through {weekLabel(projected[projected.length - 1])} ({projected.length} weeks); the repeated bars are hidden for clarity.
      </p>}
    </div>
  </Card>
}

function HistoricalRange({ low, baseline, high }: {
  low: number | null | undefined
  baseline: number | null | undefined
  high: number | null | undefined
}) {
  if (low == null || baseline == null || high == null || high <= low) {
    return <p className="lo-sub">There are not enough past comparisons to show a useful range.</p>
  }
  const marker = Math.max(0, Math.min(100, ((baseline - low) / (high - low)) * 100))
  return <div className="forecast-range" role="img"
    aria-label={`Past variation from ${m3(low)} to ${m3(high)}, around a weekly estimate of ${m3(baseline)}`}>
    <div className="forecast-range-track"><span className="forecast-range-marker" style={{ left: `${marker}%` }} /></div>
    <div className="forecast-range-labels"><span>{m3(low)}<small>Lower end</small></span>
      <span>{m3(baseline)}<small>Estimate</small></span><span>{m3(high)}<small>Upper end</small></span></div>
  </div>
}

export function CapacityForecastPage() {
  const scope = useDispatcherScope()
  const forecast = useDemandForecast(scope.depot)
  const data = forecast.data

  const projected = (data?.weeks ?? []).filter(week => !week.observed)
  const firstProjected = projected[0]
  const published = (data?.series ?? []).filter(series => series.confidence !== 'none')

  return <>
    <PageHeader title="Capacity forecast" subtitle={data
      ? `${data.depot} · calculated ${runTime(data.generatedAt)} (Sri Lanka time) from recorded orders`
      : 'Weekly demand estimated from recorded orders.'}
      actions={<Link className="btn btn-secondary btn-md" to="/dispatcher/capacity-decision">Review fleet limits</Link>} />

    {!scope.depot && <UnavailablePanel title="Weekly demand"
      description="Choose a depot in the workspace header to see its demand outlook." />}
    {scope.depot && forecast.isPending && <LoadingState rows={4} label="Loading demand outlook" />}
    {forecast.isError && <ErrorState error={forecast.error} message="Demand forecast could not be loaded."
      onRetry={() => void forecast.refetch()} />}

    {data && <>
      <section className="forecast-intro" aria-label="How to read this outlook">
        <h2 className="text-heading-s">What this forecast says</h2>
        {firstProjected?.forecastTotalM3 == null
          ? <p>There is not enough completed history to estimate weekly demand for this depot yet.</p>
          : <p>The first week after this forecast run is estimated at <strong>{m3(firstProjected.forecastTotalM3)}</strong> of orders,
              including <strong>{m3(firstProjected.forecastChilledM3)}</strong> needing refrigeration.
              This is a guide from past orders, not a count of confirmed orders or a delivery plan.</p>}
      </section>

      {data.weeksSinceLastObservation != null && data.weeksSinceLastObservation > 1 &&
        <section className="forecast-freshness" role="status" aria-label="Older demand history">
          <strong>History needs updating</strong>
          <p>The latest recorded week is {recordedWeek(data)}, {data.weeksSinceLastObservation} weeks before this forecast was run.
            Use this estimate as an older reference until newer order history is available.</p>
        </section>}

      <section aria-label="Estimated demand">
        <h2 className="forecast-section-title">{firstProjected?.forecastTotalM3 == null
          ? 'Demand estimate unavailable' : `Estimated demand for the week of ${weekStart(firstProjected)} (${weekLabel(firstProjected)})`}</h2>
        <div className="forecast-metrics">
          <MetricCard label="All order volume" value={m3(firstProjected?.forecastTotalM3)}
            caption={firstProjected ? perDay(firstProjected.forecastTotalPerDayM3) : 'No estimate available'} />
          <MetricCard label="Of that, chilled volume" value={m3(firstProjected?.forecastChilledM3)}
            caption={firstProjected ? perDay(firstProjected.forecastChilledPerDayM3) : 'No estimate available'} />
        </div>
      </section>

      {data.weeks.length === 0
        ? <UnavailablePanel title="Weekly demand"
            description="No demand history has been aggregated for this depot, so no outlook can be shown. Supply the historical deliveries file to enable it." />
        : <div className="forecast-chart-grid">
            <DemandChart title="All order volume by week" weeks={data.weeks}
              gapWeeks={data.weeksSinceLastObservation}
              pick={week => week.observed ? week.observedTotalM3 : week.forecastTotalM3} />
            <DemandChart title="Chilled volume by week" weeks={data.weeks}
              gapWeeks={data.weeksSinceLastObservation}
              pick={week => week.observed ? week.observedChilledM3 : week.forecastChilledM3} />
          </div>}

      <div className="split-view">
        <Card>
          <h2 className="text-heading-s">Which brands drive the estimate?</h2>
          <p className="lo-sub">Each brand is estimated separately. Chilled volume is included in its total.
            “Use caution” marks a small-volume series; it is not a probability score.</p>
          {published.length === 0
            ? <p className="lo-sub">No brand has enough completed weeks to project yet.</p>
            : <ul className="forecast-brand-list">
                {data.series.map(series => <li key={series.brand} className="forecast-brand-row">
                  <div className="forecast-brand-heading"><strong>{series.brand}</strong>
                    {series.confidence === 'low' ? <Badge tone="warning">Use caution</Badge>
                      : series.confidence === 'none' ? <Badge tone="neutral">No estimate</Badge> : null}</div>
                  <p>{series.confidence === 'none' ? 'No weekly estimate yet' : <>
                    {m3(series.forecastTotalM3)} total · {series.chilledApplicable
                      ? `${m3(series.forecastChilledM3)} of that chilled` : 'no chilled demand recorded'}</>}</p>
                  <details><summary>Why this estimate?</summary><p>{series.basis}</p></details>
                </li>)}
              </ul>}
        </Card>

        <Card>
          <h2 className="text-heading-s">How was this estimated?</h2>
          {data.method === 'moving_average' ? <ol className="forecast-method-steps">
            <li>Group past order volume into completed weeks for each brand at {data.depot}.</li>
            <li>Average the latest <strong>{data.windowWeeks} completed weeks</strong> for each brand.</li>
            <li>Add those brand averages to get the depot estimate. The same weekly estimate is used for later weeks because this method does not predict a trend.</li>
          </ol> : <p className="lo-sub">Method: {data.method} ({data.methodVersion}).</p>}
          <div className="forecast-basis-facts">
            <p><strong>Last recorded week</strong><span>{recordedWeek(data)}</span></p>
            <p><strong>Forecast run</strong><span>{runTime(data.generatedAt)} (Sri Lanka time)</span></p>
          </div>
          <h3 className="forecast-range-title">How much has demand varied?</h3>
          <HistoricalRange low={firstProjected?.lowTotalM3} baseline={firstProjected?.forecastTotalM3}
            high={firstProjected?.highTotalM3} />
          <p className="forecast-advisory">This band summarizes past variation around the weekly estimate.
            It is not a guarantee or a statistical confidence interval.</p>
        </Card>
      </div>
      <section className="forecast-capacity-context" aria-label="Fleet reference">
        <div><h2 className="forecast-section-title">Fleet reference</h2>
          <p>One trip of space across registered vehicles. Actual availability, routes, weight, temperature and time limits are checked during planning.</p></div>
        <div className="forecast-metrics">
          <MetricCard label="All registered vehicles" value={m3(data.capacity.volumeCapM3)}
            caption={`${data.capacity.vehicles} vehicles · one trip each`} />
          <MetricCard label="Registered refrigerated vehicles" value={m3(data.capacity.reeferVolumeCapM3)}
            caption={`${data.capacity.reeferVehicles} vehicles · one trip each`} />
        </div>
      </section>
    </>}
  </>
}

export function CapacityDecisionPage() {
  const scope = useDispatcherScope()
  const forecast = useDemandForecast(scope.depot)
  const data = forecast.data
  const projected = (data?.weeks ?? []).filter(week => !week.observed)
  const peak = projected.reduce<Week | null>((best, week) =>
    best == null || Number(week.forecastChilledM3 ?? 0) > Number(best.forecastChilledM3 ?? 0) ? week : best, null)

  return <>
    <PageHeader title="Capacity decision"
      subtitle={data ? `${data.depot} · from the advisory demand outlook` : 'Review the demand outlook before recording a fleet decision.'} />

    {forecast.isError && <ErrorState error={forecast.error} message="Demand forecast could not be loaded."
      onRetry={() => void forecast.refetch()} />}
    {scope.depot && forecast.isPending && <LoadingState label="Loading capacity review" />}

    {!scope.depot && <UnavailablePanel title="Forecast snapshot"
      description="Choose a depot in the workspace header to see its demand outlook." />}

    {data && peak?.forecastChilledM3 != null
      ? <Card>
          <h2 className="text-heading-s">Forecast snapshot</h2>
          <p className="lo-sub">This is an order-volume estimate from history. It is not a capacity verdict.</p>
          <dl className="detail-grid">
            <div><dt>Projected chilled week</dt>
              <dd>{weekLabel(peak)} · {m3(peak.forecastChilledM3)} ({perDay(peak.forecastChilledPerDayM3)})</dd></div>
            <div><dt>Total volume that week</dt>
              <dd>{m3(peak.forecastTotalM3)} ({perDay(peak.forecastTotalPerDayM3)})</dd></div>
            <div><dt>Registered fleet space</dt>
              <dd>{m3(data.capacity.volumeCapM3)} across {data.capacity.vehicles} vehicles, one trip each</dd></div>
            <div><dt>Registered refrigerated space</dt>
              <dd>{m3(data.capacity.reeferVolumeCapM3)} across {data.capacity.reeferVehicles} vehicles</dd></div>
          </dl>
          <Link className="table-link" to="/dispatcher/forecast">Back to the demand outlook</Link>
        </Card>
      : scope.depot ? <UnavailablePanel title="Forecast snapshot"
          description="A demand outlook is needed first. Supply the historical deliveries file to enable it." /> : null}

    <Card><h2 className="text-heading-s">What the dispatcher should review</h2><dl className="detail-grid">
      <div><dt>Weight and volume</dt><dd>Use both limits for every planned vehicle.</dd></div>
      <div><dt>Temperature</dt><dd>Use compatible vehicles for each order.</dd></div>
      <div><dt>Fuel and route count</dt><dd>Check the weekly quota and permitted trips.</dd></div>
      <div><dt>People and depot</dt><dd>Check driver cover and depot allocation.</dd></div>
    </dl></Card>

    <UnavailablePanel title="Proposed action"
      description="Recording a fleet decision against this outlook is not available yet. Use confirmed orders and the planning validator before making a vehicle commitment." />
  </>
}
