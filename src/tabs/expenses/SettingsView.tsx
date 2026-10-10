import { useState } from 'react'
import { getTextSize, setTextSize, type TextSize } from '../../core/prefs'
import CategorySheet from './CategorySheet'
import type { ExpensesData } from './data'
import type { Category } from './types'
import { download, money, toCsv, today } from './util'

const SIZES: { size: TextSize; label: string; px: string }[] = [
  { size: 'small', label: 'Small', px: '0.8rem' }, { size: 'normal', label: 'Normal', px: '1rem' }, { size: 'large', label: 'Large', px: '1.3rem' },
]
const EVERY = { daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly' }

export default function SettingsView({ data }: { data: ExpensesData }) {
  const [size, setSize] = useState(getTextSize)
  const [rate, setRate] = useState(data.rate > 0 ? String(data.rate) : '')
  const [draft, setDraft] = useState<Record<string, string>>({})
  const [sheet, setSheet] = useState<{ edit?: Category; parent?: Category | null } | null>(null)
  const [error, setError] = useState('')

  const tops = data.cats.filter((c) => !c.parent_id)
  const budgetValue = (k: string) => draft[k] ?? (data.budgets[k] ? String(data.budgets[k]) : '')

  async function saveBudget(k: string) {
    const v = Number(draft[k] ?? '')
    if (draft[k] === undefined || v === (data.budgets[k] ?? 0)) return
    setError(await data.setBudget(k, v > 0 ? v : 0))
  }

  const mineOrAll = data.recurring.filter((r) => data.canManage || r.user_id === data.userId)

  return (
    <>
      <section className="card">
        <h3>🔠 <small>Text size</small></h3>
        <div className="seg">
          {SIZES.map((s) => (
            <button key={s.size} className={size === s.size ? 'on' : ''} aria-label={`${s.label} text`} aria-pressed={size === s.size}
              style={{ fontSize: s.px }} onClick={() => { setTextSize(s.size); setSize(s.size) }}>A</button>
          ))}
        </div>
      </section>

      <section className="card">
        <h3>💱 <small>Rate</small></h3>
        <label className="rate">
          <span>1 SAR =</span>
          <input type="number" inputMode="decimal" step="0.01" min="0" value={rate} placeholder="0.00" aria-label="Rupees per riyal"
            onChange={(e) => { setRate(e.target.value); data.setRate(Number(e.target.value) || 0) }} />
          <span>₹</span>
        </label>
        <small className="hint">Used to show ₹ amounts in SAR on every total. Type today’s rate when it changes.</small>
      </section>

      <section className="card">
        <div className="card-head"><h3>🏷️ <small>Categories</small></h3>{data.canAdd && <button className="mini" onClick={() => setSheet({ parent: null })} aria-label="New category">＋</button>}</div>
        {tops.length === 0 && <p className="hint">Categories load the first time you are online.</p>}
        {tops.map((c) => (
          <div key={c.id} className="cat-edit">
            <div className="cat-edit-row">
              <span className="dot" style={{ background: `${c.color}22`, color: c.color }}>{c.icon}</span>
              <b>{c.name}</b>
              <span className="spacer" />
              {data.canAdd && <button className="mini" onClick={() => setSheet({ parent: c })} aria-label={`New sub-category under ${c.name}`}>＋</button>}
              {data.canManage && <button className="mini" onClick={() => setSheet({ edit: c })} aria-label={`Edit ${c.name}`}>✏️</button>}
            </div>
            <div className="chips">
              {data.cats.filter((s) => s.parent_id === c.id).map((s) => (
                data.canManage
                  ? <button key={s.id} className="chip" onClick={() => setSheet({ edit: s })}>{s.name}</button>
                  : <span key={s.id} className="chip">{s.name}</span>
              ))}
            </div>
          </div>
        ))}
      </section>

      <section className="card">
        <h3>🎯 <small>Budget, SAR / month</small></h3>
        {!data.canManage && Object.keys(data.budgets).length === 0 && <p className="hint">The admin has not set budgets.</p>}
        {data.canManage && ['', ...tops.map((c) => c.name)].map((k) => (
          <label key={k || 'all'} className="budget-input">
            <span>{k === '' ? '🎯 All' : `${tops.find((c) => c.name === k)?.icon} ${k}`}</span>
            <input type="number" inputMode="decimal" min="0" step="1" placeholder="—" value={budgetValue(k)} aria-label={`Budget for ${k || 'everything'}`}
              onChange={(e) => setDraft({ ...draft, [k]: e.target.value })} onBlur={() => saveBudget(k)} />
          </label>
        ))}
        {error && <p role="alert" className="notice">{error}</p>}
      </section>

      <section className="card">
        <h3>🔁 <small>Repeating</small></h3>
        {mineOrAll.length === 0 && <p className="hint">Nothing repeats. Pick 🔁 when adding.</p>}
        {mineOrAll.map((r) => (
          <div key={r.id} className="cat-edit-row">
            <span className="dot">{data.cats.find((c) => !c.parent_id && c.name === r.category)?.icon ?? '🏷️'}</span>
            <span className="item-main">
              <b>{money(r.amount, r.currency)} · {EVERY[r.every]}</b>
              <small>{r.category}{r.subcategory ? ` › ${r.subcategory}` : ''} · next {r.next_on}{r.active ? '' : ' · paused'}</small>
            </span>
            <button className="mini" onClick={() => data.setRecurringActive(r.id, !r.active)} aria-label={r.active ? 'Pause' : 'Resume'}>{r.active ? '⏸' : '▶'}</button>
            <button className="mini" onClick={() => window.confirm('Stop this repeating expense? Past ones stay.') && data.removeRecurring(r.id)} aria-label="Stop repeating">🗑</button>
          </div>
        ))}
      </section>

      <section className="card">
        <h3>⬇ <small>Export</small></h3>
        <button className="secondary" onClick={() => download(`expenses-all-${today()}.csv`, toCsv(data.all, data.names))} disabled={data.all.length === 0}>CSV · all expenses</button>
      </section>

      {sheet && <CategorySheet data={data} edit={sheet.edit} parent={sheet.parent} onClose={() => setSheet(null)} />}
    </>
  )
}
