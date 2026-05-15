export type Member = {
  id: string
  name: string
  rank: number
  power: number
  notes: string | null
  active: boolean
  created_at: string
  updated_at: string
}

export type DuelEvent = {
  id: string
  week_start: string
  label: string | null
  created_at: string
}

export type DuelScore = {
  id: string
  event_id: string
  member_id: string
  day: number
  score: number
  created_at: string
  updated_at: string
}

export type DuelScoreWithMember = DuelScore & {
  members: Pick<Member, 'id' | 'name'>
}

export type TrainLog = {
  id: string
  log_date: string
  conductor_id: string | null
  conductor_name: string
  vip_id: string | null
  vip_name: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

// Day themes — fixed, never changes
export const DUEL_DAYS: Record<number, { name: string; short: string }> = {
  1: { name: 'Radar Training',     short: 'Radar'    },
  2: { name: 'Base Expansion',     short: 'Base'     },
  3: { name: 'Age of Science',     short: 'Science'  },
  4: { name: 'Train Heroes',       short: 'Heroes'   },
  5: { name: 'Total Mobilization', short: 'Mobilize' },
  6: { name: 'Enemy Buster',       short: 'Buster'   },
}

export const ALLIANCE_TAG = 'ISLE'
export const SERVER_NUM   = '1109'

export const RANK_LABELS: Record<number, string> = {
  1: 'R1',
  2: 'R2',
  3: 'R3',
  4: 'R4',
  5: 'R5',
}
