'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Member, RANK_LABELS, ALLIANCE_NAME, ALLIANCE_TAG, SERVER_NUM } from '@/lib/types'

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

const RANK_LABELS_LONG: Record<number, { label: string; icon: string; color: string }> = {
  5: { label: 'Warlord',  icon: 'ti-crown',        color: '#c07800' },
  4: { label: 'Officers', icon: 'ti-star',          color: '#3a7ae8' },
  3: { label: 'Elite',    icon: 'ti-shield-half',   color: '#3ab870' },
  2: { label: 'Members',  icon: 'ti-user',          color: '#8090c0' },
  1: { label: 'Recruits', icon: 'ti-user-plus',     color: '#a0a0b8' },
}

export default function RosterPage() {
  const supabase = createClient()
  const [members, setMembers]       = useState<Member[]>([])
  const [loading, setLoading]       = useState(true)
  const [form, setForm]             = useState(EMPTY_FORM)
  const [editId, setEditId]         = useState<string | null>(null)
  const [showForm, setShowForm]     = useState(false)
  const [saving, setSaving]         = useState(false)
  const [error, setError]           = useState<string | null>(null)
  const [search, setSearch]         = useState('')
  const [dupWarning, setDupWarning] = useState<string | null>(null)

  async function fetchMembers() {
    const { data, error } = await supabase.from('members').select('*').eq('active', true)
      .order('rank', { ascending: false }).order('power', { ascending: false })
    if (error) { setError(error.message); return }
    setMembers(data || [])
  }

  useEffect(() => { fetchMembers().finally(() => setLoading(false)) }, [])

  function openAdd() { setForm(EMPTY_FORM); setEditId(null); setShowForm(true); setError(null); setDupWarning(null) }
  function openEdit(m: Member) {
    setForm({ name: m.name, rank: m.rank, power: String(m.power), notes: m.notes || '' })
    setEditId(m.id); setShowForm(true); setError(null); setDupWarning(null)
  }

  function handleNameChange(value: string) {
    setForm(f => ({ ...f, name: value }))
    const dup = members.find(m => m.name.toLowerCase() === value.trim().toLowerCase() && m.id !== editId)
    setDupWarning(dup ? `"${dup.name}" already exists (R${dup.rank} · ${formatPower(dup.power)})` : null)
  }

  async function handleSave() {
    if (!form.name.trim()) { setError('Name is required'); return }
    const dup = members.find(m => m.name.toLowerCase() === form.name.trim().toLowerCase() && m.id !== editId)
    if (dup) { setError(`"${dup.name}" already exists.`); return }
    setSaving(true); setError(null)
    const payload = { name: form.name.trim(), rank: Number(form.rank), power: form.power ? Number(form.power.toString().replace(/,/g, '')) : 0, notes: form.notes || null }
    if (editId) {
      const { error } = await supabase.from('members').update(payload).eq('id', editId)
      if (error) { setError(error.message); setSaving(false); return }
    } else {
      const { error } = await supabase.from('members').insert(payload)
      if (error) { setError(error.message); setSaving(false); return }
    }
    await fetchMembers(); setShowForm(false); setForm(EMPTY_FORM); setEditId(null); setDupWarning(null); setSaving(false)
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

  const grouped = [5,4,3,2,1].map(rank => ({
    rank, members: filtered.filter(m => m.rank === rank)
  })).filter(g => g.members.length > 0)

  return (
    <div>
      {/* Alliance banner */}
      <div style={{ background: '#2a4a9a', borderRadius: 14, padding: '14px 20px', marginBottom: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 52, height: 52, background: '#1a3a7a', border: '2px solid #f5c842', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <i className="ti ti-shield" aria-hidden="true" style={{ fontSize: 26, color: '#f5c842' }} />
          </div>
          <div>
            <div style={{ fontSize: 20, fontWeight: 900, color: '#f5c842' }}>[{ALLIANCE_TAG}] {ALLIANCE_NAME}</div>
            <div style={{ fontSize: 12, color: '#7aaaff', marginTop: 3, display: 'flex', gap: 10 }}>
              <span>Server {SERVER_NUM}</span>
              <span style={{ color: '#3a5aaa' }}>·</span>
              <span style={{ color: '#4ae87a' }}>● Active</span>
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <div className="lw-stat"><div className="lw-stat-val">{members.length}</div><div className="lw-stat-label">Members</div></div>
          <div className="lw-stat"><div className="lw-stat-val">{totalPower(members)}</div><div className="lw-stat-label">Power</div></div>
          <div className="lw-stat"><div className="lw-stat-val" style={{ color: '#7aaaff' }}>{members.filter(m => m.rank >= 4).length}</div><div className="lw-stat-label">Officers+</div></div>
        </div>
      </div>

      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div className="section-title">
          <i className="ti ti-users" aria-hidden="true" />
          Member Roster
          {filtered.length !== members.length && <span style={{ color: '#8090b8', fontWeight: 600, fontSize: 11 }}>· {filtered.length} of {members.length}</span>}
        </div>
        <button className="btn-primary btn-sm" onClick={openAdd}>
          <i className="ti ti-plus" aria-hidden="true" style={{ fontSize: 12 }} /> Add Member
        </button>
      </div>

      {/* Search */}
      <div className="lw-search" style={{ marginBottom: 14 }}>
        <i className="ti ti-search" aria-hidden="true" style={{ color: '#8090b8', fontSize: 14 }} />
        <input placeholder="Search by name or rank…" value={search} onChange={e => setSearch(e.target.value)} />
        {search && <button onClick={() => setSearch('')} style={{ background: 'none', border: 'none', color: '#a0b0cc', cursor: 'pointer', fontSize: 13 }}>✕</button>}
      </div>

      {/* Add/Edit form */}
      {showForm && (
        <div className="lw-form-panel" style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: '#1a2a4a', marginBottom: 14, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{editId ? 'Edit Member' : 'Add Member'}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
            <div style={{ gridColumn: 'span 2' }}>
              <label className="lw-form-label">Name *</label>
              <input className="lw-input" style={{ borderColor: dupWarning ? '#f0a080' : undefined }} placeholder="Member name" value={form.name} onChange={e => handleNameChange(e.target.value)} />
              {dupWarning && <p style={{ color: '#c07040', fontSize: 11, marginTop: 4 }}>⚠️ {dupWarning}</p>}
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
            <button className="btn-primary btn-sm" onClick={handleSave} disabled={saving || !!dupWarning}>
              {saving ? 'Saving…' : editId ? 'Save Changes' : 'Add Member'}
            </button>
            <button className="btn-primary btn-sm" onClick={() => { setShowForm(false); setError(null); setDupWarning(null) }} style={{ background: 'transparent', color: '#4a5a7a', borderColor: '#c0cce0' }}>Cancel</button>
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', color: '#8090b8', padding: '48px 0', fontSize: 13 }}>Loading roster…</div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', color: '#8090b8', padding: '48px 0', fontSize: 13 }}>
          {search ? `No members matching "${search}"` : 'No members yet — add your first one above.'}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          {grouped.map(({ rank, members: group }) => {
            const rl = RANK_LABELS_LONG[rank]
            return (
              <div key={rank} style={{ marginBottom: 12 }}>
                {/* Rank divider */}
                <div style={{ background: '#dde3f0', borderRadius: 8, padding: '5px 14px', marginBottom: 7, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: '#4a6aaa', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'flex', alignItems: 'center', gap: 5 }}>
                    <i className={`ti ${rl.icon}`} aria-hidden="true" style={{ fontSize: 12, color: rl.color }} />
                    R{rank} — {rl.label}
                  </div>
                  <span style={{ fontSize: 10, color: '#7a8ab8', background: '#c8d4ec', padding: '1px 8px', borderRadius: 10, fontWeight: 700 }}>{group.length}</span>
                </div>
                {/* Member cards */}
                {group.map((m, i) => {
                  const globalIdx = filtered.indexOf(m)
                  return (
                    <div key={m.id} className="member-card" style={{ marginBottom: 6 }}>
                      <div style={{ width: 24, textAlign: 'center', flexShrink: 0, fontSize: 12, fontWeight: 800, color: '#a0b0cc' }}>{globalIdx + 1}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 800, color: '#1a2a4a' }}>{m.name}</div>
                        <div style={{ marginTop: 3 }}><span className={`rank-badge rank-${m.rank}`}>R{m.rank}</span></div>
                      </div>
                      <div style={{ textAlign: 'right', marginRight: 8, flexShrink: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 800, color: '#1a2a4a', fontFamily: 'monospace' }}>{formatPower(m.power)}</div>
                        <div style={{ fontSize: 9, color: '#8090b8', fontWeight: 600, textTransform: 'uppercase', marginTop: 1 }}>Power</div>
                      </div>
                      <div style={{ display: 'flex', gap: 5, flexShrink: 0 }}>
                        <button className="btn-primary btn-sm" onClick={() => openEdit(m)}>Edit</button>
                        <button className="btn-danger btn-sm" onClick={() => handleDelete(m.id, m.name)}>Delete</button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
