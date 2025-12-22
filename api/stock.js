// /api/stock.js — FINAL STABLE VERSION
// ✅ 오늘이전 제외
// ✅ 출고일(_ymd) 기준 정렬
// ✅ MM/DD(연도없음) → 오늘보다 과거면 내년 보정
// ✅ 2026년 데이터 정상 조회

export default async function handler(req, res) {
  try {
    const { key } = req.query;
    if (!key) {
      return res.status(400).json({ ok: false, msg: "검색 키가 없습니다." });
    }

    const searchKey = String(key).trim();
    const isNumericSearch = /^[0-9]+$/.test(searchKey);
    const today = getTodayYMD();
    const thisYear = new Date().getFullYear();

    // ======================
    // CSV URL
    // ======================
    const SAP_CSV_URL =
      "https://docs.google.com/spreadsheets/d/e/2PACX-1vRAWmUNAeyndXfdxHjR-1CakW_Tm3OzmMTng5RkB53umXwucqpxABqMMcB0y8H5cHNg7aoHYqFztz0F/pub?gid=221455512&single=true&output=csv";

    const WMS_CSV_URL =
      "https://docs.google.com/spreadsheets/d/e/2PACX-1vRAWmUNAeyndXfdxHjR-1CakW_Tm3OzmMTng5RkB53umXwucqpxABqMMcB0y8H5cHNg7aoHYqFztz0F/pub?gid=1850233363&single=true&output=csv";

    // ======================
    // 1) SAP
    // ======================
    const sapText = await (await fetch(SAP_CSV_URL)).text();
    const sapRows = parseCSV(sapText).slice(1);

    // ======================
    // 2) WMS
    // ======================
    const wmsText = await (await fetch(WMS_CSV_URL)).text();
    const wmsRows = parseCSV(wmsText).slice(1);

    // ======================
    // 3) WMS 입고 맵
    // ======================
    const wmsMap = new Map();
    for (const r of wmsRows) {
      if (!r || r.length < 5) continue;
      const keyFull = clean(r[0]);
      const qty = toNumber(r[4]);
      if (keyFull) wmsMap.set(keyFull, (wmsMap.get(keyFull) || 0) + qty);
    }

    // ======================
    // 4) 결합 + 필터
    // ======================
    const matched = [];

    for (const r of sapRows) {
      if (!r || r.length < 19) continue;

      const keyFull = clean(r[0]);
      const invoice = clean(r[1]);
      const dateStr = clean(r[4]);

      const ymd = convertToYMD(dateStr, today, thisYear);
      if (!ymd || ymd < today) continue;

      const material = clean(r[6]);
      const box = clean(r[9]);

      if (isNumericSearch) {
        if (material !== searchKey) continue;
      } else {
        if (box.toUpperCase() !== searchKey.toUpperCase()) continue;
      }

      const outQty = toNumber(r[8]);
      const inQty = toNumber(wmsMap.get(keyFull));
      const diff = inQty - outQty;

      matched.push({
        invoice,
        country: clean(r[5]),
        date: dateStr,
        material,
        box,
        desc: clean(r[7]),
        outQty,
        inQty,
        diff,
        work: clean(r[18]),
        _ymd: ymd, // 🔑 정렬 기준
      });
    }

    // ======================
    // ✅ 출고일 기준 정렬 (핵심)
    // ======================
    matched.sort((a, b) => a._ymd - b._ymd);

    // _ymd 제거
    const data = matched.map(({ _ymd, ...rest }) => rest);

    return res.status(200).json({
      ok: true,
      rows: data.length,
      data,
    });
  } catch (err) {
    console.error("STOCK API ERROR:", err);
    return res.status(500).json({ ok: false, error: err.message });
  }
}

/* =========================
   Utils
========================= */

function convertToYMD(str, todayYMD, thisYear) {
  if (!str) return 0;
  const s = String(str).trim();

  let m = s.match(/^(\d{4})[.\-\/](\d{1,2})[.\-\/](\d{1,2})$/);
  if (m) return Number(`${m[1]}${m[2].padStart(2, "0")}${m[3].padStart(2, "0")}`);

  m = s.match(/^(\d{1,2})[\/\-](\d{1,2})$/);
  if (m) {
    let ymd = Number(`${thisYear}${m[1].padStart(2, "0")}${m[2].padStart(2, "0")}`);
    if (ymd < todayYMD) ymd = Number(`${thisYear + 1}${m[1].padStart(2, "0")}${m[2].padStart(2, "0")}`);
    return ymd;
  }

  return 0;
}

function getTodayYMD() {
  const d = new Date();
  return Number(
    `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`
  );
}

function parseCSV(text) {
  text = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const rows = [];
  let row = [], field = "", inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (inQuotes && text[i + 1] === '"') { field += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (c === "," && !inQuotes) {
      row.push(field); field = "";
    } else if (c === "\n" && !inQuotes) {
      row.push(field); rows.push(row); row = []; field = "";
    } else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

function clean(str) {
  return String(str || "").replace(/\uFEFF/g, "").replace(/\r|\n/g, " ").trim();
}

function toNumber(v) {
  const n = parseFloat(String(v || "").replace(/,/g, ""));
  return isNaN(n) ? 0 : n;
}
