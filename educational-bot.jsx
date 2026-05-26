import { useState, useEffect, useRef, useCallback } from "react";

// ============================================================
// HASH (prototype — replace with bcrypt in production)
// ============================================================
function simpleHash(s){let h=5381;for(let i=0;i<s.length;i++)h=((h<<5)+h)^s.charCodeAt(i);return(h>>>0).toString(16);}
const ADMIN_EMAIL="aviorg@gmail.com";
const ADMIN_HASH=simpleHash("Avi310763");

// ============================================================
// DB BACKEND CONFIG
// ─────────────────────────────────────────────────────────────
// BACKEND = "local"  → window.storage (artifact / demo)
// BACKEND = "neon"   → fetch to /api/db  (Next.js + Neon)
// BACKEND = "supabase" → fetch to /api/db (Next.js + Supabase)
//
// To switch: change DB_BACKEND and set DB_API_BASE to your
// deployed Next.js URL, e.g. "https://edu-bot.vercel.app"
// ============================================================
const DB_BACKEND = "local";          // "local" | "neon" | "supabase"
const DB_API_BASE = "";              // e.g. "https://edu-bot.vercel.app"

// ============================================================
// LOCAL STORAGE ADAPTER (window.storage + in-memory fallback)
// ============================================================
const Mem={};
const LocalAdapter={
  async get(k){try{const r=await window.storage.get(k);return r?JSON.parse(r.value):null;}catch{return Mem[k]??null;}},
  async set(k,v){try{await window.storage.set(k,JSON.stringify(v));}catch{Mem[k]=v;}},
  async del(k){try{await window.storage.delete(k);}catch{delete Mem[k];}},
  async listKeys(prefix){try{const r=await window.storage.list(prefix);return r?.keys||[];}catch{return Object.keys(Mem).filter(x=>x.startsWith(prefix));}},
};

// ============================================================
// NEON / REMOTE ADAPTER  (used when DB_BACKEND !== "local")
// Calls Next.js API routes that proxy to Neon/Supabase.
// See deployment-guide.md for full API route code.
// ============================================================
const RemoteAdapter={
  async get(k){
    const r=await fetch(`${DB_API_BASE}/api/db?key=${encodeURIComponent(k)}`);
    if(!r.ok)return null;
    const d=await r.json();
    return d.value??null;
  },
  async set(k,v){
    await fetch(`${DB_API_BASE}/api/db`,{
      method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({key:k,value:v})
    });
  },
  async del(k){await fetch(`${DB_API_BASE}/api/db?key=${encodeURIComponent(k)}`,{method:"DELETE"});},
  async listKeys(prefix){
    const r=await fetch(`${DB_API_BASE}/api/db/list?prefix=${encodeURIComponent(prefix)}`);
    if(!r.ok)return[];
    const d=await r.json();
    return d.keys||[];
  },
};

const Adapter = DB_BACKEND==="local" ? LocalAdapter : RemoteAdapter;

// ============================================================
// DB SERVICE — institution-namespaced, backend-agnostic
// ============================================================
const DB={
  key:(inst,...p)=>`inst:${inst}:${p.join(":")}`,
  async getClasses(inst){return(await Adapter.get(DB.key(inst,"classes")))||defaultClasses.filter(c=>c.institutionCode===inst);},
  async setClasses(inst,d){await Adapter.set(DB.key(inst,"classes"),d);},
  async getMaterials(inst){return(await Adapter.get(DB.key(inst,"materials")))||initialMaterials;},
  async setMaterials(inst,d){await Adapter.set(DB.key(inst,"materials"),d);},
  async getUnits(inst){return(await Adapter.get(DB.key(inst,"units")))||[];},
  async setUnits(inst,d){await Adapter.set(DB.key(inst,"units"),d);},
  // Student progress — fully isolated per institution
  async getProgress(inst,sid){return(await Adapter.get(DB.key(inst,"progress",sid)))||emptyProg();},
  async setProgress(inst,sid,d){await Adapter.set(DB.key(inst,"progress",sid),d);},
  // List all student progress keys for a class
  async listProgress(inst){return Adapter.listKeys(DB.key(inst,"progress",""));},
  async getInstitutions(){return(await Adapter.get("admin:institutions"))||defaultInstitutions;},
  async setInstitutions(d){await Adapter.set("admin:institutions",d);},
};

function emptyProg(){
  return{sessionsTotal:0,hintsTotal:0,tasksCompleted:0,lastActive:null,taskLog:[]};
}

const SUBJECTS=["היסטוריה","ספרות","תנ\"ך","אזרחות"];
const GRADES=["ז׳","ח׳","ט׳","י׳","י\"א"];
const LANG_PAIRS=[
  {id:"he-ru",label:"עברית — רוסית",flag1:"🇮🇱",flag2:"🇷🇺",secondary:"ru"},
  {id:"he-en",label:"עברית — אנגלית",flag1:"🇮🇱",flag2:"🇬🇧",secondary:"en"},
];
const SUPPORT_LEVELS=[
  {id:1,label:"תמיכה גבוהה",desc:"שאלות ורמזים גם בשפה השנייה"},
  {id:2,label:"תמיכה בינונית",desc:"כתיבה בעברית, הבהרות בשפה השנייה"},
  {id:3,label:"תמיכה נמוכה",desc:"עיקר בעברית, מעט גיבוי"},
  {id:4,label:"מוכנות לבגרות",desc:"עברית בלבד"},
];
const TASK_TYPES=["הסבר מושג","השוואה","סיבה ותוצאה","ניתוח טקסט","שכתוב","תרגול בגרות"];
const HINT_POLICIES=[{id:"3",label:"עד 3 רמזים"},{id:"5",label:"עד 5 רמזים"},{id:"unlimited",label:"ללא הגבלה"}];
const defaultInstitutions=[
  {code:"123456",name:"בית ספר אלון",city:"תל אביב",active:true},
  {code:"789012",name:"בית ספר ירדן",city:"חיפה",active:true},
];
const defaultClasses=[
  {code:"HIS10A",subject:"היסטוריה",grade:"י׳",teacherName:"שרה לוי",institutionCode:"123456"},
  {code:"CIV09B",subject:"אזרחות",grade:"ט׳",teacherName:"רנה בן דוד",institutionCode:"123456"},
  {code:"LIT10C",subject:"ספרות",grade:"י׳",teacherName:"דוד כהן",institutionCode:"789012"},
];
const initialMaterials=[
  {id:"m1",subject:"היסטוריה",grade:"י׳",title:"גורמי העלייה מברית המועצות",
   content:"גורמים פוליטיים, כלכליים ותרבותיים לעלייה הגדולה בשנות ה-90.",
   keywords:["עלייה","ברית המועצות","גלאסנוסט","הגירה"],templates:["הגורם המרכזי הוא... משום ש..."],
   author:"שרה לוי",shared:true,ownerId:"t1"},
  {id:"m2",subject:"אזרחות",grade:"ט׳",title:"זכויות אדם ואזרח בישראל",
   content:"הצהרת העצמאות, חוקי יסוד, זכות לשוויון, חופש ביטוי.",
   keywords:["זכויות יסוד","שוויון","חופש ביטוי"],templates:["הזכות המתאימה היא... משום ש..."],
   author:"רנה בן דוד",shared:true,ownerId:"t2"},
  {id:"m3",subject:"ספרות",grade:"י׳",title:"לי ולך — לאה גולדברג",
   content:"שיר אהבה ופרידה. ניתוח: דובר, מוטיב, אמצעים אמנותיים, מסר.",
   keywords:["דובר","מוטיב","אמצעי אמנותי","מסר"],templates:["המשורר/ת מדגיש/ה..."],
   author:"דוד כהן",shared:true,ownerId:"t3"},
  {id:"m4",subject:"תנ\"ך",grade:"ח׳",title:"סיפור יוסף ואחיו",
   content:"גלגולי הסיפור, יחסי אחים, נושאים: קנאה, בגידה, סליחה.",
   keywords:["יוסף","קנאה","סליחה","בגידה"],templates:["מהפסוק עולה כי..."],
   author:"אבי שטרן",shared:true,ownerId:"t4"},
];

function genCode(){return Math.random().toString(36).substring(2,8).toUpperCase();}

function buildSP(unit,langPair){
  const sec=langPair?.secondary==="ru"?"רוסית":"אנגלית";
  const sl=SUPPORT_LEVELS.find(s=>s.id===unit?.supportLevel)||SUPPORT_LEVELS[0];
  return `אתה בוט לימודי סוקרטי לעולים חדשים. שמך: "מורה-בוט".
שפת יעד: עברית. שפת תיווך: ${sec}. רמת תמיכה: ${sl.label} — ${sl.desc}
יחידה: ${unit?.title||""} | מקצוע: ${unit?.subject||""} | כיתה: ${unit?.grade||""}
שאלה: ${unit?.question||""}
מילות מפתח: ${unit?.keywords?.join(", ")||""} | תבניות: ${unit?.templates?.join(" | ")||""}
רמזים: ${unit?.hintPolicy==="unlimited"?"ללא הגבלה":"עד "+unit?.hintPolicy}

## כללים מחייבים:
1. אסור למסור תשובה מלאה לשאלת הלמידה.
2. "כתוב לי" → החזר לתבנית/רמז/שאלת מיקוד.
3. אל תשלים פסקה שלמה לפני שהתלמיד ניסה.
4. חזק ניסוח עצמאי גם אם יש שגיאות.
## מדרג עזרה: שאלת מיקוד → פירוק משימה → שליפה מודרכת → רמז חלקי → תבנית ניסוח → משוב → שכתוב מונחה
## פורמט: סמן [רמז:] [תבנית:] [משוב:] | עד 4 משפטים לתגובה | טון חם וסבלני.`;
}

async function callClaude(messages,sys){
  const r=await fetch("https://api.anthropic.com/v1/messages",{
    method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:1000,system:sys,messages})
  });
  const d=await r.json();
  if(d.error)throw new Error(d.error.message);
  return d.content?.[0]?.text||"";
}

function parseBotMsg(text){
  const parts=[];
  for(const line of text.split("\n")){
    if(line.includes("[רמז:"))parts.push({type:"hint",content:line.replace(/\[רמז[:\]]/g,"").replace(/\]$/,"").trim()});
    else if(line.includes("[תבנית:"))parts.push({type:"tmpl",content:line.replace(/\[תבנית[:\]]/g,"").replace(/\]$/,"").trim()});
    else if(line.includes("[משוב:"))parts.push({type:"fb",content:line.replace(/\[משוב[:\]]/g,"").replace(/\]$/,"").trim()});
    else if(line.trim())parts.push({type:"text",content:line});
  }
  return parts.length?parts:[{type:"text",content:text}];
}

function BotMsg({text}){
  const parts=parseBotMsg(text);
  return(<div>{parts.map((p,i)=>{
    if(p.type==="hint")return<div key={i} style={hintS}>💡 {p.content}</div>;
    if(p.type==="tmpl")return<div key={i} style={tmplS}>📝 {p.content}</div>;
    if(p.type==="fb")return<div key={i} style={fbS}>✅ {p.content}</div>;
    return<p key={i} style={{whiteSpace:"pre-wrap"}}>{p.content}</p>;
  })}</div>);
}

// ============================================================
// STYLES (inline objects for portability)
// ============================================================
const C={bg:"#0f1923",bg2:"#162030",bg3:"#1d2d40",bg4:"#243550",border:"#2a3f5a",
  teal:"#2dd4bf",teal2:"#14b8a6",amber:"#f59e0b",amber2:"#d97706",rose:"#f43f5e",
  violet:"#8b5cf6",text:"#e2e8f0",text2:"#94a3b8",text3:"#64748b",success:"#10b981"};

const hintS={background:"rgba(245,158,11,.08)",border:"1px solid rgba(245,158,11,.2)",borderRadius:8,padding:"8px 12px",fontSize:".82rem",color:C.amber,marginTop:4};
const tmplS={background:"rgba(139,92,246,.08)",border:"1px solid rgba(139,92,246,.2)",borderRadius:8,padding:"8px 12px",fontSize:".82rem",color:C.violet,fontStyle:"italic",marginTop:4};
const fbS={background:"rgba(16,185,129,.08)",border:"1px solid rgba(16,185,129,.2)",borderRadius:8,padding:"8px 12px",fontSize:".82rem",color:C.success,marginTop:4};

const CSS=`
@import url('https://fonts.googleapis.com/css2?family=Rubik:wght@300;400;500;600;700&family=JetBrains+Mono:wght@500&display=swap');
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
:root{--bg:#0f1923;--bg2:#162030;--bg3:#1d2d40;--bg4:#243550;--border:#2a3f5a;
  --teal:#2dd4bf;--teal2:#14b8a6;--amber:#f59e0b;--amber2:#d97706;--rose:#f43f5e;
  --violet:#8b5cf6;--tx:#e2e8f0;--tx2:#94a3b8;--tx3:#64748b;--ok:#10b981;
  --fn:'Rubik',sans-serif;--r:12px;--r2:8px;}
body{background:var(--bg);color:var(--tx);font-family:var(--fn);direction:rtl;min-height:100vh;}
::-webkit-scrollbar{width:5px;}::-webkit-scrollbar-track{background:var(--bg2);}
::-webkit-scrollbar-thumb{background:var(--border);border-radius:3px;}
::-webkit-scrollbar-thumb:hover{background:var(--teal);}
.app{min-height:100vh;display:flex;flex-direction:column;}
.topbar{background:var(--bg2);border-bottom:1px solid var(--border);padding:0 20px;height:56px;
  display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;z-index:100;gap:10px;}
.logo{display:flex;align-items:center;gap:8px;font-weight:700;font-size:1.05rem;color:var(--teal);cursor:pointer;white-space:nowrap;}
.logo em{color:var(--amber);font-style:normal;}
.topbar-r{display:flex;align-items:center;gap:8px;flex-wrap:wrap;}
.ml{display:flex;flex:1;min-height:calc(100vh - 56px);}
.sb{width:230px;background:var(--bg2);border-left:1px solid var(--border);padding:14px 0;flex-shrink:0;overflow-y:auto;}
.sb-lbl{font-size:.67rem;font-weight:700;color:var(--tx3);letter-spacing:.1em;text-transform:uppercase;padding:7px 16px 3px;}
.sb-i{display:flex;align-items:center;gap:9px;padding:9px 16px;cursor:pointer;font-size:.85rem;color:var(--tx2);
  border-right:3px solid transparent;transition:all .14s;}
.sb-i:hover{background:var(--bg3);color:var(--tx);}
.sb-i.on{background:rgba(45,212,191,.08);color:var(--teal);border-right-color:var(--teal);font-weight:600;}
.cnt{flex:1;overflow-y:auto;}.ci{padding:22px;max-width:920px;}
.btn{display:inline-flex;align-items:center;gap:7px;padding:8px 17px;border-radius:var(--r2);
  font-family:var(--fn);font-size:.87rem;font-weight:600;cursor:pointer;border:none;transition:all .17s;}
.bp{background:var(--teal);color:var(--bg);}.bp:hover{background:var(--teal2);transform:translateY(-1px);}
.bs{background:var(--bg3);color:var(--tx);border:1px solid var(--border);}.bs:hover{border-color:var(--teal);color:var(--teal);}
.ba{background:var(--amber);color:var(--bg);}.ba:hover{background:var(--amber2);}
.bg{background:transparent;color:var(--tx2);border:1px solid transparent;}.bg:hover{color:var(--tx);border-color:var(--border);}
.bd{background:rgba(244,63,94,.12);color:var(--rose);border:1px solid rgba(244,63,94,.25);}.bd:hover{background:var(--rose);color:#fff;}
.sm{padding:5px 12px;font-size:.79rem;}.xs{padding:3px 9px;font-size:.73rem;}
.btn:disabled{opacity:.4;cursor:not-allowed;transform:none;}.wf{width:100%;justify-content:center;}
.fg{margin-bottom:13px;}.fl{display:block;font-size:.79rem;font-weight:600;color:var(--tx2);margin-bottom:5px;}
.fc{width:100%;background:var(--bg3);border:1px solid var(--border);border-radius:var(--r2);
  padding:9px 13px;color:var(--tx);font-family:var(--fn);font-size:.87rem;transition:border-color .14s;direction:rtl;}
.fc:focus{outline:none;border-color:var(--teal);}
textarea.fc{resize:vertical;min-height:88px;line-height:1.6;}
.card{background:var(--bg2);border:1px solid var(--border);border-radius:var(--r);padding:17px;}
.card-t{font-size:.94rem;font-weight:600;}
.g2{display:grid;grid-template-columns:1fr 1fr;gap:13px;}
.g3{display:grid;grid-template-columns:repeat(3,1fr);gap:13px;}
.tag{display:inline-flex;align-items:center;padding:2px 9px;border-radius:20px;font-size:.71rem;font-weight:600;}
.tg{background:rgba(45,212,191,.14);color:var(--teal);}
.ta{background:rgba(245,158,11,.14);color:var(--amber);}
.tv{background:rgba(139,92,246,.14);color:var(--violet);}
.ts{background:rgba(16,185,129,.14);color:var(--ok);}
.tr{background:rgba(244,63,94,.14);color:var(--rose);}
.ai{background:rgba(45,212,191,.07);border:1px solid rgba(45,212,191,.2);color:var(--teal);}
.aw{background:rgba(245,158,11,.07);border:1px solid rgba(245,158,11,.2);color:var(--amber);}
.ar{background:rgba(244,63,94,.07);border:1px solid rgba(244,63,94,.2);color:var(--rose);}
.alrt{padding:10px 14px;border-radius:var(--r2);font-size:.84rem;margin-bottom:12px;}
hr.dv{border:none;border-top:1px solid var(--border);margin:16px 0;}
.stat-c{background:var(--bg2);border:1px solid var(--border);border-radius:var(--r);padding:17px;}
.stat-n{font-size:1.85rem;font-weight:700;color:var(--teal);line-height:1;}
.stat-l{font-size:.79rem;color:var(--tx2);margin-top:3px;}
.pb{background:var(--bg3);border-radius:4px;height:5px;overflow:hidden;margin-top:5px;}
.pf{height:100%;border-radius:4px;background:linear-gradient(90deg,var(--teal),var(--teal2));transition:width .6s ease;}
.land{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;
  padding:40px 16px;text-align:center;position:relative;overflow:hidden;}
.land::before{content:'';position:absolute;inset:0;background:radial-gradient(ellipse 80% 60% at 50% 0%,rgba(45,212,191,.08) 0%,transparent 70%);pointer-events:none;}
.lbadge{background:rgba(45,212,191,.1);border:1px solid rgba(45,212,191,.3);color:var(--teal);
  padding:5px 15px;border-radius:20px;font-size:.77rem;font-weight:600;margin-bottom:17px;display:inline-block;}
.ltitle{font-size:clamp(1.75rem,5vw,3rem);font-weight:700;line-height:1.2;margin-bottom:13px;}
.ac{color:var(--teal);}.ac2{color:var(--amber);}
.lsub{font-size:.98rem;color:var(--tx2);max-width:510px;line-height:1.7;margin-bottom:32px;}
.rcs{display:flex;gap:16px;flex-wrap:wrap;justify-content:center;margin-bottom:36px;}
.rc{background:var(--bg2);border:1px solid var(--border);border-radius:var(--r);padding:24px 26px;
  width:190px;cursor:pointer;transition:all .2s;}
.rc:hover{transform:translateY(-3px);box-shadow:0 4px 24px rgba(0,0,0,.4);}
.rc.t:hover{border-color:var(--teal);}.rc.s:hover{border-color:var(--amber);}.rc.a:hover{border-color:var(--violet);}
.ri{font-size:2.1rem;margin-bottom:9px;}.rt{font-size:.98rem;font-weight:700;margin-bottom:4px;}
.rd{font-size:.79rem;color:var(--tx2);line-height:1.5;}
.lbtn{background:var(--bg3);border:1px solid var(--border);color:var(--tx2);padding:7px 16px;
  border-radius:30px;cursor:pointer;font-family:var(--fn);font-size:.84rem;transition:all .17s;
  display:flex;align-items:center;gap:6px;}
.lbtn:hover,.lbtn.act{background:var(--teal);border-color:var(--teal);color:var(--bg);font-weight:600;}
.feats{display:flex;gap:16px;color:var(--tx3);font-size:.77rem;flex-wrap:wrap;justify-content:center;}
.aw-wrap{min-height:calc(100vh - 56px);display:flex;flex-direction:column;align-items:center;
  justify-content:center;padding:26px 14px;position:relative;}
.aw-wrap::before{content:'';position:absolute;inset:0;background:radial-gradient(ellipse 70% 50% at 50% 0%,rgba(45,212,191,.06) 0%,transparent 70%);pointer-events:none;}
.abox{background:var(--bg2);border:1px solid var(--border);border-radius:var(--r);padding:30px 26px;
  width:100%;max-width:410px;box-shadow:0 4px 24px rgba(0,0,0,.4);position:relative;z-index:1;}
.abox.wide{max-width:540px;}
.ai-c{font-size:2.7rem;text-align:center;margin-bottom:10px;}
.at{font-size:1.38rem;font-weight:700;text-align:center;margin-bottom:3px;}
.as{font-size:.84rem;color:var(--tx2);text-align:center;margin-bottom:22px;}
.cc{background:rgba(45,212,191,.08);border:2px solid var(--teal);border-radius:10px;
  padding:7px 18px;font-family:'JetBrains Mono',monospace;font-weight:700;font-size:1.35rem;
  color:var(--teal);letter-spacing:.18em;display:inline-block;text-align:center;}
.chat-w{display:flex;flex-direction:column;height:calc(100vh - 56px);}
.chat-tb{background:var(--bg3);border-bottom:1px solid var(--border);padding:10px 16px;
  display:flex;align-items:center;gap:9px;flex-wrap:wrap;}
.chat-ms{flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:13px;}
.msg{max-width:80%;display:flex;flex-direction:column;gap:3px;animation:mi .22s ease;}
@keyframes mi{from{opacity:0;transform:translateY(7px)}to{opacity:1;transform:translateY(0)}}
.mb{align-self:flex-start;}.mu{align-self:flex-end;}
.mb .bbl{background:var(--bg3);border:1px solid var(--border);border-bottom-right-radius:3px;}
.mu .bbl{background:rgba(45,212,191,.12);border:1px solid rgba(45,212,191,.25);border-bottom-left-radius:3px;}
.bbl{padding:10px 14px;border-radius:var(--r);line-height:1.7;font-size:.89rem;}
.mlbl{font-size:.69rem;color:var(--tx3);padding:0 4px;}
.typing{display:flex;gap:5px;align-items:center;padding:12px 14px;}
.td{width:7px;height:7px;background:var(--teal);border-radius:50%;animation:bo 1.2s ease infinite;}
.td:nth-child(2){animation-delay:.2s;}.td:nth-child(3){animation-delay:.4s;}
@keyframes bo{0%,60%,100%{transform:translateY(0)}30%{transform:translateY(-6px)}}
.wp{background:var(--bg2);border-top:1px solid var(--border);padding:13px 16px;}
.wt{display:flex;align-items:center;justify-content:space-between;margin-bottom:7px;}
.wl{font-size:.77rem;font-weight:600;color:var(--tx2);}
.hc{font-size:.72rem;color:var(--tx3);}
.hc b{color:var(--amber);}
.wi{width:100%;background:var(--bg3);border:1px solid var(--border);border-radius:var(--r2);
  padding:10px 13px;color:var(--tx);font-family:var(--fn);font-size:.89rem;line-height:1.6;
  direction:rtl;resize:none;transition:border-color .14s;}
.wi:focus{outline:none;border-color:var(--teal);}
.wa{display:flex;gap:8px;margin-top:8px;flex-wrap:wrap;}
.hbtn{background:rgba(245,158,11,.1);border:1px solid rgba(245,158,11,.27);color:var(--amber);
  padding:6px 12px;border-radius:var(--r2);cursor:pointer;font-size:.79rem;font-family:var(--fn);
  font-weight:600;transition:all .14s;}
.hbtn:hover{background:rgba(245,158,11,.2);}.hbtn:disabled{opacity:.35;cursor:not-allowed;}
.ph{margin-bottom:20px;}.ph-t{font-size:1.38rem;font-weight:700;margin-bottom:4px;}.ph-s{color:var(--tx2);font-size:.87rem;}
.ui{display:flex;align-items:center;gap:10px;padding:12px 14px;background:var(--bg2);
  border:1px solid var(--border);border-radius:var(--r2);margin-bottom:7px;cursor:pointer;transition:all .14s;}
.ui:hover{border-color:var(--teal);}
.mc{background:var(--bg2);border:1px solid var(--border);border-radius:var(--r);padding:14px 17px;margin-bottom:8px;cursor:pointer;transition:all .17s;}
.mc:hover{border-color:var(--teal);}.mc.sel{border-color:var(--teal);background:rgba(45,212,191,.04);}
.tc{background:var(--bg2);border:1px solid var(--border);border-radius:var(--r);padding:17px;margin-bottom:10px;cursor:pointer;transition:all .17s;}
.tc:hover{border-color:var(--amber);transform:translateY(-2px);}
.ov{position:fixed;inset:0;background:rgba(0,0,0,.72);z-index:200;display:flex;
  align-items:center;justify-content:center;padding:14px;}
.mo{background:var(--bg2);border:1px solid var(--border);border-radius:var(--r);padding:24px;
  width:100%;max-width:510px;max-height:90vh;overflow-y:auto;box-shadow:0 4px 24px rgba(0,0,0,.4);animation:moI .2s ease;}
.mo.wide{max-width:660px;}
@keyframes moI{from{opacity:0;transform:scale(.95)}to{opacity:1;transform:scale(1)}}
.mo-t{font-size:1.12rem;font-weight:700;margin-bottom:17px;}
.at{width:100%;border-collapse:collapse;}
.at th{background:var(--bg3);padding:8px 13px;font-size:.77rem;color:var(--tx2);font-weight:600;text-align:right;border-bottom:1px solid var(--border);}
.at td{padding:8px 13px;font-size:.84rem;border-bottom:1px solid rgba(42,63,90,.4);}
.at tr:hover td{background:rgba(45,212,191,.03);}
.upill{display:flex;align-items:center;gap:7px;background:var(--bg3);border:1px solid var(--border);border-radius:20px;padding:4px 12px;font-size:.79rem;}
.copy{position:fixed;bottom:10px;left:0;right:0;text-align:center;font-size:.67rem;color:var(--tx3);z-index:50;}
.lvl-bar{display:flex;gap:5px;margin-top:7px;}
.ls{flex:1;height:4px;border-radius:3px;background:var(--bg4);}
.ls.on{background:var(--teal);}
.gs{font-size:.87rem;font-weight:700;color:var(--teal);margin-bottom:11px;display:flex;align-items:center;gap:7px;}
.gstep{display:flex;gap:11px;margin-bottom:9px;align-items:flex-start;}
.gnum{background:var(--teal);color:var(--bg);width:23px;height:23px;border-radius:50%;
  display:flex;align-items:center;justify-content:center;font-size:.76rem;font-weight:700;flex-shrink:0;margin-top:1px;}
.gt{font-size:.86rem;color:var(--tx2);line-height:1.6;}
@media(max-width:768px){
  .g2,.g3{grid-template-columns:1fr;}
  .sb{display:none;position:fixed;top:56px;right:0;bottom:0;z-index:150;width:240px;box-shadow:-4px 0 24px rgba(0,0,0,.5);}
  .sb.mob-open{display:flex;flex-direction:column;}
  .mob-overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:140;}
  .mob-overlay.show{display:block;}
  .ml{flex-direction:column;}
  .ci{padding:12px;}.rcs{flex-direction:column;align-items:center;}
  .rc{width:100%;max-width:300px;}.topbar{padding:0 10px;}
  .msg{max-width:95%;}.abox{padding:20px 14px;}
  .feats{gap:9px;}.wa{gap:5px;}
  .chat-tb{flex-direction:column;align-items:flex-start;gap:5px;}
  .mob-nav{display:flex;background:var(--bg2);border-top:1px solid var(--border);height:54px;position:fixed;bottom:0;left:0;right:0;z-index:120;}
  .mob-nav-i{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;cursor:pointer;font-size:.62rem;color:var(--tx3);transition:color .14s;}
  .mob-nav-i.on{color:var(--teal);}.mob-nav-i span:first-child{font-size:1.15rem;}
  .hbg{background:transparent;border:none;cursor:pointer;color:var(--tx2);font-size:1.3rem;padding:6px;display:flex;align-items:center;}
  .has-mob-nav .cnt{padding-bottom:60px;}
}
@media(min-width:769px){.mob-nav{display:none;}.hbg{display:none;}.mob-overlay{display:none!important;}}
@media(max-width:480px){.ltitle{font-size:1.5rem;}.lsub{font-size:.88rem;}}
`;

// ============================================================
// USER GUIDE
// ============================================================
function UserGuide({onClose}){
  return(
    <div className="ov" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="mo wide">
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18}}>
          <div style={{fontSize:"1.28rem",fontWeight:700}}>📖 מדריך למשתמש</div>
          <button className="btn bg sm" onClick={onClose}>✕</button>
        </div>
        <div style={{marginBottom:22}}>
          <div className="gs">🎓 מה זה בוט לימוד?</div>
          <p style={{fontSize:".86rem",color:"var(--tx2)",lineHeight:1.7}}>
            מערכת פדגוגית לתלמידים עולים לקראת בגרות. הבוט מנחה בשיטה <strong>סוקרטית</strong> — שואל שאלות, נותן רמזים, ומעודד לכתוב בעברית. <strong>הבוט לא כותב בשבילך.</strong>
          </p>
        </div>
        <div style={{marginBottom:22}}>
          <div className="gs">👩‍🏫 כניסת מורה</div>
          {["הכנס שם, מקצוע, שכבה וסמל מוסד (6 ספרות).","פתח כיתה חדשה וקבל קוד — שתף עם תלמידיך.","העלה חומרי לימוד ובחר אם לשתף עם הצוות.","צור יחידות לימוד עם שאלה, סוג משימה ורמת תמיכה.","עקוב אחר התקדמות תלמידים בלוח הבקרה."]
            .map((t,i)=><div key={i} className="gstep"><div className="gnum">{i+1}</div><div className="gt">{t}</div></div>)}
        </div>
        <div style={{marginBottom:22}}>
          <div className="gs">🎒 כניסת תלמיד</div>
          {["הכנס שם, כיתה וקוד שקיבלת מהמורה.","בחר משימה מהרשימה ולחץ 'התחל שיעור'.","כתוב תשובתך בעברית בתיבת הכתיבה.","אם תקוע — בקש רמז (מספר מוגבל!).","קבל משוב מהבוט ושכתב עד שתהיה מרוצה."]
            .map((t,i)=><div key={i} className="gstep"><div className="gnum">{i+1}</div><div className="gt">{t}</div></div>)}
        </div>
        <div style={{marginBottom:18}}>
          <div className="gs">🔑 קודי דמו לבדיקה</div>
          <div style={{display:"flex",gap:9,flexWrap:"wrap"}}>
            {defaultClasses.map(c=>(
              <div key={c.code} style={{background:"var(--bg3)",border:"1px solid var(--border)",borderRadius:8,padding:"8px 13px",textAlign:"center"}}>
                <div className="cc" style={{fontSize:".9rem",padding:"3px 11px"}}>{c.code}</div>
                <div style={{fontSize:".7rem",color:"var(--tx3)",marginTop:4}}>{c.subject} {c.grade}</div>
              </div>
            ))}
          </div>
        </div>
        <div style={{marginBottom:18}}>
          <div className="gs">🔒 אבטחת מידע</div>
          <p style={{fontSize:".84rem",color:"var(--tx2)",lineHeight:1.7}}>כל בית ספר מנוהל בנפרד לפי סמל המוסד. מורה מבית ספר A אינו יכול לראות נתוני בית ספר B. מנהל המערכת רואה סטטיסטיקות כלליות בלבד.</p>
        </div>
        <button className="btn bp wf" onClick={onClose}>הבנתי — סגור מדריך</button>
        <div style={{textAlign:"center",fontSize:".68rem",color:"var(--tx3)",marginTop:10}}>© כל הזכויות שמורות לשוורץ אבי</div>
      </div>
    </div>
  );
}

// ============================================================
// ADMIN LOGIN & PANEL
// ============================================================
function AdminLogin({onLogin,onBack}){
  const [email,setEmail]=useState("");
  const [pass,setPass]=useState("");
  const [err,setErr]=useState("");
  const go=()=>{
    if(email.trim()!==ADMIN_EMAIL){setErr("כתובת מייל שגויה");return;}
    if(simpleHash(pass)!==ADMIN_HASH){setErr("סיסמא שגויה");return;}
    setErr("");onLogin();
  };
  return(
    <div className="aw-wrap">
      <div className="abox">
        <div className="ai-c">🛡️</div>
        <div className="at" style={{fontSize:"1.38rem",fontWeight:700,textAlign:"center",marginBottom:3}}>כניסת מנהל מערכת</div>
        <div className="as">גישה לניהול כלל המוסדות</div>
        <div className="fg"><label className="fl">מייל</label><input className="fc" type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="admin@example.com" style={{direction:"ltr"}}/></div>
        <div className="fg"><label className="fl">סיסמא</label><input className="fc" type="password" value={pass} onChange={e=>setPass(e.target.value)} placeholder="••••••••" style={{direction:"ltr"}} onKeyDown={e=>e.key==="Enter"&&go()}/></div>
        {err&&<div className="alrt ar">{err}</div>}
        <button className="btn bp wf" onClick={go}>כניסה →</button>
        <button className="btn bg wf" style={{marginTop:8}} onClick={onBack}>← חזרה</button>
      </div>
      <div className="copy">© כל הזכויות שמורות לשוורץ אבי</div>
    </div>
  );
}

function AdminPanel({onLogout}){
  const [tab,setTab]=useState("schools");
  const [schools,setSchools]=useState(defaultInstitutions);
  const [showAdd,setShowAdd]=useState(false);
  const [nSch,setNSch]=useState({code:"",name:"",city:""});
  const [err,setErr]=useState("");
  const [mobSB,setMobSB]=useState(false);

  // Persist institutions in DB
  useEffect(()=>{ DB.getInstitutions().then(d=>{if(d?.length)setSchools(d);}); },[]);
  useEffect(()=>{ DB.setInstitutions(schools); },[schools]);

  const addSchool=()=>{
    if(!nSch.code||!nSch.name){setErr("שדות חובה: קוד ושם");return;}
    if(schools.find(s=>s.code===nSch.code)){setErr("קוד מוסד כבר קיים");return;}
    setSchools(p=>[...p,{...nSch,active:true}]);setNSch({code:"",name:"",city:""});setShowAdd(false);setErr("");
  };

  const NAV=[{id:"schools",icon:"🏫",l:"מוסדות"},{id:"stats",icon:"📊",l:"סטטיסטיקות"},{id:"sec",icon:"🔒",l:"אבטחה"}];
  const SB=()=>(
    <>
      <div style={{padding:"12px 16px 8px",borderBottom:"1px solid var(--border)",marginBottom:8}}>
        <div style={{fontWeight:700,color:"var(--violet)"}}>🛡️ מנהל מערכת</div>
        <div style={{fontSize:".7rem",color:"var(--tx3)"}}>שוורץ אבי · {DB_BACKEND} DB</div>
      </div>
      {NAV.map(i=><div key={i.id} className={`sb-i${tab===i.id?" on":""}`} onClick={()=>{setTab(i.id);setMobSB(false);}}><span>{i.icon}</span>{i.l}</div>)}
      <hr className="dv" style={{margin:"10px 0"}}/>
      <div className="sb-i" onClick={onLogout}><span>🚪</span>התנתקות</div>
    </>
  );
  return(
    <div className="ml has-mob-nav">
      <div className="sb"><SB/></div>
      <div className={`mob-overlay${mobSB?" show":""}`} onClick={()=>setMobSB(false)}/>
      <div className={`sb${mobSB?" mob-open":""}`}><SB/></div>
      <div className="cnt">
        <div style={{display:"flex",alignItems:"center",padding:"10px 14px 0",gap:8}} className="mob-hdr">
          <button className="hbg" onClick={()=>setMobSB(v=>!v)}>☰</button>
          <span style={{fontWeight:600,fontSize:".9rem",color:"var(--violet)"}}>{NAV.find(n=>n.id===tab)?.l}</span>
        </div>
        <div className="ci">
          {tab==="schools"&&(
            <>
              <div className="ph">
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:9}}>
                  <div><div className="ph-t">🏫 ניהול מוסדות</div><div className="ph-s">נשמר ב-DB אוטומטית</div></div>
                  <button className="btn bp sm" onClick={()=>setShowAdd(true)}>➕ הוסף מוסד</button>
                </div>
              </div>
              <div className="alrt ai">🔒 כל בי"ס מבודד. מפתח: <code style={{fontFamily:"monospace"}}>inst:{"{קוד}"}:*</code></div>
              <div className="card" style={{overflowX:"auto"}}>
                <table className="at">
                  <thead><tr><th>סמל מוסד</th><th>שם</th><th>עיר</th><th>סטטוס</th><th>פעולות</th></tr></thead>
                  <tbody>
                    {schools.map(s=>(
                      <tr key={s.code}>
                        <td><span className="cc" style={{fontSize:".78rem",padding:"2px 9px"}}>{s.code}</span></td>
                        <td style={{fontWeight:600}}>{s.name}</td>
                        <td style={{color:"var(--tx2)"}}>{s.city}</td>
                        <td><span className={`tag ${s.active?"ts":"tr"}`}>{s.active?"פעיל":"מושהה"}</span></td>
                        <td><button className={`btn xs ${s.active?"bd":"bs"}`}
                          onClick={()=>setSchools(p=>p.map(x=>x.code===s.code?{...x,active:!x.active}:x))}>
                          {s.active?"השהה":"הפעל"}</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          {tab==="stats"&&(
            <>
              <div className="ph"><div className="ph-t">📊 סטטיסטיקות מערכת</div></div>
              <div className="g3" style={{marginBottom:18}}>
                {[{n:schools.length,l:"מוסדות רשומים",i:"🏫",c:"var(--teal)"},
                  {n:schools.filter(s=>s.active).length,l:"מוסדות פעילים",i:"✅",c:"var(--ok)"},
                  {n:defaultClasses.length,l:"כיתות פתוחות",i:"🎓",c:"var(--amber)"}]
                  .map((s,i)=><div key={i} className="stat-c"><div style={{fontSize:"1.3rem",marginBottom:4}}>{s.i}</div><div className="stat-n" style={{color:s.c}}>{s.n}</div><div className="stat-l">{s.l}</div></div>)}
              </div>
              <div className="alrt aw">נתוני שימוש מלאים יהיו זמינים לאחר חיבור ל-Neon / Supabase.</div>
            </>
          )}
          {tab==="sec"&&(
            <>
              <div className="ph"><div className="ph-t">🔒 מדיניות אבטחה</div></div>
              {[{icon:"🗄️",t:"DB Backend נוכחי",d:`"${DB_BACKEND}" — לשינוי: עדכן DB_BACKEND בשורה 1 של הקוד ל-"neon" / "supabase"`},
                {icon:"🏫",t:"בידוד מוסדי",d:`כל בי"ס מנוהל בנפרד. מפתח: inst:{קוד}:* — גישה צולבת חסומה ב-code.`},
                {icon:"👤",t:"הרשאות תפקיד",d:"מנהל ← מורה ← תלמיד. כל תפקיד רואה רק את הנתונים שלו."},
                {icon:"🔐",t:"ניהול סיסמאות",d:"סיסמאות מאוחסנות כ-hash. לפני הפצה: החלף ל-bcrypt + HTTPS."},
                {icon:"🚫",t:"חסימת גישה",d:"בפריסה אמיתית — הוסף Row Level Security ב-DB (ראה deployment guide)."}]
                .map((item,i)=>(
                  <div key={i} style={{background:"var(--bg2)",border:"1px solid var(--border)",borderRadius:"var(--r)",padding:"13px 17px",marginBottom:8,display:"flex",gap:11}}>
                    <span style={{fontSize:"1.4rem"}}>{item.icon}</span>
                    <div><div style={{fontWeight:600,marginBottom:2}}>{item.t}</div><div style={{fontSize:".82rem",color:"var(--tx2)"}}>{item.d}</div></div>
                  </div>
                ))}
            </>
          )}
        </div>
      </div>

      {/* Mobile bottom nav */}
      <div className="mob-nav">
        {NAV.map(i=>(
          <div key={i.id} className={`mob-nav-i${tab===i.id?" on":""}`} onClick={()=>setTab(i.id)}>
            <span>{i.icon}</span><span>{i.l}</span>
          </div>
        ))}
        <div className="mob-nav-i" onClick={onLogout}><span>🚪</span><span>יציאה</span></div>
      </div>

      {showAdd&&(
        <div className="ov" onClick={e=>e.target===e.currentTarget&&setShowAdd(false)}>
          <div className="mo">
            <div className="mo-t">➕ הוספת מוסד חדש</div>
            <div className="fg"><label className="fl">סמל מוסד (6 ספרות)</label><input className="fc" value={nSch.code} onChange={e=>setNSch(p=>({...p,code:e.target.value}))} maxLength={6} placeholder="123456"/></div>
            <div className="fg"><label className="fl">שם בית הספר</label><input className="fc" value={nSch.name} onChange={e=>setNSch(p=>({...p,name:e.target.value}))} placeholder="בית ספר..."/></div>
            <div className="fg"><label className="fl">עיר</label><input className="fc" value={nSch.city} onChange={e=>setNSch(p=>({...p,city:e.target.value}))} placeholder="עיר..."/></div>
            {err&&<div className="alrt ar">{err}</div>}
            <div style={{display:"flex",gap:9,marginTop:16}}>
              <button className="btn bp" onClick={addSchool}>הוסף</button>
              <button className="btn bs" onClick={()=>{setShowAdd(false);setErr("");}}>ביטול</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// TEACHER LOGIN
// ============================================================
function TeacherLogin({onLogin,onBack}){
  const [form,setForm]=useState({name:"",subject:SUBJECTS[0],grade:GRADES[3],institutionCode:""});
  const [classes,setClasses]=useState([...defaultClasses]);
  const [newCode,setNewCode]=useState(null);
  const [err,setErr]=useState("");
  const [step,setStep]=useState("login");
  const go=()=>{
    if(!form.name.trim()||form.institutionCode.length<4){setErr("נא למלא שם וסמל מוסד (לפחות 4 ספרות)");return;}
    if(!defaultInstitutions.find(i=>i.code===form.institutionCode)){setErr("סמל מוסד לא קיים. פנה למנהל המערכת.");return;}
    setErr("");setStep("dash");
  };
  const openClass=()=>{
    const code=genCode();
    setClasses(p=>[...p,{code,subject:form.subject,grade:form.grade,teacherName:form.name,institutionCode:form.institutionCode}]);
    setNewCode(code);
  };
  if(step==="login")return(
    <div className="aw-wrap">
      <div className="abox">
        <div className="ai-c">👩‍🏫</div>
        <div className="at" style={{fontSize:"1.38rem",fontWeight:700,textAlign:"center",marginBottom:3}}>כניסת מורה</div>
        <div className="as">מלא את פרטיך להמשך</div>
        <div className="fg"><label className="fl">שם מלא</label><input className="fc" value={form.name} onChange={e=>setForm(p=>({...p,name:e.target.value}))} placeholder="שרה לוי"/></div>
        <div className="g2">
          <div className="fg"><label className="fl">מקצוע</label><select className="fc" value={form.subject} onChange={e=>setForm(p=>({...p,subject:e.target.value}))}>{SUBJECTS.map(s=><option key={s}>{s}</option>)}</select></div>
          <div className="fg"><label className="fl">שכבה</label><select className="fc" value={form.grade} onChange={e=>setForm(p=>({...p,grade:e.target.value}))}>{GRADES.map(g=><option key={g}>{g}</option>)}</select></div>
        </div>
        <div className="fg"><label className="fl">סמל מוסד</label><input className="fc" value={form.institutionCode} onChange={e=>setForm(p=>({...p,institutionCode:e.target.value}))} placeholder="123456 לדמו" maxLength={6}/>
          <div style={{fontSize:".7rem",color:"var(--tx3)",marginTop:3}}>קודי דמו: 123456 · 789012</div></div>
        {err&&<div className="alrt ar">{err}</div>}
        <button className="btn bp wf" onClick={go}>כניסה →</button>
        <button className="btn bg wf" style={{marginTop:8}} onClick={onBack}>← חזרה</button>
      </div>
      <div className="copy">© כל הזכויות שמורות לשוורץ אבי</div>
    </div>
  );
  const myClasses=classes.filter(c=>c.institutionCode===form.institutionCode);
  return(
    <div className="aw-wrap">
      <div className="abox wide">
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:16,flexWrap:"wrap",gap:8}}>
          <div>
            <div style={{fontSize:"1.18rem",fontWeight:700}}>שלום, {form.name} 👋</div>
            <div style={{fontSize:".8rem",color:"var(--tx2)",marginTop:3}}><span className="tag tg">{form.subject}</span>&nbsp;<span className="tag ta">כיתה {form.grade}</span>&nbsp;<span style={{color:"var(--tx3)"}}>מוסד: {form.institutionCode}</span></div>
          </div>
          <span style={{fontSize:"2.3rem"}}>👩‍🏫</span>
        </div>
        <hr className="dv"/>
        <div style={{marginBottom:16}}>
          <div className="card-t" style={{marginBottom:11}}>🏫 הכיתות שלי</div>
          {myClasses.length===0?<div style={{color:"var(--tx3)",fontSize:".83rem",padding:"8px 0"}}>אין כיתות פתוחות עדיין</div>
            :myClasses.map(c=>(
              <div key={c.code} style={{background:"var(--bg3)",border:"1px solid var(--border)",borderRadius:"var(--r2)",padding:"10px 14px",display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:7,flexWrap:"wrap",gap:8}}>
                <div><div style={{fontWeight:600,fontSize:".88rem"}}>{c.subject} · כיתה {c.grade}</div><div style={{fontSize:".72rem",color:"var(--tx3)"}}>מורה: {c.teacherName}</div></div>
                <div style={{textAlign:"center"}}>
                  <div style={{fontSize:".66rem",color:"var(--tx2)",marginBottom:3}}>קוד לתלמידים</div>
                  <div className="cc">{c.code}</div>
                </div>
              </div>
            ))}
        </div>
        <div style={{background:"var(--bg3)",border:"1px dashed var(--border)",borderRadius:"var(--r)",padding:13,marginBottom:16}}>
          <div style={{fontWeight:600,marginBottom:9}}>➕ פתח כיתה חדשה</div>
          <div className="g2">
            <div className="fg" style={{marginBottom:0}}><label className="fl">מקצוע</label><select className="fc" value={form.subject} onChange={e=>setForm(p=>({...p,subject:e.target.value}))}>{SUBJECTS.map(s=><option key={s}>{s}</option>)}</select></div>
            <div className="fg" style={{marginBottom:0}}><label className="fl">כיתה</label><select className="fc" value={form.grade} onChange={e=>setForm(p=>({...p,grade:e.target.value}))}>{GRADES.map(g=><option key={g}>{g}</option>)}</select></div>
          </div>
          <button className="btn bs wf" style={{marginTop:9}} onClick={openClass}>🔑 צור קוד כניסה</button>
          {newCode&&<div style={{marginTop:11,textAlign:"center",animation:"mi .3s ease"}}>
            <div style={{fontSize:".76rem",color:"var(--ok)",marginBottom:5}}>✅ שתף קוד זה עם תלמידיך:</div>
            <div className="cc" style={{fontSize:"1.55rem",letterSpacing:".22em"}}>{newCode}</div>
          </div>}
        </div>
        <button className="btn bp wf" onClick={()=>onLogin({...form,role:"teacher",classes:myClasses})}>כניסה לסביבת המורה →</button>
        <button className="btn bg wf" style={{marginTop:8}} onClick={()=>setStep("login")}>← חזרה</button>
      </div>
      <div className="copy">© כל הזכויות שמורות לשוורץ אבי</div>
    </div>
  );
}

// ============================================================
// STUDENT LOGIN
// ============================================================
function StudentLogin({onLogin,onBack}){
  const [form,setForm]=useState({name:"",grade:GRADES[3],classCode:""});
  const [err,setErr]=useState("");
  const go=()=>{
    if(!form.name.trim()){setErr("נא להזין שם");return;}
    if(form.classCode.length<4){setErr("נא להזין קוד כיתה תקין");return;}
    const found=defaultClasses.find(c=>c.code===form.classCode.toUpperCase());
    if(!found){setErr("קוד הכיתה לא נמצא. בדוק שוב עם המורה שלך.");return;}
    setErr("");onLogin({...form,classCode:form.classCode.toUpperCase(),role:"student",classInfo:found});
  };
  return(
    <div className="aw-wrap">
      <div className="abox">
        <div className="ai-c">🎒</div>
        <div className="at" style={{fontSize:"1.38rem",fontWeight:700,textAlign:"center",marginBottom:3}}>כניסת תלמיד</div>
        <div className="as">מלא פרטים כפי שקיבלת מהמורה שלך</div>
        <div className="fg"><label className="fl">שם מלא</label><input className="fc" value={form.name} onChange={e=>setForm(p=>({...p,name:e.target.value}))} placeholder="אנה פטרוב"/></div>
        <div className="fg"><label className="fl">כיתה</label><select className="fc" value={form.grade} onChange={e=>setForm(p=>({...p,grade:e.target.value}))}>{GRADES.map(g=><option key={g}>{g}</option>)}</select></div>
        <div className="fg">
          <label className="fl">קוד כניסה לכיתה</label>
          <input className="fc" value={form.classCode} onChange={e=>setForm(p=>({...p,classCode:e.target.value.toUpperCase()}))}
            placeholder="HIS10A" maxLength={8} style={{fontFamily:"'JetBrains Mono',monospace",letterSpacing:".15em",fontSize:"1.03rem",textAlign:"center"}}
            onKeyDown={e=>e.key==="Enter"&&go()}/>
          <div style={{fontSize:".7rem",color:"var(--tx3)",marginTop:3}}>💡 קודי דמו: HIS10A · CIV09B · LIT10C</div>
        </div>
        {err&&<div className="alrt ar">{err}</div>}
        <button className="btn ba wf" onClick={go}>כניסה ללמידה →</button>
        <button className="btn bg wf" style={{marginTop:8}} onClick={onBack}>← חזרה</button>
      </div>
      <div className="copy">© כל הזכויות שמורות לשוורץ אבי</div>
    </div>
  );
}

// ============================================================
// CHAT VIEW
// ============================================================
function ChatView({unit,langPair,userData,onBack,onSessionEnd}){
  const [msgs,setMsgs]=useState([]);
  const [input,setInput]=useState("");
  const [loading,setLoading]=useState(false);
  const [hints,setHints]=useState(0);
  const [started,setStarted]=useState(false);
  const [sTime,setSTime]=useState(0);
  const endRef=useRef(null);
  const timerRef=useRef(null);
  const sys=buildSP(unit,langPair);
  const maxH=unit?.hintPolicy==="unlimited"?Infinity:parseInt(unit?.hintPolicy||"5");
  useEffect(()=>{endRef.current?.scrollIntoView({behavior:"smooth"});},[msgs,loading]);
  useEffect(()=>{if(started){timerRef.current=setInterval(()=>setSTime(t=>t+1),1000);}return()=>clearInterval(timerRef.current);},[started]);
  const fmt=s=>`${Math.floor(s/60)}:${String(s%60).padStart(2,"0")}`;
  const startSession=async()=>{
    setStarted(true);setLoading(true);
    try{const r=await callClaude([{role:"user",content:`שלום! המשימה שלי: ${unit?.question}`}],sys);
      setMsgs([{role:"user",content:`המשימה שלי: ${unit?.question}`,hidden:true},{role:"assistant",content:r}]);}
    catch{setMsgs([{role:"assistant",content:"שגיאה בחיבור. נסה שוב."}]);}
    setLoading(false);
  };
  const send=async(msg)=>{
    if(!msg.trim()||loading)return;
    setInput("");
    const nm=[...msgs,{role:"user",content:msg}];
    setMsgs(nm);setLoading(true);
    try{const api=nm.filter(m=>!m.hidden).map(m=>({role:m.role,content:m.content}));
      const r=await callClaude(api,sys);
      setMsgs([...nm,{role:"assistant",content:r}]);}
    catch{setMsgs(p=>[...p,{role:"assistant",content:"שגיאה. נסה שוב."}]);}
    setLoading(false);
  };
  const askHint=async()=>{if(hints>=maxH||loading)return;setHints(h=>h+1);await send("אני צריך רמז");};
  const finish=()=>{
    onSessionEnd&&onSessionEnd({hintsUsed:hints,sessionTime:sTime,msgCount:msgs.filter(m=>m.role==="user"&&!m.hidden).length});
    onBack();
  };
  const vis=msgs.filter(m=>!m.hidden);
  return(
    <div className="chat-w">
      <div className="chat-tb">
        <button className="btn bg sm" onClick={finish}>← חזרה</button>
        <div style={{flex:1}}>
          <div style={{fontWeight:700,fontSize:".9rem"}}>{unit?.title}</div>
          <div style={{fontSize:".8rem",color:"var(--tx2)"}}>{unit?.question}</div>
        </div>
        <div style={{display:"flex",gap:5,flexWrap:"wrap",alignItems:"center"}}>
          {started&&<span style={{fontSize:".73rem",color:"var(--tx3)",fontFamily:"'JetBrains Mono',monospace"}}>⏱ {fmt(sTime)}</span>}
          <span className="tag tg">{unit?.subject}</span>
          <span className="tag ta">{unit?.grade}</span>
          <span className="tag tv">{SUPPORT_LEVELS.find(s=>s.id===unit?.supportLevel)?.label}</span>
        </div>
      </div>
      <div className="chat-ms">
        {!started?(
          <div style={{textAlign:"center",margin:"auto"}}>
            <div style={{fontSize:"3rem",marginBottom:11}}>📚</div>
            <div style={{fontWeight:700,marginBottom:5,fontSize:"1.02rem"}}>{unit?.title}</div>
            <div style={{color:"var(--tx2)",maxWidth:360,margin:"0 auto 17px",fontSize:".86rem",lineHeight:1.6}}>{unit?.question}</div>
            <button className="btn bp" onClick={startSession}>התחל שיעור</button>
          </div>
        ):(
          <>
            {vis.map((m,i)=>(
              <div key={i} className={`msg ${m.role==="assistant"?"mb":"mu"}`}>
                <div className="mlbl">{m.role==="assistant"?"🤖 מורה-בוט":"👤 אני"}</div>
                <div className="bbl">{m.role==="assistant"?<BotMsg text={m.content}/>:<span>{m.content}</span>}</div>
              </div>
            ))}
            {loading&&<div className="msg mb"><div className="mlbl">🤖 מורה-בוט</div><div className="bbl"><div className="typing"><div className="td"/><div className="td"/><div className="td"/></div></div></div>}
            <div ref={endRef}/>
          </>
        )}
      </div>
      {started&&(
        <div className="wp">
          <div className="wt">
            <div className="wl">✍️ כתוב תשובתך בעברית</div>
            <div className="hc">רמזים: <b>{hints}</b>/{maxH===Infinity?"∞":maxH}</div>
          </div>
          <textarea className="wi" value={input} onChange={e=>setInput(e.target.value)} rows={3}
            onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();send(input);}}}
            placeholder="כתוב כאן... (Enter לשליחה, Shift+Enter שורה חדשה)"/>
          <div className="wa">
            <button className="btn bp" onClick={()=>send(input)} disabled={!input.trim()||loading}>שלח</button>
            <button className="hbtn" onClick={askHint} disabled={hints>=maxH||loading}>💡 רמז {maxH!==Infinity&&`(${maxH-hints} נשאר)`}</button>
            <button className="btn bs sm" style={{marginRight:"auto"}} onClick={finish}>סיים ✓</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// CREATE UNIT MODAL
// ============================================================
function CreateUnitModal({materials,onSave,onClose}){
  const [form,setForm]=useState({title:"",subject:SUBJECTS[0],grade:GRADES[3],question:"",taskType:TASK_TYPES[0],supportLevel:2,hintPolicy:"3",materialIds:[]});
  const fil=materials.filter(m=>m.subject===form.subject&&m.grade===form.grade);
  const togM=id=>setForm(f=>({...f,materialIds:f.materialIds.includes(id)?f.materialIds.filter(x=>x!==id):[...f.materialIds,id]}));
  const sel=materials.filter(m=>form.materialIds.includes(m.id));
  const kw=[...new Set(sel.flatMap(m=>m.keywords))];
  const tmpl=[...new Set(sel.flatMap(m=>m.templates))];
  return(
    <div className="ov" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="mo wide">
        <div className="mo-t">➕ יצירת יחידת למידה חדשה</div>
        <div className="g2">
          <div className="fg"><label className="fl">מקצוע</label><select className="fc" value={form.subject} onChange={e=>setForm(p=>({...p,subject:e.target.value}))}>{SUBJECTS.map(s=><option key={s}>{s}</option>)}</select></div>
          <div className="fg"><label className="fl">כיתה</label><select className="fc" value={form.grade} onChange={e=>setForm(p=>({...p,grade:e.target.value}))}>{GRADES.map(g=><option key={g}>{g}</option>)}</select></div>
        </div>
        <div className="fg"><label className="fl">כותרת היחידה</label><input className="fc" value={form.title} onChange={e=>setForm(p=>({...p,title:e.target.value}))} placeholder="גורמי העלייה מברית המועצות"/></div>
        <div className="fg"><label className="fl">שאלת הלמידה / המשימה</label><textarea className="fc" value={form.question} onChange={e=>setForm(p=>({...p,question:e.target.value}))} rows={3} placeholder="מה על התלמיד לעשות?"/></div>
        <div className="g2">
          <div className="fg"><label className="fl">סוג משימה</label><select className="fc" value={form.taskType} onChange={e=>setForm(p=>({...p,taskType:e.target.value}))}>{TASK_TYPES.map(t=><option key={t}>{t}</option>)}</select></div>
          <div className="fg"><label className="fl">מדיניות רמזים</label><select className="fc" value={form.hintPolicy} onChange={e=>setForm(p=>({...p,hintPolicy:e.target.value}))}>{HINT_POLICIES.map(h=><option key={h.id} value={h.id}>{h.label}</option>)}</select></div>
        </div>
        <div className="fg">
          <label className="fl">רמת תמיכה דו-לשונית</label>
          <div style={{display:"flex",flexDirection:"column",gap:7}}>
            {SUPPORT_LEVELS.map(sl=>(
              <label key={sl.id} style={{display:"flex",alignItems:"center",gap:10,cursor:"pointer",padding:"8px 12px",borderRadius:8,border:`1px solid ${form.supportLevel===sl.id?"var(--teal)":"var(--border)"}`,background:form.supportLevel===sl.id?"rgba(45,212,191,.05)":"var(--bg3)"}}>
                <input type="radio" name="sl" checked={form.supportLevel===sl.id} onChange={()=>setForm(p=>({...p,supportLevel:sl.id}))}/>
                <div><div style={{fontWeight:600,fontSize:".83rem"}}>רמה {sl.id}: {sl.label}</div><div style={{fontSize:".74rem",color:"var(--tx2)"}}>{sl.desc}</div></div>
              </label>
            ))}
          </div>
        </div>
        {fil.length>0&&<div className="fg">
          <label className="fl">חומרים ({form.subject}·{form.grade})</label>
          {fil.map(m=>(
            <label key={m.id} className={`mc ${form.materialIds.includes(m.id)?"sel":""}`} style={{display:"block"}}>
              <div style={{display:"flex",gap:8,alignItems:"center"}}>
                <input type="checkbox" checked={form.materialIds.includes(m.id)} onChange={()=>togM(m.id)}/>
                <div><div style={{fontWeight:600,fontSize:".86rem"}}>{m.title}</div><div style={{fontSize:".72rem",color:"var(--tx3)"}}>{m.author}{m.shared?" · 🤝 משותף":""}</div></div>
              </div>
            </label>
          ))}
        </div>}
        {kw.length>0&&<div className="alrt ai" style={{marginBottom:11}}>🔑 מילות מפתח: {kw.join(", ")}</div>}
        <div style={{display:"flex",gap:9,marginTop:4}}>
          <button className="btn bp" disabled={!form.title||!form.question} onClick={()=>{onSave({...form,id:Date.now().toString(),keywords:kw,templates:tmpl});onClose();}}>צור יחידה</button>
          <button className="btn bs" onClick={onClose}>ביטול</button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// UPLOAD MODAL
// ============================================================
function UploadModal({onSave,onClose}){
  const [form,setForm]=useState({title:"",subject:SUBJECTS[0],grade:GRADES[3],content:"",keywords:"",shared:false});
  return(
    <div className="ov" onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div className="mo">
        <div className="mo-t">📤 העלאת חומר לימודי</div>
        <div className="g2">
          <div className="fg"><label className="fl">מקצוע</label><select className="fc" value={form.subject} onChange={e=>setForm(p=>({...p,subject:e.target.value}))}>{SUBJECTS.map(s=><option key={s}>{s}</option>)}</select></div>
          <div className="fg"><label className="fl">כיתה</label><select className="fc" value={form.grade} onChange={e=>setForm(p=>({...p,grade:e.target.value}))}>{GRADES.map(g=><option key={g}>{g}</option>)}</select></div>
        </div>
        <div className="fg"><label className="fl">כותרת</label><input className="fc" value={form.title} onChange={e=>setForm(p=>({...p,title:e.target.value}))} placeholder="שם הנושא"/></div>
        <div className="fg"><label className="fl">תוכן</label><textarea className="fc" value={form.content} onChange={e=>setForm(p=>({...p,content:e.target.value}))} rows={5} placeholder="הדבק טקסט, סיכום, שאלות..."/></div>
        <div className="fg"><label className="fl">מילות מפתח (מופרדות בפסיק)</label><input className="fc" value={form.keywords} onChange={e=>setForm(p=>({...p,keywords:e.target.value}))} placeholder="עלייה, ברית המועצות"/></div>
        <label style={{display:"flex",alignItems:"center",gap:10,cursor:"pointer",padding:"10px 13px",background:"var(--bg3)",borderRadius:"var(--r2)",border:"1px solid var(--border)",marginBottom:15}}>
          <input type="checkbox" checked={form.shared} onChange={e=>setForm(p=>({...p,shared:e.target.checked}))}/>
          <div><div style={{fontWeight:600,fontSize:".86rem"}}>🤝 שתף עם צוות המורים</div><div style={{fontSize:".74rem",color:"var(--tx2)"}}>מורה אחר באותו מקצוע ושכבה יוכל להשתמש בחומר</div></div>
        </label>
        <div style={{display:"flex",gap:9}}>
          <button className="btn bp" disabled={!form.title||!form.content} onClick={()=>{onSave({...form,id:"m"+Date.now(),keywords:form.keywords.split(",").map(k=>k.trim()).filter(Boolean),templates:[],author:"המורה שלי",ownerId:"current"});onClose();}}>העלה חומר</button>
          <button className="btn bs" onClick={onClose}>ביטול</button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// TEACHER VIEW — DB persistence + mobile + real stats
// ============================================================
function TeacherView({langPair,userData}){
  const inst = userData?.institutionCode || "demo";
  const [tab,setTab]        = useState("units");
  const [units,setUnits]    = useState([]);
  const [materials,setMats] = useState(initialMaterials);
  const [studentStats,setSStats] = useState([]);   // [{name, tasksCompleted, hintsTotal, lastActive}]
  const [showC,setShowC]    = useState(false);
  const [showU,setShowU]    = useState(false);
  const [activeChat,setActiveChat] = useState(null);
  const [fS,setFS]          = useState("הכל");
  const [fG,setFG]          = useState("הכל");
  const [mobSB,setMobSB]    = useState(false);
  const [loading,setLoading]= useState(true);

  // ── Load from DB on mount
  useEffect(()=>{
    (async()=>{
      const [u,m] = await Promise.all([DB.getUnits(inst), DB.getMaterials(inst)]);
      if(u?.length) setUnits(u);
      if(m?.length) setMats(m);
      setLoading(false);
    })();
  },[inst]);

  // ── Save units to DB whenever they change
  useEffect(()=>{ if(!loading) DB.setUnits(inst, units); },[units, loading]);
  // ── Save materials to DB whenever they change
  useEffect(()=>{ if(!loading) DB.setMaterials(inst, materials); },[materials, loading]);

  // ── Load student stats for this institution
  const loadStudentStats = useCallback(async()=>{
    const keys = await DB.listProgress(inst);
    const all  = await Promise.all(keys.map(k => Adapter.get(k)));
    setSStats(all.filter(Boolean).map((p,i)=>({
      sid: keys[i]?.split(":progress:")[1]||"תלמיד",
      sessionsTotal:  p.sessionsTotal||0,
      hintsTotal:     p.hintsTotal||0,
      tasksCompleted: p.tasksCompleted||0,
      lastActive:     p.lastActive||null,
    })));
  },[inst]);

  useEffect(()=>{ loadStudentStats(); },[loadStudentStats]);

  if(activeChat) return(
    <ChatView unit={activeChat} langPair={langPair} userData={userData}
      onBack={()=>setActiveChat(null)}/>
  );

  const fMats = materials.filter(m=>
    (fS==="הכל"||m.subject===fS) && (fG==="הכל"||m.grade===fG)
  );

  const NAV_ITEMS = [
    {id:"units",icon:"📚",l:"יחידות"},
    {id:"materials",icon:"📁",l:"חומרים"},
    {id:"shared",icon:"🤝",l:"משותפים"},
    {id:"stats",icon:"📊",l:"בקרה"},
  ];

  const SidebarContent = ()=>(
    <>
      <div style={{padding:"11px 16px 7px",borderBottom:"1px solid var(--border)",marginBottom:7}}>
        <div style={{fontWeight:700,fontSize:".88rem",color:"var(--teal)"}}>👩‍🏫 {userData?.name}</div>
        <div style={{fontSize:".7rem",color:"var(--tx3)"}}>{userData?.subject} · כיתה {userData?.grade}</div>
        <div style={{fontSize:".68rem",color:"var(--tx3)",marginTop:2}}>מוסד: {inst}</div>
      </div>
      {NAV_ITEMS.map(i=>(
        <div key={i.id} className={`sb-i${tab===i.id?" on":""}`}
          onClick={()=>{setTab(i.id);setMobSB(false);}}>
          <span>{i.icon}</span>{i.l}
        </div>
      ))}
      <hr className="dv" style={{margin:"9px 0"}}/>
      <div className="sb-i" onClick={()=>{setShowC(true);setMobSB(false);}}><span>➕</span>יחידה חדשה</div>
      <div className="sb-i" onClick={()=>{setShowU(true);setMobSB(false);}}><span>📤</span>העלה חומר</div>
    </>
  );

  return(
    <div className={`ml has-mob-nav`}>
      {/* Desktop sidebar */}
      <div className="sb"><SidebarContent/></div>
      {/* Mobile sidebar overlay */}
      <div className={`mob-overlay${mobSB?" show":""}`} onClick={()=>setMobSB(false)}/>
      <div className={`sb${mobSB?" mob-open":""}`} style={{zIndex:mobSB?151:undefined}}>
        <SidebarContent/>
      </div>

      <div className="cnt">
        {/* Mobile topbar with hamburger */}
        <div style={{display:"flex",alignItems:"center",padding:"10px 14px 0",gap:8}} className="mob-hdr">
          <button className="hbg" onClick={()=>setMobSB(v=>!v)}>☰</button>
          <span style={{fontWeight:600,fontSize:".9rem",color:"var(--teal)"}}>{NAV_ITEMS.find(n=>n.id===tab)?.l}</span>
        </div>

        <div className="ci">
        {loading && <div style={{textAlign:"center",padding:"40px",color:"var(--tx3)"}}>טוען נתונים...</div>}

        {!loading && tab==="units" && (
          <>
            <div className="ph">
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:9}}>
                <div><div className="ph-t">יחידות לימוד</div><div className="ph-s">המשימות שיצרת לתלמידים</div></div>
                <button className="btn bp sm" onClick={()=>setShowC(true)}>➕ יחידה חדשה</button>
              </div>
            </div>
            {units.length===0
              ? <div className="card" style={{textAlign:"center",padding:"48px 20px"}}>
                  <div style={{fontSize:"2.8rem",marginBottom:10}}>📭</div>
                  <div style={{fontWeight:700,marginBottom:7}}>אין יחידות עדיין</div>
                  <div style={{color:"var(--tx2)",marginBottom:17,fontSize:".86rem"}}>צור יחידת למידה ראשונה עם שאלה ורמות תמיכה</div>
                  <button className="btn bp" onClick={()=>setShowC(true)}>➕ צור יחידה ראשונה</button>
                </div>
              : units.map(u=>(
                <div key={u.id} className="ui">
                  <span style={{fontSize:"1.5rem"}}>📖</span>
                  <div style={{flex:1}}>
                    <div style={{fontWeight:600,fontSize:".9rem"}}>{u.title}</div>
                    <div style={{fontSize:".74rem",color:"var(--tx3)",marginTop:2}}>
                      {u.subject} · {u.grade} · {u.taskType}
                    </div>
                  </div>
                  <div style={{display:"flex",gap:6,flexWrap:"wrap",alignItems:"center"}}>
                    <span className="tag tv">{SUPPORT_LEVELS.find(s=>s.id===u.supportLevel)?.label}</span>
                    <button className="btn bp sm" onClick={()=>setActiveChat(u)}>🤖 תצוגה מקדימה</button>
                    <button className="btn bd sm"
                      onClick={()=>setUnits(p=>p.filter(x=>x.id!==u.id))}>🗑</button>
                  </div>
                </div>
              ))
            }
          </>
        )}

        {!loading && tab==="materials" && (
          <>
            <div className="ph">
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:9}}>
                <div><div className="ph-t">החומרים שלי</div><div className="ph-s">חומרים שהעלת למאגר</div></div>
                <button className="btn bp sm" onClick={()=>setShowU(true)}>📤 העלה חומר</button>
              </div>
            </div>
            <div style={{display:"flex",gap:9,marginBottom:15,flexWrap:"wrap"}}>
              <select className="fc" style={{width:"auto"}} value={fS} onChange={e=>setFS(e.target.value)}>
                <option>הכל</option>{SUBJECTS.map(s=><option key={s}>{s}</option>)}</select>
              <select className="fc" style={{width:"auto"}} value={fG} onChange={e=>setFG(e.target.value)}>
                <option>הכל</option>{GRADES.map(g=><option key={g}>{g}</option>)}</select>
            </div>
            {fMats.map(m=>(
              <div key={m.id} className="mc">
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:6,flexWrap:"wrap",gap:5}}>
                  <div style={{fontWeight:600}}>{m.title}</div>
                  <div style={{display:"flex",gap:5}}>
                    <span className="tag tg">{m.subject}</span>
                    <span className="tag ta">{m.grade}</span>
                    {m.shared&&<span className="tag ts">🤝</span>}
                  </div>
                </div>
                <div style={{fontSize:".81rem",color:"var(--tx2)",lineHeight:1.5}}>{m.content.slice(0,110)}...</div>
                <div style={{display:"flex",gap:5,marginTop:7,flexWrap:"wrap"}}>
                  {m.keywords.map(k=><span key={k} className="tag tv">{k}</span>)}
                </div>
                <div style={{fontSize:".72rem",color:"var(--tx3)",marginTop:5}}>{m.author}</div>
              </div>
            ))}
          </>
        )}

        {!loading && tab==="shared" && (
          <>
            <div className="ph"><div className="ph-t">מאגר משותף 🤝</div><div className="ph-s">חומרים ששותפו על ידי מורים אחרים</div></div>
            <div className="alrt ai" style={{marginBottom:15}}>חומרים אלה הועלו ושותפו לצוות. ניתן לכלול אותם ביחידות שלך.</div>
            {materials.filter(m=>m.shared).map(m=>(
              <div key={m.id} className="mc">
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:6,flexWrap:"wrap",gap:5}}>
                  <div style={{fontWeight:600}}>{m.title}</div>
                  <div style={{display:"flex",gap:5}}>
                    <span className="tag tg">{m.subject}</span>
                    <span className="tag ta">{m.grade}</span>
                  </div>
                </div>
                <div style={{fontSize:".81rem",color:"var(--tx2)",lineHeight:1.5}}>{m.content.slice(0,100)}...</div>
                <div style={{fontSize:".72rem",color:"var(--tx3)",marginTop:5}}>{m.author}</div>
              </div>
            ))}
          </>
        )}

        {!loading && tab==="stats" && (
          <>
            <div className="ph">
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:9}}>
                <div><div className="ph-t">לוח בקרה 📊</div><div className="ph-s">פעילות תלמידים ומשאבים</div></div>
                <button className="btn bs sm" onClick={loadStudentStats}>🔄 רענן</button>
              </div>
            </div>

            {/* Summary stats */}
            <div className="g3" style={{marginBottom:18}}>
              {[
                {n:units.length,        l:"יחידות פעילות",      i:"📚", c:"var(--teal)"},
                {n:materials.length,    l:"חומרים במאגר",       i:"📁", c:"var(--amber)"},
                {n:studentStats.length, l:"תלמידים פעילים",     i:"🎒", c:"var(--violet)"},
              ].map((s,i)=>(
                <div key={i} className="stat-c">
                  <div style={{fontSize:"1.3rem",marginBottom:4}}>{s.i}</div>
                  <div className="stat-n" style={{color:s.c}}>{s.n}</div>
                  <div className="stat-l">{s.l}</div>
                </div>
              ))}
            </div>

            {/* Aggregated class stats */}
            {studentStats.length>0 ? (
              <>
                <div style={{fontWeight:600,marginBottom:12}}>📋 פעילות תלמידים לפי כיתה</div>
                {/* Bar: avg tasks */}
                <div className="card" style={{marginBottom:14}}>
                  <div className="card-t" style={{marginBottom:12}}>ממוצע משימות לתלמיד</div>
                  {(() => {
                    const avg = studentStats.length
                      ? (studentStats.reduce((a,s)=>a+s.tasksCompleted,0)/studentStats.length).toFixed(1)
                      : 0;
                    const maxT = Math.max(...studentStats.map(s=>s.tasksCompleted),1);
                    return(
                      <>
                        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}>
                          <div style={{flex:1,background:"var(--bg3)",borderRadius:4,height:10,overflow:"hidden"}}>
                            <div style={{width:`${(avg/5)*100}%`,height:"100%",background:"linear-gradient(90deg,var(--teal),var(--teal2))",borderRadius:4}}/>
                          </div>
                          <div style={{fontWeight:700,color:"var(--teal)",fontSize:".9rem",minWidth:28}}>{avg}</div>
                        </div>
                        {/* per-student rows */}
                        <div style={{display:"flex",flexDirection:"column",gap:6}}>
                          {studentStats.map((s,i)=>(
                            <div key={i} style={{display:"flex",alignItems:"center",gap:8}}>
                              <div style={{fontSize:".76rem",color:"var(--tx2)",minWidth:90,textAlign:"right"}}>{s.sid.split("_").slice(1).join(" ")||s.sid}</div>
                              <div style={{flex:1,background:"var(--bg3)",borderRadius:3,height:6,overflow:"hidden"}}>
                                <div style={{width:`${(s.tasksCompleted/maxT)*100}%`,height:"100%",background:"var(--teal)",borderRadius:3}}/>
                              </div>
                              <div style={{display:"flex",gap:5,minWidth:140}}>
                                <span className="tag tg">{s.tasksCompleted} משימות</span>
                                <span className="tag ta">{s.hintsTotal} רמזים</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </>
                    );
                  })()}
                </div>
                {/* Recently active */}
                <div className="card">
                  <div className="card-t" style={{marginBottom:10}}>🕐 פעילות אחרונה</div>
                  {[...studentStats]
                    .sort((a,b)=>new Date(b.lastActive||0)-new Date(a.lastActive||0))
                    .slice(0,5)
                    .map((s,i)=>(
                      <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"7px 0",
                        borderBottom:i<4?"1px solid rgba(42,63,90,.4)":"none",flexWrap:"wrap",gap:5}}>
                        <div style={{fontWeight:500,fontSize:".86rem"}}>{s.sid.split("_").slice(1).join(" ")||s.sid}</div>
                        <div style={{fontSize:".76rem",color:"var(--tx3)"}}>
                          {s.lastActive ? new Date(s.lastActive).toLocaleString("he-IL") : "לא פעיל עדיין"}
                        </div>
                      </div>
                    ))
                  }
                </div>
              </>
            ) : (
              <div className="alrt aw">
                לא נמצאו תלמידים פעילים עדיין. נתוני תלמידים יופיעו לאחר שיתחילו לעבוד עם היחידות.
              </div>
            )}
          </>
        )}
        </div>
      </div>

      {/* Mobile bottom nav */}
      <div className="mob-nav">
        {NAV_ITEMS.map(i=>(
          <div key={i.id} className={`mob-nav-i${tab===i.id?" on":""}`} onClick={()=>setTab(i.id)}>
            <span>{i.icon}</span><span>{i.l}</span>
          </div>
        ))}
        <div className="mob-nav-i" onClick={()=>setShowC(true)}>
          <span>➕</span><span>יחידה</span>
        </div>
      </div>

      {showC && <CreateUnitModal materials={materials} onSave={u=>setUnits(p=>[...p,u])} onClose={()=>setShowC(false)}/>}
      {showU && <UploadModal onSave={m=>setMats(p=>[...p,m])} onClose={()=>setShowU(false)}/>}
    </div>
  );
}

// ============================================================
// STUDENT VIEW
// ============================================================
function StudentView({langPair,userData}){
  const [activeChat,setActiveChat]=useState(null);
  const [tab,setTab]=useState("tasks");
  const [progress,setProgress]=useState(emptyProg());
  const [mobSB,setMobSB]=useState(false);
  const inst=userData?.classInfo?.institutionCode||"demo";
  const sid=`${inst}_${(userData?.name||"anon").replace(/\s/g,"_")}`;

  useEffect(()=>{ DB.getProgress(inst,sid).then(p=>{if(p&&p.sessionsTotal>0)setProgress(p);}); },[]);

  const demoTasks=[
    {id:"t1",title:"גורמי העלייה מברית המועצות",subject:"היסטוריה",grade:"י׳",
     question:"הסבר שני גורמים מרכזיים לעלייה הגדולה מברית המועצות בשנות ה-90.",
     taskType:"סיבה ותוצאה",supportLevel:2,hintPolicy:"3",
     keywords:["עלייה","ברית המועצות","גלאסנוסט"],templates:["הגורם המרכזי הוא... משום ש..."],
     difficulty:"בינוני",stage:"תרגול מונחה"},
    {id:"t2",title:"זכויות אדם בישראל",subject:"אזרחות",grade:"ט׳",
     question:"מהי הזכות לשוויון ואיך היא מעוגנת בחוק הישראלי?",
     taskType:"הסבר מושג",supportLevel:1,hintPolicy:"5",
     keywords:["שוויון","חוק יסוד"],templates:["הזכות המתאימה היא... משום ש..."],
     difficulty:"קל",stage:"לימוד"},
    {id:"t3",title:"ניתוח שיר — לאה גולדברג",subject:"ספרות",grade:"י׳",
     question:"זהה שני אמצעים אמנותיים בשיר והסבר את תפקידם.",
     taskType:"ניתוח טקסט",supportLevel:3,hintPolicy:"3",
     keywords:["אמצעי אמנותי","מסר"],templates:["אמצעי אמנותי זה משמש ל..."],
     difficulty:"מתקדם",stage:"תרגול עצמאי"},
  ];

  const handleEnd=async(d)=>{
    const np={...progress,
      sessionsTotal: progress.sessionsTotal+1,
      hintsTotal:    progress.hintsTotal+d.hintsUsed,
      tasksCompleted:progress.tasksCompleted+1,
      lastActive:    new Date().toISOString(),
      taskLog:[...(progress.taskLog||[]),{...d,date:new Date().toISOString()}]
    };
    setProgress(np);
    await DB.setProgress(inst,sid,np);
  };

  if(activeChat) return(
    <ChatView unit={activeChat} langPair={langPair} userData={userData}
      onBack={()=>setActiveChat(null)} onSessionEnd={handleEnd}/>
  );

  const lvl=Math.min(4,Math.floor(progress.tasksCompleted/2)+1);
  const NAV=[{id:"tasks",icon:"📋",l:"משימות"},{id:"progress",icon:"📈",l:"התקדמות"}];

  const SB=()=>(
    <>
      <div style={{padding:"11px 16px 7px",borderBottom:"1px solid var(--border)",marginBottom:7}}>
        <div style={{fontWeight:700,fontSize:".88rem",color:"var(--amber)"}}>🎒 {userData?.name}</div>
        <div style={{fontSize:".7rem",color:"var(--tx3)"}}>
          {userData?.classInfo?.subject} · כיתה {userData?.grade} · {userData?.classCode}
        </div>
      </div>
      {NAV.map(i=>(
        <div key={i.id} className={`sb-i${tab===i.id?" on":""}`}
          onClick={()=>{setTab(i.id);setMobSB(false);}}>
          <span>{i.icon}</span>{i.l}
        </div>
      ))}
    </>
  );

  return(
    <div className="ml has-mob-nav">
      <div className="sb"><SB/></div>
      <div className={`mob-overlay${mobSB?" show":""}`} onClick={()=>setMobSB(false)}/>
      <div className={`sb${mobSB?" mob-open":""}`}><SB/></div>

      <div className="cnt">
        <div style={{display:"flex",alignItems:"center",padding:"10px 14px 0",gap:8}} className="mob-hdr">
          <button className="hbg" onClick={()=>setMobSB(v=>!v)}>☰</button>
          <span style={{fontWeight:600,fontSize:".9rem",color:"var(--amber)"}}>
            {NAV.find(n=>n.id===tab)?.l}
          </span>
        </div>
        <div className="ci">
          {tab==="tasks"&&(
            <>
              <div className="ph"><div className="ph-t">המשימות שלי 📋</div><div className="ph-s">בחר משימה ולמד עם הבוט</div></div>
              <div className="alrt ai" style={{marginBottom:15}}>🤖 הבוט ישאל שאלות ויתן רמזים — הוא לא יכתוב בשבילך!</div>
              {demoTasks.map(task=>(
                <div key={task.id} className="tc" onClick={()=>setActiveChat({...task})}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8,flexWrap:"wrap",gap:5}}>
                    <div style={{fontWeight:700,fontSize:".95rem"}}>{task.title}</div>
                    <span className="tag ta">{task.stage}</span>
                  </div>
                  <div style={{fontSize:".84rem",color:"var(--tx2)",lineHeight:1.6,marginBottom:11}}>{task.question}</div>
                  <div style={{display:"flex",gap:7,flexWrap:"wrap",alignItems:"center"}}>
                    <span className="tag tg">{task.subject}</span>
                    <span className="tag tv">כיתה {task.grade}</span>
                    <span className={`tag ${task.difficulty==="קל"?"ts":task.difficulty==="מתקדם"?"tr":"ta"}`}>{task.difficulty}</span>
                    <span style={{marginRight:"auto",fontSize:".76rem",color:"var(--tx3)"}}>עד {task.hintPolicy} רמזים</span>
                    <button className="btn ba sm">התחל →</button>
                  </div>
                </div>
              ))}
            </>
          )}

          {tab==="progress"&&(
            <>
              <div className="ph"><div className="ph-t">ההתקדמות שלי 📈</div><div className="ph-s">מעקב אחר הלמידה שלך</div></div>

              {/* Stats cards */}
              <div className="g3" style={{marginBottom:17}}>
                {[{n:progress.sessionsTotal,l:"שיעורים הושלמו",i:"✅",c:"var(--teal)"},
                  {n:progress.hintsTotal,l:"רמזים שנוצלו",i:"💡",c:"var(--amber)"},
                  {n:progress.tasksCompleted,l:"משימות בוצעו",i:"📝",c:"var(--violet)"}]
                  .map((s,i)=>(
                    <div key={i} className="stat-c">
                      <div style={{fontSize:"1.3rem",marginBottom:4}}>{s.i}</div>
                      <div className="stat-n" style={{color:s.c}}>{s.n}</div>
                      <div className="stat-l">{s.l}</div>
                    </div>
                  ))}
              </div>

              {/* Language level track */}
              <div className="card" style={{marginBottom:15}}>
                <div className="card-t" style={{marginBottom:9}}>🗣️ מסלול שפה — לעברית עצמאית</div>
                <div className="lvl-bar">
                  {[1,2,3,4].map(i=><div key={i} className={`ls${i<=lvl?" on":""}`}/>)}
                </div>
                <div style={{display:"flex",justifyContent:"space-between",fontSize:".7rem",color:"var(--tx3)",marginTop:4}}>
                  <span>תמיכה גבוהה</span><span>בינונית</span><span>נמוכה</span><span>מוכן לבגרות</span>
                </div>
                <div style={{marginTop:11,padding:"9px 13px",background:"rgba(45,212,191,.06)",borderRadius:"var(--r2)",border:"1px solid rgba(45,212,191,.14)"}}>
                  <div style={{fontWeight:600,fontSize:".86rem",color:"var(--teal)"}}>
                    {["","רמה 1 — תחילת הדרך 🌱","רמה 2 — בדרך הנכונה 🌿","רמה 3 — כמעט עצמאי 🌳","רמה 4 — מוכן לבגרות 🎓"][lvl]}
                  </div>
                  <div style={{fontSize:".78rem",color:"var(--tx2)",marginTop:2}}>
                    {lvl<4?`עוד ${2-(progress.tasksCompleted%2)} משימות לרמה הבאה`:"הגעת לרמה המקסימלית!"}
                  </div>
                </div>
              </div>

              {/* Session history */}
              <div className="card">
                <div className="card-t" style={{marginBottom:11}}>📋 היסטוריית שיעורים</div>
                {(progress.taskLog||[]).length===0
                  ? <div style={{color:"var(--tx3)",fontSize:".83rem",textAlign:"center",padding:"18px 0"}}>
                      עדיין לא השלמת שיעורים.{" "}
                      <span style={{color:"var(--teal)",cursor:"pointer"}} onClick={()=>setTab("tasks")}>התחל עכשיו →</span>
                    </div>
                  : [...(progress.taskLog||[])].reverse().map((log,i)=>(
                    <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",
                      padding:"9px 0",borderBottom:i<(progress.taskLog||[]).length-1?"1px solid rgba(42,63,90,.4)":"none",
                      flexWrap:"wrap",gap:5}}>
                      <div>
                        <div style={{fontWeight:600,fontSize:".86rem"}}>שיעור {(progress.taskLog||[]).length-i}</div>
                        <div style={{fontSize:".73rem",color:"var(--tx3)"}}>
                          {new Date(log.date).toLocaleDateString("he-IL")}
                        </div>
                      </div>
                      <div style={{display:"flex",gap:7,flexWrap:"wrap"}}>
                        <span className="tag tg">⏱ {log.sessionTime?Math.round(log.sessionTime/60)+"'":"-"}</span>
                        <span className="tag ta">💡 {log.hintsUsed} רמזים</span>
                        <span className="tag tv">💬 {log.msgCount} הודעות</span>
                      </div>
                    </div>
                  ))
                }
              </div>

              {progress.lastActive&&(
                <div style={{fontSize:".72rem",color:"var(--tx3)",textAlign:"center",marginTop:11}}>
                  פעיל לאחרונה: {new Date(progress.lastActive).toLocaleString("he-IL")}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Mobile bottom nav */}
      <div className="mob-nav">
        {NAV.map(i=>(
          <div key={i.id} className={`mob-nav-i${tab===i.id?" on":""}`} onClick={()=>setTab(i.id)}>
            <span>{i.icon}</span><span>{i.l}</span>
          </div>
        ))}
      </div>
    </div>
  );
}


// ============================================================
// MAIN APP
// ============================================================
export default function App(){
  const [screen,setScreen]=useState("landing");
  const [role,setRole]=useState(null);
  const [langPair,setLangPair]=useState(LANG_PAIRS[0]);
  const [userData,setUserData]=useState(null);
  const [showGuide,setShowGuide]=useState(false);
  const logout=()=>{setScreen("landing");setRole(null);setUserData(null);};
  return(
    <>
      <style>{CSS}</style>
      <div className="app">
        <div className="topbar">
          <div className="logo" onClick={logout}>📚 בוט<em>לימוד</em>
            {screen==="app"&&langPair&&<span style={{fontSize:".7rem",color:"var(--tx3)",fontWeight:400,marginRight:5}}>{langPair.flag1}{langPair.flag2}</span>}
          </div>
          <div className="topbar-r">
            {screen==="app"&&userData&&<div className="upill"><span>{role==="teacher"?"👩‍🏫":role==="admin"?"🛡️":"🎒"}</span><span style={{fontWeight:600}}>{role==="admin"?"שוורץ אבי":userData.name}</span>{userData?.classCode&&<span className="tag ta" style={{fontSize:".66rem"}}>{userData.classCode}</span>}</div>}
            {screen==="app"&&role!=="admin"&&<div style={{display:"flex",gap:6,flexWrap:"wrap"}}>{LANG_PAIRS.map(lp=><button key={lp.id} className={`lbtn${langPair.id===lp.id?" act":""}`} style={{padding:"4px 9px",fontSize:".73rem"}} onClick={()=>setLangPair(lp)}>{lp.flag1}{lp.flag2}</button>)}</div>}
            {screen==="app"&&<button className="btn bg sm" onClick={logout}>יציאה →</button>}
          </div>
        </div>

        {screen==="landing"&&(
          <div className="land">
            <div className="lbadge">🎓 מערכת למידה לעולים חדשים</div>
            <h1 className="ltitle"><span className="ac">בוט לימוד</span> דו-לשוני<br/>לקראת <span className="ac2">בגרות</span></h1>
            <p className="lsub">מערכת פדגוגית חכמה לתלמידים עולים. בוט סוקרטי שמנחה, שואל ועוזר לכתוב בעברית — בלי לכתוב בשבילך.</p>
            <div style={{marginBottom:20}}>
              <div style={{fontSize:".79rem",color:"var(--tx2)",marginBottom:8,textAlign:"center"}}>בחר זוג שפות:</div>
              <div style={{display:"flex",gap:9,justifyContent:"center",flexWrap:"wrap"}}>
                {LANG_PAIRS.map(lp=><button key={lp.id} className={`lbtn${langPair.id===lp.id?" act":""}`} onClick={()=>setLangPair(lp)}><span>{lp.flag1}</span>{lp.label}<span>{lp.flag2}</span></button>)}
              </div>
            </div>
            <div className="rcs">
              <div className="rc t" onClick={()=>setScreen("teacher-login")}><div className="ri">👩‍🏫</div><div className="rt">אני מורה</div><div className="rd">כניסה עם שם, מקצוע, שכבה וסמל מוסד.</div></div>
              <div className="rc s" onClick={()=>setScreen("student-login")}><div className="ri">🎒</div><div className="rt">אני תלמיד</div><div className="rd">כניסה עם שם, כיתה וקוד מהמורה.</div></div>
              <div className="rc a" onClick={()=>setScreen("admin-login")}><div className="ri">🛡️</div><div className="rt">מנהל מערכת</div><div className="rd">ניהול מוסדות, הרשאות, אבטחה.</div></div>
            </div>
            <div className="feats">{["📚 ד׳ מקצועות","כיתות ז׳-י\"א","🤖 בוט סוקרטי","🤝 מאגר שיתופי","🔑 קודי כיתה","📊 מעקב התקדמות"].map(f=><span key={f}>{f}</span>)}</div>
            <button className="btn bs" style={{marginTop:26}} onClick={()=>setShowGuide(true)}>📖 מדריך למשתמש</button>
            <div className="copy">© כל הזכויות שמורות לשוורץ אבי</div>
          </div>
        )}

        {screen==="teacher-login"&&<TeacherLogin onLogin={d=>{setUserData(d);setRole("teacher");setScreen("app");}} onBack={()=>setScreen("landing")}/>}
        {screen==="student-login"&&<StudentLogin onLogin={d=>{setUserData(d);setRole("student");setScreen("app");}} onBack={()=>setScreen("landing")}/>}
        {screen==="admin-login"&&<AdminLogin onLogin={()=>{setRole("admin");setUserData({name:"שוורץ אבי"});setScreen("app");}} onBack={()=>setScreen("landing")}/>}

        {screen==="app"&&role==="teacher"&&<TeacherView langPair={langPair} userData={userData}/>}
        {screen==="app"&&role==="student"&&<StudentView langPair={langPair} userData={userData}/>}
        {screen==="app"&&role==="admin"&&<AdminPanel onLogout={logout}/>}

        {showGuide&&<UserGuide onClose={()=>setShowGuide(false)}/>}
      </div>
    </>
  );
}
