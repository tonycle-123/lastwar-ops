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

const DAY_ICONS: Record<number, string> = {
  1: 'ti-radar',
  2: 'ti-building',
  3: 'ti-flask',
  4: 'ti-sword',
  5: 'ti-rocket',
  6: 'ti-skull',
}

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
      .from('duel_events').select('*').eq('week_start', monday).single()
    if (existing) return existing
    const { data: created, error } = await supabase
      .from('duel_events')
      .upsert({ week_start: monday }, { onConflict: 'week_start' })
      .select().single()
    if (error) throw new Error(error.message)
    return created
  }

  async function fetchEvents() {
    const { data } = await supabase.from('duel_events').select('*').order('week_start', { ascending: false })
    return data || []
  }

  async function fetchMembers() {
    const { data } = await supabase.from('members').select('*').eq('active', true)
    return data || []
  }

  async function fetchScores(eventId: string): Promise<ScoreMap> {
    const { data } = await supabase.from('duel_scores').select('*').eq('event_id', eventId)
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
    setMembers(m); setScores(s)
  }, [])

  useEffect(() => {
    async function init() {
      try {
        const [current, allEvents] = await Promise.all([ensureCurrentEvent(), fetchEvents()])
        setEvents(allEvents.length ? allEvents : [current])
        await loadEvent(current)
      } catch (e: any) { setError(e.message) }
      finally { setLoading(false) }
    }
    init()
  }, [])

  async function handleEventChange(eventId: string) {
    const event = events.find(e => e.id === eventId)
    if (!event) return
    setLoading(true); await loadEvent(event); setLoading(false)
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
    const { error } = await supabase.from('duel_scores').upsert(
      { event_id: selectedEvent.id, member_id: memberId, day, score },
      { onConflict: 'event_id,member_id,day' }
    )
    if (!error) {
      setScores(prev => ({ ...prev, [memberId]: { ...(prev[memberId] || {}), [day]: score } }))
    } else { setError(error.message) }
    setEditCell(null); setEditValue(''); setSaving(null)
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') commitEdit()
    if (e.key === 'Escape') { setEditCell(null); setEditValue('') }
  }

  const ranked = members
    .map(m => {
      const dayScores = scores[m.id] || {}
      const total = Object.values(dayScores).reduce((a, b) => a + b, 0)
      return { ...m, dayScores, total }
    })
    .sort((a, b) => b.total - a.total)

  const filtered = ranked.filter(m => m.name.toLowerCase().includes(search.toLowerCase()))
  const isCurrentWeek = selectedEvent?.week_start === getMondayOf(new Date())
  const topScore = filtered[0]?.total || 0

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 20 }}>
        <div>
          <div className="section-title" style={{ marginBottom: 4 }}>
            <i className="ti ti-trophy" aria-hidden="true" />
            Alliance Duel
          </div>
          <div style={{ fontSize: 12, color: '#2a4a7a', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ color: isCurrentWeek ? '#4a8a4a' : '#4a7ab5' }}>
              {isCurrentWeek ? '● Current week' : '○ Past event'}
            </span>
            {selectedEvent && <span>— week of {formatDateLabel(selectedEvent.week_start)}</span>}
          </div>
        </div>
        <select
          className="lw-select"
          style={{ width: 'auto', minWidth: 200 }}
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

      {error && <div className="lw-error" style={{ marginBottom: 14 }}>{error}</div>}

      {loading ? (
        <div style={{ textAlign: 'center', color: '#2a4a7a', padding: '48px 0', fontSize: 13 }}>Loading scores…</div>
      ) : (
        <>
          {/* Day theme cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 8, marginBottom: 16 }}>
            {Object.entries(DUEL_DAYS).map(([day, theme]) => (
              <div key={day} style={{ background: '#0a1220', border: '1px solid #1e3a6e', borderRadius: 8, padding: '8px 6px', textAlign: 'center' }}>
                <i className={`ti ${DAY_ICONS[Number(day)]}`} aria-hidden="true" style={{ fontSize: 16, color: '#2a5090', display: 'block', marginBottom: 4 }} />
                <div style={{ fontSize: 10, color: '#2a4a7a', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Day {day}</div>
                <div style={{ fontSize: 10, color: '#4a7ab5', marginTop: 2 }}>{theme.short}</div>
              </div>
            ))}
          </div>

          {/* Search */}
          <div className="lw-search" style={{ marginBottom: 12 }}>
            <i className="ti ti-search" aria-hidden="true" style={{ color: '#2a4a7a', fontSize: 14 }} />
            <input placeholder="Search member…" value={search} onChange={e => setSearch(e.target.value)} />
            {search && <button onClick={() => setSearch('')} style={{ background: 'none', border: 'none', color: '#2a4a7a', cursor: 'pointer', fontSize: 12 }}>✕</button>}
          </div>

          {/* Score table */}
          <div className="lw-card" style={{ overflowX: 'auto' }}>
            <table className="lw-table" style={{ minWidth: 720 }}>
              <thead>
                <tr>
                  <th style={{ width: 32 }}>#</th>
                  <th>Member</th>
                  {Object.entries(DUEL_DAYS).map(([day, theme]) => (
                    <th key={day} style={{ textAlign: 'right' }}>
                      <span style={{ display: 'block', color: '#2a4a7a' }}>D{day}</span>
                      <span style={{ display: 'block', color: '#1a3060', fontSize: 9, textTransform: 'none', fontWeight: 400 }}>{theme.short}</span>
                    </th>
                  ))}
                  <th style={{ textAlign: 'right', color: '#2a5090' }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={9} style={{ textAlign: 'center', color: '#2a4a7a', padding: '40px 0' }}>{search ? `No members matching "${search}"` : 'No members yet.'}</td></tr>
                ) : filtered.map((m, i) => {
                  const pct = topScore > 0 ? (m.total / topScore) : 0
                  return (
                    <tr key={m.id}>
                      <td style={{ color: '#1a3060', fontSize: 11 }}>
                        {i === 0 && m.total > 0 ? '🥇' : i === 1 && m.total > 0 ? '🥈' : i === 2 && m.total > 0 ? '🥉' : i + 1}
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontWeight: 500, color: '#f5f0e0' }}>{m.name}</span>
                          {m.total > 0 && (
                            <div style={{ height: 3, width: 48, background: '#0e1e40', borderRadius: 2, overflow: 'hidden' }}>
                              <div style={{ height: '100%', width: `${pct * 100}%`, background: 'linear-gradient(90deg, #2a5090, #f5a623)', borderRadius: 2 }} />
                            </div>
                          )}
                        </div>
                      </td>
                      {[1,2,3,4,5,6].map(day => {
                        const isEditing = editCell?.memberId === m.id && editCell?.day === day
                        const isSaving  = saving === `${m.id}-${day}`
                        const val       = m.dayScores[day] ?? 0
                        return (
                          <td key={day} style={{ textAlign: 'right' }}>
                            {isEditing ? (
                              <input
                                autoFocus
                                style={{ width: 80, background: '#0e1e40', border: '1px solid #2a5090', borderRadius: 5, padding: '3px 6px', fontSize: 12, color: '#f5a623', textAlign: 'right', outline: 'none', fontFamily: 'monospace' }}
                                value={editValue}
                                onChange={e => setEditValue(e.target.value)}
                                onBlur={commitEdit}
                                onKeyDown={handleKeyDown}
                                placeholder="0"
                              />
                            ) : (
                              <button
                                onClick={() => startEdit(m.id, day)}
                                style={{ fontFamily: 'monospace', fontSize: 12, padding: '3px 6px', borderRadius: 5, border: '1px solid transparent', background: 'transparent', cursor: 'pointer', width: 80, textAlign: 'right', transition: 'all 0.1s', color: val > 0 ? '#7ab4f5' : '#1a3060', opacity: isSaving ? 0.5 : 1 }}
                                onMouseEnter={e => { (e.target as HTMLButtonElement).style.borderColor = '#1e3a6e'; (e.target as HTMLButtonElement).style.background = '#091428' }}
                                onMouseLeave={e => { (e.target as HTMLButtonElement).style.borderColor = 'transparent'; (e.target as HTMLButtonElement).style.background = 'transparent' }}
                              >
                                {val > 0 ? formatScore(val) : '—'}
                              </button>
                            )}
                          </td>
                        )
                      })}
                      <td style={{ textAlign: 'right', fontFamily: 'monospace', fontWeight: 700, color: m.total > 0 ? '#f5a623' : '#1a3060' }}>
                        {m.total > 0 ? formatScore(m.total) : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <p style={{ textAlign: 'center', color: '#1a3060', fontSize: 11, marginTop: 10 }}>
            Click any score cell to edit · Enter to save · Escape to cancel
          </p>
        </>
      )}
    </div>
  )
}
