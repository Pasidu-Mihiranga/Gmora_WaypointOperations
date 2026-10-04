import { Fragment, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Badge, type BadgeTone, Card, ErrorState, LoadingState, MetricCard, PageHeader } from '../../components'
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
/** The API names the business time zone the run time is read in. */
const runTime = (data: DemandForecast) => `${new Date(data.generatedAt).toLocaleString(undefined, {
  dateStyle: 'medium', timeStyle: 'short', timeZone: data.timeZone,
})} (${data.timeZone.split('/').pop()?.replace(/_/g, ' ')} time)`
const perDay = (value: number | null | undefined) => value == null
  ? 'Daily figure unavailable until operating days are recorded'
  : `${m3(value)} per operating day`

/** One projected bar represents a flat baseline; a visible gap separates old records from it. */
function DemandChart({ title, subtitle, tone, weeks, gapWeeks, pick }: {
  title: string
  subtitle: string
  tone: 'total' | 'chilled'
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
  const last = projected[projected.length - 1]
  return <Card className="forecast-chart-card">
    <div className="forecast-chart-head">
      <div><h2 className="text-heading-s">{title}</h2><p className="forecast-chart-sub">{subtitle}</p></div>
      <ul className="forecast-legend">
        <li className="forecast-legend-item"><span className={`forecast-legend-swatch ${tone}`} aria-hidden="true" />Recorded</li>
        <li className="forecast-legend-item"><span className={`forecast-legend-swatch projected ${tone}`} aria-hidden="true" />Estimated</li>
      </ul>
    </div>
    <div className="forecast-bars" role="list" aria-label={title}>
      {shown.map((week, index) => {
        const value = pick(week)
        const height = `${Math.round((Number(value ?? 0) / peak) * 100)}%`
        return <Fragment key={`${week.isoYear}-${week.isoWeek}`}>
          {index === observed.length && gapWeeks != null &&
            <div className="forecast-gap" role="note">
              <strong>{gapWeeks} weeks</strong>
              <span>no recorded orders</span>
            </div>}
          <div className="forecast-bar-group">
            <div className="forecast-bar" role="listitem"
              aria-label={`Week of ${weekStart(week)}, ${weekLabel(week)}, ${week.observed ? 'recorded' : 'estimated'} ${m3(value)}`}>
              <span className={`forecast-bar-value ${week.observed ? '' : 'projected'}`}>{m3(value)}</span>
              <div className="forecast-bar-track">
                <div className={`forecast-bar-fill ${tone} ${week.observed ? 'observed' : 'projected'}`}
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
    <p className="forecast-chart-foot">{flat && projected.length > 1
      ? `The same estimate applies to every week through ${weekLabel(last)} (${projected.length} weeks); repeated bars are hidden.`
      : 'Striped bars are estimated weeks.'}</p>
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

function ChipRow({ chip, title, children }: { chip: string; title: string; children?: ReactNode }) {
  return <div className="forecast-row">
    <span className="forecast-row-chip">{chip}</span>
    <div className="forecast-row-body"><strong>{title}</strong>{children}</div>
  </div>
}

function NextStep({ title, tone, badge, children, to }: {
  title: string; tone: BadgeTone; badge: string; children: ReactNode; to?: string
}) {
  const body = <>
    <span className="forecast-step-head"><strong>{title}{to ? ' →' : ''}</strong><Badge tone={tone}>{badge}</Badge></span>
    <span className="forecast-step-text">{children}</span>
  </>
  return to ? <Link className="forecast-step" to={to}>{body}</Link> : <div className="forecast-step">{body}</div>
}

export function CapacityForecastPage() {
  const scope = useDispatcherScope()
  const forecast = useDemandForecast(scope.depot)
  const data = forecast.data

  const projected = (data?.weeks ?? []).filter(week => !week.observed)
  const firstProjected = projected[0]
  const published = (data?.series ?? []).filter(series => series.confidence !== 'none')
  const cautious = (data?.series ?? []).filter(series => series.confidence === 'low')
  const stale = data?.historyStale === true
  const estimateBadge = <Badge tone={stale ? 'warning' : 'neutral'}>{stale ? 'Older data' : 'Estimate'}</Badge>
  const weekTitle = firstProjected ? `week of ${weekStart(firstProjected)}` : 'the next week'

  return <>
    <PageHeader title="Capacity forecast" subtitle={data
      ? `${data.depot} · next ${projected.length} weeks · estimated demand beside registered fleet space`
      : 'Weekly demand estimated from recorded orders.'}
      actions={<Link className="btn btn-secondary btn-md" to="/dispatcher/capacity-decision">Review fleet limits</Link>} />

    {!scope.depot && <UnavailablePanel title="Weekly demand"
      description="Choose a depot in the workspace header to see its demand outlook." />}
    {scope.depot && forecast.isPending && <LoadingState rows={4} label="Loading demand outlook" />}
    {forecast.isError && <ErrorState error={forecast.error} message="Demand forecast could not be loaded."
      onRetry={() => void forecast.refetch()} />}

    {data && <>
      {stale && <section className="forecast-freshness" role="status" aria-label="Older demand history">
        <strong>History needs updating</strong>
        <p>The latest recorded week is {recordedWeek(data)}, {data.weeksSinceLastObservation} weeks before this forecast was run.
          Use the estimate as an older reference until newer order history is available.</p>
      </section>}

      <section className="forecast-metrics" aria-label="Capacity and demand">
        <MetricCard label="Fleet volume capacity" value={m3(data.capacity.volumeCapM3)}
          caption={`${data.capacity.vehicles} vehicles · one trip each`} />
        <MetricCard label="Refrigerated capacity" value={m3(data.capacity.reeferVolumeCapM3)}
          caption={`${data.capacity.reeferVehicles} vehicles · one trip each`} />
        <MetricCard label="Estimated weekly demand" value={m3(firstProjected?.forecastTotalM3)} badge={estimateBadge}
          caption={firstProjected ? `${weekLabel(firstProjected)} · from ${weekStart(firstProjected)}` : 'No estimate available'} />
        <MetricCard label="Estimated chilled demand" value={m3(firstProjected?.forecastChilledM3)} badge={estimateBadge}
          caption={firstProjected ? 'Part of the weekly total' : 'No estimate available'} />
      </section>

      {data.weeks.length === 0
        ? <UnavailablePanel title="Weekly demand"
            description="No demand history has been aggregated for this depot, so no outlook can be shown. Supply the historical deliveries file to enable it." />
        : <div className="forecast-chart-grid">
            <DemandChart title="Total volume per week" tone="total"
              subtitle="m³ of orders: recorded weeks, then the estimate" weeks={data.weeks}
              gapWeeks={data.historyStale ? data.weeksSinceLastObservation : null}
              pick={week => week.observed ? week.observedTotalM3 : week.forecastTotalM3} />
            <DemandChart title="Chilled volume per week" tone="chilled"
              subtitle="m³ that needs refrigeration" weeks={data.weeks}
              gapWeeks={data.historyStale ? data.weeksSinceLastObservation : null}
              pick={week => week.observed ? week.observedChilledM3 : week.forecastChilledM3} />
          </div>}

      <div className="split-view">
        <Card>
          <h2 className="text-heading-s">Estimate for the {weekTitle}</h2>
          {firstProjected?.forecastTotalM3 == null
            ? <p className="lo-sub">There is not enough completed history to estimate weekly demand for this depot yet.</p>
            : <>
                <ChipRow chip="Total" title={`${m3(firstProjected.forecastTotalM3)} of orders`}>
                  <span>{perDay(firstProjected.forecastTotalPerDayM3)}</span></ChipRow>
                <ChipRow chip="Chilled" title={`${m3(firstProjected.forecastChilledM3)} needs refrigeration`}>
                  <span>{perDay(firstProjected.forecastChilledPerDayM3)}</span></ChipRow>
                <ChipRow chip="Range" title="How much demand has varied">
                  <HistoricalRange low={firstProjected.lowTotalM3} baseline={firstProjected.forecastTotalM3}
                    high={firstProjected.highTotalM3} /></ChipRow>
                <ChipRow chip="Basis" title={data.method === 'moving_average'
                  ? `Average of the latest ${data.windowWeeks} completed weeks per brand`
                  : `Method ${data.method} (${data.methodVersion})`}>
                  <span>Last recorded week {recordedWeek(data)} · run {runTime(data)}</span></ChipRow>
              </>}
        </Card>

        <Card>
          <h2 className="text-heading-s">What to check next</h2>
          <div className="forecast-steps">
            <NextStep title="Review fleet limits" tone="brand" badge="Next step" to="/dispatcher/capacity-decision">
              See this estimate beside registered vehicle space, weight, fuel and driver limits.</NextStep>
            {stale && <NextStep title="Refresh order history" tone="warning" badge="Action needed">
              The newest recorded week is {recordedWeek(data)}. Newer completed orders will change this estimate.</NextStep>}
            {cautious.length > 0 && <NextStep title="Treat small brands with care" tone="warning" badge="Use caution">
              {cautious.map(series => series.brand).join(', ')} {cautious.length === 1 ? 'has' : 'have'} small weekly volume,
              so {cautious.length === 1 ? 'its estimate' : 'their estimates'} can move more.</NextStep>}
            <NextStep title="Plan from confirmed orders" tone="neutral" badge="Reminder">
              This is a guide from past orders. Confirmed orders and the planning checks decide the real trips.</NextStep>
          </div>
        </Card>
      </div>

      <Card className="forecast-brands">
        <h2 className="text-heading-s">Which brands drive the estimate?</h2>
        <p className="lo-sub">Each brand is estimated separately. Chilled volume is part of its total.
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
        {data.method === 'moving_average' && <details className="forecast-method">
          <summary>How was this estimated?</summary>
          <ol className="forecast-method-steps">
            <li>Group past order volume into completed weeks for each brand at {data.depot}.</li>
            <li>Average the latest <strong>{data.windowWeeks} completed weeks</strong> for each brand.</li>
            <li>Add the brand averages to get the depot estimate. Later weeks reuse it because this method does not predict a trend.</li>
          </ol>
        </details>}
      </Card>
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
