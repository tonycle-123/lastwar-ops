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

// Clickable hazard flag that expands to show prior dates
function NameCell({ name, priorDates }: { name: string; priorDates: string[] }) {
  const [open, setOpen] = useState(false)
  const hasFlag = priorDates.length > 0

  return (
    <div className="flex items-center gap-1.5">
      <span className="font-medium text-gray-100">{name}</span>
      {hasFlag && (
        <button
          onClick={() => setOpen(o => !o)}
          className="text-orange-400 hover:text-orange-300 transition-colors text-sm leading-none"
          title="Active in last 14 days — click to expand"
        >
          ⚠️
        </button>
      )}
      {hasFlag && open && (
        <span className="text-orange-400 text-xs whitespace-nowrap">
          {priorDates.map(shortDate).join(', ')}
        </span>
      )}
    </div>
  )
}

// Autocomplete input that filters from roster
function MemberAutocomplete({
  label,
  required,
  selectedId,
  selectedName,
  members,
  onSelect,
  onManualChange,
  recentDates,
}: {
  label: string
  required?: boolean
  selectedId: string
  selectedName: string
  members: Member[]
  onSelect: (id: string, name: string) => void
  onManualChange: (name: string) => void
  recentDates?: string[] // dates this person was active in last 14 days
}) {
  const [query, setQuery] = useState(selectedName)
  const [open, setOpen]   = useState(false)

  useEffect(() => { setQuery(selectedName) }, [selectedName])

  const filtered = members.filter(m =>
    m.name.toLowerCase().includes(query.toLowerCase())
  )

  const hasWarning = recentDates && recentDates.length > 0

  return (
    <div className="relative">
      <label className="text-xs text-gray-400 mb-1 block">{label}{required && ' *'}</label>
      <input
        className={`w-full bg-gray-800 border rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:outline-none transition-colors ${
          hasWarning ? 'border-orange-500 focus:border-orange-400' : 'border-gray-600 focus:border-yellow-400'
        }`}
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
      {/* Warning under input if recently active */}
      {hasWarning && (
        <p className="text-orange-400 text-xs mt-1">
          ⚠️ Active in last 14 days: {recentDates!.map(shortDate).join(', ')}
        </p>
      )}
      {open && filtered.length > 0 && (
        <div className="absolute z-20 w-full mt-1 bg-gray-800 border border-gray-600 rounded-lg shadow-xl max-h-48 overflow-y-auto">
          {filtered.map(m => {
            const warn = recentDates && recentDates.length > 0 && m.name === selectedName
            return (
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
                {warn && <span className="text-orange-400 text-xs ml-auto">⚠️ recent</span>}
              </button>
            )
          })}
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
    const { data, error } = await supabase
      .from('train_log')
      .select('*')
      .order('log_date', { ascending: false })
      .limit(180)
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

  // Build a map of name -> dates active in last 14 days (as conductor OR vip)
  const twoWeeksAgo = new Date()
  twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14)

  const recentLogs = logs.filter(
    log => new Date(log.log_date + 'T00:00:00') >= twoWeeksAgo
  )

  function getRecentDatesFor(name: string, role: 'conductor' | 'vip' | 'both'): string[] {
    return recentLogs
      .filter(l => {
        if (role === 'conductor') return l.conductor_name.toLowerCase() === name.toLowerCase()
        if (role === 'vip')       return l.vip_name?.toLowerCase() === name.toLowerCase()
        return l.conductor_name.toLowerCase() === name.toLowerCase() ||
               l.vip_name?.toLowerCase() === name.toLowerCase()
      })
      .map(l => l.log_date)
      .filter((v, i, a) => a.indexOf(v) === i) // dedupe
  }

  // What to show as warning under conductor/vip inputs in the form
  const conductorRecentDates = form.conductor_name
    ? getRecentDatesFor(form.conductor_name, 'both')
    : []
  const vipRecentDates = form.vip_name
    ? getRecentDatesFor(form.vip_name, 'both')
    : []

  // Filter log table by search
  const filtered = logs.filter(l =>
    l.conductor_name.toLowerCase().includes(search.toLowerCase()) ||
    (l.vip_name || '').toLowerCase().includes(search.toLowerCase()) ||
    l.log_date.includes(search)
  )

  return (
    <div>
      {/* Header */}
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
              recentDates={conductorRecentDates}
              onSelect={(id, name) => setForm(f => ({ ...f, conductor_id: id, conductor_name: name }))}
              onManualChange={name => setForm(f => ({ ...f, conductor_name: name, conductor_id: '' }))}
            />

            <MemberAutocomplete
              label="VIP / Special Guest"
              selectedId={form.vip_id}
              selectedName={form.vip_name}
              members={members}
              recentDates={vipRecentDates}
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

      {/* Search */}
      <div className="relative mb-4">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">🔍</span>
        <input
          className="w-full bg-gray-900 border border-gray-700 rounded-lg pl-9 pr-4 py-2.5 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-yellow-400"
          placeholder="Search by name or date…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        {search && (
          <button
            onClick={() => setSearch('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 text-xs"
          >
            ✕
          </button>
        )}
      </div>

      {/* Log table */}
      {loading ? (
        <div className="text-gray-500 text-sm py-12 text-center">Loading log…</div>
      ) : filtered.length === 0 ? (
        <div className="text-gray-500 text-sm py-12 text-center">
          {search ? `No entries matching "${search}"` : 'No entries yet — log today\'s conductor above.'}
        </div>
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
              {filtered.map(log => {
                const isRecent       = new Date(log.log_date + 'T00:00:00') >= twoWeeksAgo
                const conductorPrior = getRecentDatesFor(log.conductor_name, 'both')
                  .filter(d => d !== log.log_date)
                const vipPrior       = log.vip_name
                  ? getRecentDatesFor(log.vip_name, 'both').filter(d => d !== log.log_date)
                  : []

                return (
                  <tr key={log.id} className="border-b border-gray-800 last:border-0 hover:bg-gray-800/50 transition-colors">
                    <td className="px-4 py-3 text-gray-400 text-xs whitespace-nowrap">
                      {formatDate(log.log_date)}
                      {isRecent && (
                        <span className="ml-2 bg-yellow-900/50 text-yellow-400 text-xs px-1.5 py-0.5 rounded">recent</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <NameCell name={log.conductor_name} priorDates={isRecent ? conductorPrior : []} />
                    </td>
                    <td className="px-4 py-3">
                      {log.vip_name
                        ? <NameCell name={log.vip_name} priorDates={isRecent ? vipPrior : []} />
                        : <span className="text-gray-600">—</span>
                      }
                    </td>
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
