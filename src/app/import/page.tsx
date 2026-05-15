'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Member, DuelEvent, DUEL_DAYS } from '@/lib/types'

type PageMode   = 'vision' | 'train_history'
type ImportMode = 'roster' | 'duel'
type UploadMode = 'screenshot' | 'video'
type RosterRow  = { name: string; rank: number; power: number; action: 'add' | 'update' | 'skip'; memberId?: string }
type DuelRow    = { name: string; score: number; memberId?: string; matched: boolean }
type TrainRow   = { date: string; conductor: string; vip: string; valid: boolean; error?: string }

function formatPower(p: number) {
  if (p >= 1_000_000_000) return (p / 1_000_000_000).toFixed(2) + 'B'
  if (p >= 1_000_000)     return (p / 1_000_000).toFixed(1) + 'M'
  if (p >= 1_000)         return (p / 1_000).toFixed(1) + 'K'
  return p.toLocaleString()
}

function getMondayOf(date: Date): string {
  const d = new Date(date); const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day; d.setDate(d.getDate() + diff)
  return d.toISOString().split('T')[0]
}

async function extractFrames(file: File, intervalSeconds = 1.5, onProgress?: (current: number, total: number) => void): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video'); const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')!; const frames: string[] = []; const url = URL.createObjectURL(file)
    video.src = url; video.muted = true; video.playsInline = true
    video.onloadedmetadata = () => {
      canvas.width = video.videoWidth; canvas.height = video.videoHeight
      const duration = video.duration; const totalFrames = Math.floor(duration / intervalSeconds); let currentFrame = 0
      function captureFrame(time: number) { video.currentTime = time }
      video.onseeked = () => {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
        frames.push(canvas.toDataURL('image/jpeg', 0.85).split(',')[1]); currentFrame++
        onProgress?.(currentFrame, totalFrames)
        const nextTime = currentFrame * intervalSeconds
        if (nextTime < duration) { captureFrame(nextTime) } else { URL.revokeObjectURL(url); resolve(frames) }
      }
      video.onerror = () => reject(new Error('Failed to load video')); captureFrame(0)
    }
    video.onerror = () => reject(new Error('Failed to load video — try MP4')); video.load()
  })
}

export default function ImportPage() {
  const supabase = useRef(createClient()).current
  const fileRef  = useRef<HTMLInputElement>(null)
  const videoRef = useRef<HTMLInputElement>(null)

  const [pageMode, setPageMode]         = useState<PageMode>('vision')
  const [importMode, setImportMode]     = useState<ImportMode>('roster')
  const [uploadMode, setUploadMode]     = useState<UploadMode>('screenshot')
  const [selectedDay, setSelectedDay]   = useState<number>(1)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [imageBase64, setImageBase64]   = useState<string | null>(null)
  const [mediaType, setMediaType]       = useState<string>('image/png')
  const [videoFile, setVideoFile]       = useState<File | null>(null)
  const [videoName, setVideoName]       = useState<string>('')
  const [processing, setProcessing]     = useState(false)
  const [saving, setSaving]             = useState(false)
  const [error, setError]               = useState<string | null>(null)
  const [success, setSuccess]           = useState<string | null>(null)
  const [progress, setProgress]         = useState<string | null>(null)
  const [rosterRows, setRosterRows]     = useState<RosterRow[]>([])
  const [duelRows, setDuelRows]         = useState<DuelRow[]>([])
  const [members, setMembers]           = useState<Member[]>([])
  const [currentEvent, setCurrentEvent] = useState<DuelEvent | null>(null)
  const [pasteText, setPasteText]       = useState('')
  const [trainRows, setTrainRows]       = useState<TrainRow[]>([])
  const [trainSaving, setTrainSaving]   = useState(false)

  useEffect(() => {
    async function load() {
      const { data } = await supabase.from('members').select('*').eq('active', true); setMembers(data || [])
      const monday = getMondayOf(new Date())
      const { data: existing } = await supabase.from('duel_events').select('*').eq('week_start', monday).single()
      if (existing) setCurrentEvent(existing)
    }
    load()
  }, [])

  function reset() {
    setRosterRows([]); setDuelRows([]); setImagePreview(null); setImageBase64(null)
    setVideoFile(null); setVideoName(''); setError(null); setSuccess(null); setProgress(null)
    if (fileRef.current) fileRef.current.value = ''
    if (videoRef.current) videoRef.current.value = ''
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return; reset()
    const reader = new FileReader()
    reader.onload = () => { const result = reader.result as string; setImagePreview(result); setImageBase64(result.split(',')[1]); setMediaType(file.type || 'image/png') }
    reader.readAsDataURL(file)
  }

  function handleVideoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return; reset(); setVideoFile(file); setVideoName(file.name)
  }

  async function processFrame(base64: string, mType: string): Promise<any[]> {
    const endpoint = importMode === 'roster' ? '/api/import/roster' : '/api/import/duel'
    const body = importMode === 'roster' ? { imageBase64: base64, mediaType: mType } : { imageBase64: base64, mediaType: mType, day: selectedDay }
    const res = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const data = await res.json(); if (data.error) throw new Error(data.error)
    return importMode === 'roster' ? data.members : data.scores
  }

  function mergeRosterResults(allResults: any[][]): any[] {
    const map = new Map<string, any>()
    for (const frame of allResults) for (const m of frame) { const key = m.name.toLowerCase().trim(); if (!map.has(key) || (m.power > 0 && map.get(key).power === 0)) map.set(key, m) }
    return Array.from(map.values())
  }

  function mergeDuelResults(allResults: any[][]): any[] {
    const map = new Map<string, any>()
    for (const frame of allResults) for (const s of frame) { const key = s.name.toLowerCase().trim(); if (!map.has(key) || s.score > map.get(key).score) map.set(key, s) }
    return Array.from(map.values())
  }

  function buildRosterRows(extracted: any[]): RosterRow[] {
    return extracted.map((m: any) => { const existing = members.find(em => em.name.toLowerCase() === m.name.toLowerCase()); return { name: m.name, rank: m.rank || 3, power: m.power || 0, action: existing ? 'update' : 'add', memberId: existing?.id } })
  }

  function buildDuelRows(extracted: any[]): DuelRow[] {
    return extracted.map((s: any) => { const existing = members.find(m => m.name.toLowerCase() === s.name.toLowerCase()); return { name: s.name, score: s.score || 0, memberId: existing?.id, matched: !!existing } })
  }

  async function handleExtractScreenshot() {
    if (!imageBase64) { setError('Please upload a screenshot first'); return }
    setProcessing(true); setError(null); setSuccess(null)
    try { const results = await processFrame(imageBase64, mediaType); if (importMode === 'roster') setRosterRows(buildRosterRows(results)); else setDuelRows(buildDuelRows(results)) }
    catch (err: any) { setError(err.message) } finally { setProcessing(false) }
  }

  async function handleExtractVideo() {
    if (!videoFile) { setError('Please upload a video first'); return }
    setProcessing(true); setError(null); setSuccess(null); setProgress('Extracting frames…')
    try {
      let frames: string[] = []
      try { frames = await extractFrames(videoFile, 1.5, (c, t) => setProgress(`Extracting frames… ${c} / ${t}`)) }
      catch (fe: any) { throw new Error(`Could not extract frames: ${fe.message}`) }
      if (frames.length === 0) throw new Error('No frames extracted. Try re-recording or use a screenshot.')
      setProgress(`Extracted ${frames.length} frames — analyzing…`)
      const allResults: any[][] = []; let failedFrames = 0
      for (let i = 0; i < frames.length; i++) {
        setProgress(`Analyzing frame ${i + 1} of ${frames.length} — ${allResults.length} results so far…`)
        try { const result = await processFrame(frames[i], 'image/jpeg'); if (result.length > 0) allResults.push(result) }
        catch (fe: any) { failedFrames++; if (failedFrames > 3 && allResults.length === 0) throw new Error(`Claude Vision failed: ${fe.message}`) }
      }
      if (allResults.length === 0) throw new Error('No data found. Make sure video shows member names clearly.')
      const merged = importMode === 'roster' ? mergeRosterResults(allResults) : mergeDuelResults(allResults)
      if (merged.length === 0) throw new Error('No members found after merging.')
      if (importMode === 'roster') setRosterRows(buildRosterRows(merged)); else setDuelRows(buildDuelRows(merged))
      setProgress(null)
    } catch (err: any) { setError(err.message); setProgress(null) } finally { setProcessing(false) }
  }

  async function handleSaveRoster() {
    setSaving(true); setError(null); let saved = 0
    for (const row of rosterRows) {
      if (row.action === 'skip') continue
      const payload = { name: row.name, rank: row.rank, power: row.power }
      if (row.action === 'update' && row.memberId) await supabase.from('members').update(payload).eq('id', row.memberId)
      else await supabase.from('members').insert({ ...payload, active: true })
      saved++
    }
    const { data } = await supabase.from('members').select('*').eq('active', true); setMembers(data || [])
    reset(); setSaving(false); setSuccess(`✅ ${saved} members saved to roster.`)
  }

  async function handleSaveDuel() {
    if (!currentEvent) { setError('No active duel event. Visit the Duel page first.'); return }
    setSaving(true); setError(null); let saved = 0
    for (const row of duelRows) {
      if (!row.memberId) continue
      await supabase.from('duel_scores').upsert({ event_id: currentEvent.id, member_id: row.memberId, day: selectedDay, score: row.score }, { onConflict: 'event_id,member_id,day' }); saved++
    }
    reset(); setSaving(false); setSuccess(`✅ ${saved} scores saved for Day ${selectedDay} — ${DUEL_DAYS[selectedDay].name}.`)
  }

  function parsePaste(text: string): TrainRow[] {
    return text.trim().split('\n').filter(l => l.trim()).map(line => {
      const cols = line.split('\t').map(c => c.trim()); const dateRaw = cols[0] || '', conductor = cols[1] || '', vip = cols[2] || ''
      let dateStr = '', valid = true, error = ''
      if (!dateRaw) { valid = false; error = 'Missing date' }
      else { const d = new Date(dateRaw); if (isNaN(d.getTime())) { valid = false; error = 'Invalid date: ' + dateRaw } else dateStr = d.toISOString().split('T')[0] }
      if (!conductor) { valid = false; error = error || 'Missing conductor' }
      return { date: dateStr, conductor, vip, valid, error }
    })
  }

  function handleParsePaste() { if (!pasteText.trim()) { setError('Please paste data first'); return }; setError(null); setTrainRows(parsePaste(pasteText)) }

  async function handleSaveTrainHistory() {
    const validRows = trainRows.filter(r => r.valid); if (validRows.length === 0) { setError('No valid rows'); return }
    setTrainSaving(true); setError(null); let saved = 0, skipped = 0
    for (const row of validRows) {
      const { error } = await supabase.from('train_log').upsert({ log_date: row.date, conductor_name: row.conductor, vip_name: row.vip || null, conductor_id: null, vip_id: null }, { onConflict: 'log_date' })
      if (error) skipped++; else saved++
    }
    setTrainSaving(false); setTrainRows([]); setPasteText('')
    setSuccess(`✅ ${saved} entries imported!${skipped > 0 ? ` ${skipped} skipped.` : ''}`)
  }

  function toggleRosterAction(i: number) {
    setRosterRows(prev => prev.map((r, idx) => idx !== i ? r : { ...r, action: r.action === 'skip' ? (r.memberId ? 'update' : 'add') : 'skip' }))
  }

  const hasPreview = rosterRows.length > 0 || duelRows.length > 0

  const tabStyle = (active: boolean) => ({
    background: active ? '#1e3060' : 'transparent',
    border: `1.5px solid ${active ? '#2e4a80' : '#d0d8ec'}`,
    color: active ? '#ffffff' : '#4a5a7a',
    borderRadius: 8, fontSize: 12, fontWeight: 700, padding: '7px 14px',
    cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5,
  } as React.CSSProperties)

  return (
    <div style={{ maxWidth: 780 }}>
      <div style={{ marginBottom: 20 }}>
        <div className="section-title" style={{ marginBottom: 4 }}><i className="ti ti-upload" aria-hidden="true" /> Import Data</div>
        <div style={{ fontSize: 12, color: '#8090b8' }}>Import from screenshots, video recordings, or paste from Google Sheets.</div>
      </div>

      {/* Page mode tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        <button style={tabStyle(pageMode === 'vision')} onClick={() => { setPageMode('vision'); reset(); setError(null); setSuccess(null) }}>
          <i className="ti ti-camera" aria-hidden="true" style={{ fontSize: 13 }} /> Screenshot / Video
        </button>
        <button style={tabStyle(pageMode === 'train_history')} onClick={() => { setPageMode('train_history'); reset(); setError(null); setSuccess(null) }}>
          <i className="ti ti-train" aria-hidden="true" style={{ fontSize: 13 }} /> Train History
        </button>
      </div>

      {/* Train history paste */}
      {pageMode === 'train_history' && (
        <div>
          <div className="lw-form-panel" style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: '#1a2a4a', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Paste from Google Sheets</div>
            <div style={{ fontSize: 12, color: '#8090b8', marginBottom: 12 }}>Select your data (Date · Conductor · VIP columns), copy, and paste below. No header row needed.</div>
            <textarea className="lw-input" rows={8} style={{ fontFamily: 'monospace', fontSize: 12, resize: 'vertical' }}
              placeholder={"5/1/2025\tPlayerOne\tPlayerTwo\n5/2/2025\tPlayerThree\t\n5/3/2025\tPlayerFour\tPlayerFive"}
              value={pasteText} onChange={e => { setPasteText(e.target.value); setTrainRows([]) }} />
            <div style={{ marginTop: 10 }}>
              <button className="btn-primary btn-sm" onClick={handleParsePaste}>
                <i className="ti ti-eye" aria-hidden="true" /> Preview Import
              </button>
            </div>
          </div>
          {error   && <div className="lw-error"   style={{ marginBottom: 12 }}>{error}</div>}
          {success && <div className="lw-success" style={{ marginBottom: 12 }}>{success}</div>}
          {trainRows.length > 0 && (
            <div className="lw-card" style={{ marginBottom: 14 }}>
              <div style={{ padding: '10px 14px', borderBottom: '1px solid #e8edf5', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 13, fontWeight: 800, color: '#1a2a4a' }}>{trainRows.length} rows parsed</span>
                <span style={{ fontSize: 11, color: '#8090b8' }}>{trainRows.filter(r => r.valid).length} valid · {trainRows.filter(r => !r.valid).length} invalid</span>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table className="lw-table" style={{ minWidth: 480 }}>
                  <thead><tr><th>Date</th><th>Conductor</th><th>VIP</th><th>Status</th></tr></thead>
                  <tbody>
                    {trainRows.map((row, i) => (
                      <tr key={i} style={{ opacity: row.valid ? 1 : 0.4 }}>
                        <td style={{ color: '#4a5a7a', fontSize: 12 }}>{row.date || '—'}</td>
                        <td style={{ fontWeight: 700 }}>{row.conductor || '—'}</td>
                        <td style={{ color: '#8090b8' }}>{row.vip || '—'}</td>
                        <td>
                          {row.valid
                            ? <span style={{ fontSize: 10, fontWeight: 800, background: '#f0fff4', border: '1px solid #a0e0b0', color: '#0a6030', padding: '2px 8px', borderRadius: 5 }}>READY</span>
                            : <span style={{ fontSize: 10, fontWeight: 800, background: '#fff0f0', border: '1px solid #f0b0b0', color: '#b03030', padding: '2px 8px', borderRadius: 5 }}>{row.error}</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{ padding: '10px 14px', borderTop: '1px solid #e8edf5', display: 'flex', gap: 8 }}>
                <button className="btn-primary btn-sm" onClick={handleSaveTrainHistory} disabled={trainSaving || trainRows.filter(r => r.valid).length === 0}>
                  <i className="ti ti-database-import" aria-hidden="true" />
                  {trainSaving ? 'Saving…' : `Import ${trainRows.filter(r => r.valid).length} Entries`}
                </button>
                <button className="btn-primary btn-sm" onClick={() => { setTrainRows([]); setPasteText('') }} style={{ background: 'transparent', color: '#4a5a7a', borderColor: '#c0cce0' }}>Clear</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Vision import */}
      {pageMode === 'vision' && (
        <div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
            <button style={tabStyle(importMode === 'roster')} onClick={() => { setImportMode('roster'); reset() }}>
              <i className="ti ti-users" aria-hidden="true" style={{ fontSize: 13 }} /> Roster
            </button>
            <button style={tabStyle(importMode === 'duel')} onClick={() => { setImportMode('duel'); reset() }}>
              <i className="ti ti-trophy" aria-hidden="true" style={{ fontSize: 13 }} /> Duel Scores
            </button>
          </div>

          <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
            {(['screenshot', 'video'] as UploadMode[]).map(m => (
              <button key={m} onClick={() => { setUploadMode(m); reset() }} style={{ ...tabStyle(uploadMode === m), fontSize: 11, padding: '5px 12px' }}>
                {m === 'screenshot' ? '📸 Screenshot' : '🎥 Video'}
              </button>
            ))}
          </div>

          {importMode === 'duel' && (
            <div className="lw-form-panel" style={{ marginBottom: 14 }}>
              <div className="lw-form-label" style={{ marginBottom: 10 }}>Which day is this from?</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 6 }}>
                {Object.entries(DUEL_DAYS).map(([day, theme]) => (
                  <button key={day} onClick={() => setSelectedDay(Number(day))}
                    style={{ ...tabStyle(selectedDay === Number(day)), flexDirection: 'column', padding: '8px 4px', fontSize: 10, justifyContent: 'center' } as React.CSSProperties}>
                    <span style={{ fontWeight: 800 }}>Day {day}</span>
                    <span style={{ fontSize: 9, opacity: 0.7, marginTop: 1 }}>{theme.short}</span>
                  </button>
                ))}
              </div>
              {currentEvent && <div style={{ fontSize: 11, color: '#8090b8', marginTop: 10 }}>Saving to week of {new Date(currentEvent.week_start + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</div>}
            </div>
          )}

          {uploadMode === 'screenshot' && (
            <>
              <div onClick={() => fileRef.current?.click()}
                style={{ border: '2px dashed #c0cce0', borderRadius: 12, padding: '32px 20px', textAlign: 'center', cursor: 'pointer', marginBottom: 12, background: '#fff', transition: 'border-color 0.15s' }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = '#3a7ae8')}
                onMouseLeave={e => (e.currentTarget.style.borderColor = '#c0cce0')}>
                {imagePreview
                  ? <img src={imagePreview} alt="Preview" style={{ maxHeight: 240, margin: '0 auto', display: 'block', borderRadius: 8, objectFit: 'contain' }} />
                  : <><div style={{ fontSize: 36, marginBottom: 10 }}>📸</div><div style={{ fontSize: 13, fontWeight: 700, color: '#1a2a4a', marginBottom: 4 }}>Click to upload screenshot</div><div style={{ fontSize: 11, color: '#8090b8' }}>PNG, JPG, or WEBP</div></>}
                <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFileChange} />
              </div>
              {imagePreview && !hasPreview && (
                <button className="btn-primary" onClick={handleExtractScreenshot} disabled={processing} style={{ width: '100%', justifyContent: 'center', padding: '10px', fontSize: 13, marginBottom: 12 }}>
                  <i className="ti ti-eye" aria-hidden="true" />{processing ? 'Extracting…' : 'Extract Data with Claude Vision'}
                </button>
              )}
            </>
          )}

          {uploadMode === 'video' && (
            <>
              <div onClick={() => videoRef.current?.click()}
                style={{ border: '2px dashed #c0cce0', borderRadius: 12, padding: '32px 20px', textAlign: 'center', cursor: 'pointer', marginBottom: 12, background: '#fff', transition: 'border-color 0.15s' }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = '#3a7ae8')}
                onMouseLeave={e => (e.currentTarget.style.borderColor = '#c0cce0')}>
                <div style={{ fontSize: 36, marginBottom: 10 }}>🎥</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#1a2a4a', marginBottom: 4 }}>{videoName || 'Click to upload screen recording'}</div>
                <div style={{ fontSize: 11, color: '#8090b8' }}>{videoName ? 'Click to change' : 'MP4, MOV, or WEBM · Frames every 1.5 seconds'}</div>
                <input ref={videoRef} type="file" accept="video/*" style={{ display: 'none' }} onChange={handleVideoChange} />
              </div>
              {videoFile && !hasPreview && (
                <button className="btn-primary" onClick={handleExtractVideo} disabled={processing} style={{ width: '100%', justifyContent: 'center', padding: '10px', fontSize: 13, marginBottom: 12 }}>
                  <i className="ti ti-player-play" aria-hidden="true" />{processing ? 'Processing…' : 'Extract Data from Video'}
                </button>
              )}
            </>
          )}

          {progress && (
            <div style={{ background: '#f0f4fd', border: '1.5px solid #d0d8ec', borderRadius: 8, padding: '10px 14px', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 14, height: 14, border: '2px solid #3a7ae8', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite', flexShrink: 0 }} />
              <span style={{ fontSize: 12, color: '#1a4ab0' }}>{progress}</span>
            </div>
          )}

          {error   && <div className="lw-error"   style={{ marginBottom: 12 }}>{error}</div>}
          {success && <div className="lw-success" style={{ marginBottom: 12 }}>{success}</div>}

          {importMode === 'roster' && rosterRows.length > 0 && (
            <div className="lw-card" style={{ marginBottom: 14 }}>
              <div style={{ padding: '10px 14px', borderBottom: '1px solid #e8edf5', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 13, fontWeight: 800, color: '#1a2a4a' }}>{rosterRows.length} members extracted</span>
                <span style={{ fontSize: 11, color: '#8090b8' }}>Click a row to skip it</span>
              </div>
              <table className="lw-table">
                <thead><tr><th>Name</th><th>Rank</th><th style={{ textAlign: 'right' }}>Power</th><th style={{ textAlign: 'center' }}>Action</th></tr></thead>
                <tbody>
                  {rosterRows.map((row, i) => (
                    <tr key={i} onClick={() => toggleRosterAction(i)} style={{ cursor: 'pointer', opacity: row.action === 'skip' ? 0.35 : 1 }}>
                      <td style={{ fontWeight: 700 }}>{row.name}</td>
                      <td><span className={`rank-badge rank-${row.rank}`}>R{row.rank}</span></td>
                      <td style={{ textAlign: 'right', fontFamily: 'monospace', fontWeight: 700 }}>{formatPower(row.power)}</td>
                      <td style={{ textAlign: 'center' }}>
                        <span style={{ fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 5, border: '1px solid',
                          ...(row.action === 'add'    ? { background: '#f0fff4', borderColor: '#a0e0b0', color: '#0a6030' } :
                              row.action === 'update' ? { background: '#e8f0ff', borderColor: '#5a8ae8', color: '#1a4ab0' } :
                                                        { background: '#f4f4f8', borderColor: '#c0c0d0', color: '#8090b8' }) }}>
                          {row.action.toUpperCase()}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ padding: '10px 14px', borderTop: '1px solid #e8edf5', display: 'flex', gap: 8 }}>
                <button className="btn-primary btn-sm" onClick={handleSaveRoster} disabled={saving}>
                  <i className="ti ti-database-import" aria-hidden="true" />{saving ? 'Saving…' : `Save ${rosterRows.filter(r => r.action !== 'skip').length} Members`}
                </button>
                <button className="btn-primary btn-sm" onClick={reset} style={{ background: 'transparent', color: '#4a5a7a', borderColor: '#c0cce0' }}>Cancel</button>
              </div>
            </div>
          )}

          {importMode === 'duel' && duelRows.length > 0 && (
            <div className="lw-card" style={{ marginBottom: 14 }}>
              <div style={{ padding: '10px 14px', borderBottom: '1px solid #e8edf5', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 13, fontWeight: 800, color: '#1a2a4a' }}>{duelRows.length} scores — Day {selectedDay}: {DUEL_DAYS[selectedDay].name}</span>
                <span style={{ fontSize: 11, color: '#8090b8' }}>Unmatched = not in roster</span>
              </div>
              <table className="lw-table">
                <thead><tr><th>Name</th><th style={{ textAlign: 'right' }}>Score</th><th style={{ textAlign: 'center' }}>Status</th></tr></thead>
                <tbody>
                  {duelRows.map((row, i) => (
                    <tr key={i}>
                      <td style={{ fontWeight: 700 }}>{row.name}</td>
                      <td style={{ textAlign: 'right', fontFamily: 'monospace', fontWeight: 700 }}>{formatPower(row.score)}</td>
                      <td style={{ textAlign: 'center' }}>
                        {row.matched || row.memberId
                          ? <span style={{ fontSize: 10, fontWeight: 800, background: '#f0fff4', border: '1px solid #a0e0b0', color: '#0a6030', padding: '2px 8px', borderRadius: 5 }}>MATCHED</span>
                          : <span style={{ fontSize: 10, fontWeight: 800, background: '#fff0f0', border: '1px solid #f0b0b0', color: '#b03030', padding: '2px 8px', borderRadius: 5 }}>NO MATCH</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ padding: '10px 14px', borderTop: '1px solid #e8edf5', display: 'flex', gap: 8 }}>
                <button className="btn-primary btn-sm" onClick={handleSaveDuel} disabled={saving}>
                  <i className="ti ti-database-import" aria-hidden="true" />{saving ? 'Saving…' : `Save ${duelRows.filter(r => r.matched || r.memberId).length} Scores`}
                </button>
                <button className="btn-primary btn-sm" onClick={reset} style={{ background: 'transparent', color: '#4a5a7a', borderColor: '#c0cce0' }}>Cancel</button>
              </div>
            </div>
          )}
        </div>
      )}
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
