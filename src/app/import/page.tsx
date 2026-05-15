'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Member, DuelEvent, DUEL_DAYS } from '@/lib/types'

type ImportMode = 'roster' | 'duel'

type RosterRow  = { name: string; rank: number; power: number; action: 'add' | 'update' | 'skip'; memberId?: string }
type DuelRow    = { name: string; score: number; memberId?: string; matched: boolean }

function formatPower(p: number) {
  if (p >= 1_000_000_000) return (p / 1_000_000_000).toFixed(2) + 'B'
  if (p >= 1_000_000)     return (p / 1_000_000).toFixed(1) + 'M'
  if (p >= 1_000)         return (p / 1_000).toFixed(1) + 'K'
  return p.toLocaleString()
}

function getMondayOf(date: Date): string {
  const d = new Date(date)
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  return d.toISOString().split('T')[0]
}

export default function ImportPage() {
  const supabase = createClient()
  const fileRef  = useRef<HTMLInputElement>(null)

  const [mode, setMode]               = useState<ImportMode>('roster')
  const [selectedDay, setSelectedDay] = useState<number>(1)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [imageBase64, setImageBase64]   = useState<string | null>(null)
  const [mediaType, setMediaType]       = useState<string>('image/png')
  const [processing, setProcessing]     = useState(false)
  const [saving, setSaving]             = useState(false)
  const [error, setError]               = useState<string | null>(null)
  const [success, setSuccess]           = useState<string | null>(null)

  // Preview data
  const [rosterRows, setRosterRows] = useState<RosterRow[]>([])
  const [duelRows, setDuelRows]     = useState<DuelRow[]>([])
  const [members, setMembers]       = useState<Member[]>([])
  const [currentEvent, setCurrentEvent] = useState<DuelEvent | null>(null)

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('members')
        .select('*')
        .eq('active', true)
      setMembers(data || [])

      // Load or create current duel event
      const monday = getMondayOf(new Date())
      const { data: existing } = await supabase
        .from('duel_events')
        .select('*')
        .eq('week_start', monday)
        .single()
      if (existing) setCurrentEvent(existing)
    }
    load()
  }, [])

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setError(null)
    setSuccess(null)
    setRosterRows([])
    setDuelRows([])

    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      setImagePreview(result)
      const base64 = result.split(',')[1]
      setImageBase64(base64)
      setMediaType(file.type || 'image/png')
    }
    reader.readAsDataURL(file)
  }

  async function handleExtract() {
    if (!imageBase64) { setError('Please upload a screenshot first'); return }
    setProcessing(true)
    setError(null)
    setSuccess(null)
    setRosterRows([])
    setDuelRows([])

    try {
      if (mode === 'roster') {
        const res  = await fetch('/api/import/roster', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imageBase64, mediaType }),
        })
        const data = await res.json()
        if (data.error) throw new Error(data.error)

        // Match extracted names against existing roster
        const rows: RosterRow[] = data.members.map((m: any) => {
          const existing = members.find(
            em => em.name.toLowerCase() === m.name.toLowerCase()
          )
          return {
            name:     m.name,
            rank:     m.rank || 3,
            power:    m.power || 0,
            action:   existing ? 'update' : 'add',
            memberId: existing?.id,
          }
        })
        setRosterRows(rows)

      } else {
        const res  = await fetch('/api/import/duel', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imageBase64, mediaType, day: selectedDay }),
        })
        const data = await res.json()
        if (data.error) throw new Error(data.error)

        const rows: DuelRow[] = data.scores.map((s: any) => {
          const existing = members.find(
            m => m.name.toLowerCase() === s.name.toLowerCase()
          )
          return {
            name:      s.name,
            score:     s.score || 0,
            memberId:  existing?.id,
            matched:   !!existing,
          }
        })
        setDuelRows(rows)
      }
    } catch (err: any) {
      setError(err.message || 'Extraction failed')
    } finally {
      setProcessing(false)
    }
  }

  async function handleSaveRoster() {
    setSaving(true)
    setError(null)
    let saved = 0

    for (const row of rosterRows) {
      if (row.action === 'skip') continue
      const payload = { name: row.name, rank: row.rank, power: row.power }

      if (row.action === 'update' && row.memberId) {
        await supabase.from('members').update(payload).eq('id', row.memberId)
      } else {
        await supabase.from('members').insert({ ...payload, active: true })
      }
      saved++
    }

    // Refresh members list
    const { data } = await supabase.from('members').select('*').eq('active', true)
    setMembers(data || [])
    setRosterRows([])
    setImagePreview(null)
    setImageBase64(null)
    setSaving(false)
    setSuccess(`✅ ${saved} members saved to roster.`)
  }

  async function handleSaveDuel() {
    if (!currentEvent) { setError('No active duel event found. Visit the Duel page first.'); return }
    setSaving(true)
    setError(null)
    let saved = 0

    for (const row of duelRows) {
      if (!row.memberId) continue // skip unmatched
      await supabase.from('duel_scores').upsert(
        { event_id: currentEvent.id, member_id: row.memberId, day: selectedDay, score: row.score },
        { onConflict: 'event_id,member_id,day' }
      )
      saved++
    }

    setDuelRows([])
    setImagePreview(null)
    setImageBase64(null)
    setSaving(false)
    setSuccess(`✅ ${saved} scores saved for Day ${selectedDay} — ${DUEL_DAYS[selectedDay].name}.`)
  }

  function toggleRosterAction(i: number) {
    setRosterRows(prev => prev.map((r, idx) =>
      idx !== i ? r : {
        ...r,
        action: r.action === 'skip'
          ? (r.memberId ? 'update' : 'add')
          : 'skip'
      }
    ))
  }

  function toggleDuelRow(i: number) {
    setDuelRows(prev => prev.map((r, idx) =>
      idx !== i ? r : { ...r, memberId: r.memberId ? undefined : members.find(m => m.name.toLowerCase() === r.name.toLowerCase())?.id }
    ))
  }

  const hasPreview = rosterRows.length > 0 || duelRows.length > 0

  return (
    <div className="max-w-3xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-100">Screenshot Import</h1>
        <p className="text-gray-400 text-sm mt-0.5">Upload a Last War screenshot and Claude will extract the data automatically.</p>
      </div>

      {/* Mode toggle */}
      <div className="flex gap-2 mb-6">
        {(['roster', 'duel'] as ImportMode[]).map(m => (
          <button
            key={m}
            onClick={() => { setMode(m); setRosterRows([]); setDuelRows([]); setError(null); setSuccess(null) }}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              mode === m
                ? 'bg-yellow-400 text-gray-950'
                : 'bg-gray-800 text-gray-400 hover:text-gray-100 border border-gray-700'
            }`}
          >
            {m === 'roster' ? '👥 Roster' : '⚔️ Duel Scores'}
          </button>
        ))}
      </div>

      {/* Duel day selector */}
      {mode === 'duel' && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 mb-5">
          <p className="text-xs text-gray-400 mb-3 font-medium uppercase tracking-wide">Which day is this screenshot from?</p>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
            {Object.entries(DUEL_DAYS).map(([day, theme]) => (
              <button
                key={day}
                onClick={() => setSelectedDay(Number(day))}
                className={`rounded-lg px-2 py-2 text-center transition-colors ${
                  selectedDay === Number(day)
                    ? 'bg-yellow-400 text-gray-950'
                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                }`}
              >
                <p className="text-xs font-semibold">Day {day}</p>
                <p className="text-xs mt-0.5 opacity-80">{theme.short}</p>
              </button>
            ))}
          </div>
          {currentEvent && (
            <p className="text-xs text-gray-600 mt-3">
              Saving to current event — week of {new Date(currentEvent.week_start + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            </p>
          )}
        </div>
      )}

      {/* Upload area */}
      <div
        className="border-2 border-dashed border-gray-700 hover:border-yellow-400 rounded-xl p-8 text-center cursor-pointer transition-colors mb-4"
        onClick={() => fileRef.current?.click()}
      >
        {imagePreview ? (
          <img src={imagePreview} alt="Screenshot preview" className="max-h-64 mx-auto rounded-lg object-contain" />
        ) : (
          <div>
            <p className="text-4xl mb-3">📸</p>
            <p className="text-gray-300 font-medium">Click to upload screenshot</p>
            <p className="text-gray-600 text-sm mt-1">PNG, JPG, or WEBP</p>
          </div>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileChange}
        />
      </div>

      {imagePreview && !hasPreview && (
        <button
          onClick={handleExtract}
          disabled={processing}
          className="w-full bg-yellow-400 hover:bg-yellow-300 disabled:opacity-50 text-gray-950 font-bold py-3 rounded-xl text-sm transition-colors mb-4"
        >
          {processing ? '🔍 Extracting data…' : '🔍 Extract Data with Claude Vision'}
        </button>
      )}

      {error   && <p className="text-red-400 text-sm mb-4 bg-red-950/30 border border-red-800 rounded-lg px-4 py-3">{error}</p>}
      {success && <p className="text-green-400 text-sm mb-4 bg-green-950/30 border border-green-800 rounded-lg px-4 py-3">{success}</p>}

      {/* Roster preview */}
      {mode === 'roster' && rosterRows.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden mb-4">
          <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between">
            <p className="text-sm font-semibold text-gray-100">
              {rosterRows.length} members extracted — review before saving
            </p>
            <p className="text-xs text-gray-500">Click a row to skip it</p>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-gray-500 text-xs uppercase tracking-wide border-b border-gray-800">
                <th className="text-left px-4 py-2 font-medium">Name</th>
                <th className="text-left px-4 py-2 font-medium">Rank</th>
                <th className="text-right px-4 py-2 font-medium">Power</th>
                <th className="text-center px-4 py-2 font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {rosterRows.map((row, i) => (
                <tr
                  key={i}
                  onClick={() => toggleRosterAction(i)}
                  className={`border-b border-gray-800 last:border-0 cursor-pointer transition-colors ${
                    row.action === 'skip' ? 'opacity-40' : 'hover:bg-gray-800/50'
                  }`}
                >
                  <td className="px-4 py-2.5 font-medium text-gray-100">{row.name}</td>
                  <td className="px-4 py-2.5 text-gray-400">R{row.rank}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-yellow-400">{formatPower(row.power)}</td>
                  <td className="px-4 py-2.5 text-center">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded ${
                      row.action === 'add'    ? 'bg-green-900/50 text-green-400' :
                      row.action === 'update' ? 'bg-blue-900/50 text-blue-400'  :
                      'bg-gray-800 text-gray-600'
                    }`}>
                      {row.action}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="px-4 py-3 border-t border-gray-800 flex gap-3">
            <button
              onClick={handleSaveRoster}
              disabled={saving}
              className="bg-yellow-400 hover:bg-yellow-300 disabled:opacity-50 text-gray-950 font-bold px-5 py-2 rounded-lg text-sm transition-colors"
            >
              {saving ? 'Saving…' : `Save ${rosterRows.filter(r => r.action !== 'skip').length} Members`}
            </button>
            <button
              onClick={() => { setRosterRows([]); setImagePreview(null); setImageBase64(null) }}
              className="text-gray-400 hover:text-gray-200 px-4 py-2 rounded-lg text-sm border border-gray-700 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Duel preview */}
      {mode === 'duel' && duelRows.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden mb-4">
          <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between">
            <p className="text-sm font-semibold text-gray-100">
              {duelRows.length} scores extracted — Day {selectedDay}: {DUEL_DAYS[selectedDay].name}
            </p>
            <p className="text-xs text-gray-500">Unmatched names won't be saved</p>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-gray-500 text-xs uppercase tracking-wide border-b border-gray-800">
                <th className="text-left px-4 py-2 font-medium">Name</th>
                <th className="text-right px-4 py-2 font-medium">Score</th>
                <th className="text-center px-4 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {duelRows.map((row, i) => (
                <tr key={i} className="border-b border-gray-800 last:border-0 hover:bg-gray-800/30">
                  <td className="px-4 py-2.5 font-medium text-gray-100">{row.name}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-yellow-400">{formatPower(row.score)}</td>
                  <td className="px-4 py-2.5 text-center">
                    {row.matched || row.memberId ? (
                      <span className="text-xs font-semibold px-2 py-0.5 rounded bg-green-900/50 text-green-400">matched</span>
                    ) : (
                      <span className="text-xs font-semibold px-2 py-0.5 rounded bg-red-900/50 text-red-400">no match</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="px-4 py-3 border-t border-gray-800 flex gap-3">
            <button
              onClick={handleSaveDuel}
              disabled={saving}
              className="bg-yellow-400 hover:bg-yellow-300 disabled:opacity-50 text-gray-950 font-bold px-5 py-2 rounded-lg text-sm transition-colors"
            >
              {saving ? 'Saving…' : `Save ${duelRows.filter(r => r.matched || r.memberId).length} Scores`}
            </button>
            <button
              onClick={() => { setDuelRows([]); setImagePreview(null); setImageBase64(null) }}
              className="text-gray-400 hover:text-gray-200 px-4 py-2 rounded-lg text-sm border border-gray-700 transition-colors"
            >
              Cancel
            </button>
          </div>
          {duelRows.some(r => !r.matched && !r.memberId) && (
            <p className="px-4 pb-3 text-xs text-orange-400">
              ⚠️ Some names didn't match your roster. Add them to the roster first, then re-import.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
