export type TextSize = 'small' | 'normal' | 'large'

const KEY = 'fm.textSize'

export function getTextSize(): TextSize {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'normal' || v === 'large' ? v : 'small'
  } catch { return 'small' }
}

/** Small is the default; the choice is remembered on this phone. */
export function setTextSize(size: TextSize) {
  try { localStorage.setItem(KEY, size) } catch { /* storage unavailable */ }
  applyTextSize()
}

export function applyTextSize() {
  document.documentElement.dataset.size = getTextSize()
}
