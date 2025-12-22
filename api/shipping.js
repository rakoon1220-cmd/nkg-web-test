// /api/shipping.js — Stable Serverless Version (최종본)

export default async function handler(req, res) {
  try {
    const CSV_URL =
      "https://docs.google.com/spreadsheets/d/e/2PACX-1vRAWmUNAeyndXfdxHjR-1CakW_Tm3OzmMTng5RkB53umXwucqpxABqMMcB0y8H5cHNg7aoHYqFztz0F/pub?gid=1070360000&single=true&output=csv";

    // 1) CSV 요청
    const resp = await fetch(CSV_URL);
    if (!resp.ok) throw new Error("CSV 요청 실패: " + resp.status);

    const text = await resp.text();
    const rows = parseCSV(text);

    if (!rows || rows.length <= 1) {
      return res.status(200).json({ ok: true, data: [] });
    }

    const bodyRows = rows.slice(1);
    const today = getTodayYMD();

    const result = [];

    // 2) 데이터 파싱
    for (const r of bodyRows) {
      if (!r || r.length < 20) continue;

      const safe = (i) => clean(r[i] ?? "");

      const dateStr = safe(3);          // D열: 출고일
      const ymd = convertToYMD(dateStr);
      if (!ymd) continue;

      // 오늘 이전 출고 제외
      if (ymd < today) continue;

      result.push({
        ymd,
        date: dateStr,           // 출고일
        invoice: safe(0),        // 인보이스
        country: safe(4),        // 국가
        location: safe(16),      // 상차위치
        pallet: safe(18),        // 파레트
        time: safe(19),          // 상차시간
        cbm: safe(11),           // CBM
        container: safe(9),      // 컨테이너
        work: safe(15),          // 작업여부
        type: safe(10),          // 유형
      });
    }

    // 3) 날짜 기준 정렬 (기본)
    result.sort((a, b) => a.ymd - b.ymd);

    return res.status(200).json({ ok: true, data: result });
  } catch (err) {
    console.error("SHIPPING API ERROR:", err);
    return res.status(500).json({
      ok: false,
      error: err.message || String(err),
    });
  }
}

/* ============================================================
   공통 유틸
============================================================ */

function parseCSV(text) {
  text = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];

    if (c === '"') {
      if (inQuotes && text[i + 1] === '"') {
        field += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (c === "," && !inQuotes) {
      row.push(field);
      field = "";
    } else if (c === "\n" && !inQuotes) {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += c;
    }
  }

  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

function clean(str) {
  return String(str || "")
    .replace(/\uFEFF/g, "")
    .replace(/\r/g, "")
    .replace(/\n/g, " ")
    .trim();
}

function convertToYMD(dateStr) {
  if (!dateStr) return 0;
  const s = dateStr.replace(/\s+/g, "");
  const parts = s.split(".");
  if (parts.length !== 3) return 0;

  const y = parts[0];
  const m = parts[1].padStart(2, "0");
  const d = parts[2].padStart(2, "0");

  return Number(`${y}${m}${d}`);
}

function getTodayYMD() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return Number(`${y}${m}${day}`);
}
