import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const { imageBase64, mediaType, day } = await req.json()

    if (!imageBase64) {
      return NextResponse.json({ error: 'No image provided' }, { status: 400 })
    }

    const dayThemes: Record<number, string> = {
      1: 'Radar Training',
      2: 'Base Expansion',
      3: 'Age of Science',
      4: 'Train Heroes',
      5: 'Total Mobilization',
      6: 'Enemy Buster',
    }

    const dayContext = day
      ? `This screenshot is from Day ${day} (${dayThemes[day] || 'unknown theme'}) of the Alliance Duel event.`
      : 'This screenshot is from an Alliance Duel event.'

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: 2000,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: mediaType || 'image/png',
                  data: imageBase64,
                },
              },
              {
                type: 'text',
                text: `This is a screenshot from the mobile game Last War: Survival showing Alliance Duel scores. ${dayContext}

Extract every visible member score and return ONLY a JSON array with no markdown, no explanation, no code fences — just raw JSON.

Each object must have:
- "name": string (the member's in-game name)
- "score": number (their score as a plain integer — convert K/M/B suffixes, e.g. "1.2M" = 1200000, "850K" = 850000)

Example output:
[{"name":"PlayerOne","score":1200000},{"name":"PlayerTwo","score":850000}]

If you cannot find any score data, return an empty array: []`,
              },
            ],
          },
        ],
      }),
    })

    if (!response.ok) {
      const err = await response.text()
      return NextResponse.json({ error: `Claude API error: ${err}` }, { status: 500 })
    }

    const data = await response.json()
    const text = data.content
      .filter((b: any) => b.type === 'text')
      .map((b: any) => b.text)
      .join('')

    const clean = text.replace(/```json|```/g, '').trim()
    const scores = JSON.parse(clean)

    return NextResponse.json({ scores })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to parse response' }, { status: 500 })
  }
}
