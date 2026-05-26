/**
 * /api/db/list?prefix=inst:123456:progress:
 * Returns all student_id keys for a given institution.
 * © כל הזכויות שמורות לשוורץ אבי
 */
import { neon } from '@neondatabase/serverless';
import { NextRequest, NextResponse } from 'next/server';

const sql = neon(process.env.DATABASE_URL!);

export async function GET(req: NextRequest) {
  const prefix = req.nextUrl.searchParams.get('prefix') ?? '';
  const m = prefix.match(/^inst:([^:]+):progress/);
  if (!m) return NextResponse.json({ keys: [] });

  const inst = m[1];
  try {
    const rows = await sql`
      SELECT student_id FROM student_progress
      WHERE institution_code = ${inst}
      ORDER BY updated_at DESC`;
    const keys = rows.map((r: any) => `inst:${inst}:progress:${r.student_id}`);
    return NextResponse.json({ keys });
  } catch (err: any) {
    console.error('[GET /api/db/list]', err.message);
    return NextResponse.json({ keys: [] });
  }
}
