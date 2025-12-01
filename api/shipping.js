// api/shipping.js — Final Stable Version (padStart Error 0%)

export default async function handler(req, res) {
  try {
    const CSV_URL =
      "https://docs.google.com/spreadsheets/d/e/2PACX-1vRAWmUNAeyndXfdxHjR-1CakW_Tm3OzmMTng5RkB53umXwucqpxABqMMcB0y8H5cHNg7aoHYqFztz0F/pub?gid=1070360000&single=true&output=csv";

    const text = await fetch(CSV_URL).then(r => r.text());
    const rows = parseCSV(text);

    const todayYmd = getTodayYMD();

    // 오늘 이후만 필터
    const filtered = rows.filter(r => r.ymd >= todayYmd);

    // 날짜순 정렬
    filtered.sort((a, b) => a.ymd - b.ymd);

    return res.status(200).json({ ok: true, data: filtered });

  } catch (err) {
    return res.status(500).json({ ok: false, msg: err.message });
  }
}


/* ------------------------------
   CSV 파싱
------------------------------ */
function parseCSV(text) {
  const lines = text.split(/\r?\n/);
  const out = [];

  for (let i = 1; i < lines.length; i++) {
    const row = lines[i];
    if (!row.trim()) continue;

    const c = safeParse(row);

    const safe = (idx) => (c[idx] !== undefined ? clean(c[idx]) : "");

    const dateStr = safe(3);
    const ymd = convertToYMD(dateStr);   // 여기서 오류 0%

    out.push({
      ymd,
      date:      safe(3),   // D
      invoice:   safe(0),   // A
      country:   safe(4),   // E
      location:  safe(16),  // Q
      pallet:    safe(18),  // S
      time:      safe(19),  // T
      cbm:       safe(11),  // L
      container: safe(9),   // J
      work:      safe(15),  // P
      type:      safe(10),  // K
    });
  }

  return out;
}


/* ------------------------------
   CSV 안전 파서
------------------------------ */
function safeParse(row) {
  let out = [], cur = "", inside = false;

  for (let c of row) {
    if (c === '"' && inside) inside = false;
    else if (c === '"' && !inside) inside = true;
    else if (c === "," && !inside) { out.push(cur); cur = ""; }
    else cur += c;
  }
  out.push(cur);

  return out;
}


/* ------------------------------
   날짜 변환 (완전 보호 버전)
------------------------------ */
function convertToYMD(str) {
  if (!str) return 0;

  const s = String(str).trim();
  if (!/^\d{4}\.\d{1,2}\.\d{1,2}$/.test(s)) {
    return 0; // 날짜 형식이 아니면 무조건 제외
  }

  const parts = s.split(".");
  if (parts.length !== 3) return 0;

  const y = parts[0];
  const m = (parts[1] || "0").padStart(2, "0");
  const d = (parts[2] || "0").padStart(2, "0");

  return Number(`${y}${m}${d}`);
}


/* ------------------------------
   기타 유틸
------------------------------ */
function clean(str) {
  if (!str) return "";
  return String(str)
    .replace(/\uFEFF/g, "")
    .replace(/\r/g, "")
    .replace(/\n/g, "")
    .trim();
}

function getTodayYMD() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return Number(`${y}${m}${day}`);
}
