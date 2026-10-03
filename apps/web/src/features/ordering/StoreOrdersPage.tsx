import { useDeferredValue, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Search, Send } from 'lucide-react'
import { Badge, Button, DataTable, EmptyState, ErrorState, LoadingState, PageHeader, type Column } from '../../components'
import { clock, useStoreHome, useStoreOrderBoard, type OrderGroup, type StoreOrderRow } from '../receipt/receiptQueries'
import { formatVolume, groupPill, relativeDay, tempLabel } from './orderDisplay'
import { useStoreCutoff } from './orderQueries'
import './storeHome.css'

const CHIPS: { group: OrderGroup; label: string; count: (counts: Counts) => number }[] = [
  { group: 'ALL', label: 'All', count: c => c.all },
  { group: 'SUBMITTED', label: 'Submitted', count: c => c.submitted },
  { group: 'PLANNED', label: 'Planned', count: c => c.planned },
  { group: 'IN_DELIVERY', label: 'In delivery', count: c => c.inDelivery },
  { group: 'DELIVERED', label: 'Delivered', count: c => c.delivered },
  { group: 'ISSUE', label: 'Issue', count: c => c.issue },
  { group: 'DEFERRED', label: 'Deferred', count: c => c.deferred },
]
type Counts = { all: number; submitted: number; planned: number; inDelivery: number; delivered: number; issue: number; deferred: number }

export function StoreOrdersPage() {
  const [params, setParams] = useSearchParams()
  const group = (CHIPS.find(chip => chip.group === params.get('group'))?.group ?? 'ALL') as OrderGroup
  const page = Math.max(0, Number(params.get('page') ?? 0) || 0)
  const [typed, setTyped] = useState(params.get('q') ?? '')
  const q = useDeferredValue(typed.trim())
  const home = useStoreHome()
  const cutoff = useStoreCutoff()
  const board = useStoreOrderBoard({ group, q, page })
  const nowIso = cutoff.data?.serverNow
  const zone = cutoff.data?.timeZone
  const clockNow = useMemo(() => nowIso && zone ? { nowIso, timeZone: zone } : null, [nowIso, zone])

  function update(next: Record<string, string | null>) {
    const merged = new URLSearchParams(params)
    for (const [key, value] of Object.entries(next)) { if (value) merged.set(key, value); else merged.delete(key) }
    setParams(merged, { replace: true })
  }

  const columns = useMemo<Column<StoreOrderRow>[]>(() => [
    { key: 'ref', header: 'Order ID', cell: row => <Link className="store-ref" to={`/store/orders/${row.id}`}>{row.ref}</Link> },
    { key: 'date', header: 'Delivery', cell: row => {
      const day = clockNow ? relativeDay(row.deliveryDate, clockNow.nowIso, clockNow.timeZone) : row.deliveryDate
      return row.windowOpen && row.windowClose && row.group !== 'DELIVERED' && row.group !== 'ISSUE'
        ? `${day} · ${clock(row.windowOpen)}–${clock(row.windowClose)}` : day
    } },
    { key: 'units', header: 'Units', cell: row => `${row.units} units · ${tempLabel(row.tempRequirement)}` },
    { key: 'volume', header: 'Volume', align: 'end', cell: row => <strong>{formatVolume(row.volumeM3)}</strong> },
    { key: 'group', header: 'Status', cell: row => { const pill = groupPill(row.group); return <Badge tone={pill.tone}>{pill.label}</Badge> } },
  ], [clockNow])

  const data = board.data
  return <>
    <PageHeader title="Orders" subtitle={home.data ? `${home.data.brand} · ${home.data.district} · ${home.data.outletId}` : 'Orders from your outlet.'}
      actions={<Link className="btn btn-primary btn-md store-place-button" to="/store/orders/new"><Send size={16} aria-hidden="true" />Place New Order</Link>} />

    <div className="store-chips" role="group" aria-label="Filter orders by status">
      {CHIPS.map(chip => <button key={chip.group} type="button" className="store-chip" aria-pressed={group === chip.group}
        onClick={() => update({ group: chip.group === 'ALL' ? null : chip.group, page: null })}>
        {chip.label}{chip.group === 'ALL' && data ? ` ${chip.count(data.counts)}` : data && chip.count(data.counts) > 0 ? ` ${chip.count(data.counts)}` : ''}
      </button>)}
    </div>

    <label className="store-search">
      <Search size={16} aria-hidden="true" />
      <span className="visually-hidden">Search orders</span>
      <input type="search" placeholder="Search orders…" value={typed}
        onChange={event => { setTyped(event.target.value); update({ q: event.target.value.trim() || null, page: null }) }} />
    </label>

    {board.isPending && <LoadingState rows={4} label="Loading orders" />}
    {board.isError && <ErrorState error={board.error} message="Your orders could not be loaded." onRetry={() => void board.refetch()} />}
    {data && data.items.length === 0 && <EmptyState title="No orders" description={q || group !== 'ALL' ? 'No orders match this filter.' : 'Orders you place will appear here.'} />}
    {data && data.items.length > 0 && <>
      <DataTable caption="Orders" columns={columns} rows={data.items} rowKey={row => String(row.id)} />
      {(page > 0 || data.total > data.size) && <nav className="toolbar-row" aria-label="Order pages">
        <Button variant="secondary" disabled={page === 0} onClick={() => update({ page: page > 1 ? String(page - 1) : null })}>Previous page</Button>
        <span>Page {page + 1}</span>
        <Button variant="secondary" disabled={(page + 1) * data.size >= data.total} onClick={() => update({ page: String(page + 1) })}>Next page</Button>
      </nav>}
    </>}
  </>
}
