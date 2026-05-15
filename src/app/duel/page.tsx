'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Member, DuelEvent, DuelScore, DUEL_DAYS } from '@/lib/types'

function getMondayOf(date: Date): string {
  const d = new Date(date)
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  return d.toISOString().split('T')[0]
}

function formatScore(n: number) {
  if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(2) + 'B'
  if (n >= 1_000_000)     return (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000)         return (n / 1_000).toFixed(1) + 'K'
  return n.toLocaleString()
}

function formatDateLabel(dateStr: string) {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

type ScoreMap = Record<string, Record<number, number>>

export default function DuelPage() {
  const supabase = createClient()

  const [events, setEvents]          = useState<DuelEvent[]>([])
  const [selectedEvent, setSelected] = useState<DuelEvent | null>(null)
  const [members, setMembers]        = useState<Member[]>([])
  const [scores, setScores]          = useState<ScoreMap>({})
  const [loading, setLoading]        = useState(true)
  const [saving, setSaving]          = useState<string | null>(null)
  const [editCell, setEditCell]      = useState<{ memberId: string; day: number } | null>(null)
  const [editValue, setEditValue]    = useState('')
  const [error, setError]            = useState<string | null>(null)
  const [search, setSearch]          = useState('')

  async function ensureCurrentEvent(): Promise<DuelEvent> {
    const monday = getMondayOf(new Date())
    const { data: existing } = await supabase
      .from('duel_events')
      .select('*')
      .eq('week_start', monday)
      .single()

    if (existing) return existing

    const { data: created, error } = await supabase
      .from('duel_events')
      .upsert({ week_start: monday }, { onConflict: 'week_start' })
      .select()
      .single()

    if (error) throw new Error(error.message)
    return created
  }

  async function fetchEvents() {
    const { data } = await supabase
      .from('duel_events')
      .select('*')
      .order('week_start', { ascending: false })
    return data || []
  }

  async function fetchMembers() {
    const { data } = await supabase
      .from('members')
      .select('*')
      .eq('active', true)
    return data || []
  }

  async function fetchScores(eventId: string): Promise<ScoreMap> {
    const { data } = await supabase
      .from('duel_scores')
      .select('*')
      .eq('event_id', eventId)

    const map: ScoreMap = {}
    for (const s of (data || []) as DuelScore[]) {
      if (!map[s.member_id]) map[s.member_id] = {}
      map[s.member_id][s.day] = s.score
    }
    return map
  }

  const loadEvent = useCallback(async (event: DuelEvent) => {
    setSelected(event)
    const [m, s] = await Promise.all([fetchMembers(), fetchScores(event.id)])
    setMembers(m)
    setScores(s)
  }, [])

  useEffect(() => {
    async function init() {
      try {
        const [current, allEvents] = await Promise.all([
          ensureCurrentEvent(),
          fetchEvents(),
        ])
        setEvents(allEvents.length ? allEvents : [current])
        await loadEvent(current)
      } catch (e: any) {
        setError(e.message)
      } finally {
        setLoading(false)
      }
    }
    init()
  }, [])

  async function handleEventChange(eventId: string) {
    const event = events.find(e => e.id === eventId)
    if (!event) return
    setLoading(true)
    await loadEvent(event)
    setLoading(false)
  }

  function startEdit(memberId: string, day: number) {
    const current = scores[memberId]?.[day] ?? 0
    setEditCell({ memberId, day })
    setEditValue(current > 0 ? String(current) : '')
  }

  async function commitEdit() {
    if (!editCell || !selectedEvent) return
    const { memberId, day } = editCell
    const score = parseInt(editValue.replace(/,/g, ''), 10) || 0
    setSaving(`${memberId}-${day}`)

    const { error } = await supabase
      .from('duel_scores')
      .upsert(
        { event_id: selectedEvent.id, member_id: memberId, day, score },
        { onConflict: 'event_id,member_id,day' }
      )

    if (!error) {
      setScores(prev => ({
        ...prev,
        [memberId]: { ...(prev[memberId] || {}), [day]: score },
      }))
    } else {
      setError(error.message)
    }

    setEditCell(null)
    setEditValue('')
    setSaving(null)
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') commitEdit()
    if (e.key === 'Escape') { setEditCell(null); setEditValue('') }
  }

  // Calculate totals, sort by total desc, then filter by search
  const ranked = members
    .map(m => {
      const dayScores = scores[m.id] || {}
      const total = Object.values(dayScores).reduce((a, b) => a + b, 0)
      return { ...m, dayScores, total }
    })
    .sort((a, b) => b.total - a.total)

  const filtered = ranked.filter(m =>
    m.name.toLowerCase().includes(search.toLowerCase())
  )

  const isCurrentWeek = selectedEvent?.week_start === getMondayOf(new Date())

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-100">Alliance Duel</h1>
          <p className="text-gray-400 text-sm mt-0.5">
            {isCurrentWeek ? '🟢 Current week' : '📅 Viewing past event'}
            {selectedEvent && ` — week of ${formatDateLabel(selectedEvent.week_start)}`}
          </p>
        </div>
        <select
          className="bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-yellow-400"
          value={selectedEvent?.id || ''}
          onChange={e => handleEventChange(e.target.value)}
        >
          {events.map(ev => (
            <option key={ev.id} value={ev.id}>
              {ev.label || `Week of ${formatDateLabel(ev.week_start)}`}
              {ev.week_start === getMondayOf(new Date()) ? ' (current)' : ''}
            </option>
          ))}
        </select>
      </div>

      {error && <p className="text-red-400 text-sm mb-4">{error}</p>}

      {loading ? (
        <div className="text-gray-500 text-sm py-12 text-center">Loading scores…</div>
      ) : (
        <>
          {/* Day theme legend */}
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 mb-4">
            {Object.entries(DUEL_DAYS).map(([day, theme]) => (
              <div key={day} className="bg-gray-900 border border-gray-800 rounded-lg px-3 py-2 text-center">
                <p className="text-xs text-gray-500 font-medium">Day {day}</p>
                <p className="text-xs text-gray-300 mt-0.5">{theme.short}</p>
              </div>
            ))}
          </div>

          {/* Search */}
          <div className="relative mb-4">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">🔍</span>
            <input
              className="w-full bg-gray-900 border border-gray-700 rounded-lg pl-9 pr-4 py-2.5 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-yellow-400"
              placeholder="Search member name…"
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

          {/* Score table */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-x-auto">
            <table className="w-full text-sm min-w-[700px]">
              <thead>
                <tr className="border-b border-gray-800 text-gray-400 text-xs uppercase tracking-wide">
                  <th className="text-left px-4 py-3 font-medium w-8">#</th>
                  <th className="text-left px-4 py-3 font-medium">Member</th>
                  {Object.entries(DUEL_DAYS).map(([day, theme]) => (
                    <th key={day} className="text-right px-3 py-3 font-medium">
                      <span className="block text-gray-500">D{day}</span>
                      <span className="block text-gray-600 text-xs normal-case">{theme.short}</span>
                    </th>
                  ))}
                  <th className="text-right px-4 py-3 font-medium text-yellow-400">Total</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-12 text-center text-gray-500 text-sm">
                      {search ? `No members found matching "${search}"` : 'No members in roster yet.'}
                    </td>
                  </tr>
                ) : (
                  filtered.map((m, i) => (
                    <tr key={m.id} className="border-b border-gray-800 last:border-0 hover:bg-gray-800/30 transition-colors">
                      <td className="px-4 py-3 text-gray-500 font-mono text-xs">{i + 1}</td>
                      <td className="px-4 py-3 font-medium text-gray-100">{m.name}</td>
                      {[1,2,3,4,5,6].map(day => {
                        const isEditing = editCell?.memberId === m.id && editCell?.day === day
                        const isSaving  = saving === `${m.id}-${day}`
                        const val       = m.dayScores[day] ?? 0

                        return (
                          <td key={day} className="px-3 py-3 text-right">
                            {isEditing ? (
                              <input
                                autoFocus
                                className="w-24 bg-gray-700 border border-yellow-400 rounded px-2 py-1 text-xs text-right text-gray-100 focus:outline-none"
                                value={editValue}
                                onChange={e => setEditValue(e.target.value)}
                                onBlur={commitEdit}
                                onKeyDown={handleKeyDown}
                                placeholder="0"
                              />
                            ) : (
                              <button
                                onClick={() => startEdit(m.id, day)}
                                className={`font-mono text-xs px-2 py-1 rounded transition-colors w-24 text-right ${
                                  val > 0
                                    ? 'text-gray-200 hover:bg-gray-700'
                                    : 'text-gray-600 hover:bg-gray-700 hover:text-gray-400'
                                } ${isSaving ? 'opacity-50' : ''}`}
                              >
                                {val > 0 ? formatScore(val) : '—'}
                              </button>
                            )}
                          </td>
                        )
                      })}
                      <td className="px-4 py-3 text-right font-mono font-bold text-yellow-400">
                        {m.total > 0 ? formatScore(m.total) : '—'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <p className="text-gray-600 text-xs mt-3 text-center">
            Click any score cell to edit · Enter to save · Escape to cancel
          </p>
        </>
      )}
    </div>
  )
}
