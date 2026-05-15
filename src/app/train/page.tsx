'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Member, TrainLog } from '@/lib/types'

function formatDate(dateStr: string) {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
}

function todayStr() {
  return new Date().toISOString().split('T')[0]
}

const EMPTY_FORM = {
  log_date: todayStr(),
  conductor_id: '',
  conductor_name: '',
  vip_id: '',
  vip_name: '',
  notes: '',
}

// Filtered dropdown with search
function MemberAutocomplete({
  label,
  required,
  selectedId,
  selectedName,
  members,
  onSelect,
  onManualChange,
}: {
  label: string
  required?: boolean
  selectedId: string
  selectedName: string
  members: Member[]
  onSelect: (id: string, name: string) => void
  onManualChange: (name: string) => void
}) {
  const [query, setQuery]     = useState(selectedName)
  const [open, setOpen]       = useState(false)

  useEffect(() => { setQuery(selectedName) }, [selectedName])

  const filtered = members.filter(m =>
    m.name.toLowerCase().includes(query.toLowerCase())
  )

  return (
    <div className="relative">
      <label className="text-xs text-gray-400 mb-1 block">{label}{required && ' *'}</label>
      <input
        className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-yellow-400"
        placeholder={`Search or type ${label.toLowerCase()}…`}
        value={query}
        onChange={e => {
          setQuery(e.target.value)
          onManualChange(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {open && filtered.length > 0 && (
        <div className="absolute z-20 w-full mt-1 bg-gray-800 border border-gray-600 rounded-lg shadow-xl max-h-48 overflow-y-auto">
          {filtered.map(m => (
            <button
              key={m.id}
              type="button"
              className="w-full text-left px-3 py-2 text-sm hover:bg-gray-700 transition-colors flex items-center gap-2"
              onMouseDown={() => {
                onSelect(m.id, m.name)
                setQuery(m.name)
                setOpen(false)
              }}
            >
              <span className="text-xs bg-gray-700 text-gray-300 px-1.5 py-0.5 rounded">R{m.rank}</span>
              <span className="text-gray-100">{m.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default function TrainPage() {
  const supabase = createClient()

  const [logs, setLogs]           = useState<TrainLog[]>([])
  const [members, setMembers]     = useState<Member[]>([])
  const [loading, setLoading]     = useState(true)
  const [showForm, setShowForm]   = useState(false)
  const [form, setForm]           = useState(EMPTY_FORM)
  const [editId, setEditId]       = useState<string | null>(null)
  const [saving, setSaving]       = useState(false)
  const [error, setError]         = useState<string | null>(null)
  const [alertOpen, setAlertOpen] = useState(false)

  async function fetchLogs() {
    const { data, error } = await supabase
      .from('train_log')
      .select('*')
      .order('log_date', { ascending: false })
      .limit(120)
    if (error) { setError(error.message); return }
    setLogs(data || [])
  }

  async function fetchMembers() {
    const { data } = await supabase
      .from('members')
      .select('*')
      .eq('active', true)
      .order('rank', { ascending: false })
      .order('name')
    setMembers(data || [])
  }

  useEffect(() => {
    Promise.all([fetchLogs(), fetchMembers()]).finally(() => setLoading(false))
  }, [])

  function openAdd() {
    setForm({ ...EMPTY_FORM, log_date: todayStr() })
    setEditId(null)
    setShowForm(true)
    setError(null)
  }

  function openEdit(log: TrainLog) {
    setForm({
      log_date:       log.log_date,
      conductor_id:   log.conductor_id || '',
      conductor_name: log.conductor_name,
      vip_id:         log.vip_id || '',
      vip_name:       log.vip_name || '',
      notes:          log.notes || '',
    })
    setEditId(log.id)
    setShowForm(true)
    setError(null)
  }

  async function handleSave() {
    if (!form.conductor_name.trim()) { setError('Conductor name is required'); return }
    setSaving(true)
    setError(null)

    const payload = {
      log_date:       form.log_date,
      conductor_id:   form.conductor_id || null,
      conductor_name: form.conductor_name.trim(),
      vip_id:         form.vip_id || null,
      vip_name:       form.vip_name.trim() || null,
      notes:          form.notes.trim() || null,
    }

    if (editId) {
      const { error } = await supabase.from('train_log').update(payload).eq('id', editId)
      if (error) { setError(error.message); setSaving(false); return }
    } else {
      const { error } = await supabase
        .from('train_log')
        .upsert(payload, { onConflict: 'log_date' })
      if (error) { setError(error.message); setSaving(false); return }
    }

    await fetchLogs()
    setShowForm(false)
    setForm(EMPTY_FORM)
    setEditId(null)
    setSaving(false)
  }

  async function handleDelete(id: string, date: string) {
    if (!confirm(`Delete log entry for ${formatDate(date)}?`)) return
    const { error } = await supabase.from('train_log').delete().eq('id', id)
    if (error) { setError(error.message); return }
    setLogs(prev => prev.filter(l => l.id !== id))
  }

  // 14-day flagging for both conductors and VIPs
  const twoWeeksAgo = new Date()
  twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14)

  const recentLogs = logs.filter(
    log => new Date(log.log_date + 'T00:00:00') >= twoWeeksAgo
  )

  const recentConductors = [...new Set(recentLogs.map(l => l.conductor_name))].map(name => ({
    name,
    role: 'Conductor' as const,
    count: recentLogs.filter(l => l.conductor_name === name).length,
    dates: recentLogs.filter(l => l.conductor_name === name).map(l => formatDate(l.log_date)),
  })).sort((a, b) => b.count - a.count)

  const recentVIPs = [...new Set(recentLogs.filter(l => l.vip_name).map(l => l.vip_name!))].map(name => ({
    name,
    role: 'VIP' as const,
    count: recentLogs.filter(l => l.vip_name === name).length,
    dates: recentLogs.filter(l => l.vip_name === name).map(l => formatDate(l.log_date)),
  })).sort((a, b) => b.count - a.count)

  const flagged = [...recentConductors, ...recentVIPs]

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-100">Train Conductor Log</h1>
          <p className="text-gray-400 text-sm mt-0.5">Last {logs.length} days recorded</p>
        </div>
        <button
          onClick={openAdd}
          className="bg-yellow-400 hover:bg-yellow-300 text-gray-950 font-semibold px-4 py-2 rounded-lg text-sm transition-colors"
        >
          + Log Today
        </button>
      </div>

      {/* Collapsible 14-day alert */}
      {flagged.length > 0 && (
        <div className="bg-orange-950/40 border border-orange-800 rounded-xl mb-6 overflow-hidden">
          <button
            onClick={() => setAlertOpen(o => !o)}
            className="w-full flex items-center justify-between px-4 py-3 text-left"
          >
            <div className="flex items-center gap-2">
              <span className="text-orange-400 text-sm font-semibold">
                ⚠️ Active in last 14 days
              </span>
              <span className="bg-orange-900/60 text-orange-300 text-xs px-2 py-0.5 rounded-full">
                {recentConductors.length} conductors · {recentVIPs.length} VIPs
              </span>
            </div>
            <span className="text-orange-500 text-xs">{alertOpen ? '▲ collapse' : '▼ expand'}</span>
          </button>

          {alertOpen && (
            <div className="px-4 pb-4 border-t border-orange-800/50">
              {recentConductors.length > 0 && (
                <>
                  <p className="text-orange-600 text-xs font-medium uppercase tracking-wide mt-3 mb-2">Conductors</p>
                  <div className="flex flex-col gap-1.5">
                    {recentConductors.map(({ name, count, dates }) => (
                      <div key={name} className="bg-orange-900/30 rounded-lg px-3 py-2 flex flex-wrap items-center gap-2">
                        <span className="text-orange-200 text-sm font-semibold">{name}</span>
                        <span className="text-orange-400 text-xs">×{count}</span>
                        <span className="text-orange-600 text-xs">{dates.join(' · ')}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
              {recentVIPs.length > 0 && (
                <>
                  <p className="text-orange-600 text-xs font-medium uppercase tracking-wide mt-3 mb-2">VIPs</p>
                  <div className="flex flex-col gap-1.5">
                    {recentVIPs.map(({ name, count, dates }) => (
                      <div key={name} className="bg-orange-900/30 rounded-lg px-3 py-2 flex flex-wrap items-center gap-2">
                        <span className="text-orange-200 text-sm font-semibold">{name}</span>
                        <span className="text-orange-400 text-xs">×{count}</span>
                        <span className="text-orange-600 text-xs">{dates.join(' · ')}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* Add / Edit Form */}
      {showForm && (
        <div className="bg-gray-900 border border-gray-700 rounded-xl p-5 mb-6">
          <h2 className="text-base font-semibold mb-4 text-gray-100">
            {editId ? 'Edit Entry' : 'Log Train Entry'}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Date</label>
              <input
                type="date"
                className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-yellow-400"
                value={form.log_date}
                onChange={e => setForm(f => ({ ...f, log_date: e.target.value }))}
              />
            </div>
            <div className="hidden sm:block" />

            <MemberAutocomplete
              label="Conductor"
              required
              selectedId={form.conductor_id}
              selectedName={form.conductor_name}
              members={members}
              onSelect={(id, name) => setForm(f => ({ ...f, conductor_id: id, conductor_name: name }))}
              onManualChange={name => setForm(f => ({ ...f, conductor_name: name, conductor_id: '' }))}
            />

            <MemberAutocomplete
              label="VIP / Special Guest"
              selectedId={form.vip_id}
              selectedName={form.vip_name}
              members={members}
              onSelect={(id, name) => setForm(f => ({ ...f, vip_id: id, vip_name: name }))}
              onManualChange={name => setForm(f => ({ ...f, vip_name: name, vip_id: '' }))}
            />

            <div className="sm:col-span-2">
              <label className="text-xs text-gray-400 mb-1 block">Notes (optional)</label>
              <input
                className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-yellow-400"
                placeholder="Any notes about this run"
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              />
            </div>
          </div>

          {error && <p className="text-red-400 text-sm mt-3">{error}</p>}

          <div className="flex gap-3 mt-4">
            <button
              onClick={handleSave}
              disabled={saving}
              className="bg-yellow-400 hover:bg-yellow-300 disabled:opacity-50 text-gray-950 font-semibold px-5 py-2 rounded-lg text-sm transition-colors"
            >
              {saving ? 'Saving…' : editId ? 'Save Changes' : 'Save Entry'}
            </button>
            <button
              onClick={() => { setShowForm(false); setError(null) }}
              className="text-gray-400 hover:text-gray-200 px-4 py-2 rounded-lg text-sm border border-gray-700 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-gray-500 text-sm py-12 text-center">Loading log…</div>
      ) : logs.length === 0 ? (
        <div className="text-gray-500 text-sm py-12 text-center">No entries yet — log today's conductor above.</div>
      ) : (
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead>
              <tr className="border-b border-gray-800 text-gray-400 text-xs uppercase tracking-wide">
                <th className="text-left px-4 py-3 font-medium">Date</th>
                <th className="text-left px-4 py-3 font-medium">Conductor</th>
                <th className="text-left px-4 py-3 font-medium">VIP</th>
                <th className="text-left px-4 py-3 font-medium hidden sm:table-cell">Notes</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {logs.map(log => {
                const isRecent = new Date(log.log_date + 'T00:00:00') >= twoWeeksAgo
                return (
                  <tr key={log.id} className="border-b border-gray-800 last:border-0 hover:bg-gray-800/50 transition-colors">
                    <td className="px-4 py-3 text-gray-400 text-xs whitespace-nowrap">
                      {formatDate(log.log_date)}
                      {isRecent && (
                        <span className="ml-2 bg-yellow-900/50 text-yellow-400 text-xs px-1.5 py-0.5 rounded">recent</span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-100">{log.conductor_name}</td>
                    <td className="px-4 py-3 text-gray-300">{log.vip_name || <span className="text-gray-600">—</span>}</td>
                    <td className="px-4 py-3 text-gray-500 hidden sm:table-cell">{log.notes || '—'}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 justify-end">
                        <button
                          onClick={() => openEdit(log)}
                          className="text-gray-400 hover:text-yellow-400 text-xs px-2 py-1 rounded border border-gray-700 hover:border-yellow-400 transition-colors"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(log.id, log.log_date)}
                          className="text-gray-400 hover:text-red-400 text-xs px-2 py-1 rounded border border-gray-700 hover:border-red-400 transition-colors"
                        >
                          Delete
                        </button>
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
