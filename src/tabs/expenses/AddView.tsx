import { useEffect, useMemo, useState } from 'react'
import CategorySheet from './CategorySheet'
import type { ExpensesData } from './data'
import type { Category, Currency, Repeat } from './types'
import { compressImage, today } from './util'

const LAST_KEY = 'fm.expenses.lastCategory'
// the CSS puts ⌫ and the tall ✔ in the right-hand column
const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', '00', '⌫', '✔']

/** Fast add, in the style of Monefy: type the amount on the keypad, tap a category, tap ✔. */
export default function AddView({ data }: { data: ExpensesData }) {
  const tops = useMemo(() => data.cats.filter((c) => !c.parent_id), [data.cats])
  const [amount, setAmount] = useState('')
  const [currency, setCurrency] = useState<Currency>('SAR')
  const [chosen, setCategory] = useState(() => { try { return localStorage.getItem(LAST_KEY) ?? '' } catch { return '' } })
  const [sub, setSub] = useState('')
  const [note, setNote] = useState('')
  const [date, setDate] = useState(today())
  const [isPrivate, setIsPrivate] = useState(false)
  const [repeat, setRepeat] = useState<Repeat>('none')
  const [photo, setPhoto] = useState('')
  const [toast, setToast] = useState('')
  const [busy, setBusy] = useState(false)
  const [sheet, setSheet] = useState<{ parent: Category | null } | null>(null)

  // the remembered category may have been deleted: fall back to the first one
  const category = tops.some((c) => c.name === chosen) ? chosen : tops[0]?.name ?? ''
  const current = tops.find((c) => c.name === category)
  const subs = useMemo(() => data.cats.filter((c) => c.parent_id && c.parent_id === current?.id), [data.cats, current])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(''), 3500)
    return () => clearTimeout(t)
  }, [toast])

  function press(k: string) {
    if (k === '⌫') { setAmount((a) => a.slice(0, -1)); return }
    if (k === '✔') { void save(); return }
    setAmount((a) => {
      if (k === '.' && a.includes('.')) return a
      if (a.includes('.') && a.split('.')[1].length >= 2) return a
      if (a.replace('.', '').length >= 9) return a
      if (a === '' && k === '.') return '0.'
      if (a === '0' && k !== '.') return k === '00' ? a : k
      if (a === '' && k === '00') return a
      return a + k
    })
  }

  function pick(c: Category) {
    setCategory(c.name)
    setSub('')
    try { localStorage.setItem(LAST_KEY, c.name) } catch { /* storage unavailable */ }
  }

  async function onPhoto(file?: File) {
    if (!file) return
    try { setPhoto(await compressImage(file)) } catch { setToast('Could not read that photo.') }
  }

  async function save() {
    if (busy) return
    const value = Number(amount)
    if (!(value > 0)) { setToast('Type an amount first.'); return }
    if (!category) { setToast('Pick a category.'); return }
    setBusy(true)
    const res = await data.addExpense({
      amount: Math.round(value * 100) / 100, currency, category, subcategory: sub, note: note.trim(),
      spent_on: date, is_private: isPrivate, repeat,
    }, photo || undefined)
    setBusy(false)
    setToast(res.text)
    if (res.ok) { setAmount(''); setNote(''); setPhoto(''); setRepeat('none'); setDate(today()); setSub('') }
  }

  if (!data.canAdd) {
    return <p className="hint">{data.level >= 1 ? '👁 You can look at expenses but not add them.' : '🔒 The admin has not given you access to Expenses yet.'}</p>
  }

  return (
    <div className="add">
      <div className="amount-box">
        <button className="cur" onClick={() => setCurrency((c) => (c === 'SAR' ? 'INR' : 'SAR'))} aria-label={`Money: ${currency}. Tap to switch`}>
          {currency === 'SAR' ? 'SAR' : '₹'} ⇄
        </button>
        <output className="amount" aria-live="polite">{amount || '0'}</output>
      </div>

      <div className="cat-grid" role="radiogroup" aria-label="Category">
        {tops.map((c) => (
          <button key={c.id} role="radio" aria-checked={c.name === category} className={`cat ${c.name === category ? 'on' : ''}`}
            style={{ '--c': c.color } as React.CSSProperties} onClick={() => pick(c)}>
            <span className="cat-icon">{c.icon}</span>
            <span className="cat-name">{c.name}</span>
          </button>
        ))}
        <button className="cat add-cat" onClick={() => setSheet({ parent: null })} aria-label="New category"><span className="cat-icon">＋</span></button>
      </div>
      {tops.length === 0 && <p className="hint">Categories load the first time you are online.</p>}

      {current && (
        <div className="chips" aria-label={`Sub-category of ${current.name}`}>
          <button className={`chip ${sub === '' ? 'on' : ''}`} onClick={() => setSub('')}>—</button>
          {subs.map((s) => (
            <button key={s.id} className={`chip ${sub === s.name ? 'on' : ''}`} onClick={() => setSub(s.name)}>{s.icon} {s.name}</button>
          ))}
          <button className="chip" onClick={() => setSheet({ parent: current })} aria-label={`New sub-category under ${current.name}`}>＋</button>
        </div>
      )}

      <div className="chips tools">
        <label className="chip"><span aria-hidden>📅</span>
          <input type="date" value={date} max="2100-01-01" onChange={(e) => e.target.value && setDate(e.target.value)} aria-label="Date" />
        </label>
        <label className={`chip ${photo ? 'on' : ''}`}>
          <span aria-hidden>📷</span>{photo ? '✔' : ''}
          <input type="file" accept="image/*" hidden onChange={(e) => { void onPhoto(e.target.files?.[0]); e.target.value = '' }} aria-label="Receipt photo" />
        </label>
        {photo && <button className="chip" onClick={() => setPhoto('')} aria-label="Remove photo">✕</button>}
        <button className={`chip ${isPrivate ? 'on' : ''}`} onClick={() => setIsPrivate((p) => !p)} aria-pressed={isPrivate} aria-label="Private: only me and the admin">
          {isPrivate ? '🔒' : '🔓'}
        </button>
        <label className={`chip ${repeat !== 'none' ? 'on' : ''}`}><span aria-hidden>🔁</span>
          <select value={repeat} onChange={(e) => setRepeat(e.target.value as Repeat)} aria-label="Repeat">
            <option value="none">Once</option>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
          </select>
        </label>
      </div>

      <input className="note" value={note} maxLength={120} placeholder="📝 Note" onChange={(e) => setNote(e.target.value)} aria-label="Note" />
      {toast && <p role="status" className="toast">{toast}</p>}

      <div className="keypad">
        {KEYS.map((k) => (
          <button key={k} className={`key ${k === '✔' ? 'ok' : k === '⌫' ? 'del' : ''}`} onClick={() => press(k)} disabled={k === '✔' && busy}
            aria-label={k === '⌫' ? 'Delete last digit' : k === '✔' ? 'Save expense' : undefined}>{k}</button>
        ))}
      </div>

      {sheet && <CategorySheet data={data} parent={sheet.parent} onClose={() => setSheet(null)}
        onSaved={(n) => { if (sheet.parent) setSub(n); else { setCategory(n); setSub('') } }} />}
    </div>
  )
}
