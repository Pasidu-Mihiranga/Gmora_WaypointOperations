import { Link } from 'react-router-dom'
import { Bell, ChevronDown, Store } from 'lucide-react'
import { Button } from '../../components'
import { useStoreHome } from '../receipt/receiptQueries'

/** The outlet the store manager works for, as Figma's top bar shows it. Names come from the API. */
export function StoreOutletChip({ outletId }: { outletId?: string | null }) {
  const home = useStoreHome()
  const label = home.data ? `${home.data.brand} · ${home.data.district}` : outletId ?? 'Your outlet'
  return <div className="topbar-depot-pill" aria-label="Outlet">
    <Store size={16} className="topbar-depot-icon" aria-hidden="true" />
    <span className="topbar-outlet-name">{label}</span>
  </div>
}

export function StoreUserChip({ name, outletId, pending, onLogout }: {
  name?: string | null; outletId?: string | null; pending: boolean; onLogout: () => void
}) {
  const initials = (name ?? '').split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]?.toUpperCase()).join('') || 'SM'
  return <div className="topbar-account">
    <Link className="topbar-icon-button" to="/store/notifications" aria-label="Notifications"><Bell size={18} aria-hidden="true" /></Link>
    <Link className="topbar-account-link" to="/store/profile" aria-label="Your profile">
      <span className="topbar-avatar" aria-hidden="true">{initials}</span>
      <span className="topbar-account-text"><strong>{name}</strong><small>{outletId}</small></span>
      <ChevronDown size={14} aria-hidden="true" />
    </Link>
    <Button variant="ghost" loading={pending} onClick={onLogout}>Sign out</Button>
  </div>
}
