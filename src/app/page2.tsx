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

export default function RosterPage() {
  const supabase = createClient()
  const [members, setMembers]     = useState<Member[]>([])
  const [loading, setLoading]     = useState(true)
  const [form, setForm]           = useState(EMPTY_FORM)
  const [editId, setEditId]       = useState<string | null>(null)
  const [showForm, setShowForm]   = useState(false)
  const [saving, setSaving]       = useState(false)
  const [error, setError]         = useState<string | null>(null)

  async function fetchMembers() {
    const { data, error } = await supabase
      .from('members')
      .select('*')
      .eq('active', true)
      .order('rank', { ascending: false })
      .order('power', { ascending: false })
    if (error) { setError(error.message); return }
    setMembers(data || [])
  }

  useEffect(() => {
    fetchMembers().finally(() => setLoading(false))
  }, [])

  function openAdd() {
    setForm(EMPTY_FORM)
    setEditId(null)
    setShowForm(true)
    setError(null)
  }

  function openEdit(m: Member) {
    setForm({ name: m.name, rank: m.rank, power: String(m.power), notes: m.notes || '' })
    setEditId(m.id)
    setShowForm(true)
    setError(null)
  }

  async function handleSave() {
    if (!form.name.trim()) { setError('Name is required'); return }
    setSaving(true)
    setError(null)

    const payload = {
      name:  form.name.trim(),
      rank:  Number(form.rank),
      power: form.power ? Number(form.power.toString().replace(/,/g, '')) : 0,
      notes: form.notes || null,
    }

    if (editId) {
      const { error } = await supabase.from('members').update(payload).eq('id', editId)
      if (error) { setError(error.message); setSaving(false); return }
    } else {
      const { error } = await supabase.from('members').insert(payload)
      if (error) { setError(error.message); setSaving(false); return }
    }

    await fetchMembers()
    setShowForm(false)
    setForm(EMPTY_FORM)
    setEditId(null)
    setSaving(false)
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Remove ${name} from the roster?`)) return
    const { error } = await supabase.from('members').update({ active: false }).eq('id', id)
    if (error) { setError(error.message); return }
    setMembers(prev => prev.filter(m => m.id !== id))
  }

  const rankColors: Record<number, string> = {
    5: 'bg-yellow-400 text-gray-950',
    4: 'bg-orange-400 text-gray-950',
    3: 'bg-blue-500 text-white',
    2: 'bg-gray-500 text-white',
    1: 'bg-gray-700 text-gray-300',
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-100">Member Roster</h1>
          <p className="text-gray-400 text-sm mt-0.5">{members.length} active members</p>
        </div>
        <button
          onClick={openAdd}
          className="bg-yellow-400 hover:bg-yellow-300 text-gray-950 font-semibold px-4 py-2 rounded-lg text-sm transition-colors"
        >
          + Add Member
        </button>
      </div>

      {/* Add / Edit Form */}
      {showForm && (
        <div className="bg-gray-900 border border-gray-700 rounded-xl p-5 mb-6">
          <h2 className="text-base font-semibold mb-4 text-gray-100">
            {editId ? 'Edit Member' : 'Add Member'}
          </h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div className="sm:col-span-2">
              <label className="text-xs text-gray-400 mb-1 block">Name *</label>
              <input
                className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-yellow-400"
                placeholder="Member name"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Rank</label>
              <select
                className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-yellow-400"
                value={form.rank}
                onChange={e => setForm(f => ({ ...f, rank: Number(e.target.value) }))}
              >
                {[5,4,3,2,1].map(r => (
                  <option key={r} value={r}>R{r}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Power</label>
              <input
                className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-yellow-400"
                placeholder="e.g. 850000000"
                value={form.power}
                onChange={e => setForm(f => ({ ...f, power: e.target.value }))}
              />
            </div>
            <div className="sm:col-span-4">
              <label className="text-xs text-gray-400 mb-1 block">Notes (optional)</label>
              <input
                className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-yellow-400"
                placeholder="Any notes about this member"
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
              {saving ? 'Saving…' : editId ? 'Save Changes' : 'Add Member'}
            </button>
            <button
              onClick={() => { setShowForm(false); setError(null) }}
              className="text-gray-400 hover:text-gray-200 px-4 py-2 rounded-lg text-sm transition-colors border border-gray-700"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="text-gray-500 text-sm py-12 text-center">Loading roster…</div>
      ) : members.length === 0 ? (
        <div className="text-gray-500 text-sm py-12 text-center">No members yet — add your first one above.</div>
      ) : (
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-gray-400 text-xs uppercase tracking-wide">
                <th className="text-left px-4 py-3 font-medium">#</th>
                <th className="text-left px-4 py-3 font-medium">Name</th>
                <th className="text-left px-4 py-3 font-medium">Rank</th>
                <th className="text-right px-4 py-3 font-medium">Power</th>
                <th className="text-left px-4 py-3 font-medium hidden sm:table-cell">Notes</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {members.map((m, i) => (
                <tr key={m.id} className="border-b border-gray-800 last:border-0 hover:bg-gray-800/50 transition-colors">
                  <td className="px-4 py-3 text-gray-500">{i + 1}</td>
                  <td className="px-4 py-3 font-medium text-gray-100">{m.name}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-bold px-2 py-0.5 rounded ${rankColors[m.rank] || 'bg-gray-700 text-gray-300'}`}>
                      {RANK_LABELS[m.rank]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-yellow-400">{formatPower(m.power)}</td>
                  <td className="px-4 py-3 text-gray-500 hidden sm:table-cell">{m.notes || '—'}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 justify-end">
                      <button
                        onClick={() => openEdit(m)}
                        className="text-gray-400 hover:text-yellow-400 text-xs px-2 py-1 rounded border border-gray-700 hover:border-yellow-400 transition-colors"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(m.id, m.name)}
                        className="text-gray-400 hover:text-red-400 text-xs px-2 py-1 rounded border border-gray-700 hover:border-red-400 transition-colors"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
