import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Bell, ChevronRight, LogOut } from 'lucide-react'
import { Card, ErrorState, LoadingState, PageHeader } from '../../components'
import { useAuth } from '../auth/auth'
import { useStoreHome } from '../receipt/receiptQueries'
import './storeHome.css'

/** Figma "SM · Profile", from the session and the outlet record. Editing and help are not available yet. */
export function StoreProfilePage() {
  const auth = useAuth()
  const home = useStoreHome()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const user = auth.user
  const initials = (user?.displayName ?? '').split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]?.toUpperCase()).join('') || 'SM'
  const outlet = home.data ? `${home.data.brand} · ${home.data.district} · ${home.data.outletId}` : user?.outletId ?? ''

  async function logout() {
    setPending(true); setError(null)
    try { await auth.logout() } catch (failure) { setError(failure instanceof Error ? failure.message : 'Sign-out failed. Try again.') } finally { setPending(false) }
  }

  return <>
    <PageHeader title="Profile" subtitle="Your account and outlet information" />
    {home.isError && <ErrorState error={home.error} message="Your outlet could not be loaded." onRetry={() => void home.refetch()} />}
    <div className="store-profile">
      <div className="store-profile-main">
        <Card className="store-profile-head" aria-label="Account">
          <span className="store-profile-avatar" aria-hidden="true">{initials}</span>
          <div><h2 className="text-heading-s">{user?.displayName}</h2><p className="store-quiet">{outlet}</p></div>
        </Card>
        <Card aria-label="Work information">
          <h2 className="text-heading-s">Work information</h2>
          <dl className="store-review-facts store-profile-facts">
            <div><dt>User ID</dt><dd>{user?.username}</dd></div>
            <div><dt>Outlet</dt><dd>{outlet || '—'}</dd></div>
            <div><dt>Depot</dt><dd>{home.data?.depot ?? user?.depot ?? '—'}</dd></div>
            <div><dt>Role</dt><dd>Store manager</dd></div>
          </dl>
          <p className="store-quiet">Editing your details and help &amp; support are not available yet.</p>
        </Card>
        <Card aria-label="Account actions">
          <h2 className="text-heading-s">Account</h2>
          <Link className="store-profile-row" to="/store/notifications"><Bell size={16} aria-hidden="true" />Notifications<ChevronRight size={16} aria-hidden="true" /></Link>
          <button type="button" className="store-profile-row store-profile-danger" disabled={pending} onClick={() => void logout()}>
            <LogOut size={16} aria-hidden="true" />{pending ? 'Signing out…' : 'Log out'}<ChevronRight size={16} aria-hidden="true" /></button>
          {error && <p className="field-error" role="alert">{error}</p>}
        </Card>
      </div>
      <Card className="store-profile-side" aria-label="Your outlet">
        <h2 className="text-heading-s">Your outlet</h2>
        {home.isPending && <LoadingState rows={1} label="Loading outlet summary" />}
        {home.data && <dl className="store-review-facts">
          <div><dt>Open orders</dt><dd>{home.data.openOrders}</dd></div>
          <div><dt>Completed orders</dt><dd>{home.data.completedOrders}</dd></div>
          <div><dt>Open issues</dt><dd>{home.data.openIssues}</dd></div>
        </dl>}
      </Card>
    </div>
  </>
}
