const stages = ['Confirmed Orders', 'Generate Plan', 'Review Allocation', 'Resolve Exceptions', 'Confirm & Send']

export function PlanningStageTabs({ stage, onChange }: { stage: number; onChange: (stage: number) => void }) {
  return (
    <nav className="planning-stepper-card" aria-label="Planning stages">
      <div className="planning-stepper">
        {stages.map((title, index) => {
          const isActive = stage === index
          const isDone = stage > index
          return (
            <button
              key={title}
              type="button"
              className={`stepper-step ${isActive ? 'stepper-step-active' : ''} ${isDone ? 'stepper-step-done' : ''}`}
              aria-current={isActive ? 'step' : undefined}
              onClick={() => onChange(index)}
            >
              <div
                className={`stepper-bar ${isActive || isDone ? 'stepper-bar-active' : ''}`}
                aria-hidden="true"
              />
              <div className="stepper-content">
                <span
                  className={`stepper-num ${isActive ? 'stepper-num-active' : ''} ${isDone ? 'stepper-num-done' : ''}`}
                >
                  {isDone ? (
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                      <path d="M2.5 6L5 8.5L9.5 3.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  ) : (
                    index + 1
                  )}
                </span>
                <span className={`stepper-title ${isActive || isDone ? 'stepper-title-active' : ''}`}>
                  {title}
                </span>
              </div>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
