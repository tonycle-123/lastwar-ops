import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const { imageBase64, mediaType } = await req.json()

    if (!imageBase64) {
      return NextResponse.json({ error: 'No image provided' }, { status: 400 })
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: 4000,
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
                text: `This is a screenshot from the mobile game Last War: Survival showing the Alliance Member List screen.

The layout shows rows of members. Each member row contains:
- A small profile/avatar image on the far left
- The member's in-game NAME (usually colored text — gold, yellow, white, or light colored)
- Below or next to the name: a POWER number (a large number, often formatted like 1,234,567 or shown with commas)
- A rank badge or indicator (R1, R2, R3, R4, or R5)
- A "Message" button on the right side

The screenshot may show two columns of members side by side.

Your task: Read every single member name and their power number that is visible in this image.

IMPORTANT RULES:
- Member names are the player-chosen usernames, NOT game labels like "Member", "Officer", "Leader"
- Power numbers are large integers, typically between 100,000 and 2,000,000,000
- If you see "1.2M" convert it to 1200000. If you see "850K" convert to 850000. If you see "1.2B" convert to 1200000000
- For rank: R5=5, R4=4, R3=3, R2=2, R1=1. If rank is unclear use 3
- Read ALL rows visible, both columns if there are two columns
- Do not skip any member

Return ONLY a raw JSON array. No markdown, no code fences, no explanation. Just the JSON.

Format:
[{"name":"ExactNameHere","rank":3,"power":1234567},{"name":"AnotherName","rank":4,"power":987654321}]

If you truly cannot read any members return: []`,
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
    const members = JSON.parse(clean)

    return NextResponse.json({ members })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to parse response' }, { status: 500 })
  }
}
