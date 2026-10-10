const LABELS = {
  idle: '',
  unsaved: 'Unsaved',
  saving: 'Saving…',
  saved: 'Saved',
  error: 'Save failed',
}

export function SaveIndicator({ saveStatus }) {
  const label = LABELS[saveStatus]
  if (!label) {
    return <p className="save-indicator save-indicator--empty" aria-live="polite" />
  }

  return (
    <p
      className={`save-indicator save-indicator--${saveStatus}`}
      aria-live="polite"
    >
      <span className="save-indicator__dot" aria-hidden="true" />
      {label}
    </p>
  )
}
