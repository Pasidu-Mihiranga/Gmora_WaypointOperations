import { Link } from 'react-router-dom'
import { Badge, Card, ErrorState, LoadingState, MetricCard, PageHeader } from '../../components'
import { UnavailablePanel } from '../../components/UnavailablePanel'
import { useDemandForecast, type DemandForecast } from './forecastQueries'
import { useDispatcherScope } from '../shell/useDispatcherScope'
import './forecast.css'

type Week = DemandForecast['weeks'][number]

/** Format a server number for display. No business value is derived here. */
const m3 = (value: number | null | undefined) =>
  value == null ? '—' : `${Number(value).toLocaleString(undefined, { maximumFractionDigits: 0 })} m³`

const weekLabel = (week: Week) => `W${week.isoWeek}`

/**
 * Weekly demand bars. Observed weeks are solid, projected weeks hatched, scaled against the
 * largest value shown so the chart never implies a capacity threshold it cannot support.
 */
function DemandChart({ title, caption, weeks, pick }: {
  title: string
  caption: string
  weeks: Week[]
  pick: (week: Week) => number | null | undefined
}) {
  const values = weeks.map(week => Number(pick(week) ?? 0))
  const peak = Math.max(...values, 1)
  return (
    <Card>
      <h2 className="text-heading-s">{title}</h2>
      <p className="lo-sub">{caption}</p>
      <div className="forecast-chart">
        <ul className="forecast-legend">
          <li className="forecast-legend-item"><span className="forecast-legend-swatch observed" aria-hidden="true" />Observed</li>
          <li className="forecast-legend-item"><span className="forecast-legend-swatch projected" aria-hidden="true" />Projected</li>
        </ul>
        <div className="forecast-bars" role="list" aria-label={title}>
          {weeks.map(week => {
            const value = pick(week)
            const height = `${Math.round((Number(value ?? 0) / peak) * 100)}%`
            return (
              <div className="forecast-bar" key={`${week.isoYear}-${week.isoWeek}`} role="listitem"
                aria-label={`${weekLabel(week)} ${week.observed ? 'observed' : 'projected'} ${m3(value)}`}>
                <span className="forecast-bar-value">{value == null ? '—' : Math.round(Number(value))}</span>
                <div className="forecast-bar-track">
                  <div className={`forecast-bar-fill ${week.observed ? 'observed' : 'projected'}`}
                    style={{ height }} />
                </div>
                <span className={`forecast-bar-label ${week.observed ? '' : 'projected'}`}>{weekLabel(week)}</span>
              </div>
            )
          })}
        </div>
      </div>
    </Card>
  )
}

export function CapacityForecastPage() {
  const scope = useDispatcherScope()
  const forecast = useDemandForecast(scope.depot)
  const data = forecast.data

  const projected = (data?.weeks ?? []).filter(week => !week.observed)
  const firstProjected = projected[0]
  // The server marks a series unavailable when its history is too short; honour that here.
  const published = (data?.series ?? []).filter(series => series.confidence !== 'none')

  return <>
    <PageHeader title="Capacity forecast" subtitle={data
      ? `${data.depot} · advisory demand outlook from observed history`
      : 'Demand against fleet capacity.'}
      actions={<Link className="btn btn-secondary btn-md" to="/dispatcher/capacity-decision">Capacity decision</Link>} />

    {!scope.depot && <UnavailablePanel title="Weekly demand"
      description="Choose a depot in the workspace header to see its demand outlook." />}
    {scope.depot && forecast.isPending && <LoadingState rows={4} label="Loading demand outlook" />}
    {forecast.isError && <ErrorState error={forecast.error} message="Demand forecast could not be loaded."
      onRetry={() => void forecast.refetch()} />}

    {data && <>
      <section className="grid-metrics" aria-label="Forecast summary">
        {/* Fleet limits are shown as plain facts. The history does not support a capacity verdict,
            so no tile claims a shortfall; feasibility is decided by plan validation alone. */}
        <MetricCard label="Fleet volume capacity" value={m3(data.capacity.volumeCapM3)}
          caption={`${data.capacity.vehicles} vehicles, one trip each`} />
        <MetricCard label="Refrigerated capacity" value={m3(data.capacity.reeferVolumeCapM3)}
          caption={`${data.capacity.reeferVehicles} refrigerated vehicles`} />
        <MetricCard label="Projected weekly demand"
          value={m3(firstProjected?.forecastTotalM3)}
          caption={firstProjected ? `${weekLabel(firstProjected)} · ${m3(firstProjected.forecastTotalPerDayM3)} per operating day` : 'No projection available'} />
        <MetricCard label="Projected chilled demand"
          value={m3(firstProjected?.forecastChilledM3)}
          caption={firstProjected ? `${weekLabel(firstProjected)} · ${m3(firstProjected.forecastChilledPerDayM3)} per operating day` : 'No projection available'} />
      </section>

      {data.weeks.length === 0
        ? <UnavailablePanel title="Weekly demand"
            description="No demand history has been aggregated for this depot, so no outlook can be shown. Supply the historical deliveries file to enable it." />
        : <div className="split-view">
            <DemandChart title="Total volume per week" weeks={data.weeks}
              caption="Observed weeks, then the projected baseline."
              pick={week => week.observed ? week.observedTotalM3 : week.forecastTotalM3} />
            <DemandChart title="Chilled volume per week" weeks={data.weeks}
              caption="Chilled demand comes from the brands that order it."
              pick={week => week.observed ? week.observedChilledM3 : week.forecastChilledM3} />
          </div>}

      <div className="split-view">
        <Card>
          <h2 className="text-heading-s">Demand by brand</h2>
          {published.length === 0
            ? <p className="lo-sub">No brand has enough completed weeks to project yet.</p>
            : <dl className="detail-grid">
                {data.series.map(series => <div key={series.brand}>
                  <dt>{series.brand}{series.confidence === 'low'
                    ? <> <Badge tone="warning">Low confidence</Badge></>
                    : series.confidence === 'none' ? <> <Badge tone="neutral">No projection</Badge></> : null}</dt>
                  <dd>
                    {series.confidence === 'none' ? '—' : m3(series.forecastTotalM3)}
                    {series.chilledApplicable && series.confidence !== 'none'
                      ? ` · ${m3(series.forecastChilledM3)} chilled` : ' · no chilled demand'}
                    <br /><span className="lo-sub">{series.basis}</span>
                  </dd>
                </div>)}
              </dl>}
        </Card>

        <Card>
          <h2 className="text-heading-s">How this was calculated</h2>
          <dl className="detail-grid">
            <div><dt>Method</dt><dd>{data.method} ({data.methodVersion})</dd></div>
            <div><dt>History averaged</dt><dd>{data.windowWeeks} completed weeks per brand</dd></div>
            <div><dt>Range shown</dt><dd>
              {firstProjected?.lowTotalM3 == null ? '—'
                : `${m3(firstProjected.lowTotalM3)} to ${m3(firstProjected.highTotalM3)}`}
            </dd></div>
            <div><dt>Calculated</dt><dd>{new Date(data.generatedAt).toLocaleString()}</dd></div>
          </dl>
          <p className="forecast-advisory">
            The range is how far actual weeks have moved around this baseline in the recorded history,
            not a model confidence interval. These figures are advisory: planning uses confirmed
            orders, and every published plan is re-checked against the operating constraints.
          </p>
        </Card>
      </div>
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

    {!scope.depot && <UnavailablePanel title="Forecast snapshot"
      description="Choose a depot in the workspace header to see its demand outlook." />}

    {data && peak
      ? <Card>
          <h2 className="text-heading-s">Forecast snapshot</h2>
          <p className="lo-sub">Advisory; derived from observed history and not a capacity verdict.</p>
          <dl className="detail-grid">
            <div><dt>Highest projected chilled week</dt>
              <dd>{weekLabel(peak)} · {m3(peak.forecastChilledM3)} ({m3(peak.forecastChilledPerDayM3)} per operating day)</dd></div>
            <div><dt>Total volume that week</dt>
              <dd>{m3(peak.forecastTotalM3)} ({m3(peak.forecastTotalPerDayM3)} per operating day)</dd></div>
            <div><dt>Depot fleet volume</dt>
              <dd>{m3(data.capacity.volumeCapM3)} across {data.capacity.vehicles} vehicles, one trip each</dd></div>
            <div><dt>Refrigerated fleet volume</dt>
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
      description="Recording a fleet decision against the outlook is not built yet. The observed history shows demand well inside depot volume capacity, so no hire or extra-trip recommendation can be justified from it." />
  </>
}
