import type { Session } from '@supabase/supabase-js'
import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'

export interface FamilyInfo {
  id: string
  name: string
  status: 'pending' | 'active' | 'rejected'
  role: string
}

export interface Account {
  loading: boolean
  session: Session | null
  isSuperAdmin: boolean
  family: FamilyInfo | null
  refresh: () => Promise<void>
}

/** Who is signed in, are they a super-admin, and which family do they belong to. */
export function useAccount(): Account {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(Boolean(supabase))
  const [isSuperAdmin, setIsSuperAdmin] = useState(false)
  const [family, setFamily] = useState<FamilyInfo | null>(null)

  const load = useCallback(async (s: Session | null) => {
    if (!supabase || !s) {
      setIsSuperAdmin(false)
      setFamily(null)
      return
    }
    const [profile, membership] = await Promise.all([
      supabase.from('profiles').select('is_super_admin').eq('id', s.user.id).maybeSingle(),
      supabase.from('members').select('role, families(id, name, status)').eq('user_id', s.user.id).limit(1).maybeSingle(),
    ])
    setIsSuperAdmin(Boolean(profile.data?.is_super_admin))
    const f = membership.data?.families as unknown as Omit<FamilyInfo, 'role'> | null | undefined
    setFamily(f ? { ...f, role: membership.data!.role } : null)
  }, [])

  useEffect(() => {
    if (!supabase) return
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      load(data.session).finally(() => setLoading(false))
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s)
      load(s)
    })
    return () => sub.subscription.unsubscribe()
  }, [load])

  return { loading, session, isSuperAdmin, family, refresh: () => load(session) }
}
