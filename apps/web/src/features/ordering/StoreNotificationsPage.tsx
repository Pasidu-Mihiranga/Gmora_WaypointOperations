import { Link } from 'react-router-dom'
import { Card, EmptyState, ErrorState, LoadingState, PageHeader } from '../../components'
import { useAuth } from '../auth/auth'
import { useStoreHome, useStoreNotifications, type StoreNotification } from '../receipt/receiptQueries'
import { relativeStamp } from './orderDisplay'
import { useStoreCutoff } from './orderQueries'
import './storeHome.css'

const dayLabel = (date: string | null) => date ? new Date(`${date}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }) : ''

/** Plain-language line for each stored event; the facts (reference, day) come from the API. */
export function notificationText(item: StoreNotification) {
  switch (item.kind) {
    case 'ORDER_SUBMITTED': return `${item.orderRef} was submitted for the ${dayLabel(item.date)} run.`
    case 'ORDER_DEFERRED': return `${item.orderRef} was deferred to the ${dayLabel(item.date)} planning run.`
    case 'ORDER_DISPATCHED': return `${item.orderRef} was loaded and dispatched.`
    case 'ORDER_DELIVERED': return `${item.orderRef} was delivered. Check what arrived and confirm receipt.`
    case 'RECEIPT_CONFIRMED': return `You confirmed receipt of ${item.orderRef}.`
    case 'ISSUE_REPORTED': return `You reported an issue on ${item.orderRef}.`
    case 'ISSUE_RESOLVED': return `The dispatcher resolved the issue on ${item.orderRef}.`
    default: return `${item.orderRef}: ${item.kind}`
  }
}

function target(item: StoreNotification) {
  if (item.kind === 'ISSUE_REPORTED' || item.kind === 'ISSUE_RESOLVED') return '/store/issues'
  if (item.kind === 'ORDER_DELIVERED') return `/store/deliveries/${item.orderId}`
  return `/store/orders/${item.orderId}`
}

/** Figma "SM · Notifications": order updates, read from stored events. There is no read state yet. */
export function StoreNotificationsPage() {
  const auth = useAuth()
  const home = useStoreHome()
  const cutoff = useStoreCutoff()
  const updates = useStoreNotifications()
  const clockNow = cutoff.data?.serverNow && cutoff.data.timeZone ? { nowIso: cutoff.data.serverNow, timeZone: cutoff.data.timeZone } : null
  return <>
    <PageHeader title="Notifications" subtitle={`${auth.user?.displayName ?? 'Store manager'}${home.data ? ` · ${home.data.brand} · ${home.data.district}` : ''}`} />
    {updates.isPending && <LoadingState rows={3} label="Loading updates" />}
    {updates.isError && <ErrorState error={updates.error} message="Your updates could not be loaded." onRetry={() => void updates.refetch()} />}
    {updates.data && updates.data.length === 0 && <EmptyState title="No updates yet" description="Order, delivery and issue updates for your outlet appear here." />}
    {updates.data && updates.data.length > 0 && <Card aria-label="Order updates">
      <h2 className="text-heading-s">Order updates</h2>
      <ul className="store-updates">
        {updates.data.map(item => <li key={`${item.kind}-${item.orderId}-${item.at}`}>
          <Link to={target(item)}>{notificationText(item)}</Link>
          <span className="store-quiet">{relativeStamp(item.at, clockNow)}</span>
        </li>)}
      </ul>
    </Card>}
  </>
}
