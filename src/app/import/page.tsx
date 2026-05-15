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
  const d = new Date(date)
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  return d.toISOString().split('T')[0]
}

async function extractFrames(file: File, intervalSeconds = 1.5, onProgress?: (current: number, total: number) => void): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const video  = document.createElement('video')
    const canvas = document.createElement('canvas')
    const ctx    = canvas.getContext('2d')!
    const frames: string[] = []
    const url    = URL.createObjectURL(file)
    video.src = url; video.muted = true; video.playsInline = true
    video.onloadedmetadata = () => {
      canvas.width = video.videoWidth; canvas.height = video.videoHeight
      const duration = video.duration
      const totalFrames = Math.floor(duration / intervalSeconds)
      let currentFrame = 0
      function captureFrame(time: number) { video.currentTime = time }
      video.onseeked = () => {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
        frames.push(canvas.toDataURL('image/jpeg', 0.85).split(',')[1])
        currentFrame++
        onProgress?.(currentFrame, totalFrames)
        const nextTime = currentFrame * intervalSeconds
        if (nextTime < duration) { captureFrame(nextTime) }
        else { URL.revokeObjectURL(url); resolve(frames) }
      }
      video.onerror = () => reject(new Error('Failed to load video'))
      captureFrame(0)
    }
    video.onerror = () => reject(new Error('Failed to load video — try a different format'))
    video.load()
  })
}

// Reusable tab button
function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '7px 16px', borderRadius: 6, fontSize: 12, fontWeight: 600,
        cursor: 'pointer', transition: 'all 0.15s', display: 'flex', alignItems: 'center', gap: 6,
        background: active ? 'linear-gradient(135deg, #b8860b, #8b6508)' : 'transparent',
        border: active ? 'none' : '1px solid #2a1f0a',
        color: active ? '#fff8e0' : '#7a6030',
      }}
    >
      {children}
    </button>
  )
}

// Upload drop zone
function DropZone({ icon, title, subtitle, preview, onClick }: { icon: string; title: string; subtitle: string; preview?: React.ReactNode; onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      style={{
        border: '2px dashed #2a1f0a', borderRadius: 10, padding: '32px 20px',
        textAlign: 'center', cursor: 'pointer', transition: 'border-color 0.15s',
        marginBottom: 12,
      }}
      onMouseEnter={e => (e.currentTarget.style.borderColor = '#b8860b')}
      onMouseLeave={e => (e.currentTarget.style.borderColor = '#2a1f0a')}
    >
      {preview || (
        <>
          <div style={{ fontSize: 36, marginBottom: 10 }}>{icon}</div>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#c8a840', marginBottom: 4 }}>{title}</div>
          <div style={{ fontSize: 11, color: '#4a3820' }}>{subtitle}</div>
        </>
      )}
    </div>
  )
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
      const { data } = await supabase.from('members').select('*').eq('active', true)
      setMembers(data || [])
      const monday = getMondayOf(new Date())
      const { data: existing } = await supabase.from('duel_events').select('*').eq('week_start', monday).single()
      if (existing) setCurrentEvent(existing)
    }
    load()
  }, [])

  function reset() {
    setRosterRows([]); setDuelRows([]); setImagePreview(null); setImageBase64(null)
    setVideoFile(null); setVideoName(''); setError(null); setSuccess(null); setProgress(null)
    if (fileRef.current)  fileRef.current.value  = ''
    if (videoRef.current) videoRef.current.value = ''
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return; reset()
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      setImagePreview(result); setImageBase64(result.split(',')[1]); setMediaType(file.type || 'image/png')
    }
    reader.readAsDataURL(file)
  }

  function handleVideoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return; reset()
    setVideoFile(file); setVideoName(file.name)
  }

  async function processFrame(base64: string, mType: string): Promise<any[]> {
    const endpoint = importMode === 'roster' ? '/api/import/roster' : '/api/import/duel'
    const body = importMode === 'roster' ? { imageBase64: base64, mediaType: mType } : { imageBase64: base64, mediaType: mType, day: selectedDay }
    const res  = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const data = await res.json()
    if (data.error) throw new Error(data.error)
    return importMode === 'roster' ? data.members : data.scores
  }

  function mergeRosterResults(allResults: any[][]): any[] {
    const map = new Map<string, any>()
    for (const frame of allResults) for (const m of frame) {
      const key = m.name.toLowerCase().trim()
      if (!map.has(key) || (m.power > 0 && map.get(key).power === 0)) map.set(key, m)
    }
    return Array.from(map.values())
  }

  function mergeDuelResults(allResults: any[][]): any[] {
    const map = new Map<string, any>()
    for (const frame of allResults) for (const s of frame) {
      const key = s.name.toLowerCase().trim()
      if (!map.has(key) || s.score > map.get(key).score) map.set(key, s)
    }
    return Array.from(map.values())
  }

  function buildRosterRows(extracted: any[]): RosterRow[] {
    return extracted.map((m: any) => {
      const existing = members.find(em => em.name.toLowerCase() === m.name.toLowerCase())
      return { name: m.name, rank: m.rank || 3, power: m.power || 0, action: existing ? 'update' : 'add', memberId: existing?.id }
    })
  }

  function buildDuelRows(extracted: any[]): DuelRow[] {
    return extracted.map((s: any) => {
      const existing = members.find(m => m.name.toLowerCase() === s.name.toLowerCase())
      return { name: s.name, score: s.score || 0, memberId: existing?.id, matched: !!existing }
    })
  }

  async function handleExtractScreenshot() {
    if (!imageBase64) { setError('Please upload a screenshot first'); return }
    setProcessing(true); setError(null); setSuccess(null)
    try {
      const results = await processFrame(imageBase64, mediaType)
      if (importMode === 'roster') setRosterRows(buildRosterRows(results))
      else setDuelRows(buildDuelRows(results))
    } catch (err: any) { setError(err.message) }
    finally { setProcessing(false) }
  }

  async function handleExtractVideo() {
    if (!videoFile) { setError('Please upload a video first'); return }
    setProcessing(true); setError(null); setSuccess(null); setProgress('Extracting frames from video…')
    try {
      let frames: string[] = []
      try {
        frames = await extractFrames(videoFile, 1.5, (current, total) => setProgress(`Extracting frames… ${current} / ${total}`))
      } catch (frameErr: any) { throw new Error(`Could not extract frames: ${frameErr.message}. Try MP4 format.`) }
      if (frames.length === 0) throw new Error('No frames could be extracted. Try re-recording or use a screenshot instead.')
      setProgress(`Extracted ${frames.length} frames — analyzing with Claude Vision…`)
      const allResults: any[][] = []
      let failedFrames = 0
      for (let i = 0; i < frames.length; i++) {
        setProgress(`Analyzing frame ${i + 1} of ${frames.length} — ${allResults.length} results so far…`)
        try {
          const result = await processFrame(frames[i], 'image/jpeg')
          if (result.length > 0) allResults.push(result)
        } catch (frameErr: any) {
          failedFrames++
          if (failedFrames > 3 && allResults.length === 0) throw new Error(`Claude Vision failed on multiple frames: ${frameErr.message}`)
        }
      }
      if (allResults.length === 0) throw new Error('No data found in any frames. Make sure the video clearly shows member names and scores.')
      setProgress(`Merging results from ${allResults.length} frames…`)
      const merged = importMode === 'roster' ? mergeRosterResults(allResults) : mergeDuelResults(allResults)
      if (merged.length === 0) throw new Error('Frames processed but no members found. Try a clearer recording.')
      if (importMode === 'roster') setRosterRows(buildRosterRows(merged))
      else setDuelRows(buildDuelRows(merged))
      setProgress(null)
    } catch (err: any) { setError(err.message || 'Video processing failed.'); setProgress(null) }
    finally { setProcessing(false) }
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
    const { data } = await supabase.from('members').select('*').eq('active', true)
    setMembers(data || []); reset(); setSaving(false)
    setSuccess(`✅ ${saved} members saved to roster.`)
  }

  async function handleSaveDuel() {
    if (!currentEvent) { setError('No active duel event found. Visit the Duel page first.'); return }
    setSaving(true); setError(null); let saved = 0
    for (const row of duelRows) {
      if (!row.memberId) continue
      await supabase.from('duel_scores').upsert({ event_id: currentEvent.id, member_id: row.memberId, day: selectedDay, score: row.score }, { onConflict: 'event_id,member_id,day' })
      saved++
    }
    reset(); setSaving(false)
    setSuccess(`✅ ${saved} scores saved for Day ${selectedDay} — ${DUEL_DAYS[selectedDay].name}.`)
  }

  function parsePaste(text: string): TrainRow[] {
    return text.trim().split('\n').filter(l => l.trim()).map(line => {
      const cols = line.split('\t').map(c => c.trim())
      const dateRaw = cols[0] || '', conductor = cols[1] || '', vip = cols[2] || ''
      let dateStr = '', valid = true, error = ''
      if (!dateRaw) { valid = false; error = 'Missing date' }
      else { const d = new Date(dateRaw); if (isNaN(d.getTime())) { valid = false; error = 'Invalid date: ' + dateRaw } else dateStr = d.toISOString().split('T')[0] }
      if (!conductor) { valid = false; error = error || 'Missing conductor' }
      return { date: dateStr, conductor, vip, valid, error }
    })
  }

  function handleParsePaste() {
    if (!pasteText.trim()) { setError('Please paste your Google Sheet data first'); return }
    setError(null); setTrainRows(parsePaste(pasteText))
  }

  async function handleSaveTrainHistory() {
    const validRows = trainRows.filter(r => r.valid)
    if (validRows.length === 0) { setError('No valid rows to save'); return }
    setTrainSaving(true); setError(null); let saved = 0, skipped = 0
    for (const row of validRows) {
      const { error } = await supabase.from('train_log').upsert({ log_date: row.date, conductor_name: row.conductor, vip_name: row.vip || null, conductor_id: null, vip_id: null }, { onConflict: 'log_date' })
      if (error) skipped++; else saved++
    }
    setTrainSaving(false); setTrainRows([]); setPasteText('')
    setSuccess(`✅ ${saved} train log entries imported!${skipped > 0 ? ` ${skipped} skipped.` : ''}`)
  }

  function toggleRosterAction(i: number) {
    setRosterRows(prev => prev.map((r, idx) => idx !== i ? r : { ...r, action: r.action === 'skip' ? (r.memberId ? 'update' : 'add') : 'skip' }))
  }

  const hasPreview = rosterRows.length > 0 || duelRows.length > 0

  const actionColor = (a: string) => a === 'add' ? { bg: '#081a0a', border: '#1a4a1a', color: '#60c060' } : a === 'update' ? { bg: '#080e1a', border: '#1a2a4a', color: '#6090e0' } : { bg: '#141210', border: '#2a1f0a', color: '#4a3820' }

  return (
    <div style={{ maxWidth: 780 }}>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <div className="section-title" style={{ marginBottom: 4 }}>
          <i className="ti ti-upload" aria-hidden="true" />
          Import Data
        </div>
        <div style={{ fontSize: 12, color: '#4a3820' }}>Import from screenshots, video recordings, or paste from Google Sheets.</div>
      </div>

      {/* Page mode tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        <TabBtn active={pageMode === 'vision'} onClick={() => { setPageMode('vision'); reset(); setError(null); setSuccess(null) }}>
          <i className="ti ti-camera" aria-hidden="true" style={{ fontSize: 13 }} /> Screenshot / Video
        </TabBtn>
        <TabBtn active={pageMode === 'train_history'} onClick={() => { setPageMode('train_history'); reset(); setError(null); setSuccess(null) }}>
          <i className="ti ti-train" aria-hidden="true" style={{ fontSize: 13 }} /> Train History
        </TabBtn>
      </div>

      {/* ── TRAIN HISTORY ── */}
      {pageMode === 'train_history' && (
        <div>
          <div className="lw-form-panel" style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#c8a840', marginBottom: 6 }}>Paste from Google Sheets</div>
            <div style={{ fontSize: 12, color: '#4a3820', marginBottom: 12 }}>
              Select your data (Date · Conductor · VIP columns), copy, and paste below. No header row needed.
            </div>
            <textarea
              className="lw-input"
              rows={8}
              style={{ fontFamily: 'monospace', fontSize: 12, resize: 'vertical' }}
              placeholder={"5/1/2025\tPlayerOne\tPlayerTwo\n5/2/2025\tPlayerThree\t\n5/3/2025\tPlayerFour\tPlayerFive"}
              value={pasteText}
              onChange={e => { setPasteText(e.target.value); setTrainRows([]) }}
            />
            <div style={{ marginTop: 10 }}>
              <button className="btn-gold" onClick={handleParsePaste}>
                <i className="ti ti-eye" aria-hidden="true" /> Preview Import
              </button>
            </div>
          </div>

          {error   && <div className="lw-error"   style={{ marginBottom: 12 }}>{error}</div>}
          {success && <div className="lw-success" style={{ marginBottom: 12 }}>{success}</div>}

          {trainRows.length > 0 && (
            <div className="lw-card" style={{ marginBottom: 14 }}>
              <div style={{ padding: '10px 14px', borderBottom: '1px solid #2a1f0a', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#c8a840' }}>{trainRows.length} rows parsed</span>
                <span style={{ fontSize: 11, color: '#4a3820' }}>{trainRows.filter(r => r.valid).length} valid · {trainRows.filter(r => !r.valid).length} invalid</span>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table className="lw-table" style={{ minWidth: 480 }}>
                  <thead><tr><th>Date</th><th>Conductor</th><th>VIP</th><th>Status</th></tr></thead>
                  <tbody>
                    {trainRows.map((row, i) => (
                      <tr key={i} style={{ opacity: row.valid ? 1 : 0.4 }}>
                        <td style={{ color: '#7a6030', fontSize: 12 }}>{row.date || '—'}</td>
                        <td style={{ fontWeight: 500 }}>{row.conductor || '—'}</td>
                        <td style={{ color: '#7a6030' }}>{row.vip || '—'}</td>
                        <td>
                          {row.valid
                            ? <span style={{ fontSize: 10, fontWeight: 700, background: '#081a0a', border: '1px solid #1a4a1a', color: '#60c060', padding: '2px 7px', borderRadius: 4 }}>READY</span>
                            : <span style={{ fontSize: 10, fontWeight: 700, background: '#1a0808', border: '1px solid #4a1818', color: '#e06060', padding: '2px 7px', borderRadius: 4 }}>{row.error}</span>
                          }
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{ padding: '10px 14px', borderTop: '1px solid #2a1f0a', display: 'flex', gap: 8 }}>
                <button className="btn-gold" onClick={handleSaveTrainHistory} disabled={trainSaving || trainRows.filter(r => r.valid).length === 0}>
                  <i className="ti ti-database-import" aria-hidden="true" />
                  {trainSaving ? 'Saving…' : `Import ${trainRows.filter(r => r.valid).length} Entries`}
                </button>
                <button className="btn-ghost" onClick={() => { setTrainRows([]); setPasteText('') }}>Clear</button>
              </div>
              {trainRows.some(r => !r.valid) && (
                <div style={{ padding: '0 14px 10px', fontSize: 11, color: '#c07040' }}>⚠️ Invalid rows will be skipped. Fix them in Google Sheets and re-paste.</div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── VISION IMPORT ── */}
      {pageMode === 'vision' && (
        <div>
          {/* Import mode */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
            <TabBtn active={importMode === 'roster'} onClick={() => { setImportMode('roster'); reset() }}>
              <i className="ti ti-users" aria-hidden="true" style={{ fontSize: 13 }} /> Roster
            </TabBtn>
            <TabBtn active={importMode === 'duel'} onClick={() => { setImportMode('duel'); reset() }}>
              <i className="ti ti-trophy" aria-hidden="true" style={{ fontSize: 13 }} /> Duel Scores
            </TabBtn>
          </div>

          {/* Upload mode */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
            {(['screenshot', 'video'] as UploadMode[]).map(m => (
              <button key={m} onClick={() => { setUploadMode(m); reset() }} style={{ padding: '4px 12px', borderRadius: 5, fontSize: 11, fontWeight: 500, cursor: 'pointer', transition: 'all 0.15s', background: uploadMode === m ? '#1a1400' : 'transparent', border: uploadMode === m ? '1px solid #b8860b' : '1px solid #2a1f0a', color: uploadMode === m ? '#ffd700' : '#4a3820' }}>
                {m === 'screenshot' ? '📸 Screenshot' : '🎥 Video'}
              </button>
            ))}
          </div>

          {/* Duel day selector */}
          {importMode === 'duel' && (
            <div className="lw-form-panel" style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#7a6030', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Which day is this from?</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 6 }}>
                {Object.entries(DUEL_DAYS).map(([day, theme]) => (
                  <button key={day} onClick={() => setSelectedDay(Number(day))} style={{ borderRadius: 7, padding: '8px 4px', textAlign: 'center', cursor: 'pointer', transition: 'all 0.15s', background: selectedDay === Number(day) ? 'linear-gradient(135deg, #b8860b, #8b6508)' : '#0f0e0a', border: selectedDay === Number(day) ? 'none' : '1px solid #2a1f0a', color: selectedDay === Number(day) ? '#fff8e0' : '#4a3820' }}>
                    <div style={{ fontSize: 10, fontWeight: 700 }}>Day {day}</div>
                    <div style={{ fontSize: 9, marginTop: 2, opacity: 0.8 }}>{theme.short}</div>
                  </button>
                ))}
              </div>
              {currentEvent && <div style={{ fontSize: 11, color: '#3a2a10', marginTop: 10 }}>Saving to week of {new Date(currentEvent.week_start + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</div>}
            </div>
          )}

          {/* Screenshot upload */}
          {uploadMode === 'screenshot' && (
            <>
              <DropZone
                icon="📸" title="Click to upload screenshot" subtitle="PNG, JPG, or WEBP"
                onClick={() => fileRef.current?.click()}
                preview={imagePreview ? <img src={imagePreview} alt="Preview" style={{ maxHeight: 240, margin: '0 auto', display: 'block', borderRadius: 8, objectFit: 'contain' }} /> : undefined}
              />
              <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFileChange} />
              {imagePreview && !hasPreview && (
                <button className="btn-gold" onClick={handleExtractScreenshot} disabled={processing} style={{ width: '100%', justifyContent: 'center', padding: '10px', fontSize: 13, marginBottom: 12 }}>
                  <i className="ti ti-eye" aria-hidden="true" />
                  {processing ? 'Extracting…' : 'Extract Data with Claude Vision'}
                </button>
              )}
            </>
          )}

          {/* Video upload */}
          {uploadMode === 'video' && (
            <>
              <DropZone
                icon="🎥"
                title={videoName || 'Click to upload screen recording'}
                subtitle={videoName ? 'Click to change video' : 'MP4, MOV, or WEBM · Frames extracted every 1.5 seconds'}
                onClick={() => videoRef.current?.click()}
              />
              <input ref={videoRef} type="file" accept="video/*" style={{ display: 'none' }} onChange={handleVideoChange} />
              {videoFile && !hasPreview && (
                <button className="btn-gold" onClick={handleExtractVideo} disabled={processing} style={{ width: '100%', justifyContent: 'center', padding: '10px', fontSize: 13, marginBottom: 12 }}>
                  <i className="ti ti-player-play" aria-hidden="true" />
                  {processing ? 'Processing video…' : 'Extract Data from Video'}
                </button>
              )}
            </>
          )}

          {/* Progress */}
          {progress && (
            <div style={{ background: '#141210', border: '1px solid #2a1f0a', borderRadius: 8, padding: '10px 14px', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 14, height: 14, border: '2px solid #b8860b', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite', flexShrink: 0 }} />
              <span style={{ fontSize: 12, color: '#c8a840' }}>{progress}</span>
            </div>
          )}

          {error   && <div className="lw-error"   style={{ marginBottom: 12 }}>{error}</div>}
          {success && <div className="lw-success" style={{ marginBottom: 12 }}>{success}</div>}

          {/* Roster preview */}
          {importMode === 'roster' && rosterRows.length > 0 && (
            <div className="lw-card" style={{ marginBottom: 14 }}>
              <div style={{ padding: '10px 14px', borderBottom: '1px solid #2a1f0a', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#c8a840' }}>{rosterRows.length} members extracted</span>
                <span style={{ fontSize: 11, color: '#4a3820' }}>Click a row to skip it</span>
              </div>
              <table className="lw-table">
                <thead><tr><th>Name</th><th>Rank</th><th style={{ textAlign: 'right' }}>Power</th><th style={{ textAlign: 'center' }}>Action</th></tr></thead>
                <tbody>
                  {rosterRows.map((row, i) => {
                    const ac = actionColor(row.action)
                    return (
                      <tr key={i} onClick={() => toggleRosterAction(i)} style={{ cursor: 'pointer', opacity: row.action === 'skip' ? 0.35 : 1 }}>
                        <td style={{ fontWeight: 500 }}>{row.name}</td>
                        <td><span className={`rank-badge rank-${row.rank}`}>R{row.rank}</span></td>
                        <td style={{ textAlign: 'right' }} className="power-text">{formatPower(row.power)}</td>
                        <td style={{ textAlign: 'center' }}>
                          <span style={{ fontSize: 10, fontWeight: 700, background: ac.bg, border: `1px solid ${ac.border}`, color: ac.color, padding: '2px 7px', borderRadius: 4 }}>{row.action.toUpperCase()}</span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              <div style={{ padding: '10px 14px', borderTop: '1px solid #2a1f0a', display: 'flex', gap: 8 }}>
                <button className="btn-gold" onClick={handleSaveRoster} disabled={saving}>
                  <i className="ti ti-database-import" aria-hidden="true" />
                  {saving ? 'Saving…' : `Save ${rosterRows.filter(r => r.action !== 'skip').length} Members`}
                </button>
                <button className="btn-ghost" onClick={reset}>Cancel</button>
              </div>
            </div>
          )}

          {/* Duel preview */}
          {importMode === 'duel' && duelRows.length > 0 && (
            <div className="lw-card" style={{ marginBottom: 14 }}>
              <div style={{ padding: '10px 14px', borderBottom: '1px solid #2a1f0a', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#c8a840' }}>{duelRows.length} scores extracted — Day {selectedDay}: {DUEL_DAYS[selectedDay].name}</span>
                <span style={{ fontSize: 11, color: '#4a3820' }}>Unmatched = not in roster</span>
              </div>
              <table className="lw-table">
                <thead><tr><th>Name</th><th style={{ textAlign: 'right' }}>Score</th><th style={{ textAlign: 'center' }}>Status</th></tr></thead>
                <tbody>
                  {duelRows.map((row, i) => (
                    <tr key={i}>
                      <td style={{ fontWeight: 500 }}>{row.name}</td>
                      <td style={{ textAlign: 'right' }} className="power-text">{formatPower(row.score)}</td>
                      <td style={{ textAlign: 'center' }}>
                        {row.matched || row.memberId
                          ? <span style={{ fontSize: 10, fontWeight: 700, background: '#081a0a', border: '1px solid #1a4a1a', color: '#60c060', padding: '2px 7px', borderRadius: 4 }}>MATCHED</span>
                          : <span style={{ fontSize: 10, fontWeight: 700, background: '#1a0808', border: '1px solid #4a1818', color: '#e06060', padding: '2px 7px', borderRadius: 4 }}>NO MATCH</span>
                        }
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ padding: '10px 14px', borderTop: '1px solid #2a1f0a', display: 'flex', gap: 8 }}>
                <button className="btn-gold" onClick={handleSaveDuel} disabled={saving}>
                  <i className="ti ti-database-import" aria-hidden="true" />
                  {saving ? 'Saving…' : `Save ${duelRows.filter(r => r.matched || r.memberId).length} Scores`}
                </button>
                <button className="btn-ghost" onClick={reset}>Cancel</button>
              </div>
              {duelRows.some(r => !r.matched && !r.memberId) && (
                <div style={{ padding: '0 14px 10px', fontSize: 11, color: '#c07040' }}>⚠️ Some names didn't match your roster. Add them to the roster first, then re-import.</div>
              )}
            </div>
          )}
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
