import type { BadgeTone, VehicleKind } from '../../components'
import type { components } from '../../generated/api'

export function planningOrdersCsv(orders: components['schemas']['CustomerOrder'][]) {
  const cell = (value: unknown) => `"${String(value ?? '').replaceAll('"', '""')}"`
  return [
    'Order ID,Outlet,District,Volume,Type',
    ...orders.map(order => [order.ref, order.outletId, order.district, order.volumeM3, order.tempRequirement].map(cell).join(',')),
  ].join('\r\n')
}

/** Formats order fields for display. Does not compute business metrics. */
export function formatVolume(m3: number | string) {
  const n = typeof m3 === 'string' ? Number(m3) : m3
  return `${n.toFixed(3)} m³`
}

export function formatWeight(kg: number | string) {
  const n = typeof kg === 'string' ? Number(kg) : kg
  return `${n.toFixed(1)} kg`
}

export function tempKind(temp: string): VehicleKind {
  return temp === 'chilled' ? 'fridge' : 'normal'
}

export function tempLabel(temp: string) {
  return temp === 'chilled' ? 'Refrigerated' : 'Ambient'
}

export function statusTone(status: string): BadgeTone {
  switch (status) {
    case 'confirmed': return 'neutral'
    case 'planned':
    case 'loaded':
    case 'delivered':
    case 'receipt_confirmed': return 'success'
    case 'deferred':
    case 'failed':
    case 'cancelled': return 'danger'
    case 'in_transit':
    case 'partial': return 'warning'
    default: return 'neutral'
  }
}

export interface StorePill { label: string; tone: BadgeTone }

/** The pill for a group the server assigned (SUBMITTED, PLANNED, IN_DELIVERY, DELIVERED, ISSUE, DEFERRED, CANCELLED). */
export function groupPill(group: string): StorePill {
  switch (group) {
    case 'SUBMITTED': return { label: 'Submitted', tone: 'neutral' }
    case 'PLANNED': return { label: 'Planned', tone: 'warning' }
    case 'IN_DELIVERY': return { label: 'In delivery', tone: 'warning' }
    case 'DELIVERED': return { label: 'Delivered', tone: 'success' }
    case 'ISSUE': return { label: 'Issue', tone: 'danger' }
    case 'DEFERRED': return { label: 'Deferred', tone: 'danger' }
    case 'CANCELLED': return { label: 'Cancelled', tone: 'neutral' }
    default: return { label: group, tone: 'neutral' }
  }
}

/** The pill for a single order from its status and receipt; mirrors the grouping the server applies to the order board.
 *  A disputed receipt shows as Issue even though the order stays delivered. */
export function storeStatusPill(status: string, receipt?: string | null): StorePill {
  if (receipt === 'DISPUTED') return { label: 'Issue', tone: 'danger' }
  switch (status) {
    case 'draft':
    case 'confirmed': return { label: 'Submitted', tone: 'neutral' }
    case 'planned':
    case 'loaded': return { label: 'Planned', tone: 'warning' }
    case 'in_transit': return { label: 'In delivery', tone: 'warning' }
    case 'delivered':
    case 'partial':
    case 'receipt_confirmed': return { label: 'Delivered', tone: 'success' }
    case 'deferred': return { label: 'Deferred', tone: 'danger' }
    case 'failed': return { label: 'Issue', tone: 'danger' }
    case 'cancelled': return { label: 'Cancelled', tone: 'neutral' }
    default: return { label: status, tone: 'neutral' }
  }
}

/** "Today", "Tomorrow", "Yesterday", "3 days ago" or the date, read in the business time zone the API reports. */
export function relativeDay(date: string, nowIso: string, timeZone: string) {
  const today = new Date(nowIso).toLocaleDateString('en-CA', { timeZone })
  const days = Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000)
  if (days === 0) return 'Today'
  if (days === 1) return 'Tomorrow'
  if (days === -1) return 'Yesterday'
  if (days < 0 && days > -7) return `${-days} days ago`
  return new Date(`${date}T00:00:00Z`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', timeZone: 'UTC' })
}

export interface BusinessClock { nowIso: string; timeZone: string }

/** "Today at 15:00" or "3 days ago at 09:14", read in the business time zone the API reports. */
export function relativeStamp(iso: string | null | undefined, clock: BusinessClock | null) {
  if (!iso || !clock) return '—'
  const day = relativeDay(new Date(iso).toLocaleDateString('en-CA', { timeZone: clock.timeZone }), clock.nowIso, clock.timeZone)
  return `${day} at ${new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: clock.timeZone })}`
}

export function planningLabel(status: string) {
  if (status === 'deferred') return 'Deferred'
  if (status === 'confirmed' || status === 'draft') return 'Unplanned'
  return 'Planned'
}

export function planningTone(status: string): BadgeTone {
  if (status === 'deferred') return 'danger'
  if (status === 'confirmed' || status === 'draft') return 'neutral'
  return 'success'
}

export function formatCutoffCountdown(seconds: number) {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}
