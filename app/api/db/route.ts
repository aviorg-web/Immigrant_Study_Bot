/**
 * /api/db — Generic key-value CRUD backed by Neon PostgreSQL
 * Institution isolation is enforced at query level (inst:{code}:* keys).
 * © כל הזכויות שמורות לשוורץ אבי
 */
import { neon } from '@neondatabase/serverless';
import { NextRequest, NextResponse } from 'next/server';

const sql = neon(process.env.DATABASE_URL!);

// ── Key parser: "inst:123456:units" → { inst:"123456", table:"units", rest:[] }
function parseKey(key: string) {
  if (key === 'admin:institutions') return { admin: true };
  const parts = key.split(':');
  if (parts[0] !== 'inst' || parts.length < 3)
    throw new Error(`Invalid key: ${key}`);
  return { inst: parts[1], table: parts[2], rest: parts.slice(3) };
}

// ─────────────────────────────────────────────────────────────
// GET
// ─────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get('key');
  if (!key) return NextResponse.json({ value: null });

  try {
    const p = parseKey(key);

    if ((p as any).admin) {
      const rows = await sql`SELECT * FROM institutions ORDER BY name`;
      return NextResponse.json({ value: rows });
    }

    const { inst, table, rest } = p as any;

    if (table === 'classes') {
      const rows = await sql`
        SELECT code, institution_code AS "institutionCode", subject, grade,
               teacher_name AS "teacherName", created_at
        FROM classes WHERE institution_code = ${inst} ORDER BY created_at`;
      return NextResponse.json({ value: rows });
    }

    if (table === 'materials') {
      const rows = await sql`
        SELECT id, institution_code AS "institutionCode", subject, grade,
               title, content, keywords, templates, author,
               shared, owner_id AS "ownerId", created_at
        FROM materials WHERE institution_code = ${inst} ORDER BY created_at`;
      return NextResponse.json({ value: rows });
    }

    if (table === 'units') {
      const rows = await sql`
        SELECT id, institution_code AS "institutionCode", title, subject, grade,
               question, task_type AS "taskType", support_level AS "supportLevel",
               hint_policy AS "hintPolicy", material_ids AS "materialIds",
               keywords, templates, created_at
        FROM units WHERE institution_code = ${inst} ORDER BY created_at`;
      return NextResponse.json({ value: rows });
    }

    if (table === 'progress') {
      const studentId = rest.join(':');
      const rows = await sql`
        SELECT sessions_total   AS "sessionsTotal",
               hints_total      AS "hintsTotal",
               tasks_completed  AS "tasksCompleted",
               task_log         AS "taskLog",
               last_active      AS "lastActive"
        FROM student_progress
        WHERE institution_code = ${inst} AND student_id = ${studentId}
        LIMIT 1`;
      return NextResponse.json({ value: rows[0] ?? null });
    }

    return NextResponse.json({ value: null });

  } catch (err: any) {
    console.error('[GET /api/db]', err.message);
    return NextResponse.json({ value: null });
  }
}

// ─────────────────────────────────────────────────────────────
// POST — upsert
// ─────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const { key, value } = await req.json();
  if (!key || value === undefined)
    return NextResponse.json({ error: 'Missing key or value' }, { status: 400 });

  try {
    const p = parseKey(key);

    // ── admin: institutions ──────────────────────────────────
    if ((p as any).admin) {
      for (const s of value) {
        await sql`
          INSERT INTO institutions (code, name, city, active)
          VALUES (${s.code}, ${s.name}, ${s.city ?? ''}, ${s.active ?? true})
          ON CONFLICT (code) DO UPDATE
            SET name   = EXCLUDED.name,
                city   = EXCLUDED.city,
                active = EXCLUDED.active`;
      }
      return NextResponse.json({ ok: true });
    }

    const { inst, table, rest } = p as any;

    // ── classes ──────────────────────────────────────────────
    if (table === 'classes') {
      // Ensure institution exists first
      await sql`
        INSERT INTO institutions (code, name, city, active)
        VALUES (${inst}, ${inst}, '', true)
        ON CONFLICT (code) DO NOTHING`;

      for (const c of value) {
        await sql`
          INSERT INTO classes
            (code, institution_code, subject, grade, teacher_name)
          VALUES (${c.code}, ${inst}, ${c.subject}, ${c.grade}, ${c.teacherName ?? ''})
          ON CONFLICT (code) DO UPDATE
            SET subject      = EXCLUDED.subject,
                grade        = EXCLUDED.grade,
                teacher_name = EXCLUDED.teacher_name`;
      }
      return NextResponse.json({ ok: true });
    }

    // ── materials ────────────────────────────────────────────
    if (table === 'materials') {
      for (const m of value) {
        await sql`
          INSERT INTO materials
            (id, institution_code, subject, grade, title, content,
             keywords, templates, author, shared, owner_id)
          VALUES (
            ${m.id}, ${inst}, ${m.subject}, ${m.grade}, ${m.title},
            ${m.content ?? ''}, ${JSON.stringify(m.keywords ?? [])},
            ${JSON.stringify(m.templates ?? [])},
            ${m.author ?? ''}, ${m.shared ?? false}, ${m.ownerId ?? ''})
          ON CONFLICT (id) DO UPDATE
            SET title     = EXCLUDED.title,
                content   = EXCLUDED.content,
                keywords  = EXCLUDED.keywords,
                templates = EXCLUDED.templates,
                shared    = EXCLUDED.shared`;
      }
      return NextResponse.json({ ok: true });
    }

    // ── units ────────────────────────────────────────────────
    if (table === 'units') {
      // Replace all units for this institution
      await sql`DELETE FROM units WHERE institution_code = ${inst}`;
      for (const u of value) {
        await sql`
          INSERT INTO units
            (id, institution_code, title, subject, grade, question,
             task_type, support_level, hint_policy,
             material_ids, keywords, templates)
          VALUES (
            ${u.id}, ${inst}, ${u.title}, ${u.subject}, ${u.grade},
            ${u.question}, ${u.taskType ?? ''},
            ${u.supportLevel ?? 2}, ${u.hintPolicy ?? '3'},
            ${JSON.stringify(u.materialIds ?? [])},
            ${JSON.stringify(u.keywords ?? [])},
            ${JSON.stringify(u.templates ?? [])})
          ON CONFLICT (id) DO NOTHING`;
      }
      return NextResponse.json({ ok: true });
    }

    // ── student progress ─────────────────────────────────────
    if (table === 'progress') {
      const studentId = rest.join(':');
      await sql`
        INSERT INTO student_progress
          (institution_code, student_id,
           sessions_total, hints_total, tasks_completed,
           task_log, last_active, updated_at)
        VALUES (
          ${inst}, ${studentId},
          ${value.sessionsTotal ?? 0},
          ${value.hintsTotal    ?? 0},
          ${value.tasksCompleted ?? 0},
          ${JSON.stringify(value.taskLog ?? [])},
          ${value.lastActive ?? null},
          NOW())
        ON CONFLICT (institution_code, student_id) DO UPDATE
          SET sessions_total  = EXCLUDED.sessions_total,
              hints_total     = EXCLUDED.hints_total,
              tasks_completed = EXCLUDED.tasks_completed,
              task_log        = EXCLUDED.task_log,
              last_active     = EXCLUDED.last_active,
              updated_at      = NOW()`;
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: 'Unknown table' }, { status: 400 });

  } catch (err: any) {
    console.error('[POST /api/db]', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// ─────────────────────────────────────────────────────────────
// DELETE
// ─────────────────────────────────────────────────────────────
export async function DELETE(req: NextRequest) {
  const key = req.nextUrl.searchParams.get('key');
  if (!key) return NextResponse.json({ ok: true });
  // Soft-delete not needed for current feature set — just return ok
  return NextResponse.json({ ok: true });
}
