import { useCallback, useEffect, useState } from 'react'
import type { Account } from '../core/account'
import { supabase } from '../core/supabase'

/** First sign-in: the person names their family. It then waits for super-admin approval. */
export function CreateFamily({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!supabase) return
    setBusy(true)
    const { error } = await supabase.rpc('create_family', { p_name: name.trim() })
    setBusy(false)
    if (error) setError(error.message)
    else onDone()
  }

  return (
    <section className="panel">
      <h2>Set up your family</h2>
      <p className="hint">Give your family a name. You will be its administrator.</p>
      <form onSubmit={submit} className="form">
        <label>
          Family name
          <input value={name} onChange={(e) => setName(e.target.value)} required placeholder="For example: The Ansari Family" />
        </label>
        {error && <p role="alert" className="notice">{error}</p>}
        <button type="submit" disabled={busy || !name.trim()}>Create family</button>
      </form>
    </section>
  )
}

export function WaitingForApproval({ status, onCheck }: { status: 'pending' | 'rejected'; onCheck: () => void }) {
  return (
    <section className="panel">
      <h2>{status === 'pending' ? 'Waiting for approval' : 'Family not approved'}</h2>
      <p>
        {status === 'pending'
          ? 'Your family has been created. It will open as soon as it is approved.'
          : 'This family was not approved. Please contact the person who runs Family Manager.'}
      </p>
      <button onClick={onCheck}>Check again</button>
    </section>
  )
}

interface PendingFamily { id: string; name: string; created_at: string }

/** Super-admin only: approve or reject new families. */
export function ApproveFamilies({ account }: { account: Account }) {
  const [rows, setRows] = useState<PendingFamily[]>([])

  const reload = useCallback(async () => {
    if (!supabase) return
    const { data } = await supabase.from('families').select('id, name, created_at').eq('status', 'pending').order('created_at')
    setRows(data ?? [])
  }, [])
  useEffect(() => {
    supabase
      ?.from('families')
      .select('id, name, created_at')
      .eq('status', 'pending')
      .order('created_at')
      .then(({ data }) => setRows(data ?? []))
  }, [])

  async function decide(id: string, status: 'active' | 'rejected') {
    if (!supabase) return
    await supabase.from('families').update({ status }).eq('id', id)
    await reload()
    await account.refresh()
  }

  return (
    <section className="panel">
      <h2>Families waiting for approval</h2>
      {rows.length === 0 && <p className="hint">No families are waiting.</p>}
      {rows.map((f) => (
        <div key={f.id} className="row">
          <strong>{f.name}</strong>
          <span className="actions">
            <button onClick={() => decide(f.id, 'active')}>Approve</button>
            <button className="secondary" onClick={() => decide(f.id, 'rejected')}>Reject</button>
          </span>
        </div>
      ))}
    </section>
  )
}
