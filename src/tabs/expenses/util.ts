import type { Category, Currency, Every, Expense, Period } from './types'

const pad = (n: number) => String(n).padStart(2, '0')
/** Dates are plain 'YYYY-MM-DD' strings in the phone's own time zone, so they sort and compare as text. */
export const fmtDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
export const toDate = (s: string) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d, 12) }
export const today = () => fmtDate(new Date())

export function addDays(s: string, n: number) {
  const d = toDate(s)
  d.setDate(d.getDate() + n)
  return fmtDate(d)
}

export function addMonths(s: string, n: number) {
  const d = toDate(s)
  const day = d.getDate()
  d.setDate(1)
  d.setMonth(d.getMonth() + n)
  d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()))
  return fmtDate(d)
}

export function nextDate(s: string, every: Every) {
  return every === 'daily' ? addDays(s, 1) : every === 'weekly' ? addDays(s, 7) : addMonths(s, 1)
}

/** Weeks run Sunday to Saturday. */
export function range(p: Period): { from: string; to: string } {
  if (p.mode === 'day') return { from: p.anchor, to: p.anchor }
  if (p.mode === 'week') {
    const from = addDays(p.anchor, -toDate(p.anchor).getDay())
    return { from, to: addDays(from, 6) }
  }
  const d = toDate(p.anchor)
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
  const ym = `${d.getFullYear()}-${pad(d.getMonth() + 1)}`
  return { from: `${ym}-01`, to: `${ym}-${pad(last)}` }
}

export function shift(p: Period, n: number): Period {
  const anchor = p.mode === 'day' ? addDays(p.anchor, n) : p.mode === 'week' ? addDays(p.anchor, 7 * n) : addMonths(p.anchor, n)
  return { ...p, anchor }
}

const short = (s: string) => toDate(s).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })

export function periodLabel(p: Period) {
  if (p.mode === 'day') {
    if (p.anchor === today()) return 'Today'
    if (p.anchor === addDays(today(), -1)) return 'Yesterday'
    return toDate(p.anchor).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
  }
  if (p.mode === 'week') { const r = range(p); return `${short(r.from)} – ${short(r.to)}` }
  return toDate(p.anchor).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
}

export function dayLabel(s: string) {
  if (s === today()) return 'Today'
  if (s === addDays(today(), -1)) return 'Yesterday'
  return toDate(s).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
}

export const SYMBOL: Record<Currency, string> = { SAR: 'SAR', INR: '₹' }

export function num(n: number, digits = 2) {
  return n.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits })
}
export const money = (n: number, c: Currency) => c === 'INR' ? `₹${num(n)}` : `SAR ${num(n)}`
/** Whole numbers for tight spaces (charts, lists of totals). */
export const sar = (n: number) => `SAR ${num(n, n >= 1000 ? 0 : 2)}`

/** An amount in riyal. Rupees are converted with the rate typed in Settings; without a rate they count as 0. */
export const inSar = (e: Pick<Expense, 'amount' | 'currency'>, rate: number) =>
  e.currency === 'SAR' ? e.amount : rate > 0 ? e.amount / rate : 0

export const sum = (rows: Expense[], rate: number) => rows.reduce((t, r) => t + inSar(r, rate), 0)

export function group<T>(rows: T[], key: (r: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>()
  for (const r of rows) { const k = key(r); const list = m.get(k); if (list) list.push(r); else m.set(k, [r]) }
  return m
}

// ------------------------------------------------------------------ CSV
const cell = (v: string | number | boolean) => {
  let s = String(v)
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}` // stop spreadsheets running typed text as a formula
  return `"${s.replace(/"/g, '""')}"`
}

export function toCsv(rows: Expense[], names: Record<string, string>) {
  const head = ['Date', 'Amount', 'Currency', 'Category', 'Sub-category', 'Note', 'Person', 'Private', 'Receipt']
  const lines = rows.map((r) => [r.spent_on, r.amount, r.currency, r.category, r.subcategory, r.note,
    names[r.user_id] ?? '', r.is_private ? 'yes' : 'no', r.receipt_path ? 'yes' : 'no'].map(cell).join(','))
  return '﻿' + [head.map(cell).join(','), ...lines].join('\r\n')
}

export function download(name: string, text: string, type = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// ------------------------------------------------------------- receipts
/** Shrinks a photo to about 100–200 KB so it uploads fast on mobile data and fits in free storage. */
export async function compressImage(file: File, max = 1280, quality = 0.72): Promise<string> {
  const bmp = await createImageBitmap(file)
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(bmp.width * scale))
  canvas.height = Math.max(1, Math.round(bmp.height * scale))
  canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height)
  bmp.close()
  return canvas.toDataURL('image/jpeg', quality)
}

export async function dataUrlToBlob(url: string) {
  return (await fetch(url)).blob()
}

// ------------------------------------------------------------ categories
const FALLBACK = { icon: '🏷️', color: '#64748b' }

/** Looks up icon and colour by category name; unknown or deleted names get a neutral tag. */
export function categoryLook(cats: Category[], name: string) {
  const c = cats.find((x) => !x.parent_id && x.name === name)
  return c ? { icon: c.icon, color: c.color } : FALLBACK
}
