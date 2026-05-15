'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Member, RANK_LABELS } from '@/lib/types'

const EMPTY_FORM = { name: '', rank: 3, power: '', notes: '' }

function formatPower(p: number) {
  if (p >= 1_000_000_000) return (p / 1_000_000_000).toFixed(2) + 'B'
  if (p >= 1_000_000)     return (p / 1_000_000).toFixed(1) + 'M'
  return p.toLocaleString()
}

function totalPower(members: Member[]) {
  const t = members.reduce((a, m) => a + m.power, 0)
  if (t >= 1_000_000_000) return (t / 1_000_000_000).toFixed(1) + 'B'
  if (t >= 1_000_000)     return (t / 1_000_000).toFixed(0) + 'M'
  return t.toLocaleString()
}

export default function RosterPage() {
  const supabase = createClient()
  const [members, setMembers]     = useState<Member[]>([])
  const [loading, setLoading]     = useState(true)
  const [form, setForm]           = useState(EMPTY_FORM)
  const [editId, setEditId]       = useState<string | null>(null)
  const [showForm, setShowForm]   = useState(false)
  const [saving, setSaving]       = useState(false)
  const [error, setError]         = useState<string | null>(null)
  const [search, setSearch]       = useState('')
  const [dupWarning, setDupWarning] = useState<string | null>(null)

  async function fetchMembers() {
    const { data, error } = await supabase
      .from('members').select('*').eq('active', true)
      .order('rank', { ascending: false })
      .order('power', { ascending: false })
    if (error) { setError(error.message); return }
    setMembers(data || [])
  }

  useEffect(() => { fetchMembers().finally(() => setLoading(false)) }, [])

  function openAdd() {
    setForm(EMPTY_FORM); setEditId(null); setShowForm(true); setError(null); setDupWarning(null)
  }

  function openEdit(m: Member) {
    setForm({ name: m.name, rank: m.rank, power: String(m.power), notes: m.notes || '' })
    setEditId(m.id); setShowForm(true); setError(null); setDupWarning(null)
  }

  function handleNameChange(value: string) {
    setForm(f => ({ ...f, name: value }))
    if (!value.trim()) { setDupWarning(null); return }
    const dup = members.find(m => m.name.toLowerCase() === value.trim().toLowerCase() && m.id !== editId)
    setDupWarning(dup ? `⚠️ "${dup.name}" already exists (R${dup.rank} · ${formatPower(dup.power)})` : null)
  }

  async function handleSave() {
    if (!form.name.trim()) { setError('Name is required'); return }
    const dup = members.find(m => m.name.toLowerCase() === form.name.trim().toLowerCase() && m.id !== editId)
    if (dup) { setError(`"${dup.name}" already exists in the roster.`); return }
    setSaving(true); setError(null)
    const payload = { name: form.name.trim(), rank: Number(form.rank), power: form.power ? Number(form.power.toString().replace(/,/g, '')) : 0, notes: form.notes || null }
    if (editId) {
      const { error } = await supabase.from('members').update(payload).eq('id', editId)
      if (error) { setError(error.message); setSaving(false); return }
    } else {
      const { error } = await supabase.from('members').insert(payload)
      if (error) { setError(error.message); setSaving(false); return }
    }
    await fetchMembers()
    setShowForm(false); setForm(EMPTY_FORM); setEditId(null); setDupWarning(null); setSaving(false)
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Remove ${name} from the roster?`)) return
    const { error } = await supabase.from('members').update({ active: false }).eq('id', id)
    if (error) { setError(error.message); return }
    setMembers(prev => prev.filter(m => m.id !== id))
  }

  const filtered = members.filter(m =>
    m.name.toLowerCase().includes(search.toLowerCase()) ||
    RANK_LABELS[m.rank]?.toLowerCase().includes(search.toLowerCase())
  )

  // Group by rank
  const grouped = [5,4,3,2,1].map(rank => ({
    rank,
    members: filtered.filter(m => m.rank === rank)
  })).filter(g => g.members.length > 0)

  const rankLabels: Record<number, string> = { 5: 'R5 — Leader', 4: 'R4 — Officers', 3: 'R3 — Elite', 2: 'R2 — Members', 1: 'R1 — Recruits' }

  return (
    <div>
      {/* Hero banner */}
      <div style={{ background: 'linear-gradient(180deg, #1a1000 0%, #0d0d0f 100%)', border: '1px solid #2a1f0a', borderRadius: 12, padding: '16px 20px', marginBottom: 24, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 52, height: 52, background: 'linear-gradient(135deg, #1a1000, #2a1f0a)', border: '2px solid #b8860b', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26 }}>🛡️</div>
          <div>
            <div style={{ fontSize: 22, fontWeight: 700, color: '#ffd700', letterSpacing: '0.08em' }}>[ ISLE ]</div>
            <div style={{ fontSize: 12, color: '#7a6030', marginTop: 3, display: 'flex', gap: 10 }}>
              <span>Server 1109</span>
              <span style={{ color: '#3a2a10' }}>·</span>
              <span style={{ color: '#4a8a4a' }}>● Active</span>
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <div className="lw-stat">
            <div className="lw-stat-val">{members.length}</div>
            <div className="lw-stat-label">Members</div>
          </div>
          <div className="lw-stat">
            <div className="lw-stat-val" style={{ color: '#e07030' }}>{totalPower(members)}</div>
            <div className="lw-stat-label">Total Power</div>
          </div>
          <div className="lw-stat">
            <div className="lw-stat-val" style={{ color: '#4a9a6a' }}>{members.filter(m => m.rank >= 4).length}</div>
            <div className="lw-stat-label">Officers+</div>
          </div>
        </div>
      </div>

      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div className="section-title">
          <i className="ti ti-users" aria-hidden="true" />
          Member Roster
          {filtered.length !== members.length && <span style={{ color: '#4a3820', fontWeight: 400 }}>— {filtered.length} of {members.length}</span>}
        </div>
        <button className="btn-gold" onClick={openAdd}>
          <i className="ti ti-plus" aria-hidden="true" />
          Add Member
        </button>
      </div>

      {/* Search */}
      <div className="lw-search" style={{ marginBottom: 14 }}>
        <i className="ti ti-search" aria-hidden="true" style={{ color: '#4a3820', fontSize: 14 }} />
        <input placeholder="Search by name or rank…" value={search} onChange={e => setSearch(e.target.value)} />
        {search && <button onClick={() => setSearch('')} style={{ background: 'none', border: 'none', color: '#4a3820', cursor: 'pointer', fontSize: 12 }}>✕</button>}
      </div>

      {/* Add / Edit form */}
      {showForm && (
        <div className="lw-form-panel" style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#c8a840', marginBottom: 14 }}>{editId ? 'Edit Member' : 'Add Member'}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
            <div style={{ gridColumn: 'span 2' }}>
              <label className="lw-form-label">Name *</label>
              <input className="lw-input" style={{ borderColor: dupWarning ? '#8a4020' : undefined }} placeholder="Member name" value={form.name} onChange={e => handleNameChange(e.target.value)} />
              {dupWarning && <p style={{ color: '#c07040', fontSize: 11, marginTop: 4 }}>{dupWarning}</p>}
            </div>
            <div>
              <label className="lw-form-label">Rank</label>
              <select className="lw-select" value={form.rank} onChange={e => setForm(f => ({ ...f, rank: Number(e.target.value) }))}>
                {[5,4,3,2,1].map(r => <option key={r} value={r}>R{r}</option>)}
              </select>
            </div>
            <div>
              <label className="lw-form-label">Power</label>
              <input className="lw-input" placeholder="e.g. 850000000" value={form.power} onChange={e => setForm(f => ({ ...f, power: e.target.value }))} />
            </div>
            <div style={{ gridColumn: 'span 2' }}>
              <label className="lw-form-label">Notes (optional)</label>
              <input className="lw-input" placeholder="Any notes" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
          </div>
          {error && <div className="lw-error" style={{ marginTop: 12 }}>{error}</div>}
          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            <button className="btn-gold" onClick={handleSave} disabled={saving || !!dupWarning}>
              {saving ? 'Saving…' : editId ? 'Save Changes' : 'Add Member'}
            </button>
            <button className="btn-ghost" onClick={() => { setShowForm(false); setError(null); setDupWarning(null) }}>Cancel</button>
          </div>
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div style={{ textAlign: 'center', color: '#4a3820', padding: '48px 0', fontSize: 13 }}>Loading roster…</div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', color: '#4a3820', padding: '48px 0', fontSize: 13 }}>
          {search ? `No members matching "${search}"` : 'No members yet — add your first one above.'}
        </div>
      ) : (
        <div className="lw-card">
          <table className="lw-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Name</th>
                <th>Rank</th>
                <th style={{ textAlign: 'right' }}>Power</th>
                <th style={{ display: 'none' }} className="sm-show">Notes</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {grouped.map(({ rank, members: group }) => (
                <>
                  <tr key={`div-${rank}`} className="rank-divider">
                    <td colSpan={6}>
                      <div className="rank-divider-label">{rankLabels[rank]} <span style={{ color: '#3a2a10' }}>({group.length})</span></div>
                    </td>
                  </tr>
                  {group.map((m, i) => {
                    const globalIdx = filtered.indexOf(m)
                    return (
                      <tr key={m.id}>
                        <td style={{ color: '#3a2a10', fontSize: 11, width: 32 }}>{globalIdx + 1}</td>
                        <td style={{ fontWeight: 500, color: '#e8d8a0' }}>{m.name}</td>
                        <td><span className={`rank-badge rank-${m.rank}`}>R{m.rank}</span></td>
                        <td style={{ textAlign: 'right' }} className="power-text">{formatPower(m.power)}</td>
                        <td style={{ color: '#4a3820', fontSize: 12 }}>{m.notes || '—'}</td>
                        <td>
                          <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                            <button className="btn-ghost" onClick={() => openEdit(m)}>Edit</button>
                            <button className="btn-ghost danger" onClick={() => handleDelete(m.id, m.name)}>Delete</button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
