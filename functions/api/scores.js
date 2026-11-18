// 打字遊戲排行榜 API（Cloudflare Pages Functions）
// GET  /api/scores?period=month|all  → 前 10 名
// POST /api/scores                   → 登錄成績，回傳最新排行
// 需要在 Cloudflare Pages 設定 D1 資料庫綁定，變數名稱為 DB；還沒設定時回傳 503，遊戲會顯示「排行榜準備中」。

const MAX_NAME = 8;
const BAD_WORDS = [
  '幹你', '幹妳', '幹林', '靠北', '靠杯', '操你', '肏', '雞掰', '機掰', '智障', '白癡', '白痴', '垃圾', '去死', '王八',
  'fuck', 'shit', 'bitch', 'dick', 'cunt', 'nigger', 'nigga', 'porn', 'sex'
];

const SCHEMA = [
  'CREATE TABLE IF NOT EXISTS scores (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, score INTEGER NOT NULL, kpm INTEGER NOT NULL, acc INTEGER NOT NULL, grade TEXT NOT NULL, level INTEGER NOT NULL, combo INTEGER NOT NULL, duration INTEGER NOT NULL, ip_hash TEXT, created_at INTEGER NOT NULL)',
  'CREATE INDEX IF NOT EXISTS idx_scores_rank ON scores (score DESC, created_at ASC)'
];
let ready = false;
async function ensure(db) {
  if (ready) return;
  await db.batch(SCHEMA.map(sql => db.prepare(sql)));
  ready = true;
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
  });
}

// 台灣時間（UTC+8）本月 1 日 00:00 的時間戳
function monthStart(now = Date.now()) {
  const tw = new Date(now + 8 * 3600e3);
  return Date.UTC(tw.getUTCFullYear(), tw.getUTCMonth(), 1) - 8 * 3600e3;
}

async function top(db, period) {
  const since = period === 'all' ? 0 : monthStart();
  const r = await db
    .prepare('SELECT id, name, score, kpm, acc, grade, level, created_at FROM scores WHERE created_at >= ? ORDER BY score DESC, created_at ASC LIMIT 10')
    .bind(since)
    .all();
  return r.results || [];
}

function cleanName(raw) {
  let s = String(raw == null ? '' : raw).normalize('NFKC');
  s = s.replace(/[\u0000-\u001f\u007f<>&"'`\\]/g, '').replace(/\s+/g, ' ').trim();
  return Array.from(s).slice(0, MAX_NAME).join('');
}
function isBad(name) {
  const t = name.toLowerCase().replace(/[\s._\-*~!]/g, '');
  return BAD_WORDS.some(w => t.includes(w));
}
function int(v, min, max) {
  const n = Number(v);
  return Number.isInteger(n) && n >= min && n <= max ? n : null;
}
async function sha(s) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(d)).map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
}

export async function onRequestGet({ request, env }) {
  if (!env.DB) return json({ error: 'not_ready' }, 503);
  await ensure(env.DB);
  const period = new URL(request.url).searchParams.get('period') === 'all' ? 'all' : 'month';
  return json({ period, scores: await top(env.DB, period) });
}

export async function onRequestPost({ request, env }) {
  if (!env.DB) return json({ error: 'not_ready' }, 503);
  let body;
  try { body = await request.json(); } catch (e) { return json({ error: 'bad_json' }, 400); }

  const name = cleanName(body.name);
  if (!name) return json({ error: 'name_empty' }, 400);
  if (isBad(name)) return json({ error: 'name_bad' }, 400);

  const score = int(body.score, 1, 200000);
  const kpm = int(body.kpm, 0, 600);
  const acc = int(body.acc, 0, 100);
  const level = int(body.level, 0, 8);
  const combo = int(body.combo, 0, 5000);
  const duration = int(body.duration, 5, 7200);
  const grade = ['S', 'A', 'B', 'C', 'D'].indexOf(body.grade) >= 0 ? body.grade : null;
  if ([score, kpm, acc, level, combo, duration].indexOf(null) >= 0 || !grade) return json({ error: 'bad_data' }, 400);
  // 基本防作弊：分數不能超過到達關卡的合理上限，也不能得分太快
  if (score > (level + 1) * 15000 || score / duration > 600) return json({ error: 'implausible' }, 400);

  await ensure(env.DB);
  const now = Date.now();
  const ip = request.headers.get('CF-Connecting-IP') || '';
  const ipHash = ip ? await sha(ip + ':' + monthStart(now)) : null;
  if (ipHash) {
    const c = await env.DB.prepare('SELECT COUNT(*) AS n FROM scores WHERE ip_hash = ? AND created_at > ?').bind(ipHash, now - 60000).first();
    if (c && c.n >= 3) return json({ error: 'too_many' }, 429);
  }
  const res = await env.DB
    .prepare('INSERT INTO scores (name, score, kpm, acc, grade, level, combo, duration, ip_hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(name, score, kpm, acc, grade, level, combo, duration, ipHash, now)
    .run();
  const [month, all] = await Promise.all([top(env.DB, 'month'), top(env.DB, 'all')]);
  return json({ id: res.meta && res.meta.last_row_id, month, all });
}
