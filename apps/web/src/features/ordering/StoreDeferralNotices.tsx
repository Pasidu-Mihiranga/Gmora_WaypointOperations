import { Badge, Button, Card, ErrorState, LoadingState } from '../../components'
import { useAcknowledgeDeferral, useStoreDeferrals } from '../planning/deferralQueries'
import { deferReasonLabel } from '../planning/deferralReasons'
import { tempLabel } from './orderDisplay'
import './storeHome.css'

const day = (date: string) => new Date(`${date}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })

/**
 * Deferral notices for the store's outlet, following Figma "SM · Deferral Notice": what changed, why, and what
 * to plan. No arrival time is promised for a run that has not been planned yet.
 */
export function StoreDeferralNotices({ orderId }: { orderId?: number }) {
  const notices = useStoreDeferrals()
  const acknowledge = useAcknowledgeDeferral()
  // Never let an unexpected payload take down the store's home page.
  const items = (Array.isArray(notices.data) ? notices.data : []).filter(notice => orderId == null || notice.orderId === orderId)
  if (notices.isPending) return <LoadingState rows={1} label="Loading deferral notices" />
  if (notices.isError) return <ErrorState error={notices.error} message="Deferral notices could not be loaded." onRetry={() => void notices.refetch()} />
  if (items.length === 0) return null
  return (
    <section className="store-notices" aria-label="Deferral notices">
      {items.map(notice => (
        <div key={notice.id} className="store-notice">
          <div className="store-notice-banner">
            <h2 className="text-heading-s">{day(notice.planDate)} delivery deferred</h2>
            <p>{notice.orderRef} ({tempLabel(notice.tempRequirement)}) was not planned for {day(notice.planDate)}. Reason: {deferReasonLabel(notice.reasonCode)}. {notice.reason}</p>
            {notice.protectNextRun ? <Badge tone="warning">Priority on next run</Badge> : null}
          </div>
          <Card aria-label="What changed">
            <h3 className="decision-like-heading">What changed</h3>
            <dl className="store-review-facts store-profile-facts">
              <div><dt>Original run</dt><dd>{day(notice.planDate)}</dd></div>
              <div><dt>Next planning run</dt><dd>{day(notice.nextPlanningDate)}</dd></div>
              <div><dt>Reason</dt><dd>{deferReasonLabel(notice.reasonCode)}</dd></div>
              <div><dt>Decision recorded</dt><dd>{notice.decidedByName}</dd></div>
            </dl>
          </Card>
          <Card aria-label="Plan your receiving staff">
            <h3 className="decision-like-heading">Plan your receiving staff</h3>
            <p>Do not plan receiving staff for {day(notice.planDate)}. It moves to the {day(notice.nextPlanningDate)} planning run
              {notice.protectNextRun ? ' and is protected as first priority there' : ''}. The arrival time is confirmed only after that run is planned.</p>
          </Card>
          {notice.acknowledgedAt
            ? <p className="field-hint">Acknowledged.</p>
            : <Button loading={acknowledge.isPending && acknowledge.variables === notice.id}
                onClick={() => acknowledge.mutate(notice.id)}>Acknowledge notice</Button>}
        </div>
      ))}
      {acknowledge.isError && <ErrorState error={acknowledge.error} message={acknowledge.error.message} />}
    </section>
  )
}
