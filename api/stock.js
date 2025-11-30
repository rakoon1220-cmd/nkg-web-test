// api/stock.js

const SAP_CSV_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vRAWmUNAeyndXfdxHjR-1CakW_Tm3OzmMTng5RkB53umXwucqpxABqMMcB0y8H5cHNg7aoHYqFztz0F/pub?gid=221455512&single=true&output=csv";

const WMS_CSV_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vRAWmUNAeyndXfdxHjR-1CakW_Tm3OzmMTng5RkB53umXwucqpxABqMMcB0y8H5cHNg7aoHYqFztz0F/pub?gid=1850233363&single=true&output=csv";

// ------------------------------
// CSV 정밀 파서
// ------------------------------
function parseCsvPrecise(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inside = false;

  text = text.replace(/\r/g, "");

  for (let i = 0; i < text.length; i++) {
    const c = text[i];

    if (c === '"') {
      if (inside && text[i + 1] === '"') {
        field += '"';
        i++;
      } else {
        inside = !inside;
      }
    } else if (c === "," && !inside) {
      row.push(field);
      field = "";
    } else if (c === "\n" && !inside) {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += c;
    }
  }

  row.push(field);
  rows.push(row);

  return rows;
}

// ------------------------------
// 날짜 파싱
// ------------------------------
function parseYmd(text) {
  if (!text) return null;
  let s = String(text).trim();
  if (!s) return null;

  s = s.replace(/\s+/g, "");

  let y, m, d;

  if (s.includes(".")) {
    const parts = s.split(".");
    if (parts.length >= 3) {
      y = parseInt(parts[0], 10);
      m = parseInt(parts[1], 10);
      d = parseInt(parts[2], 10);
    }
  } else if (s.includes("-")) {
    const parts = s.split("-");
    if (parts.length >= 3) {
      if (parts[0].length === 4) {
        y = parseInt(parts[0], 10);
        m = parseInt(parts[1], 10);
        d = parseInt(parts[2], 10);
      } else {
        m = parseInt(parts[0], 10);
        d = parseInt(parts[1], 10);
        y = parseInt(parts[2], 10);
      }
    }
  } else if (s.includes("/")) {
    const parts = s.split("/");
    if (parts.length === 3) {
      m = parseInt(parts[0], 10);
      d = parseInt(parts[1], 10);
      y = parseInt(parts[2], 10);
    } else if (parts.length === 2) {
      const now = new Date();
      y = now.getFullYear();
      m = parseInt(parts[0], 10);
      d = parseInt(parts[1], 10);
    }
  } else {
    const dt = new Date(s);
    if (!isNaN(dt.getTime())) {
      y = dt.getFullYear();
      m = dt.getMonth() + 1;
      d = dt.getDate();
    }
  }

  if (!y || !m || !d) return null;
  const ymd = y * 10000 + m * 100 + d;
  return { year: y, month: m, day: d, ymd };
}

function todayYmd() {
  const now = new Date();
  return now.getFullYear() * 10000 + (now.getMonth() + 1) * 100 + now.getDate();
}

function toNumber(str) {
  if (str == null) return 0;
  const n = parseFloat(String(str).replace(/,/g, "").trim());
  return isNaN(n) ? 0 : n;
}

function isNumeric(str) {
  return /^[0-9]+$/.test(str);
}

// ------------------------------
// Vercel API 핸들러
// ------------------------------
export default async function handler(req, res) {
  try {
    const { key } = req.query;

    if (!key) {
      return res.status(400).json({
        ok: false,
        msg: "검색 키(key)가 없습니다.",
      });
    }

    const rawKey = String(key).trim();
    const keyUpper = rawKey.toUpperCase();
    const numeric = isNumeric(rawKey);
    const today = todayYmd();

    // 1) SAP(출고) CSV
    const sapRes = await fetch(SAP_CSV_URL);
    if (!sapRes.ok) {
      throw new Error("SAP CSV 요청 실패: " + sapRes.status);
    }
    const sapText = await sapRes.text();
    const sapRows = parseCsvPrecise(sapText);
    const sapData = sapRows.slice(1);

    // 2) WMS(입고) CSV
    const wmsRes = await fetch(WMS_CSV_URL);
    if (!wmsRes.ok) {
      throw new Error("WMS CSV 요청 실패: " + wmsRes.status);
    }
    const wmsText = await wmsRes.text();
    const wmsRows = parseCsvPrecise(wmsText);
    const wmsData = wmsRows.slice(1);

    // 3) 입고 맵 (인보이스+자재코드 => 수량 합)
    const wmsMap = new Map();
    for (const r of wmsData) {
      const keyFull = (r[0] || "").trim(); // 인보이스+자재코드
      if (!keyFull) continue;
      const inQty = toNumber(r[4]); // 수량
      if (!wmsMap.has(keyFull)) {
        wmsMap.set(keyFull, inQty);
      } else {
        wmsMap.set(keyFull, wmsMap.get(keyFull) + inQty);
      }
    }

    const matched = [];

    for (const r of sapData) {
      if (!r || r.length === 0) continue;

      const keyFull = (r[0] || "").trim(); // 인보이스+자재코드
      const invoice = (r[1] || "").trim();
      const dateStr = (r[4] || "").trim();
      const country = (r[5] || "").trim();
      const material = (r[6] || "").trim();
      const desc = (r[7] || "").trim();
      const outQty = toNumber(r[8]); // 출고
      const box = (r[9] || "").trim(); // 박스번호
      const work = (r[18] || "").trim(); // 작업여부

      // 날짜 필터 (오늘 이전 제외)
      const parsed = parseYmd(dateStr);
      if (parsed && parsed.ymd < today) continue;

      // 검색 키 필터
      if (numeric) {
        // 숫자 → 자재코드(G열)
        if (material !== rawKey) continue;
      } else {
        // 영문+숫자 → 박스번호(J열)
        if (box.toUpperCase() !== keyUpper) continue;
      }

      const inQty = toNumber(wmsMap.get(keyFull));
      const diff = inQty - outQty;

      matched.push({
        keyFull,
        invoice,
        country,
        date: dateStr,
        material,
        box,
        desc,
        outQty,
        inQty,
        diff,
        work,
      });
    }

    return res.status(200).json({
      ok: true,
      rows: matched,
    });
  } catch (err) {
    console.error("STOCK API ERROR:", err);
    return res.status(500).json({
      ok: false,
      error: err.message || String(err),
    });
  }
}
