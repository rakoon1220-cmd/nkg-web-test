// /api/stock.js — 재고조회 안정판

const SAP_CSV_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vRAWmUNAeyndXfdxHjR-1CakW_Tm3OzmMTng5RkB53umXwucqpxABqMMcB0y8H5cHNg7aoHYqFztz0F/pub?gid=221455512&single=true&output=csv";

const WMS_CSV_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vRAWmUNAeyndXfdxHjR-1CakW_Tm3OzmMTng5RkB53umXwucqpxABqMMcB0y8H5cHNg7aoHYqFztz0F/pub?gid=1850233363&single=true&output=csv";

/* ------------------------------------------------
   공통 유틸
--------------------------------------------------*/
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
      } else inside = !inside;
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

function parseYmd(text) {
  if (!text) return null;
  let s = String(text).trim().replace(/\s+/g, "");
  if (!s) return null;

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

  if (!y || !m || !d) return null;
  return { ymd: y * 10000 + m * 100 + d };
}

function todayYmd() {
  const n = new Date();
  return (
    n.getFullYear() * 10000 +
    (n.getMonth() + 1) * 100 +
    n.getDate()
  );
}

function toNumber(v) {
  if (v == null) return 0;
  const n = parseFloat(String(v).replace(/,/g, "").trim());
  return isNaN(n) ? 0 : n;
}

function isNumeric(str) {
  return /^[0-9]+$/.test(str);
}

/* ------------------------------------------------
   API Handler
--------------------------------------------------*/
export default async function handler(req, res) {
  try {
    const { key } = req.query;

    if (!key) {
      return res
        .status(400)
        .json({ ok: false, msg: "검색 키가 없습니다." });
    }

    const rawKey = String(key).trim();
    const keyUpper = rawKey.toUpperCase();
    const numeric = isNumeric(rawKey);
    const today = todayYmd();

    // 1) SAP CSV
    const sapRes = await fetch(SAP_CSV_URL);
    if (!sapRes.ok) {
      throw new Error("SAP CSV 요청 실패: " + sapRes.status);
    }
    const sapText = await sapRes.text();
    const sapRows = parseCsvPrecise(sapText);
    const sapData = sapRows.slice(1);

    // 2) WMS CSV
    const wmsRes = await fetch(WMS_CSV_URL);
    if (!wmsRes.ok) {
      throw new Error("WMS CSV 요청 실패: " + wmsRes.status);
    }
    const wmsText = await wmsRes.text();
    const wmsRows = parseCsvPrecise(wmsText);
    const wmsData = wmsRows.slice(1);

    // 3) WMS 입고 맵 (인보이스+자재코드 → 입고수량 합)
    const wmsMap = new Map();
    for (const r of wmsData) {
      const full = clean(r[0]);
      if (!full) continue;

      const qty = toNumber(r[4]);
      wmsMap.set(full, (wmsMap.get(full) || 0) + qty);
    }

    // 4) 최종 결과 생성
    const matched = [];

    for (const r of sapData) {
      if (!r || r.length === 0) continue;

      // === 고정 인덱스 (SAP 시트) ===
      // 0: 인보이스+자재코드
      // 1: 인보이스
      // 4: 출고일
      // 5: 국가
      // 6: 자재코드
      // 7: 자재내역
      // 8: 출고
      // 9: 박스번호
      // 12: 컨테이너
      // 16: 작업여부
      const keyFull = clean(r[0]);
      const invoice = clean(r[1]);
      const dateStr = clean(r[4]);
      const country = clean(r[5]);
      const material = clean(r[6]);
      const desc = clean(r[7]);
      const outQty = toNumber(r[8]);
      const box = clean(r[9]);
      const work = clean(r[16]);

      // 출고일 필터 (오늘 포함 이후만)
      const parsed = parseYmd(dateStr);
      if (parsed && parsed.ymd < today) continue;

      // 검색 키 필터
      if (numeric) {
        // 숫자 → 자재코드 부분일치 (예: 7768 → 0000007768…)
        if (!material.includes(rawKey)) continue;
      } else {
        // 영문/문자 → 박스번호 부분일치
        if (!box.toUpperCase().includes(keyUpper)) continue;
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
