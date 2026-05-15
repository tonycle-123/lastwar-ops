'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Member, TrainLog } from '@/lib/types'

function formatDate(dateStr: string) {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
}

function shortDate(dateStr: string) {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function todayStr() { return new Date().toISOString().split('T')[0] }

const EMPTY_FORM = { log_date: todayStr(), conductor_id: '', conductor_name: '', vip_id: '', vip_name: '', notes: '' }

function NameCell({ name, priorDates }: { name: string; priorDates: string[] }) {
  const [open, setOpen] = useState(false)
  const hasFlag = priorDates.length > 0
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{ fontWeight: 500, color: '#f5f0e0' }}>{name}</span>
      {hasFlag && (
        <button
          onClick={() => setOpen(o => !o)}
          title="Active in last 14 days"
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: 13, lineHeight: 1 }}
        >
          ⚠️
        </button>
      )}
      {hasFlag && open && (
        <span style={{ fontSize: 11, color: '#c07040', whiteSpace: 'nowrap' }}>
          {priorDates.map(shortDate).join(', ')}
        </span>
      )}
    </div>
  )
}

function MemberAutocomplete({ label, required, selectedId, selectedName, members, onSelect, onManualChange, recentDates }: {
  label: string; required?: boolean; selectedId: string; selectedName: string
  members: Member[]; onSelect: (id: string, name: string) => void
  onManualChange: (name: string) => void; recentDates?: string[]
}) {
  const [query, setQuery] = useState(selectedName)
  const [open, setOpen]   = useState(false)
  useEffect(() => { setQuery(selectedName) }, [selectedName])
  const filtered = members.filter(m => m.name.toLowerCase().includes(query.toLowerCase()))
  const hasWarning = recentDates && recentDates.length > 0

  return (
    <div style={{ position: 'relative' }}>
      <label className="lw-form-label">{label}{required && ' *'}</label>
      <input
        className="lw-input"
        style={{ borderColor: hasWarning ? '#8a4020' : undefined }}
        placeholder={`Search or type ${label.toLowerCase()}…`}
        value={query}
        onChange={e => { setQuery(e.target.value); onManualChange(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {hasWarning && (
        <p style={{ color: '#c07040', fontSize: 11, marginTop: 4 }}>
          ⚠️ Active in last 14 days: {recentDates!.map(shortDate).join(', ')}
        </p>
      )}
      {open && filtered.length > 0 && (
        <div className="lw-dropdown">
          {filtered.map(m => (
            <button
              key={m.id}
              type="button"
              className="lw-dropdown-item"
              onMouseDown={() => { onSelect(m.id, m.name); setQuery(m.name); setOpen(false) }}
            >
              <span className={`rank-badge rank-${m.rank}`} style={{ width: 22, height: 22, fontSize: 9 }}>R{m.rank}</span>
              <span>{m.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default function TrainPage() {
  const supabase = createClient()
  const [logs, setLogs]         = useState<TrainLog[]>([])
  const [members, setMembers]   = useState<Member[]>([])
  const [loading, setLoading]   = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm]         = useState(EMPTY_FORM)
  const [editId, setEditId]     = useState<string | null>(null)
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState<string | null>(null)
  const [search, setSearch]     = useState('')

  async function fetchLogs() {
    const { data, error } = await supabase.from('train_log').select('*').order('log_date', { ascending: false }).limit(180)
    if (error) { setError(error.message); return }
    setLogs(data || [])
  }

  async function fetchMembers() {
    const { data } = await supabase.from('members').select('*').eq('active', true).order('rank', { ascending: false }).order('name')
    setMembers(data || [])
  }

  useEffect(() => { Promise.all([fetchLogs(), fetchMembers()]).finally(() => setLoading(false)) }, [])

  function openAdd() { setForm({ ...EMPTY_FORM, log_date: todayStr() }); setEditId(null); setShowForm(true); setError(null) }

  function openEdit(log: TrainLog) {
    setForm({ log_date: log.log_date, conductor_id: log.conductor_id || '', conductor_name: log.conductor_name, vip_id: log.vip_id || '', vip_name: log.vip_name || '', notes: log.notes || '' })
    setEditId(log.id); setShowForm(true); setError(null)
  }

  async function handleSave() {
    if (!form.conductor_name.trim()) { setError('Conductor name is required'); return }
    setSaving(true); setError(null)
    const payload = { log_date: form.log_date, conductor_id: form.conductor_id || null, conductor_name: form.conductor_name.trim(), vip_id: form.vip_id || null, vip_name: form.vip_name.trim() || null, notes: form.notes.trim() || null }
    if (editId) {
      const { error } = await supabase.from('train_log').update(payload).eq('id', editId)
      if (error) { setError(error.message); setSaving(false); return }
    } else {
      const { error } = await supabase.from('train_log').upsert(payload, { onConflict: 'log_date' })
      if (error) { setError(error.message); setSaving(false); return }
    }
    await fetchLogs(); setShowForm(false); setForm(EMPTY_FORM); setEditId(null); setSaving(false)
  }

  async function handleDelete(id: string, date: string) {
    if (!confirm(`Delete log entry for ${formatDate(date)}?`)) return
    const { error } = await supabase.from('train_log').delete().eq('id', id)
    if (error) { setError(error.message); return }
    setLogs(prev => prev.filter(l => l.id !== id))
  }

  const twoWeeksAgo = new Date()
  twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14)

  const recentLogs = logs.filter(log => new Date(log.log_date + 'T00:00:00') >= twoWeeksAgo)

  function getRecentDatesFor(name: string): string[] {
    return recentLogs
      .filter(l => l.conductor_name.toLowerCase() === name.toLowerCase() || l.vip_name?.toLowerCase() === name.toLowerCase())
      .map(l => l.log_date)
      .filter((v, i, a) => a.indexOf(v) === i)
  }

  const conductorRecentDates = form.conductor_name ? getRecentDatesFor(form.conductor_name) : []
  const vipRecentDates       = form.vip_name ? getRecentDatesFor(form.vip_name) : []

  const filtered = logs.filter(l =>
    l.conductor_name.toLowerCase().includes(search.toLowerCase()) ||
    (l.vip_name || '').toLowerCase().includes(search.toLowerCase()) ||
    l.log_date.includes(search)
  )

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <div className="section-title" style={{ marginBottom: 4 }}>
            <i className="ti ti-train" aria-hidden="true" />
            Train Conductor Log
          </div>
          <div style={{ fontSize: 12, color: '#2a4a7a' }}>{logs.length} days recorded</div>
        </div>
        <button className="btn-gold" onClick={openAdd}>
          <i className="ti ti-plus" aria-hidden="true" />
          Log Today
        </button>
      </div>

      {/* Add / Edit form */}
      {showForm && (
        <div className="lw-form-panel" style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#7ab4f5', marginBottom: 14 }}>{editId ? 'Edit Entry' : 'Log Train Entry'}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
            <div>
              <label className="lw-form-label">Date</label>
              <input type="date" className="lw-input" value={form.log_date} onChange={e => setForm(f => ({ ...f, log_date: e.target.value }))} />
            </div>
            <div style={{ display: 'none' }} />
            <MemberAutocomplete
              label="Conductor" required
              selectedId={form.conductor_id} selectedName={form.conductor_name}
              members={members} recentDates={conductorRecentDates}
              onSelect={(id, name) => setForm(f => ({ ...f, conductor_id: id, conductor_name: name }))}
              onManualChange={name => setForm(f => ({ ...f, conductor_name: name, conductor_id: '' }))}
            />
            <MemberAutocomplete
              label="VIP / Special Guest"
              selectedId={form.vip_id} selectedName={form.vip_name}
              members={members} recentDates={vipRecentDates}
              onSelect={(id, name) => setForm(f => ({ ...f, vip_id: id, vip_name: name }))}
              onManualChange={name => setForm(f => ({ ...f, vip_name: name, vip_id: '' }))}
            />
            <div style={{ gridColumn: 'span 2' }}>
              <label className="lw-form-label">Notes (optional)</label>
              <input className="lw-input" placeholder="Any notes about this run" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
          </div>
          {error && <div className="lw-error" style={{ marginTop: 12 }}>{error}</div>}
          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            <button className="btn-gold" onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : editId ? 'Save Changes' : 'Save Entry'}</button>
            <button className="btn-ghost" onClick={() => { setShowForm(false); setError(null) }}>Cancel</button>
          </div>
        </div>
      )}

      {/* Search */}
      <div className="lw-search" style={{ marginBottom: 12 }}>
        <i className="ti ti-search" aria-hidden="true" style={{ color: '#2a4a7a', fontSize: 14 }} />
        <input placeholder="Search by name or date…" value={search} onChange={e => setSearch(e.target.value)} />
        {search && <button onClick={() => setSearch('')} style={{ background: 'none', border: 'none', color: '#2a4a7a', cursor: 'pointer', fontSize: 12 }}>✕</button>}
      </div>

      {/* Table */}
      {loading ? (
        <div style={{ textAlign: 'center', color: '#2a4a7a', padding: '48px 0', fontSize: 13 }}>Loading log…</div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', color: '#2a4a7a', padding: '48px 0', fontSize: 13 }}>
          {search ? `No entries matching "${search}"` : "No entries yet — log today's conductor above."}
        </div>
      ) : (
        <div className="lw-card" style={{ overflowX: 'auto' }}>
          <table className="lw-table" style={{ minWidth: 640 }}>
            <thead>
              <tr>
                <th><i className="ti ti-calendar" aria-hidden="true" style={{ fontSize: 12 }} /> Date</th>
                <th><i className="ti ti-steering-wheel" aria-hidden="true" style={{ fontSize: 12 }} /> Conductor</th>
                <th><i className="ti ti-star" aria-hidden="true" style={{ fontSize: 12 }} /> VIP</th>
                <th>Notes</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(log => {
                const isRecent       = new Date(log.log_date + 'T00:00:00') >= twoWeeksAgo
                const conductorPrior = getRecentDatesFor(log.conductor_name).filter(d => d !== log.log_date)
                const vipPrior       = log.vip_name ? getRecentDatesFor(log.vip_name).filter(d => d !== log.log_date) : []
                return (
                  <tr key={log.id}>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <span style={{ color: '#4a7ab5', fontSize: 12 }}>{formatDate(log.log_date)}</span>
                      {isRecent && <span style={{ marginLeft: 6, background: '#0e1e40', border: '1px solid #2a5090', color: '#f5a623', fontSize: 9, padding: '1px 5px', borderRadius: 3, fontWeight: 600 }}>RECENT</span>}
                    </td>
                    <td><NameCell name={log.conductor_name} priorDates={isRecent ? conductorPrior : []} /></td>
                    <td>
                      {log.vip_name
                        ? <NameCell name={log.vip_name} priorDates={isRecent ? vipPrior : []} />
                        : <span style={{ color: '#1a3060' }}>—</span>
                      }
                    </td>
                    <td style={{ color: '#2a4a7a', fontSize: 12 }}>{log.notes || '—'}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                        <button className="btn-ghost" onClick={() => openEdit(log)}>Edit</button>
                        <button className="btn-ghost danger" onClick={() => handleDelete(log.id, log.log_date)}>Delete</button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
