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
      .select('id, name, rank')
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

  function handleMemberSelect(field: 'conductor' | 'vip', memberId: string) {
    const member = members.find(m => m.id === memberId)
    if (field === 'conductor') {
      setForm(f => ({ ...f, conductor_id: memberId, conductor_name: member?.name || '' }))
    } else {
      setForm(f => ({ ...f, vip_id: memberId, vip_name: member?.name || '' }))
    }
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

  // Flag anyone who has been conductor in the last 14 days
  const twoWeeksAgo = new Date()
  twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14)

  const recentLogs = logs.filter(
    log => new Date(log.log_date + 'T00:00:00') >= twoWeeksAgo
  )

  const recentConductorNames = recentLogs.map(l => l.conductor_name)

  const flagged = [...new Set(recentConductorNames)].map(name => ({
    name,
    count: recentConductorNames.filter(n => n === name).length,
    dates: recentLogs
      .filter(l => l.conductor_name === name)
      .map(l => formatDate(l.log_date)),
  })).sort((a, b) => b.count - a.count)

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

      {/* 14-day repeat warning */}
      {flagged.length > 0 && (
        <div className="bg-orange-950/40 border border-orange-800 rounded-xl p-4 mb-6">
          <p className="text-orange-400 text-sm font-semibold mb-3">⚠️ Conductors active in the last 14 days</p>
          <div className="flex flex-col gap-2">
            {flagged.map(({ name, count, dates }) => (
              <div key={name} className="bg-orange-900/40 rounded-lg px-3 py-2 flex flex-wrap items-center gap-2">
                <span className="text-orange-200 text-sm font-semibold">{name}</span>
                <span className="text-orange-400 text-xs">×{count}</span>
                <span className="text-orange-600 text-xs">{dates.join(' · ')}</span>
              </div>
            ))}
          </div>
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
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Conductor *</label>
              <select
                className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-yellow-400 mb-2"
                value={form.conductor_id}
                onChange={e => handleMemberSelect('conductor', e.target.value)}
              >
                <option value="">— Pick from roster —</option>
                {members.map(m => (
                  <option key={m.id} value={m.id}>R{m.rank} · {m.name}</option>
                ))}
              </select>
              <input
                className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-yellow-400"
                placeholder="Or type name manually"
                value={form.conductor_name}
                onChange={e => setForm(f => ({ ...f, conductor_name: e.target.value, conductor_id: '' }))}
              />
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">VIP / Special Guest</label>
              <select
                className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-yellow-400 mb-2"
                value={form.vip_id}
                onChange={e => handleMemberSelect('vip', e.target.value)}
              >
                <option value="">— Pick from roster —</option>
                {members.map(m => (
                  <option key={m.id} value={m.id}>R{m.rank} · {m.name}</option>
                ))}
              </select>
              <input
                className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-yellow-400"
                placeholder="Or type name manually"
                value={form.vip_name}
                onChange={e => setForm(f => ({ ...f, vip_name: e.target.value, vip_id: '' }))}
              />
            </div>
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
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
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
