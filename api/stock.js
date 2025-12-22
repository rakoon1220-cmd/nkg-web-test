// /api/stock.js — FINAL (연도 추정 금지, 공백 포함 날짜 파싱 강화)
// ✅ 출고일은 원본 그대로 사용 (예: "2025. 12. 01")
// ✅ 필터/정렬은 "연도 포함 날짜"만 인정
// ✅ MM/DD(연도 없음)로 내려오는 행은 제외(무결성 유지)
// ✅ 오늘 이전 제외 + ✅ 출고일 기준 정렬 + ✅ 안전 length

export default async function handler(req, res) {
  try {
    const { key } = req.query;
    if (!key) {
      return res.status(400).json({ ok: false, msg: "검색 키가 없습니다." });
    }

    const searchKey = String(key).trim();
    const isNumericSearch = /^[0-9]+$/.test(searchKey); // 숫자면 자재코드, 아니면 박스
    const today = getTodayYMD();

    // 📌 SAP & WMS CSV URL
    const SAP_CSV_URL =
      "https://docs.google.com/spreadsheets/d/e/2PACX-1vRAWmUNAeyndXfdxHjR-1CakW_Tm3OzmMTng5RkB53umXwucqpxABqMMcB0y8H5cHNg7aoHYqFztz0F/pub?gid=221455512&single=true&output=csv";

    const WMS_CSV_URL =
      "https://docs.google.com/spreadsheets/d/e/2PACX-1vRAWmUNAeyndXfdxHjR-1CakW_Tm3OzmMTng5RkB53umXwucqpxABqMMcB0y8H5cHNg7aoHYqFztz0F/pub?gid=1850233363&single=true&output=csv";

    // ======================
    // 1) SAP CSV 읽기
    // ======================
    const sapResp = await fetch(SAP_CSV_URL);
    if (!sapResp.ok) throw new Error("SAP CSV 요청 실패");
    const sapText = await sapResp.text();
    const sapRows = parseCSV(sapText).slice(1); // 헤더 제외

    // ======================
    // 2) WMS CSV 읽기
    // ======================
    const wmsResp = await fetch(WMS_CSV_URL);
    if (!wmsResp.ok) throw new Error("WMS CSV 요청 실패");
    const wmsText = await wmsResp.text();
    const wmsRows = parseCSV(wmsText).slice(1);

    // ======================
    // 3) WMS 입고수량 맵 생성 (keyFull 기준)
    // ======================
    const wmsMap = new Map();
    for (const r of wmsRows) {
      if (!r || r.length < 5) continue;

      const keyFull = clean(r[0]); // 인보이스+자재코드
      const qty = toNumber(r[4]);

      if (keyFull) {
        wmsMap.set(keyFull, (wmsMap.get(keyFull) || 0) + qty);
      }
    }

    // ======================
    // 4) SAP + WMS 결합 & 필터링
    // ======================
    const matched = [];

    for (const r of sapRows) {
      // work(r[18])까지 쓰므로 최소 19칸 필요
      if (!r || r.length < 19) continue;

      const keyFull = clean(r[0]);
      const invoice = clean(r[1]);
      const dateStr = clean(r[4]); // 출고일 (원본 그대로 저장)

      // ✅ 연도 포함 날짜만 파싱 (공백/점/하이픈/슬래시 허용)
      const ymd = convertToYMD(dateStr);

      // ✅ 연도 없는 날짜(MM/DD 등)는 제외 (무결성)
      if (!ymd) continue;

      // ✅ 오늘 이전 출고 제외
      if (ymd < today) continue;

      const country = clean(r[5]);
      const material = clean(r[6]);
      const desc = clean(r[7]);
      const outQty = toNumber(r[8]);
      const box = clean(r[9]);
      const work = clean(r[18]);

      // 검색 조건
      if (isNumericSearch) {
        if (material !== searchKey) continue;
      } else {
        if (box.toUpperCase() !== searchKey.toUpperCase()) continue;
      }

      const inQty = toNumber(wmsMap.get(keyFull));
      const diff = inQty - outQty;

      matched.push({
        keyFull,
        invoice,
        country,
        date: dateStr, // ✅ 표시: 원본 그대로 (예: "2025. 12. 1")
        material,
        box,
        desc,
        outQty,
        inQty,
        diff,
        work,
        _ymd: ymd, // ✅ 정렬용 숫자
      });
    }

    // ✅ 출고일 기준 오름차순 정렬 (빠른 날짜 → 늦은 날짜)
    matched.sort((a, b) => a._ymd - b._ymd);

    // _ymd 제거(응답 깔끔하게)
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

/* ====================================================================
   공통 유틸
==================================================================== */

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

function toNumber(v) {
  const n = parseFloat(String(v || "").replace(/,/g, ""));
  return isNaN(n) ? 0 : n;
}

/**
 * ✅ 연도 포함 날짜만 허용 (공백 포함 강력 지원)
 * - "2025. 12. 1" / "2025.12.01" / "2025-12-1" / "2025/12/01" 모두 OK
 * - "12/01" 같은 연도 없는 값은 0 반환 (제외)
 */
function convertToYMD(str) {
  if (!str) return 0;
  const s = String(str).trim();

  const m = s.match(/^(\d{4})\s*[.\-\/]\s*(\d{1,2})\s*[.\-\/]\s*(\d{1,2})$/);
  if (!m) return 0;

  const y = m[1];
  const mo = String(m[2]).padStart(2, "0");
  const d = String(m[3]).padStart(2, "0");

  const ymd = Number(`${y}${mo}${d}`);
  return Number.isFinite(ymd) ? ymd : 0;
}

function getTodayYMD() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return Number(`${y}${m}${day}`);
}
