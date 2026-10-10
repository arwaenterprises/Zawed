import { useMemo, useState } from 'react'
import type { ExpensesData } from './data'
import type { Period } from './types'
import { Donut, PeriodBar } from './ui'
import { addDays, categoryLook, download, group, num, range, sar, shift, sum, toCsv, today, toDate } from './util'

/** Where the money went: ring, categories (tap to open sub-categories), days, people, budgets, comparison, CSV. */
export default function ReportsView({ data, period, onPeriod }: { data: ExpensesData; period: Period; onPeriod: (p: Period) => void }) {
  const [open, setOpen] = useState('')
  const { from, to } = range(period)
  const prev = range(shift(period, -1))
  const rows = useMemo(() => data.all.filter((e) => e.spent_on >= from && e.spent_on <= to), [data.all, from, to])
  const total = sum(rows, data.rate)
  const before = sum(data.all.filter((e) => e.spent_on >= prev.from && e.spent_on <= prev.to), data.rate)
  const change = before > 0 ? ((total - before) / before) * 100 : null

  const byCat = useMemo(() => {
    const g = group(rows, (e) => e.category)
    return [...g.entries()].map(([name, list]) => ({
      name, value: sum(list, data.rate), ...categoryLook(data.cats, name),
      subs: [...group(list, (e) => e.subcategory).entries()].map(([s, l]) => ({ name: s, value: sum(l, data.rate) })).sort((a, b) => b.value - a.value),
    })).filter((c) => c.value > 0).sort((a, b) => b.value - a.value)
  }, [rows, data.cats, data.rate])

  const perDay = useMemo(() => {
    if (period.mode === 'day') return []
    const g = group(rows, (e) => e.spent_on)
    const out: { day: string; value: number }[] = []
    for (let d = from; d <= to; d = addDays(d, 1)) out.push({ day: d, value: sum(g.get(d) ?? [], data.rate) })
    return out
  }, [rows, period.mode, from, to, data.rate])
  const maxDay = Math.max(1, ...perDay.map((d) => d.value))

  const perPerson = useMemo(() => [...group(rows, (e) => e.user_id).entries()]
    .map(([id, l]) => ({ id, value: sum(l, data.rate) })).sort((a, b) => b.value - a.value), [rows, data.rate])

  // budgets always look at the current calendar month
  const month = range({ mode: 'month', anchor: today() })
  const monthRows = data.all.filter((e) => e.spent_on >= month.from && e.spent_on <= month.to)
  const budgetKeys = Object.keys(data.budgets).sort((a, b) => (a === '' ? -1 : b === '' ? 1 : a.localeCompare(b)))
  const spentFor = (cat: string) => sum(cat === '' ? monthRows : monthRows.filter((e) => e.category === cat), data.rate)

  return (
    <>
      <PeriodBar period={period} onChange={onPeriod} />

      <section className="card">
        <Donut slices={byCat.map((c) => ({ label: c.name, value: c.value, color: c.color }))} center={<><small>Total</small><strong>{sar(total)}</strong></>} />
        {change !== null && (
          <p className={`change ${change > 0 ? 'up' : 'down'}`}>{change > 0 ? '▲' : '▼'} {Math.abs(change).toFixed(0)}% <small>vs before</small></p>
        )}
        {rows.some((e) => e.currency === 'INR') && !(data.rate > 0) && <p className="notice">₹ not counted. Set the rate in ⚙️.</p>}
      </section>

      <h3>🏷️ <small>Categories</small></h3>
      {byCat.length === 0 && <p className="hint">Nothing in this period.</p>}
      {byCat.map((c) => (
        <div key={c.name} className="cat-report">
          <button className="rep-row" onClick={() => setOpen(open === c.name ? '' : c.name)} aria-expanded={open === c.name}>
            <span className="dot" style={{ background: `${c.color}22`, color: c.color }}>{c.icon}</span>
            <span className="rep-main">
              <span className="rep-top"><b>{c.name}</b><span>{num(c.value, 0)} <small>{total > 0 ? Math.round((c.value / total) * 100) : 0}%</small></span></span>
              <span className="bar"><span style={{ width: `${(c.value / byCat[0].value) * 100}%`, background: c.color }} /></span>
            </span>
          </button>
          {open === c.name && c.subs.map((s) => (
            <div key={s.name} className="sub-row"><span>{s.name || '—'}</span><span>{num(s.value, 0)}</span></div>
          ))}
        </div>
      ))}

      {perDay.length > 0 && (
        <>
          <h3>📊 <small>Per day</small></h3>
          <div className="days-chart" role="img" aria-label="Spending per day">
            {perDay.map((d) => (
              <div key={d.day} className="col" title={`${d.day}: ${num(d.value, 0)}`}>
                <div className="col-bar" style={{ height: `${(d.value / maxDay) * 100}%`, opacity: d.value ? 1 : 0.15 }} />
                {(perDay.length <= 7 || toDate(d.day).getDate() % 5 === 1) && <small>{toDate(d.day).getDate()}</small>}
              </div>
            ))}
          </div>
        </>
      )}

      {perPerson.length > 1 && (
        <>
          <h3>👥 <small>Who spent</small></h3>
          {perPerson.map((p) => (
            <div key={p.id} className="sub-row"><span>👤 {data.names[p.id] ?? 'Family member'}</span><b>{sar(p.value)}</b></div>
          ))}
        </>
      )}

      {budgetKeys.length > 0 && (
        <>
          <h3>🎯 <small>Budgets, this month</small></h3>
          {budgetKeys.map((k) => {
            const spent = spentFor(k)
            const limit = data.budgets[k]
            const look = k === '' ? { icon: '🎯', color: '#7c3aed' } : categoryLook(data.cats, k)
            return (
              <div key={k || 'all'} className="rep-row static">
                <span className="dot" style={{ background: `${look.color}22`, color: look.color }}>{look.icon}</span>
                <span className="rep-main">
                  <span className="rep-top"><b>{k || 'All'}</b><span className={spent > limit ? 'bad' : ''}>{num(spent, 0)} / {num(limit, 0)}</span></span>
                  <span className="bar"><span className={spent > limit ? 'over' : ''} style={{ width: `${Math.min(100, (spent / limit) * 100)}%`, background: spent > limit ? undefined : look.color }} /></span>
                </span>
              </div>
            )
          })}
        </>
      )}

      <div className="btn-row">
        <button className="secondary" onClick={() => download(`expenses-${from}_${to}.csv`, toCsv(rows, data.names))} disabled={rows.length === 0}>⬇ CSV</button>
      </div>
    </>
  )
}
