import { useDeferredValue, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import { Check, CheckCircle2, Send } from 'lucide-react'
import { Button, Card, ErrorState, Input, LoadingState, PageHeader } from '../../components'
import { clock, useStoreHome } from '../receipt/receiptQueries'
import { formatVolume, formatWeight, tempLabel } from './orderDisplay'
import { useOrderEstimate, useStoreCutoff } from './orderQueries'
import { api } from '../../lib/apiClient'
import './storeHome.css'

type Step = 'details' | 'review' | 'done'
type Placed = { id: number; ref: string; orderDate: string; temp: string; units: number; volumeM3: number }

const ERRORS: Record<string, string> = {
  DELIVERY_DATE_CHANGED: 'The delivery date changed. Review the updated date and confirm again.',
  DUPLICATE_TEMP_ORDER: 'You already have an active order of this temperature for that delivery day.',
  CHILLED_FRESH_ONLY: 'Only Fresh outlets may place chilled orders.',
  NO_OPERATING_DAY: 'The delivery calendar needs to be extended before an order can be placed.',
}

/** "Sat 27 Jun" for a plain calendar date. */
const dayLabel = (date: string) => new Date(`${date}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })

/** The two steps of Figma's Place Order flow: choose what to order, then review and submit. */
function Stepper({ step }: { step: Step }) {
  return <ol className="store-steps" aria-label="Order steps">
    <li className={step === 'details' ? 'store-step store-step-active' : 'store-step store-step-done'}>
      <span className="store-step-dot">{step === 'details' ? 1 : <Check size={12} aria-hidden="true" />}</span>Order details</li>
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
  const [units, setUnits] = useState('')
  const [weightEdit, setWeightEdit] = useState<string | null>(null)
  const [volumeEdit, setVolumeEdit] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [placed, setPlaced] = useState<Placed | null>(null)

  const unitCount = useDeferredValue(Number(units))
  const estimate = useOrderEstimate(temp, units.trim() !== '' && Number.isInteger(unitCount) && unitCount >= 1 ? unitCount : null)
  const est = estimate.data && estimate.data.units === Number(units) ? estimate.data : null
  const weight = weightEdit ?? (est?.weightKg != null ? String(est.weightKg) : '')
  const volume = volumeEdit ?? (est?.volumeM3 != null ? String(est.volumeM3) : '')
  const chilledAllowed = estimate.data?.chilledAllowed ?? true

  function validate() {
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
      setPlaced({ id: data.id ?? 0, ref: data.ref ?? '', orderDate: data.orderDate ?? '', temp, units: values.units, volumeM3: values.volumeM3 })
      setStep('done')
    } catch {
      setSubmitError('The order could not be confirmed. Check your connection and try again.')
      setStep('details')
    } finally { setSubmitting(false) }
  }

  if (cutoff.isPending) return <LoadingState rows={2} label="Loading cutoff" />
  if (cutoff.isError) return <ErrorState error={cutoff.error} message="Cutoff could not be loaded." onRetry={() => void cutoff.refetch()} />

  const deliveryDate = cutoff.data?.nextDeliveryDate
  const deliveryLabel = deliveryDate ? dayLabel(deliveryDate) : '—'
  const window = est?.windowOpen && est.windowClose ? `${clock(est.windowOpen)}–${clock(est.windowClose)}` : null
  const outlet = home.data ? `${home.data.brand} · ${home.data.district} (${home.data.outletId})` : '—'
  const basisOrders = est?.basisOrders ?? 0
  const basis = est ? (basisOrders > 0 ? `Estimated from ${basisOrders} past ${basisOrders === 1 ? 'order' : 'orders'} of this type. You can adjust it.`
    : 'There are no past orders to estimate from. Enter the weight and volume.') : null

  if (step === 'done' && placed) {
    return <div className="store-done">
      <Card className="store-done-card" role="status">
        <span className="store-done-icon" aria-hidden="true"><CheckCircle2 size={32} /></span>
        <h1 className="store-done-title">{tempLabel(placed.temp)} order submitted</h1>
        <p>{placed.ref} · {placed.units} units · {formatVolume(placed.volumeM3)}</p>
        <p className="store-quiet">{placed.ref} is confirmed for the {dayLabel(placed.orderDate)} run{window ? ` · window ${window}` : ''}</p>
        <div className="store-detail-actions">
          <Button onClick={() => navigate(`/store/orders/${placed.id}`)}>View order</Button>
          <Button variant="secondary" onClick={() => { setPlaced(null); setUnits(''); setWeightEdit(null); setVolumeEdit(null); setTemp(placed.temp === 'chilled' ? 'ambient' : 'chilled'); setStep('details') }}>
            {placed.temp === 'chilled' ? 'Place separate dry order' : 'Place another order'}</Button>
        </div>
      </Card>
    </div>
  }

  return <>
    <PageHeader title="Place Order"
      subtitle={`${home.data?.outletId ?? ''}${home.data ? ' · ' : ''}${cutoff.data?.open ? 'Order before cutoff' : 'Cutoff passed'} · delivery ${deliveryLabel}`}
      actions={<Link className="btn btn-secondary btn-md" to="/store/orders">Orders</Link>} />
    <Stepper step={step} />

    <div className="store-place">
      <div className="store-place-main">
        {step === 'details' && <Card aria-label="Order details">
          <h2 className="text-heading-s">What are you ordering?</h2>
          <div className="store-temp" role="radiogroup" aria-label="Temperature">
            {[['ambient', 'Ambient', 'Dry goods'], ['chilled', 'Chilled', chilledAllowed ? 'Needs a refrigerated vehicle' : 'Fresh outlets only']].map(([value, label, hint]) =>
              <label key={value} className={`store-temp-option${temp === value ? ' store-temp-on' : ''}${value === 'chilled' && !chilledAllowed ? ' store-temp-off' : ''}`}>
                <input type="radio" name="temp" value={value} checked={temp === value} disabled={value === 'chilled' && !chilledAllowed}
                  onChange={() => { setTemp(value); setWeightEdit(null); setVolumeEdit(null) }} />
                <strong>{label}</strong><span>{hint}</span>
              </label>)}
          </div>
          <p className="store-quiet">Dry and chilled goods are ordered separately.</p>
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
          {formError && <p className="field-error" role="alert">{formError}</p>}
          {submitError && <p className="field-error" role="alert">{submitError}</p>}
        </Card>}

        {step === 'review' && <>
          <Card aria-label="Order items">
            <h2 className="text-heading-s">{tempLabel(temp)} order · dry and chilled goods are separate orders</h2>
            <table className="store-review-table">
              <thead><tr><th>Item</th><th>Units</th><th>Weight</th><th>Volume</th></tr></thead>
              <tbody><tr><td>{tempLabel(temp)} order</td><td>{units}</td><td>{formatWeight(Number(weight))}</td><td><strong>{formatVolume(Number(volume))}</strong></td></tr></tbody>
            </table>
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
        <h2 className="text-heading-s">Order summary</h2>
        <dl className="store-review-facts">
          <div><dt>Type</dt><dd>{tempLabel(temp)}</dd></div>
          <div><dt>Units</dt><dd>{units || '—'}</dd></div>
          <div><dt>{basis && est?.weightKg != null ? 'Est. weight' : 'Weight'}</dt><dd>{weight ? formatWeight(Number(weight)) : '—'}</dd></div>
          <div><dt>{basis && est?.volumeM3 != null ? 'Est. volume' : 'Volume'}</dt><dd>{volume ? formatVolume(Number(volume)) : '—'}</dd></div>
          <div><dt>Delivery</dt><dd>{deliveryLabel}{window ? ` · ${window}` : ''}</dd></div>
        </dl>
        {step === 'details'
          ? <Button onClick={() => { if (validate()) setStep('review') }} disabled={estimate.isFetching && units !== ''}><Send size={16} aria-hidden="true" />Continue to Review</Button>
          : <>
              <Button onClick={() => void onSubmit()} loading={submitting}><Check size={16} aria-hidden="true" />Submit Order</Button>
              <Button variant="secondary" onClick={() => setStep('details')} disabled={submitting}>Back to details</Button>
            </>}
      </Card>
    </div>
  </>
}
