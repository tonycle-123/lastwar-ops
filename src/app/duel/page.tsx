'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Member, DuelEvent, DuelScore, DUEL_DAYS } from '@/lib/types'

function formatScore(n: number) {
  if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(2) + 'B'
  if (n >= 1_000_000)     return (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000)         return (n / 1_000).toFixed(1) + 'K'
  return n.toLocaleString()
}

function fmt(dateStr: string) {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit' })
}

function fmtFull(dateStr: string) {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function eventLabel(ev: { week_start: string; week_end?: string | null; label?: string | null }) {
  if (ev.label) return ev.label
  const start = fmt(ev.week_start)
  const end   = ev.week_end ? fmt(ev.week_end) : '—'
  return `${start} – ${end}`
}

// Given any date, return the Sunday that started the duel event that week.
// The event starts Sunday at 10pm ET. If it's Sunday before 10pm ET, 
// go back to the previous Sunday.
function getEventSunday(date: Date): string {
  const etStr = date.toLocaleString('en-US', { timeZone: 'America/New_York' })
  const et    = new Date(etStr)
  const day   = et.getDay()   // 0 = Sunday
  const hour  = et.getHours()

  const d = new Date(date)
  if (day === 0 && hour < 22) {
    d.setDate(d.getDate() - 7) // Before 10pm Sunday — still last week's event
  } else {
    d.setDate(d.getDate() - day) // Go back to Sunday of this week
  }
  const y  = d.getFullYear()
  const m  = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00')
  d.setDate(d.getDate() + days)
  return d.toISOString().split('T')[0]
}

type ScoreMap = Record<string, Record<number, number>>

const DAY_ICONS: Record<number, string> = {
  1: 'ti-radar', 2: 'ti-building', 3: 'ti-flask',
  4: 'ti-sword',  5: 'ti-rocket',  6: 'ti-skull',
}
const DAY_COLORS: Record<number, string> = {
  1: '#3a7ae8', 2: '#3ab870', 3: '#9a5ae8',
  4: '#e87a3a', 5: '#e8c83a', 6: '#e84a4a',
}

// What calendar date does Day N fall on for a given event?
function dayDate(weekStart: string, day: number): string {
  return addDays(weekStart, day - 1)
}

export default function DuelPage() {
  const supabase = createClient()

  const [events, setEvents]           = useState<DuelEvent[]>([])
  const [selectedEvent, setSelected]  = useState<DuelEvent | null>(null)
  const [members, setMembers]         = useState<Member[]>([])
  const [scores, setScores]           = useState<ScoreMap>({})
  const [loading, setLoading]         = useState(true)
  const [saving, setSaving]           = useState<string | null>(null)
  const [editCell, setEditCell]       = useState<{ memberId: string; day: number } | null>(null)
  const [editValue, setEditValue]     = useState('')
  const [error, setError]             = useState<string | null>(null)
  const [search, setSearch]           = useState('')
  const [showNewEvent, setShowNewEvent] = useState(false)
  const [newEventDate, setNewEventDate] = useState('')

  async function fetchEvents() {
    const { data } = await supabase
      .from('duel_events').select('*').order('week_start', { ascending: false })
    return (data || []) as DuelEvent[]
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

  async function ensureCurrentEvent(): Promise<DuelEvent> {
    const sunday   = getEventSunday(new Date())
    const saturday = addDays(sunday, 6)

    // Check if event already exists
    const { data: existing } = await supabase
      .from('duel_events').select('*').eq('week_start', sunday).single()
    if (existing) return existing as DuelEvent

    // Create it with start + end dates
    const { data: created, error } = await supabase
      .from('duel_events')
      .upsert({ week_start: sunday, week_end: saturday }, { onConflict: 'week_start' })
      .select().single()
    if (error) throw new Error(error.message)
    return created as DuelEvent
  }

  async function handleCreateEvent() {
    if (!newEventDate) return
    // Find the Sunday of the selected date's week
    const d   = new Date(newEventDate + 'T12:00:00')
    const day = d.getDay()
    d.setDate(d.getDate() - day) // back to Sunday
    const sunday   = d.toISOString().split('T')[0]
    const saturday = addDays(sunday, 6)

    const { data, error } = await supabase
      .from('duel_events')
      .upsert({ week_start: sunday, week_end: saturday }, { onConflict: 'week_start' })
      .select().single()
    if (error) { setError(error.message); return }

    const updated = await fetchEvents()
    setEvents(updated)
    await loadEvent(data as DuelEvent)
    setShowNewEvent(false)
    setNewEventDate('')
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
    if (!error) setScores(prev => ({ ...prev, [memberId]: { ...(prev[memberId] || {}), [day]: score } }))
    else setError(error.message)
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
  const topScore = filtered[0]?.total || 0

  const currentSunday   = getEventSunday(new Date())
  const isCurrentWeek   = selectedEvent?.week_start === currentSunday

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 16 }}>
        <div>
          <div className="section-title" style={{ marginBottom: 4 }}>
            <i className="ti ti-trophy" aria-hidden="true" /> Alliance Duel
          </div>
          <div style={{ fontSize: 12, color: '#8090b8' }}>
            <span style={{ color: isCurrentWeek ? '#0a6030' : '#8090b8', fontWeight: 600 }}>
              {isCurrentWeek ? '● Current event' : '○ Past event'}
            </span>
            {selectedEvent && (
              <span style={{ marginLeft: 6 }}>
                — {fmt(selectedEvent.week_start)} – {selectedEvent.week_end ? fmt(selectedEvent.week_end) : fmt(addDays(selectedEvent.week_start, 6))}
              </span>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <select
            className="lw-select"
            style={{ width: 'auto', minWidth: 180 }}
            value={selectedEvent?.id || ''}
            onChange={e => handleEventChange(e.target.value)}
          >
            {events.map(ev => (
              <option key={ev.id} value={ev.id}>
                {eventLabel(ev)}{ev.week_start === currentSunday ? ' (current)' : ''}
              </option>
            ))}
          </select>
          <button className="btn-primary btn-sm" onClick={() => setShowNewEvent(v => !v)}>
            <i className="ti ti-plus" aria-hidden="true" style={{ fontSize: 12 }} /> New Event
          </button>
        </div>
      </div>

      {/* New event form */}
      {showNewEvent && (
        <div className="lw-form-panel" style={{ marginBottom: 16, display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div>
            <label className="lw-form-label">Pick any date within the event week</label>
            <input type="date" className="lw-input" style={{ width: 180 }} value={newEventDate} onChange={e => setNewEventDate(e.target.value)} />
          </div>
          <button className="btn-primary btn-sm" onClick={handleCreateEvent} disabled={!newEventDate}>
            <i className="ti ti-check" aria-hidden="true" /> Create Event
          </button>
          <button className="btn-primary btn-sm" onClick={() => setShowNewEvent(false)} style={{ background: 'transparent', color: '#4a5a7a', borderColor: '#c0cce0' }}>Cancel</button>
          <p style={{ fontSize: 11, color: '#8090b8', width: '100%', margin: 0 }}>
            The app will automatically set the event to Sun–Sat of the week you pick.
          </p>
        </div>
      )}

      {error && <div className="lw-error" style={{ marginBottom: 14 }}>{error}</div>}

      {loading ? (
        <div style={{ textAlign: 'center', color: '#8090b8', padding: '48px 0', fontSize: 13 }}>Loading scores…</div>
      ) : (
        <>
          {/* Day theme cards — show the actual calendar date for each day */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 8, marginBottom: 16 }}>
            {Object.entries(DUEL_DAYS).map(([day, theme]) => {
              const date = selectedEvent ? dayDate(selectedEvent.week_start, Number(day)) : ''
              return (
                <div key={day} style={{ background: '#fff', border: '1.5px solid #e0e8f4', borderRadius: 10, padding: '10px 6px', textAlign: 'center' }}>
                  <i className={`ti ${DAY_ICONS[Number(day)]}`} aria-hidden="true" style={{ fontSize: 16, color: DAY_COLORS[Number(day)], display: 'block', marginBottom: 4 }} />
                  <div style={{ fontSize: 10, fontWeight: 800, color: '#4a5a7a', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Day {day}</div>
                  <div style={{ fontSize: 10, color: '#8090b8', marginTop: 1 }}>{theme.short}</div>
                  {date && <div style={{ fontSize: 9, color: '#a0b0cc', marginTop: 2, fontWeight: 600 }}>{fmt(date)}</div>}
                </div>
              )
            })}
          </div>

          {/* Search */}
          <div className="lw-search" style={{ marginBottom: 12 }}>
            <i className="ti ti-search" aria-hidden="true" style={{ color: '#8090b8', fontSize: 14 }} />
            <input placeholder="Search member…" value={search} onChange={e => setSearch(e.target.value)} />
            {search && <button onClick={() => setSearch('')} style={{ background: 'none', border: 'none', color: '#a0b0cc', cursor: 'pointer', fontSize: 13 }}>✕</button>}
          </div>

          {/* Score table */}
          <div className="lw-card" style={{ overflowX: 'auto' }}>
            <table className="lw-table" style={{ minWidth: 720 }}>
              <thead>
                <tr>
                  <th style={{ width: 36 }}>#</th>
                  <th>Member</th>
                  {Object.entries(DUEL_DAYS).map(([day, theme]) => {
                    const date = selectedEvent ? dayDate(selectedEvent.week_start, Number(day)) : ''
                    return (
                      <th key={day} style={{ textAlign: 'right' }}>
                        <span style={{ display: 'block' }}>D{day}</span>
                        <span style={{ display: 'block', color: '#c0cce0', fontSize: 9, textTransform: 'none', fontWeight: 400 }}>{date ? fmt(date) : theme.short}</span>
                      </th>
                    )
                  })}
                  <th style={{ textAlign: 'right', color: '#1a4ab0' }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={9} style={{ textAlign: 'center', color: '#8090b8', padding: '40px 0' }}>{search ? `No members matching "${search}"` : 'No members yet.'}</td></tr>
                ) : filtered.map((m, i) => {
                  const pct = topScore > 0 ? (m.total / topScore) : 0
                  return (
                    <tr key={m.id}>
                      <td style={{ color: '#a0b0cc', fontSize: 12, fontWeight: 800 }}>{i + 1}</td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontWeight: 800, color: '#1a2a4a' }}>{m.name}</span>
                          {m.total > 0 && (
                            <div style={{ height: 4, width: 52, background: '#e8edf5', borderRadius: 2, overflow: 'hidden' }}>
                              <div style={{ height: '100%', width: `${pct * 100}%`, background: '#3a7ae8', borderRadius: 2 }} />
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
                              <input autoFocus
                                style={{ width: 80, background: '#fff', border: '1.5px solid #3a7ae8', borderRadius: 6, padding: '4px 7px', fontSize: 12, color: '#1a2a4a', textAlign: 'right', outline: 'none', fontFamily: 'monospace' }}
                                value={editValue} onChange={e => setEditValue(e.target.value)}
                                onBlur={commitEdit} onKeyDown={handleKeyDown} placeholder="0" />
                            ) : (
                              <button onClick={() => startEdit(m.id, day)}
                                style={{ fontFamily: 'monospace', fontSize: 12, padding: '4px 7px', borderRadius: 6, border: '1.5px solid transparent', background: 'transparent', cursor: 'pointer', width: 80, textAlign: 'right', transition: 'all 0.1s', color: val > 0 ? '#1a2a4a' : '#c0cce0', fontWeight: val > 0 ? 700 : 400, opacity: isSaving ? 0.5 : 1 }}
                                onMouseEnter={e => { (e.target as HTMLButtonElement).style.borderColor = '#d0d8ec'; (e.target as HTMLButtonElement).style.background = '#f4f7fd' }}
                                onMouseLeave={e => { (e.target as HTMLButtonElement).style.borderColor = 'transparent'; (e.target as HTMLButtonElement).style.background = 'transparent' }}>
                                {val > 0 ? formatScore(val) : '—'}
                              </button>
                            )}
                          </td>
                        )
                      })}
                      <td style={{ textAlign: 'right', fontFamily: 'monospace', fontWeight: 800, color: m.total > 0 ? '#1a4ab0' : '#c0cce0', fontSize: 13 }}>
                        {m.total > 0 ? formatScore(m.total) : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <p style={{ textAlign: 'center', color: '#a0b0cc', fontSize: 11, marginTop: 10 }}>
            Click any score cell to edit · Enter to save · Escape to cancel
          </p>
        </>
      )}
    </div>
  )
}
