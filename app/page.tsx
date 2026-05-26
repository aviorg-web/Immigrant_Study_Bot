'use client';

/**
 * Main page — injects a window.storage shim that routes to /api/db
 * so the educational-bot.jsx works identically whether DB_BACKEND
 * is "local" (window.storage) or "neon" (/api/db).
 *
 * © כל הזכויות שמורות לשוורץ אבי
 */

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';

// Dynamically import to avoid SSR issues with window references
const EduBot = dynamic(() => import('../educational-bot'), { ssr: false });

export default function Page() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    /**
     * Inject window.storage shim — proxies all reads/writes to /api/db
     * so the bot component needs zero changes between local & production.
     */
    if (typeof window !== 'undefined' && !window.storage) {
      window.storage = {
        async get(key: string) {
          try {
            const r = await fetch(`/api/db?key=${encodeURIComponent(key)}`);
            if (!r.ok) return null;
            const d = await r.json();
            if (d.value === null || d.value === undefined) return null;
            return { key, value: JSON.stringify(d.value) };
          } catch { return null; }
        },
        async set(key: string, value: string) {
          try {
            await fetch('/api/db', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ key, value: JSON.parse(value) }),
            });
            return { key, value };
          } catch { return null; }
        },
        async delete(key: string) {
          try {
            await fetch(`/api/db?key=${encodeURIComponent(key)}`, { method: 'DELETE' });
            return { key, deleted: true };
          } catch { return null; }
        },
        async list(prefix: string) {
          try {
            const r = await fetch(`/api/db/list?prefix=${encodeURIComponent(prefix)}`);
            if (!r.ok) return { keys: [] };
            return r.json();
          } catch { return { keys: [] }; }
        },
      };
    }
    setReady(true);
  }, []);

  if (!ready) return (
    <div style={{
      minHeight: '100vh', background: '#0f1923', display: 'flex',
      alignItems: 'center', justifyContent: 'center',
      color: '#2dd4bf', fontFamily: 'sans-serif', fontSize: '1.1rem',
    }}>
      טוען...
    </div>
  );

  return <EduBot />;
}
