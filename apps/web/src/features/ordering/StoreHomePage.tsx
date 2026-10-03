import { Link } from 'react-router-dom'
import { Send, TriangleAlert } from 'lucide-react'
import { Badge, Card, EmptyState, ErrorState, LoadingState, PageHeader } from '../../components'
import { KIND_LABELS, clock, useStoreHome, useStoreOrderBoard, type DeliveryRow } from '../receipt/receiptQueries'
import { formatCutoffCountdown, groupPill, relativeDay, storeStatusPill, tempLabel } from './orderDisplay'
import { StoreDeferralNotices } from './StoreDeferralNotices'
import { useStoreCutoff } from './orderQueries'
import './storeHome.css'

function Kpi({ value, label }: { value: number | undefined; label: string }) {
  return <Card className="store-kpi"><span className="store-kpi-value">{typeof value === 'number' ? value.toLocaleString() : '—'}</span><span className="store-kpi-label">{label}</span></Card>
}

/** Time of day with the date it applies to, e.g. "Tomorrow · 05:30–07:30". All values come from the API. */
function ArrivalCards({ next, nowIso, timeZone }: { next: DeliveryRow; nowIso: string; timeZone: string }) {
  const day = relativeDay(next.planDate, nowIso, timeZone)
  const pill = storeStatusPill(next.phase === 'IN_DELIVERY' ? 'in_transit' : 'planned')
  const window = next.windowOpen && next.windowClose ? `${clock(next.windowOpen)}–${clock(next.windowClose)}` : null
  return <>
    <Card className="store-arrival" aria-label="Arrival">
      <div className="store-card-row"><h2 className="text-heading-s">{next.phase === 'IN_DELIVERY' ? 'On the way' : `Arriving ${day.toLowerCase()}`}</h2>
        <Badge tone={pill.tone}>{pill.label}</Badge></div>
      <p className="store-arrival-time">{next.plannedArrival ? clock(next.plannedArrival) : 'Time not set'}</p>
      <p className="store-quiet">{next.orderRef} · {[next.vehicleId, next.driverName].filter(Boolean).join(' · ') || 'Vehicle and driver to be assigned'}</p>
      {window && <p className="store-quiet">Window {window}{next.plannedArrival ? ` · plan receiving staff for ${clock(next.plannedArrival)}` : ''}</p>}
    </Card>
    <Card className="store-next" aria-label="Next delivery">
      <div className="store-card-row"><h2 className="text-heading-s">Next delivery</h2><Badge tone={pill.tone}>{pill.label}</Badge></div>
      <p className="store-strong">{next.orderRef} · {day}{window ? `, ${window}` : ''}</p>
      <p className="store-quiet">{next.units} units · {tempLabel(next.tempRequirement)}{next.vehicleId ? ` · ${next.vehicleId}` : ''}{next.driverName ? ` · Driver ${next.driverName}` : ''}</p>
      <Link className="table-link" to={`/store/deliveries/${next.orderId}`}>View delivery →</Link>
    </Card>
  </>
}

export function StoreHomePage() {
  const home = useStoreHome()
  const cutoff = useStoreCutoff()
  const orders = useStoreOrderBoard({ group: 'ALL', q: '', page: 0, size: 5 })
  const data = home.data
  const clockNow = cutoff.data?.serverNow && cutoff.data.timeZone ? { nowIso: cutoff.data.serverNow, timeZone: cutoff.data.timeZone } : null
  const recent = orders.data?.items ?? []

  return <>
    <PageHeader title="Home" subtitle={data ? `${data.brand} · ${data.district} · ${data.outletId}` : 'Your outlet at a glance.'}
      actions={<>
        {cutoff.data && <Badge tone={cutoff.data.open ? 'success' : 'neutral'}>
          {cutoff.data.open ? `Ordering open · ${formatCutoffCountdown(cutoff.data.secondsRemaining ?? 0)} left` : `Ordering closed · next delivery ${cutoff.data.nextDeliveryDate ?? '—'}`}
        </Badge>}
        <Link className="btn btn-primary btn-md store-place-button" to="/store/orders/new"><Send size={16} aria-hidden="true" />Place New Order</Link>
      </>} />

    <StoreDeferralNotices />

    {home.isPending && <LoadingState rows={2} label="Loading your outlet summary" />}
    {home.isError && <ErrorState error={home.error} message="Your outlet summary could not be loaded." onRetry={() => void home.refetch()} />}

    {data && <section className="store-kpis" aria-label="Outlet summary">
      <Kpi value={data.openOrders} label="Open orders" />
      <Kpi value={data.pendingDeliveries} label="Pending deliveries" />
      <Kpi value={data.openIssues} label="Open issues" />
      <Kpi value={data.completedOrders} label="Completed orders" />
    </section>}

    <div className="store-body">
      <Card className="store-recent" aria-label="Recent orders">
        <div className="store-card-row store-recent-head">
          <h2 className="text-heading-s">Recent orders</h2>
          <Link className="table-link" to="/store/orders">View all →</Link>
        </div>
        {orders.isPending && <LoadingState rows={2} label="Loading orders" />}
        {orders.isError && <ErrorState error={orders.error} message="Orders could not be loaded." onRetry={() => void orders.refetch()} />}
        {orders.data && recent.length === 0 &&
          <EmptyState title="No orders yet" description="Orders you place for your outlet will appear here." />}
        {recent.map(order => {
          const pill = groupPill(order.group)
          return <div className="store-order-row" key={order.id}>
            <div>
              <p className="store-order-line"><Link className="store-ref" to={`/store/orders/${order.id}`}>{order.ref}</Link>
                <span aria-hidden="true">·</span>
                <span>{clockNow ? relativeDay(order.deliveryDate, clockNow.nowIso, clockNow.timeZone) : order.deliveryDate}
                  {order.planningDate !== order.orderDate ? ' · moved to a later run' : ''}</span></p>
              <p className="store-quiet">{order.units} units · {tempLabel(order.tempRequirement)}</p>
            </div>
            <Badge tone={pill.tone}>{pill.label}</Badge>
          </div>
        })}
      </Card>

      <div className="store-stack">
        {data?.nextDelivery && clockNow
          ? <ArrivalCards next={data.nextDelivery} nowIso={clockNow.nowIso} timeZone={clockNow.timeZone} />
          : data && <Card><h2 className="text-heading-s">Next delivery</h2>
              <p className="store-quiet">No delivery is planned for your outlet yet. It appears here once an order is planned.</p></Card>}
        {data?.latestOpenIssue && <Card className="store-issue" aria-label="Open issue">
          <p className="store-issue-label"><TriangleAlert size={16} aria-hidden="true" />Open issue</p>
          <p className="store-strong">{data.latestOpenIssue.orderRef} · {KIND_LABELS[data.latestOpenIssue.kind] ?? data.latestOpenIssue.kind} · {data.latestOpenIssue.affectedUnits} of {data.latestOpenIssue.deliveredUnits} units</p>
          <Link className="store-issue-link" to="/store/issues">View issue →</Link>
        </Card>}
      </div>
    </div>
  </>
}
