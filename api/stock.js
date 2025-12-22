// /api/stock.js — Stable Serverless Version
// ✅ 오늘이전 제외 + ✅ 출고일 정렬 + ✅ MM/DD(연도없음) 내년 보정 + ✅ 안전 length

export default async function handler(req, res) {
  try {
    const { key } = req.query;
    if (!key) {
      return res.status(400).json({ ok: false, msg: "검색 키가 없습니다." });
    }

    const searchKey = String(key).trim();
    const isNumericSearch = /^[0-9]+$/.test(searchKey); // 숫자면 자재코드, 아니면 박스
    const today = getTodayYMD();
    const thisYear = new Date().getFullYear();

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
      if (keyFull) wmsMap.set(keyFull, (wmsMap.get(keyFull) || 0) + qty);
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
      const dateStr = clean(r[4]); // 출고일 (12/01 형태로 올 수 있음)

      // ✅ MM/DD면 "오늘보다 과거면 내년" 보정
      const ymd = convertToYMD(dateStr, today, thisYear);

      // ✅ 오늘 이전 출고 제외 (파싱 실패도 제외)
      if (!ymd || ymd < today) continue;

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
        date: dateStr,
        material,
        box,
        desc,
        outQty,
        inQty,
        diff,
        work,
        _ymd: ymd, // 내부정렬용(응답엔 굳이 안 써도 됨)
      });
    }

    // ✅ 출고일 기준 오름차순 정렬
    matched.sort((a, b) => {
      const da = a._ymd || 99999999;
      const db = b._ymd || 99999999;
      if (da !== db) return da - db;

      const ia = String(a.invoice || "");
      const ib = String(b.invoice || "");
      if (ia !== ib) return ia.localeCompare(ib, "ko");

      const ma = String(a.material || "");
      const mb = String(b.material || "");
      if (ma !== mb) return ma.localeCompare(mb, "ko");

      const बा = String(a.box || "");
      const bb = String(b.box || "");
      return बा.localeCompare(bb, "ko");
    });

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
 * 날짜를 yyyymmdd(Number)로 변환
 * - "YYYY.MM.DD" / "YYYY-MM-DD" / "YYYY/MM/DD" 지원
 * - "MM/DD" / "MM-DD" 지원 (연도 없음 → 올해로 가정, 단 오늘보다 과거면 내년으로 보정)
 */
function convertToYMD(str, todayYMD, thisYear) {
  if (!str) return 0;
  const s = String(str).trim();

  // YYYY.MM.DD / YYYY-MM-DD / YYYY/MM/DD
  let m = s.match(/^(\d{4})[.\-\/](\d{1,2})[.\-\/](\d{1,2})$/);
  if (m) {
    const y = m[1];
    const mo = m[2].padStart(2, "0");
    const d = m[3].padStart(2, "0");
    const ymd = Number(`${y}${mo}${d}`);
    return Number.isFinite(ymd) ? ymd : 0;
  }

  // MM/DD or MM-DD → 올해 기준, 단 오늘보다 과거면 내년으로 보정
  m = s.match(/^(\d{1,2})[\/\-](\d{1,2})$/);
  if (m) {
    const mo = m[1].padStart(2, "0");
    const d = m[2].padStart(2, "0");
    let ymd = Number(`${thisYear}${mo}${d}`);
    if (todayYMD && ymd < todayYMD) {
      ymd = Number(`${thisYear + 1}${mo}${d}`);
    }
    return Number.isFinite(ymd) ? ymd : 0;
  }

  return 0;
}

function getTodayYMD() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return Number(`${y}${m}${day}`);
}
