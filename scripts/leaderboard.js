/* Синхронизация общего рейтинга: ntfy -> leaderboard.json
   Запускается GitHub Actions каждые 10 минут. */

const fs = require("fs");
const path = require("path");

const TOPIC = "prz-liga-7b21e4";
const TOP = 50;
const FILE = path.join(__dirname, "..", "leaderboard.json");

function loadArchive() {
  try {
    const data = JSON.parse(fs.readFileSync(FILE, "utf8"));
    if (Array.isArray(data.scores)) return data.scores;
    if (Array.isArray(data)) return data;
    return [];
  } catch (e) {
    return [];
  }
}

function parseMessage(text) {
  const parts = String(text || "").split("|");
  if (parts.length < 4 || parts[0] !== "LB") return null;

  const name = parts[1].trim();
  const score = parseInt(parts[2], 10);
  const ts = parseInt(parts[3], 10);

  if (!/^[А-Яа-яЁёA-Za-z\- ]{2,30}$/.test(name)) return null;
  if (!Number.isFinite(score) || score <= 0 || score > 1000000) return null;
  if (!Number.isFinite(ts) || ts <= 0) return null;

  return { name, score, ts };
}

async function fetchMessages() {
  const url = `https://ntfy.sh/${TOPIC}/json?poll=1&since=12h`;
  const res = await fetch(url, { headers: { "User-Agent": "prz-leaderboard-bot" } });
  if (!res.ok) throw new Error("ntfy: HTTP " + res.status);

  const text = await res.text();
  const out = [];

  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    let ev;
    try { ev = JSON.parse(line); } catch (e) { continue; }
    if (!ev || ev.event !== "message" || !ev.message) continue;
    const item = parseMessage(ev.message);
    if (item) out.push(item);
  }

  return out;
}

async function main() {
  const merged = new Map();

  for (const item of loadArchive()) {
    if (!item || !item.name) continue;
    const key = `${item.name.toLowerCase()}|${item.score}|${Math.floor((item.ts || 0) / 1000)}`;
    merged.set(key, {
      name: String(item.name),
      score: parseInt(item.score, 10) || 0,
      ts: parseInt(item.ts, 10) || 0
    });
  }

  const fresh = await fetchMessages();
  for (const item of fresh) {
    const key = `${item.name.toLowerCase()}|${item.score}|${Math.floor(item.ts / 1000)}`;
    merged.set(key, item);
  }

  const scores = Array.from(merged.values())
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score || a.ts - b.ts)
    .slice(0, TOP);

  const out = { updated: new Date().toISOString(), scores };
  fs.writeFileSync(FILE, JSON.stringify(out, null, 2) + "\n", "utf8");

  console.log(`Собрано сообщений: ${fresh.length}, в рейтинге: ${scores.length}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
