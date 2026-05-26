/**
 * /api/claude — Server-side proxy for Anthropic API
 * Keeps the API key on the server, never exposed to the browser.
 * © כל הזכויות שמורות לשוורץ אבי
 */
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const body = await req.json();

  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type':         'application/json',
      'x-api-key':            process.env.ANTHROPIC_API_KEY!,
      'anthropic-version':    '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify(body),
  });

  const data = await r.json();
  return NextResponse.json(data, { status: r.status });
}
