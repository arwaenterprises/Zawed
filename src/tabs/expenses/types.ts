export type Currency = 'SAR' | 'INR'
export type Every = 'daily' | 'weekly' | 'monthly'
export type Repeat = 'none' | Every

export interface Expense {
  id: string
  family_id: string
  user_id: string
  amount: number
  currency: Currency
  category: string
  subcategory: string
  note: string
  spent_on: string
  is_private: boolean
  receipt_path: string | null
}

/** An expense saved on the phone that has not reached the database yet. */
export interface QueuedExpense extends Expense {
  repeat?: Repeat
}

export interface Category {
  id: string
  family_id: string
  parent_id: string | null
  name: string
  icon: string
  color: string
  sort_order: number
}

export interface Recurring {
  id: string
  family_id: string
  user_id: string
  amount: number
  currency: Currency
  category: string
  subcategory: string
  note: string
  is_private: boolean
  every: Every
  next_on: string
  active: boolean
}

/** category name -> monthly budget in SAR; '' is the overall budget */
export type Budgets = Record<string, number>

export type Mode = 'day' | 'week' | 'month'
export interface Period { mode: Mode; anchor: string }

export type View = 'home' | 'add' | 'reports' | 'settings'
