import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Check } from 'lucide-react'
import { Badge, EmptyState, ErrorState, LoadingState, PageHeader, TypeBadge } from '../../components'
import { relativeDay, tempLabel } from '../ordering/orderDisplay'
import { useStoreCutoff } from '../ordering/orderQueries'
import type { BadgeTone } from '../../components'
import { clock, OUTCOME_LABELS, useStoreDeliveries, useStoreHome, when } from './receiptQueries'
import type { DeliveryRow, Phase } from './receiptQueries'
import './receipt.css'

const FILTERS: { key: Phase | 'ALL'; label: string }[] = [
  { key: 'ALL', label: 'All' }, { key: 'PENDING', label: 'Pending' }, { key: 'IN_DELIVERY', label: 'In Delivery' }, { key: 'DELIVERED', label: 'Delivered' },
]

export function deliveryBadge(row: Pick<DeliveryRow, 'phase' | 'receipt' | 'outcome'>): { label: string; tone: BadgeTone } {
  if (row.receipt === 'DISPUTED') return { label: 'Issue open', tone: 'danger' }
  if (row.receipt === 'CONFIRMED' || row.receipt === 'RESOLVED') return { label: 'Received', tone: 'success' }
  if (row.phase === 'PENDING') return { label: 'Pending', tone: 'neutral' }
  if (row.phase === 'IN_DELIVERY') return { label: 'In delivery', tone: 'warning' }
  if (row.outcome === 'FAILED') return { label: 'Not delivered', tone: 'danger' }
  return { label: row.outcome === 'PARTIAL' ? 'Partly delivered' : 'Delivered', tone: row.outcome === 'PARTIAL' ? 'warning' : 'success' }
}

/** Figma Store Manager · Deliveries (89:7490): the outlet's orders on the way, delivered or received. */
export function StoreDeliveriesPage() {
  const deliveries = useStoreDeliveries()
  const home = useStoreHome()
  const cutoff = useStoreCutoff()
  const [filter, setFilter] = useState<Phase | 'ALL'>('ALL')
  const rows = (deliveries.data ?? []).filter(row => filter === 'ALL' || row.phase === filter)
  return (
    <>
      <PageHeader title="Deliveries" subtitle={home.data ? `${home.data.brand} · ${home.data.district} · ${home.data.outletId}` : 'Orders on their way to your outlet.'} />
      <div className="rc-filters" role="group" aria-label="Filter by delivery status">
        {FILTERS.map(f => (
          <button key={f.key} type="button" aria-pressed={filter === f.key} className={`filter-pill${filter === f.key ? ' active' : ''}`} onClick={() => setFilter(f.key)}>{f.label}</button>
        ))}
      </div>
      {deliveries.isPending && <LoadingState rows={3} label="Loading deliveries" />}
      {deliveries.isError && <ErrorState error={deliveries.error} message="Deliveries could not be loaded." onRetry={() => void deliveries.refetch()} />}
      {deliveries.data && deliveries.data.length === 0 && <EmptyState title="No deliveries yet" description="Planned orders appear here once the dispatcher publishes the plan." />}
      {deliveries.data && deliveries.data.length > 0 && rows.length === 0 && <EmptyState title="Nothing in this status" description="Choose another filter." />}
      <div className="rc-list">
        {rows.map(row => {
          const badge = deliveryBadge(row)
          return (
            <article key={row.orderId} className="rc-card" aria-label={row.orderRef}>
              <div className="rc-row">
                <h2 className="rc-ref">{row.orderRef}</h2>
                {badge.label === 'Pending' ? <TypeBadge kind="normal">Pending</TypeBadge> : <Badge tone={badge.tone}>{badge.label}</Badge>}
              </div>
              <p className="rc-sub">
                {cutoff.data?.serverNow && cutoff.data.timeZone ? relativeDay(row.planDate, cutoff.data.serverNow, cutoff.data.timeZone) : row.planDate}
                {row.windowOpen ? `, ${clock(row.windowOpen)}–${clock(row.windowClose)}` : ''} · {row.units} {row.units === 1 ? 'unit' : 'units'} · {tempLabel(row.tempRequirement)}
                {row.plannedArrival && row.phase !== 'DELIVERED' ? ` · planned ${clock(row.plannedArrival)}` : ''}
              </p>
              <p className="rc-sub">
                {row.driverName ? `Driver ${row.driverName}` : 'Driver not assigned yet'}{row.vehicleId ? ` · ${row.vehicleId}` : ''}
                {row.outcome ? ` · ${OUTCOME_LABELS[row.outcome]}${row.deliveredUnits !== null ? ` (${row.deliveredUnits} of ${row.units} units)` : ''}` : ''}
                {row.deliveredAt ? ` · ${when(row.deliveredAt)}` : ''}
              </p>
              {row.phase !== 'PENDING' && <ol className="rc-steps" aria-label="Delivery progress">
                {[['Planned', true], ['On the road', true], ['Delivered', row.phase === 'DELIVERED']].map(([label, done], index) =>
                  <li key={String(label)} className={done ? 'rc-step rc-step-done' : 'rc-step'}>
                    <span className="rc-step-dot">{done ? <Check size={12} aria-hidden="true" /> : index + 1}</span>
                    <span className="rc-step-label">{label}</span>
                  </li>)}
              </ol>}
              <Link className="rc-link" to={`/store/deliveries/${row.orderId}`}>
                {row.phase === 'DELIVERED' && row.receipt === 'NONE' && row.outcome !== 'FAILED' ? 'Confirm receipt →' : 'View delivery →'}
              </Link>
            </article>
          )
        })}
      </div>
    </>
  )
}
