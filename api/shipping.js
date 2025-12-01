// api/shipping.js — Google Sheets Date Auto Detection Version

export default async function handler(req, res) {
  try {
    const CSV_URL =
      "https://docs.google.com/spreadsheets/d/e/2PACX-1vRAWmUNAeyndXfdxHjR-1CakW_Tm3OzmMTng5RkB53umXwucqpxABqMMcB0y8H5cHNg7aoHYqFztz0F/pub?gid=1070360000&single=true&output=csv";

    const text = await fetch(CSV_URL).then(r => r.text());
    const rows = parseCSV(text);

    const today = getTodayYMD();

    // 오늘 포함 이후만 표시
    const filtered = rows.filter(r => r.ymd >= today);
    filtered.sort((a, b) => a.ymd - b.ymd);

    return res.status(200).json({ ok: true, data: filtered });
  } catch (err) {
    return res.status(500).json({ ok: false, msg: err.message });
  }
}

/* ======================================================
   CSV 파싱
====================================================== */
function parseCSV(text) {
  const lines = text.split(/\r?\n/);
  const out = [];

  for (let i = 1; i < lines.length; i++) {
    const row = lines[i];
    if (!row.trim()) continue;

    const c = safeParse(row);
    const safe = (i) => (c[i] !== undefined ? clean(c[i]) : "");

    // 날짜 파싱
    const dateStr = safe(3);
    const ymd = detectAndConvertDate(dateStr);

    out.push({
      ymd,
      date: safe(3),
      invoice: safe(0),
      country: safe(4),
      location: safe(16),
      pallet: safe(18),
      time: safe(19),
      cbm: safe(11),
      container: safe(9),
      work: safe(15),
      type: safe(10),
    });
  }
  return out;
}

/* ======================================================
   안전 CSV 파서
====================================================== */
function safeParse(row) {
  let out = [], cur = "", inside = false;

  for (let ch of row) {
    if (ch === '"' && inside) inside = false;
    else if (ch === '"' && !inside) inside = true;
    else if (ch === "," && !inside) {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

/* ======================================================
   날짜 자동 감지 + 변환
====================================================== */
function detectAndConvertDate(str) {
  if (!str) return 0;

  const s = String(str).trim();

  // 1) "2025. 12. 1" 형식
  if (/^\d{4}\.\s*\d{1,2}\.\s*\d{1,2}$/.test(s)) {
    const p = s.split(".");
    const y = p[0].trim();
    const m = p[1].trim().padStart(2, "0");
    const d = p[2].trim().padStart(2, "0");
    return Number(`${y}${m}${d}`);
  }

  // 2) 슬래시 날짜 "12/1/2025"
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(s)) {
    const [m, d, y] = s.split("/");
    return Number(`${y}${m.padStart(2, "0")}${d.padStart(2, "0")}`);
  }

  // 3) Google Sheets 날짜 숫자 (예: 45300)
  if (!isNaN(s) && Number(s) > 30000) {
    const excelOrigin = new Date(1899, 11, 30);
    const resultDate = new Date(excelOrigin.getTime() + s * 86400000);

    const y = resultDate.getFullYear();
    const m = String(resultDate.getMonth() + 1).padStart(2, "0");
    const d = String(resultDate.getDate()).padStart(2, "0");

    return Number(`${y}${m}${d}`);
  }

  // 4) 알 수 없는 날짜 → 제외
  return 0;
}

/* ======================================================
   기타 유틸
====================================================== */
function clean(s) {
  return String(s).replace(/\uFEFF/g, "").trim();
}

function getTodayYMD() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return Number(`${y}${m}${day}`);
}
