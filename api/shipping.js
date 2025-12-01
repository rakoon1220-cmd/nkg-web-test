// /api/shipping.js — 출고정보 상세내역 안정판

const CSV_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vRAWmUNAeyndXfdxHjR-1CakW_Tm3OzmMTng5RkB53umXwucqpxABqMMcB0y8H5cHNg7aoHYqFztz0F/pub?gid=1070360000&single=true&output=csv";

// 공통: 정밀 CSV 파서 (따옴표/줄바꿈/쉼표 안전)
function parseCsvPrecise(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inside = false;

  // CR 제거
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

function clean(str) {
  if (str == null) return "";
  return String(str)
    .replace(/\uFEFF/g, "")
    .replace(/\r/g, "")
    .replace(/\n/g, " ")
    .trim();
}

function convertToYMD(str) {
  if (!str) return 0;
  let s = String(str).trim().replace(/\s+/g, ""); // 공백 제거 (2025. 12. 1 → 2025.12.1)
  if (!s) return 0;

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
    if (parts.length === 3) {
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

  if (!y || !m || !d) return 0;
  return y * 10000 + m * 100 + d;
}

function getTodayYMD() {
  const d = new Date();
  return (
    d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate()
  );
}

export default async function handler(req, res) {
  try {
    const csvRes = await fetch(CSV_URL);
    if (!csvRes.ok) {
      throw new Error("CSV 요청 실패: " + csvRes.status);
    }

    const text = await csvRes.text();
    const rows = parseCsvPrecise(text);
    if (rows.length <= 1) {
      return res.status(200).json({ ok: true, data: [] });
    }

    const body = rows.slice(1); // 헤더 제거
    const today = getTodayYMD();
    const data = [];

    for (const r of body) {
      if (!r || r.length === 0) continue;

      // === 고정 인덱스 (현재 시트 구조 기준) ===
      // A: 인보이스+자재코드   → 0
      // B: 인보이스            → 1
      // C: 인보이스            → 2
      // D: 문서번호            → 3
      // E: 출고일              → 4
      // F: 국가                → 5
      // ...
      // M: 컨테이너            → 12
      // Q: 작업여부            → 16
      // R: CBM                 → 17
      // U: 상차위치            → 20
      // W: 파레트              → 22
      // X: 상차시간            → 23

      const dateStr = clean(r[4]);
      const ymd = convertToYMD(dateStr);
      if (!ymd) continue;

      // 오늘 포함 + 이후만
      if (ymd < today) continue;

      const invoice = clean(r[1]);
      const country = clean(r[5]);
      const location = clean(r[20]);
      const pallet = clean(r[22]);
      const time = clean(r[23]);
      const cbm = clean(r[17]);
      const container = clean(r[12]);
      const work = clean(r[16]);
      const type = clean(r[11]);

      data.push({
        ymd,
        date: dateStr,
        invoice,
        country,
        location,
        pallet,
        time,
        cbm,
        container,
        work,
        type,
      });
    }

    return res.status(200).json({ ok: true, data });
  } catch (err) {
    console.error("SHIPPING API ERROR:", err);
    return res.status(500).json({
      ok: false,
      msg: err.message || String(err),
    });
  }
}
