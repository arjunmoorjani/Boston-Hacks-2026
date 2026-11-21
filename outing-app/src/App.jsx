import { useState } from 'react'
import { saveOuting } from './lib/saveOuting.js'
import './App.css'

function App() {
  const [name, setName] = useState('')
  const [stops, setStops] = useState([''])
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState(null)

  async function handleSubmit(event) {
    event.preventDefault()
    if (saving) return

    setSaving(true)
    setFeedback(null)
    try {
      await saveOuting(name, stops)
      setFeedback({ message: 'Outing saved.' })
    } catch (error) {
      setFeedback({ message: error?.message || 'Could not save the outing.', isError: true })
    } finally {
      setSaving(false)
    }
  }

  return (
    <main className="outing">
      <h1>Plan an outing</h1>
      <form onSubmit={handleSubmit}>
        <fieldset disabled={saving}>
          <label htmlFor="outing-name">Outing name</label>
          <input
            id="outing-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
          />

          <h2>Stops</h2>
          <p>Paste a Google Place ID for each stop in itinerary order.</p>
          <ol className="stops">
            {stops.map((stop, index) => (
              <li key={index}>
                <label htmlFor={`stop-${index}`}>Google Place ID</label>
                <div className="stop-input">
                  <input
                    id={`stop-${index}`}
                    value={stop}
                    onChange={(event) => {
                      const value = event.target.value
                      setStops((current) => current.map((id, position) => (
                        position === index ? value : id
                      )))
                    }}
                    spellCheck={false}
                    autoComplete="off"
                    required
                  />
                  <button
                    type="button"
                    aria-label={`Remove stop ${index + 1}`}
                    disabled={stops.length === 1}
                    onClick={() => setStops((current) => current.filter((_, position) => position !== index))}
                  >
                    Remove
                  </button>
                </div>
              </li>
            ))}
          </ol>

          <div className="outing-actions">
            <button type="button" onClick={() => setStops((current) => [...current, ''])}>
              Add Stop
            </button>
            <button type="submit">{saving ? 'Saving…' : 'Save Outing'}</button>
          </div>
        </fieldset>
        <p role="status">{feedback && !feedback.isError ? feedback.message : ''}</p>
        <p role="alert">{feedback?.isError ? feedback.message : ''}</p>
      </form>
    </main>
  )
}

export default App
