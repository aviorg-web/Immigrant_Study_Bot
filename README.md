# 🎓 Immigrant Study Bot — בוט     לימוד לעולים חדשים

מערכת פדגוגית דו-לשונית לתלמידים עולים לקראת בגרות.

## © כל הזכויות שמורות לשוורץ אבי

## טכנולוגיות
- **Frontend**: React (Next.js 14)
- **DB**: Neon PostgreSQL (serverless)
- **AI**: Claude Sonnet (Anthropic)
- **Deploy**: Vercel

## הרצה מקומית
```bash
npm install
cp .env.example .env.local
# מלא DATABASE_URL ו-ANTHROPIC_API_KEY
npm run dev
```

## משתני סביבה ב-Vercel
| שם | תיאור |
|----|-------|
| `DATABASE_URL` | Neon connection string |
| `ANTHROPIC_API_KEY` | Anthropic API key |
