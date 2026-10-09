import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Account } from '../../core/account'
import { supabase } from '../../core/supabase'

type Currency = 'SAR' | 'INR'

interface Expense {
  id: string
  family_id: string
  user_id: string
  amount: number
  currency: Currency
  category: string
  note: string
  spent_on: string
  is_private: boolean
}

const CATEGORIES = ['Food', 'Groceries', 'Transport', 'Bills', 'School', 'Health', 'Shopping', 'Fun', 'Other']
const QUEUE_KEY = 'fm.expenses.queue'
const RATE_KEY = 'fm.expenses.sarToInr'

function loadQueue(): Expense[] {
  try { return JSON.parse(localStorage.getItem(QUEUE_KEY) ?? '[]') } catch { return [] }
}
function saveQueue(q: Expense[]) {
  try { localStorage.setItem(QUEUE_KEY, JSON.stringify(q)) } catch { /* storage unavailable */ }
}

const money = (n: number, c: string) => `${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${c}`

/** Expenses: add by typing (works offline, syncs later), see totals, per-category chart, delete. */
export default function ExpensesTab({ account }: { account: Account }) {
  const family = account.family!
  const userId = account.session!.user.id
  const isAdmin = family.role === 'admin'

  const [rows, setRows] = useState<Expense[]>([])
  const [names, setNames] = useState<Record<string, string>>({})
  const [queue, setQueue] = useState<Expense[]>(loadQueue)
  const [level, setLevel] = useState(isAdmin ? 3 : 0)
  const [message, setMessage] = useState('')
  const [rate, setRate] = useState(() => {
    try { return localStorage.getItem(RATE_KEY) ?? '' } catch { return '' }
  })

  const [amount, setAmount] = useState('')
  const [currency, setCurrency] = useState<Currency>('SAR')
  const [category, setCategory] = useState('Food')
  const [note, setNote] = useState('')
  const [spentOn, setSpentOn] = useState(() => new Date().toISOString().slice(0, 10))
  const [isPrivate, setIsPrivate] = useState(false)

  const canAdd = level >= 2

  const reload = useCallback(async () => {
    if (!supabase) return
    if (!isAdmin) {
      const { data } = await supabase.from('tab_permissions').select('level')
        .eq('family_id', family.id).eq('user_id', userId).eq('tab_id', 'expenses').maybeSingle()
      setLevel({ view: 1, edit: 2, full: 3 }[data?.level as 'view'] ?? 0)
    }
    const { data, error } = await supabase.from('expenses').select('*')
      .eq('family_id', family.id).order('spent_on', { ascending: false }).order('created_at', { ascending: false }).limit(500)
    if (error) { setMessage('Could not load expenses. Showing what is saved on this phone.'); return }
    setRows((data ?? []).map((r) => ({ ...r, amount: Number(r.amount) })))
    const { data: profiles } = await supabase.from('profiles').select('id, display_name')
    setNames(Object.fromEntries((profiles ?? []).map((p) => [p.id, p.display_name])))
  }, [family.id, userId, isAdmin])

  const sync = useCallback(async () => {
    if (!supabase) return
    const pending = loadQueue()
    if (!pending.length) return
    const left: Expense[] = []
    for (const e of pending) {
      const { error } = await supabase.from('expenses').insert(e)
      // 23505 = already saved earlier (the id is made on the phone, so retrying is safe)
      if (error && error.code !== '23505') left.push(e)
    }
    saveQueue(left)
    setQueue(left)
    await reload()
  }, [reload])

  useEffect(() => {
    sync()
    window.addEventListener('online', sync)
    return () => window.removeEventListener('online', sync)
  }, [sync])

  async function add(e: React.FormEvent) {
    e.preventDefault()
    const value = Number(amount)
    if (!(value > 0)) { setMessage('Please type an amount bigger than zero.'); return }
    const entry: Expense = {
      id: crypto.randomUUID(), family_id: family.id, user_id: userId,
      amount: Math.round(value * 100) / 100, currency, category, note: note.trim(), spent_on: spentOn, is_private: isPrivate,
    }
    const q = [...loadQueue(), entry]
    saveQueue(q)
    setQueue(q)
    setAmount(''); setNote(''); setMessage('')
    if (navigator.onLine) await sync()
    else setMessage('Saved on this phone. It will upload when you are back online.')
  }

  async function remove(id: string) {
    if (!supabase || !window.confirm('Delete this expense?')) return
    const { error } = await supabase.from('expenses').delete().eq('id', id)
    if (error) setMessage(error.message)
    else setRows((r) => r.filter((x) => x.id !== id))
  }

  function changeRate(v: string) {
    setRate(v)
    try { localStorage.setItem(RATE_KEY, v) } catch { /* storage unavailable */ }
  }

  const all = useMemo(() => [...queue, ...rows.filter((r) => !queue.some((q) => q.id === r.id))], [queue, rows])
  const rateNum = Number(rate)
  const hasRate = rateNum > 0

  const totals = useMemo(() => {
    const t: Record<Currency, number> = { SAR: 0, INR: 0 }
    for (const r of all) t[r.currency] += r.amount
    return t
  }, [all])

  const byCategory = useMemo(() => {
    const m = new Map<string, number>()
    for (const r of all) {
      const inSar = r.currency === 'SAR' ? r.amount : hasRate ? r.amount / rateNum : 0
      m.set(r.category, (m.get(r.category) ?? 0) + inSar)
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1])
  }, [all, hasRate, rateNum])
  const max = Math.max(1, ...byCategory.map(([, v]) => v))

  const perPerson = useMemo(() => {
    const m = new Map<string, number>()
    for (const r of all) {
      const inSar = r.currency === 'SAR' ? r.amount : hasRate ? r.amount / rateNum : 0
      m.set(r.user_id, (m.get(r.user_id) ?? 0) + inSar)
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1])
  }, [all, hasRate, rateNum])

  return (
    <>
      {message && <p role="status" className="notice">{message}</p>}
      {queue.length > 0 && <p className="notice">{queue.length} waiting to upload. <button className="secondary" onClick={sync}>Upload now</button></p>}

      {canAdd ? (
        <form onSubmit={add} className="form">
          <label>
            Amount
            <input type="number" inputMode="decimal" step="0.01" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} required />
          </label>
          <label>
            Money
            <select value={currency} onChange={(e) => setCurrency(e.target.value as Currency)}>
              <option value="SAR">Riyal (SAR)</option>
              <option value="INR">Rupees (INR)</option>
            </select>
          </label>
          <label>
            What was it for?
            <select value={category} onChange={(e) => setCategory(e.target.value)}>
              {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </select>
          </label>
          <label>Note (optional)<input value={note} onChange={(e) => setNote(e.target.value)} /></label>
          <label>Date<input type="date" value={spentOn} onChange={(e) => setSpentOn(e.target.value)} required /></label>
          <label className="check"><input type="checkbox" checked={isPrivate} onChange={(e) => setIsPrivate(e.target.checked)} /> Private (only me and the admin)</label>
          <button type="submit">Add expense</button>
        </form>
      ) : (
        <p className="hint">{level >= 1 ? 'You can look at expenses but not add them.' : 'The admin has not given you access to Expenses yet.'}</p>
      )}

      {level >= 1 && (
        <>
          <h3>Totals</h3>
          <div className="row"><span>Riyal</span><strong>{money(totals.SAR, 'SAR')}</strong></div>
          <div className="row"><span>Rupees</span><strong>{money(totals.INR, 'INR')}</strong></div>
          <label className="form">
            Rupees per 1 riyal (type today's rate to see everything in riyal)
            <input type="number" inputMode="decimal" step="0.01" min="0" value={rate} onChange={(e) => changeRate(e.target.value)} />
          </label>
          {hasRate && <div className="row"><span>All together</span><strong>{money(totals.SAR + totals.INR / rateNum, 'SAR')}</strong></div>}

          <h3>Where the money goes {hasRate ? '(in riyal)' : '(riyal only until you type a rate)'}</h3>
          {byCategory.map(([c, v]) => (
            <div key={c} className="bar-row">
              <span>{c}</span>
              <div className="bar"><div style={{ width: `${(v / max) * 100}%` }} /></div>
              <span>{v.toFixed(0)}</span>
            </div>
          ))}

          <h3>Who spent</h3>
          {perPerson.map(([id, v]) => (
            <div key={id} className="row"><span>{names[id] || 'Family member'}</span><strong>{money(v, 'SAR')}</strong></div>
          ))}

          <h3>Recent</h3>
          {all.length === 0 && <p className="hint">No expenses yet.</p>}
          {all.map((r) => (
            <div key={r.id} className="row">
              <span>
                <strong>{money(r.amount, r.currency)}</strong> · {r.category}{r.is_private ? ' 🔒' : ''}
                <br /><small>{r.spent_on} · {names[r.user_id] || 'Family member'}{r.note ? ` · ${r.note}` : ''}{queue.some((q) => q.id === r.id) ? ' · waiting to upload' : ''}</small>
              </span>
              {(isAdmin || level >= 3 || r.user_id === userId) && !queue.some((q) => q.id === r.id) && (
                <button className="secondary" onClick={() => remove(r.id)}>Delete</button>
              )}
            </div>
          ))}
        </>
      )}
    </>
  )
}
