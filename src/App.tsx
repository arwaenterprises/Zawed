import { useState } from 'react'
import { useAppUpdate, useInstallPrompt } from './core/pwa'
import { tabs } from './core/tabs'
import './tabs'

function Modal({ title, text, children }: { title: string; text: string; children: React.ReactNode }) {
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={title}>
      <div className="modal">
        <h2>{title}</h2>
        <p>{text}</p>
        <div className="actions">{children}</div>
      </div>
    </div>
  )
}

export default function App() {
  const [openId, setOpenId] = useState<string | null>(null)
  const { canInstall, install, dismiss } = useInstallPrompt()
  const { needsUpdate, applyUpdate, later } = useAppUpdate()
  const current = tabs.find((t) => t.id === openId)

  return (
    <main className="app">
      <header className="app-header">
        <span style={{ fontSize: '2.4rem' }} aria-hidden>🏠</span>
        <h1>Family Manager</h1>
      </header>

      {current ? (
        <>
          <button className="secondary back" onClick={() => setOpenId(null)}>← Back to home</button>
          <section className="panel">
            <h2>{current.icon} {current.title}</h2>
            {current.render()}
          </section>
        </>
      ) : (
        <>
          <p className="hint">Tap a big card to open it.</p>
          <div className="tile-grid">
            {tabs.map((t) => (
              <button key={t.id} className="tile" style={{ background: t.color }} onClick={() => setOpenId(t.id)}>
                <span className="tile-icon" aria-hidden>{t.icon}</span>
                {t.title}
                <span className="tile-blurb">{t.blurb}</span>
              </button>
            ))}
          </div>
        </>
      )}

      {canInstall && (
        <Modal title="Install Family Manager" text="Add it to your home screen so you can open it like any other app.">
          <button onClick={install}>Install</button>
          <button className="secondary" onClick={dismiss}>Not now</button>
        </Modal>
      )}
      {needsUpdate && (
        <Modal title="A new version is ready" text="Update now to get the latest improvements.">
          <button onClick={() => applyUpdate()}>Update now</button>
          <button className="secondary" onClick={later}>Later</button>
        </Modal>
      )}
    </main>
  )
}
