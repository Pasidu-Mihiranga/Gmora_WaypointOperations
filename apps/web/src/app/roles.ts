import { Activity, ClipboardList, History, House, Package, PackagePlus, Route, Settings, TrendingUp, TriangleAlert, Truck, User } from 'lucide-react'
import type { NavEntry } from '../components'

export type RoleKey = 'dispatcher' | 'store' | 'loader' | 'driver'

/** Navigation for one role. */
export interface RolePage extends NavEntry {
  title: string
  description: string
  phase?: string
}

export interface RoleConfig {
  key: RoleKey
  label: string
  basePath: string
  pages: RolePage[]
  footerPages?: RolePage[]
}

export const roles: Record<RoleKey, RoleConfig> = {
  dispatcher: {
    key: 'dispatcher', label: 'Dispatcher', basePath: '/dispatcher',
    pages: [
      { to: '/dispatcher', label: 'Home', icon: House, end: true, title: 'Dashboard', description: 'Planning status and items that need attention.', phase: 'Phase 3A' },
      { to: '/dispatcher/orders', label: 'Orders', icon: ClipboardList, title: 'Orders', description: 'All confirmed orders for the planning day.', phase: 'Phase 3A' },
      { to: '/dispatcher/planning', label: 'Planning', icon: Route, title: 'Planning', description: 'Interactive multi-step delivery planning and trip optimisation.' },
      { to: '/dispatcher/live-operations', label: 'Live Operations', icon: Activity, title: 'Live Operations', description: 'Trips in progress and problems on the road.', phase: 'Phase 16' },
      { to: '/dispatcher/forecast', label: 'Forecast', icon: TrendingUp, title: 'Capacity forecast', description: 'Advisory demand outlook from observed history.', phase: 'Phase 17' },
      { to: '/dispatcher/fleet', label: 'Fleet', icon: Truck, title: 'Fleet', description: 'Vehicles, availability and workshop status.', phase: 'Phase 3A' },
      { to: '/dispatcher/exceptions', label: 'Exceptions', icon: TriangleAlert, title: 'Exceptions', description: 'Loading, delivery, offline and receipt problems waiting for you.', phase: 'Phase 10 / 16' },
      { to: '/dispatcher/deferred-orders', label: 'Deferred Orders', icon: History, title: 'Deferred orders', description: 'Orders moved to a later run, with the reason.', phase: 'Phase 8' },
    ],
    footerPages: [
      { to: '/dispatcher/settings', label: 'Settings', icon: Settings, title: 'Settings', description: 'Your profile and preferences.' },
    ],
  },
  store: {
    key: 'store', label: 'Store manager', basePath: '/store',
    pages: [
      { to: '/store', label: 'Home', icon: House, end: true, title: 'Home', description: 'Your outlet at a glance.' },
      { to: '/store/orders/new', label: 'Place Order', icon: PackagePlus, title: 'Place an order', description: 'Place and confirm an order before the 16:00 cutoff.' },
      { to: '/store/orders', label: 'Orders', icon: ClipboardList, end: true, title: 'Orders', description: 'Orders from your outlet and their status.' },
      { to: '/store/deliveries', label: 'Deliveries', icon: Truck, activePattern: /^\/store\/deliveries\//, title: 'Deliveries', description: 'Orders on their way and what the driver delivered.' },
      { to: '/store/issues', label: 'Issues', icon: TriangleAlert, title: 'Issues', description: 'Delivery issues you reported.' },
    ],
    footerPages: [
      { to: '/store/profile', label: 'Profile', icon: User, title: 'Profile', description: 'Your account and outlet.' },
    ],
  },
  loader: {
    key: 'loader', label: 'Loader', basePath: '/loader',
    pages: [
      { to: '/loader', label: 'Home', icon: House, end: true, title: 'Trips to load', description: 'Today’s trips for your depot.' },
      { to: '/loader/issues', label: 'Issues', icon: TriangleAlert, title: 'Loading issues', description: 'Shortfalls and damage you reported.' },
      { to: '/loader/profile', label: 'Profile', icon: User, title: 'Profile', description: 'Your account and depot.' },
    ],
  },
  driver: {
    key: 'driver', label: 'Driver', basePath: '/driver',
    pages: [
      { to: '/driver', label: 'Home', icon: House, end: true, title: 'Home', description: 'Your trips for today.' },
      { to: '/driver/trip', label: 'Trip', icon: Route, activePattern: /^\/driver\/trips\//, title: 'Trip', description: 'Stops of the trip you are running.' },
      { to: '/driver/deliveries', label: 'Deliveries', icon: Package, title: 'Deliveries', description: 'Today’s stops and past trips.' },
      { to: '/driver/profile', label: 'Profile', icon: User, title: 'Profile', description: 'Your account.' },
    ],
  },
}
