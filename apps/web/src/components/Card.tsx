import type { HTMLAttributes, ReactNode } from 'react'

export function Card({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div {...rest} className={['card', className].filter(Boolean).join(' ')} />
}

interface MetricCardProps {
  label: string
  /** Formatted value. The number must come from the API; this component never computes it. */
  value: ReactNode
  caption?: ReactNode
  /** Optional status pill beside the value (Figma KPI cards). */
  badge?: ReactNode
}

export function MetricCard({ label, value, caption, badge }: MetricCardProps) {
  return (
    <Card className="metric">
      <span className="metric-label">{label}</span>
      {badge
        ? <span className="metric-value-row"><span className="metric-value">{value}</span>{badge}</span>
        : <span className="metric-value">{value}</span>}
      {caption ? <span className="metric-caption">{caption}</span> : null}
    </Card>
  )
}
