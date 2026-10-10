import { useState } from 'react'
import type { Account } from '../../core/account'
import AddView from './AddView'
import { useExpenses } from './data'
import HomeView from './HomeView'
import ReportsView from './ReportsView'
import SettingsView from './SettingsView'
import type { Period, View } from './types'
import { today } from './util'

const NAV: { view: View; icon: string; label: string }[] = [
  { view: 'home', icon: '🏠', label: 'Home' },
  { view: 'add', icon: '＋', label: 'Add' },
  { view: 'reports', icon: '📊', label: 'Reports' },
  { view: 'settings', icon: '⚙️', label: 'Settings' },
]

/** Expenses, built for a phone: bottom bar (Home / Add / Reports / Settings), Day-Week-Month at the top. */
export default function ExpensesTab({ account }: { account: Account }) {
  const data = useExpenses(account)
  const [view, setView] = useState<View>('home')
  const [period, setPeriod] = useState<Period>({ mode: 'month', anchor: today() })

  return (
    <div className="exp">
      {data.message && <p role="status" className="notice">{data.message}</p>}

      {data.level < 1 ? (
        <p className="hint">🔒 The admin has not given you access to Expenses yet.</p>
      ) : (
        <>
          {view === 'home' && <HomeView data={data} period={period} onPeriod={setPeriod} />}
          {view === 'add' && <AddView data={data} />}
          {view === 'reports' && <ReportsView data={data} period={period} onPeriod={setPeriod} />}
          {view === 'settings' && <SettingsView data={data} />}

          <nav className="bottom-nav" aria-label="Expenses">
            {NAV.map((n) => (
              <button key={n.view} className={`${view === n.view ? 'on' : ''} ${n.view === 'add' ? 'fab' : ''}`}
                aria-current={view === n.view ? 'page' : undefined} onClick={() => setView(n.view)}>
                <span className="nav-icon" aria-hidden>{n.icon}</span>
                <span className="nav-label">{n.label}</span>
              </button>
            ))}
          </nav>
        </>
      )}
    </div>
  )
}
