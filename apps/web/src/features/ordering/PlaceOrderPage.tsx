import { useDeferredValue, useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import {
  Boxes, Check, CheckCircle2, Coffee, Cookie, CupSoda, Croissant, Laptop, Milk, Minus, Package, Plus, Refrigerator, Search, Send, Shirt,
  ShoppingBasket, Smartphone, Snowflake, Tv, WashingMachine,
} from 'lucide-react'
import { Button, Card, ErrorState, Input, LoadingState, PageHeader } from '../../components'
import { clock, useStoreHome } from '../receipt/receiptQueries'
import { formatVolume, formatWeight } from './orderDisplay'
import { useCatalog, useOrderEstimate, useOrderPreview, useStoreCutoff, type BasketLine, type CatalogItem } from './orderQueries'
import { api } from '../../lib/apiClient'
import './storeHome.css'

type Step = 'details' | 'review' | 'done'
type Placed = { id: number; ref: string; orderDate: string; temp: string; units: number; items: number | null; volumeM3: number }

const ERRORS: Record<string, string> = {
  DELIVERY_DATE_CHANGED: 'The delivery date changed. Review the updated date and confirm again.',
  DUPLICATE_TEMP_ORDER: 'You already have an active order of this temperature for that delivery day.',
  CHILLED_FRESH_ONLY: 'Only Fresh outlets may place chilled orders.',
  NO_OPERATING_DAY: 'The delivery calendar needs to be extended before an order can be placed.',
  PRODUCT_NOT_AVAILABLE: 'An item in your basket is no longer available. Review your items.',
  CATALOG_UNAVAILABLE: 'The catalog cannot be sized yet. Order by units instead.',
}

/** What the store calls the two kinds of order. */
const kind = (temp: string) => temp === 'chilled' ? 'Chilled' : 'Dry'

/** "Sat 27 Jun" for a plain calendar date. */
const dayLabel = (date: string) => new Date(`${date}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })

const ICONS: Record<string, ReactNode> = {
  'Dairy & Chilled': <Milk size={22} />, Bakery: <Croissant size={22} />, Beverages: <CupSoda size={22} />, Frozen: <Snowflake size={22} />,
  Pantry: <ShoppingBasket size={22} />, Snacks: <Cookie size={22} />, 'Hanging garments': <Shirt size={22} />, Cartons: <Package size={22} />,
  Appliances: <Refrigerator size={22} />, 'Consumer electronics': <Tv size={22} />,
}
const ITEM_ICONS: Record<string, ReactNode> = {
  'Coffee 200g': <Coffee size={22} />, 'Washing Machine': <WashingMachine size={22} />, 'Laptop Carton': <Laptop size={22} />,
  'Smartphone Carton': <Smartphone size={22} />,
}
const iconFor = (item: CatalogItem) => ITEM_ICONS[item.name] ?? ICONS[item.categoryName] ?? <Boxes size={22} />

/** The two steps of Figma's Place Order flow: choose what to order, then review and submit. */
function Stepper({ step }: { step: Step }) {
  return <ol className="store-steps" aria-label="Order steps">
    <li className={step === 'details' ? 'store-step store-step-active' : 'store-step store-step-done'}>
      <span className="store-step-dot">{step === 'details' ? 1 : <Check size={12} aria-hidden="true" />}</span>Select products</li>
    <li className={step === 'review' ? 'store-step store-step-active' : 'store-step'}><span className="store-step-dot">2</span>Review &amp; submit</li>
  </ol>
}

export function PlaceOrderPage() {
  const client = useQueryClient()
  const navigate = useNavigate()
  const cutoff = useStoreCutoff()
  const home = useStoreHome()
  const [step, setStep] = useState<Step>('details')
  const [temp, setTemp] = useState('ambient')
  const [cart, setCart] = useState<Record<number, number>>({})
  const [category, setCategory] = useState<number | null>(null)
  const [search, setSearch] = useState('')
  const [units, setUnits] = useState('')
  const [weightEdit, setWeightEdit] = useState<string | null>(null)
  const [volumeEdit, setVolumeEdit] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [placed, setPlaced] = useState<Placed | null>(null)

  const catalog = useCatalog(temp)
  const items = catalog.data?.items ?? []
  const byItems = catalog.data != null && catalog.data.sized && items.length > 0     // otherwise the store orders by units
  const lines: BasketLine[] = items.filter(item => (cart[item.id] ?? 0) > 0).map(item => ({ productId: item.id, quantity: cart[item.id] }))
  const preview = useOrderPreview(temp, byItems ? lines : [])
  const shown = byItems && lines.length > 0 ? preview.data ?? null : null

  // Fallback: ordering by units with a server estimate.
  const unitCount = useDeferredValue(Number(units))
  const estimate = useOrderEstimate(temp, !byItems && units.trim() !== '' && Number.isInteger(unitCount) && unitCount >= 1 ? unitCount : null)
  const est = estimate.data && estimate.data.units === Number(units) ? estimate.data : null
  const weight = weightEdit ?? (est?.weightKg != null ? String(est.weightKg) : '')
  const volume = volumeEdit ?? (est?.volumeM3 != null ? String(est.volumeM3) : '')

  const chilledAllowed = catalog.data?.chilledAllowed ?? estimate.data?.chilledAllowed ?? true
  const timing = catalog.data?.windowOpen ? catalog.data : est
  const window = timing?.windowOpen && timing.windowClose ? `${clock(timing.windowOpen)}–${clock(timing.windowClose)}` : null
  const deliveryDate = cutoff.data?.nextDeliveryDate
  const deliveryLabel = deliveryDate ? dayLabel(deliveryDate) : '—'
  const outlet = home.data ? `${home.data.brand} · ${home.data.district} (${home.data.outletId})` : '—'
  const visible = items.filter(item => (category == null || item.categoryId === category) && (!search.trim() || item.name.toLowerCase().includes(search.trim().toLowerCase())))

  function setQuantity(id: number, quantity: number) {
    setCart(current => { const next = { ...current }; if (quantity > 0) next[id] = Math.min(quantity, 100_000); else delete next[id]; return next })
  }
  function chooseTemp(value: string) { setTemp(value); setCart({}); setCategory(null); setWeightEdit(null); setVolumeEdit(null); setFormError(null) }

  function validate() {
    if (byItems) {
      if (lines.length === 0) return setFormError('Add at least one item to your order.')
      setFormError(null)
      return { lines }
    }
    const u = Number(units), w = Number(weight), v = Number(volume)
    if (!Number.isInteger(u) || u < 1) return setFormError('Enter a whole number of units of at least 1.')
    if (!(w > 0) || !(v > 0)) return setFormError('Weight and volume must be greater than zero. Enter them if no estimate is shown.')
    setFormError(null)
    return { units: u, weightKg: w, volumeM3: v }
  }

  async function onSubmit() {
    const values = validate()
    if (!values) { setStep('details'); return }
    setSubmitting(true)
    setSubmitError(null)
    try {
      const { data, error } = await api.POST('/api/v1/store/orders', {
        body: { expectedDeliveryDate: cutoff.data?.nextDeliveryDate, tempRequirement: temp, ...values },
      })
      if (!data) {
        const code = error && typeof error === 'object' && 'code' in error ? String((error as { code?: string }).code) : undefined
        if (code === 'DELIVERY_DATE_CHANGED') await cutoff.refetch()
        setSubmitError(ERRORS[code ?? ''] ?? 'The order could not be confirmed. Check the values and try again.')
        setStep('details')
        return
      }
      void client.invalidateQueries({ queryKey: ['store'] })
      setPlaced({ id: data.id ?? 0, ref: data.ref ?? '', orderDate: data.orderDate ?? '', temp, units: data.units ?? 0,
        items: byItems ? lines.length : null, volumeM3: Number(data.volumeM3 ?? 0) })
      setStep('done')
    } catch {
      setSubmitError('The order could not be confirmed. Check your connection and try again.')
      setStep('details')
    } finally { setSubmitting(false) }
  }

  if (cutoff.isPending) return <LoadingState rows={2} label="Loading cutoff" />
  if (cutoff.isError) return <ErrorState error={cutoff.error} message="Cutoff could not be loaded." onRetry={() => void cutoff.refetch()} />

  if (step === 'done' && placed) {
    return <div className="store-done">
      <Card className="store-done-card" role="status">
        <span className="store-done-icon" aria-hidden="true"><CheckCircle2 size={32} /></span>
        <h1 className="store-done-title">{kind(placed.temp)} order submitted</h1>
        <p>{placed.ref} · {placed.items != null ? `${placed.items} ${placed.items === 1 ? 'item' : 'items'} · ` : ''}{placed.units} units · {formatVolume(placed.volumeM3)}</p>
        <p className="store-quiet">{placed.ref} is confirmed for the {dayLabel(placed.orderDate)} run{window ? ` · window ${window}` : ''}</p>
        <div className="store-detail-actions">
          <Button onClick={() => navigate(`/store/orders/${placed.id}`)}>View order</Button>
          <Button variant="secondary" onClick={() => { setPlaced(null); setCart({}); setUnits(''); setWeightEdit(null); setVolumeEdit(null); setTemp(placed.temp === 'chilled' ? 'ambient' : 'chilled'); setStep('details') }}>
            {placed.temp === 'chilled' ? 'Place separate dry order' : 'Place another order'}</Button>
        </div>
      </Card>
    </div>
  }

  const basisOrders = est?.basisOrders ?? 0
  const basis = !byItems && est ? (basisOrders > 0 ? `Estimated from ${basisOrders} past ${basisOrders === 1 ? 'order' : 'orders'} of this type. You can adjust it.`
    : 'There are no past orders to estimate from. Enter the weight and volume.') : null
  const summaryUnits = byItems ? shown?.units : units ? Number(units) : undefined
  const summaryWeight = byItems ? shown?.weightKg : weight ? Number(weight) : undefined
  const summaryVolume = byItems ? shown?.volumeM3 : volume ? Number(volume) : undefined

  return <>
    <PageHeader title="Place Order"
      subtitle={`${home.data?.outletId ?? ''}${home.data ? ' · ' : ''}${cutoff.data?.open ? 'Order before cutoff' : 'Cutoff passed'} · delivery ${deliveryLabel}`}
      actions={<Link className="btn btn-secondary btn-md" to="/store/orders">Orders</Link>} />
    <Stepper step={step} />

    <div className="store-place">
      <div className="store-place-main">
        {step === 'details' && <Card aria-label="Order details">
          <div className="store-temp" role="radiogroup" aria-label="Temperature">
            {[['ambient', 'Ambient', 'Dry goods'], ['chilled', 'Chilled', chilledAllowed ? 'Needs a refrigerated vehicle' : 'Fresh outlets only']].map(([value, label, hint]) =>
              <label key={value} className={`store-temp-option${temp === value ? ' store-temp-on' : ''}${value === 'chilled' && !chilledAllowed ? ' store-temp-off' : ''}`}>
                <input type="radio" name="temp" value={value} checked={temp === value} disabled={value === 'chilled' && !chilledAllowed}
                  onChange={() => chooseTemp(value)} />
                <strong>{label}</strong><span>{hint}</span>
              </label>)}
          </div>
          <p className="store-quiet">Dry and chilled goods are ordered separately.</p>

          {catalog.isPending && <LoadingState rows={2} label="Loading items" />}
          {catalog.isError && <ErrorState error={catalog.error} message="The catalog could not be loaded." onRetry={() => void catalog.refetch()} />}

          {byItems && <>
            <div className="store-chips" role="group" aria-label="Item groups">
              {[{ id: null, name: 'All' }, ...(catalog.data?.categories ?? [])].map(group =>
                <button key={group.id ?? 'all'} type="button" className="store-chip" aria-pressed={category === group.id} onClick={() => setCategory(group.id)}>{group.name}</button>)}
            </div>
            <label className="store-search">
              <Search size={16} aria-hidden="true" /><span className="visually-hidden">Search items</span>
              <input type="search" placeholder="Search products…" value={search} onChange={event => setSearch(event.target.value)} />
            </label>
            {visible.length === 0 && <p className="store-quiet">No items match.</p>}
            <div className="store-products" role="list" aria-label="Items">
              {visible.map(item => {
                const quantity = cart[item.id] ?? 0
                return <div key={item.id} className="store-product" role="listitem" aria-label={item.name}>
                  <span className="store-product-icon" aria-hidden="true">{iconFor(item)}</span>
                  <strong className="store-product-name">{item.name}</strong>
                  <span className="store-quiet">{item.categoryName}</span>
                  <div className="store-product-foot">
                    <span className="store-quiet">{item.weightKgPerUnit != null ? `≈ ${Number(item.weightKgPerUnit).toFixed(1)} kg / unit` : ''}</span>
                    {quantity === 0
                      ? <button type="button" className="store-add" onClick={() => setQuantity(item.id, 1)}>Add</button>
                      : <span className="store-stepper">
                          <button type="button" aria-label={`Remove one ${item.name}`} onClick={() => setQuantity(item.id, quantity - 1)}><Minus size={14} aria-hidden="true" /></button>
                          <span aria-label={`${item.name} quantity`}>{quantity}</span>
                          <button type="button" aria-label={`Add one ${item.name}`} onClick={() => setQuantity(item.id, quantity + 1)}><Plus size={14} aria-hidden="true" /></button>
                        </span>}
                  </div>
                </div>
              })}
            </div>
          </>}

          {!catalog.isPending && !byItems && <>
            <p className="store-estimate-basis">{catalog.data && items.length > 0 ? 'There are no past orders to size the catalog from, so enter units and the server estimates the rest.' : 'No catalog is available for this outlet and temperature, so enter units and the server estimates the rest.'}</p>
            <div className="store-place-field">
              <Input label="Units" type="number" min={1} step={1} value={units}
                onChange={event => { setUnits(event.target.value); setWeightEdit(null); setVolumeEdit(null) }} />
            </div>
            {basis && <p className="store-estimate-basis">{basis}</p>}
            <details className="store-adjust" open={est != null && est.weightKg == null}>
              <summary>Adjust weight and volume</summary>
              <div className="store-adjust-fields">
                <Input label="Weight (kg)" type="number" min={0.01} step={0.01} value={weight} onChange={event => setWeightEdit(event.target.value)} />
                <Input label="Volume (m³)" type="number" min={0.001} step={0.001} value={volume} onChange={event => setVolumeEdit(event.target.value)} />
              </div>
            </details>
            {estimate.isError && <p className="field-error" role="alert">The estimate could not be loaded. Enter the weight and volume yourself.</p>}
          </>}
          {formError && <p className="field-error" role="alert">{formError}</p>}
          {submitError && <p className="field-error" role="alert">{submitError}</p>}
        </Card>}

        {step === 'review' && <>
          <Card aria-label="Order items">
            <h2 className="text-heading-s">{kind(temp)} order · dry and chilled goods are separate orders</h2>
            {byItems
              ? <table className="store-review-table">
                  <thead><tr><th>Item</th><th>Group</th><th>Qty</th></tr></thead>
                  <tbody>{lines.map(line => { const item = items.find(entry => entry.id === line.productId)!
                    return <tr key={line.productId}><td>{item.name}</td><td>{item.categoryName}</td><td><strong>{line.quantity}</strong></td></tr> })}</tbody>
                </table>
              : <table className="store-review-table">
                  <thead><tr><th>Item</th><th>Units</th><th>Weight</th><th>Volume</th></tr></thead>
                  <tbody><tr><td>{kind(temp)} order</td><td>{units}</td><td>{formatWeight(Number(weight))}</td><td><strong>{formatVolume(Number(volume))}</strong></td></tr></tbody>
                </table>}
          </Card>
          <Card aria-label="Delivery details">
            <h2 className="text-heading-s">Delivery details</h2>
            <dl className="store-review-facts">
              <div><dt>Outlet</dt><dd>{outlet}</dd></div>
              <div><dt>Delivery day</dt><dd>{deliveryLabel}</dd></div>
              <div><dt>Delivery window (fixed)</dt><dd>{window ?? '—'}</dd></div>
            </dl>
          </Card>
          {submitError && <p className="field-error" role="alert">{submitError}</p>}
        </>}
      </div>

      <Card className="store-summary" aria-label="Order summary">
        <h2 className="text-heading-s">{kind(temp)} order{temp === 'chilled' ? ' · submit dry separately' : ' · separate from chilled goods'}</h2>
        {byItems && lines.length > 0 && <ul className="store-basket" aria-label="Basket">
          {lines.map(line => <li key={line.productId}><span>{items.find(item => item.id === line.productId)?.name}</span><span className="store-quiet">×{line.quantity}</span></li>)}
        </ul>}
        {byItems && lines.length === 0 && <p className="store-quiet">Your basket is empty. Add items to build the order.</p>}
        <dl className="store-review-facts">
          {byItems && <div><dt>Items</dt><dd>{lines.length || '—'}</dd></div>}
          <div><dt>Units</dt><dd>{summaryUnits ?? '—'}</dd></div>
          <div><dt>Est. weight</dt><dd>{summaryWeight != null ? formatWeight(summaryWeight) : '—'}</dd></div>
          <div><dt>Est. volume</dt><dd>{summaryVolume != null ? formatVolume(summaryVolume) : '—'}</dd></div>
          <div><dt>Delivery</dt><dd>{deliveryLabel}{window ? ` · ${window}` : ''}</dd></div>
        </dl>
        {step === 'details'
          ? <Button onClick={() => { if (validate()) setStep('review') }} disabled={byItems ? lines.length === 0 || preview.isFetching : estimate.isFetching && units !== ''}><Send size={16} aria-hidden="true" />Continue to Review</Button>
          : <>
              <Button onClick={() => void onSubmit()} loading={submitting}><Check size={16} aria-hidden="true" />Submit Order</Button>
              <Button variant="secondary" onClick={() => setStep('details')} disabled={submitting}>Back to {byItems ? 'catalog' : 'details'}</Button>
            </>}
      </Card>
    </div>
  </>
}
