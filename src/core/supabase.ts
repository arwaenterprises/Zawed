import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

/** True once the project URL and public (anon) key have been provided in `.env.local`. */
export const isConfigured = Boolean(url && anonKey)

// The anon key is public by design; the database rules (row-level security) protect the data.
export const supabase = isConfigured ? createClient(url!, anonKey!) : null
