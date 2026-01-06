// /api/in-detail.js — ✅ 최종 수정본 (행 누락 방지 버전)
// 핵심 수정:
// - ✅ r.length < 24 같은 강제 스킵 제거
// - ✅ safe(i)로 undefined 안전처리
// - ✅ invoice 숫자 정규화, keyFull 공백 제거
// - ✅ WMS 입고수량 컬럼 "헤더명" 자동 탐지
// - debug=1 지원

const SAP_CSV_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vRAWmUNAeyndXfdxHjR-1CakW_Tm3OzmMTng5RkB53umXwucqpxABqMMcB0y8H5cHNg7aoHYqFztz0F/pub?gid=221455512&single=true&output=csv";

const WMS_CSV_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vRAWmUNAeyndXfdxHjR-1CakW_Tm3OzmMTng5RkB53umXwucqpxABqMMcB0y8H5cHNg7aoHYqFztz0F/pub?gid=1850233363&single=true&output=csv";

const WMS_QTY_HEADER_CANDIDATES = [
  "입고수량",
  "입고 수량",
  "수량",
  "INQTY",
  "IN QTY",
  "QTY",
  "Qty",
  "qty",
];

export default async function handler(req, res) {
  try {
    const debug = String(req.query.debug || "") === "1";

    let invoice = String(req.query.invoice || "").trim().replace(/[^0-9]/g, "");
    if (!invoice) return res.status(400).json({ ok: false, msg: "invoice 값이 없습니다." });

    const [sapResp, wmsResp] = await Promise.all([fetch(SAP_CSV_URL), fetch(WMS_CSV_URL)]);
    if (!sapResp.ok) throw new Error("SAP CSV 요청 실패: " + sapResp.status);
    if (!wmsResp.ok) throw new Error("WMS CSV 요청 실패: " + wmsResp.status);

    const [sapText, wmsText] = await Promise.all([sapResp.text(), wmsResp.text()]);
    const sapAll = parseCSV(sapText);
    const wmsAll = parseCSV(wmsText);

    const sapHeader = (sapAll[0] || []).map(clean);
    const wmsHeader = (wmsAll[0] || []).map(clean);

    const sapRows = sapAll.slice(1);
    const wmsRows = wmsAll.slice(1);

    // ✅ WMS 수량 컬럼 자동탐지
    const wmsQtyIndex = findHeaderIndex(wmsHeader, WMS_QTY_HEADER_CANDIDATES);
    if (wmsQtyIndex < 0) {
      return res.status(500).json({
        ok: false,
        error: "WMS 헤더에서 '입고수량' 컬럼을 찾지 못했습니다.",
        ...(debug ? { wmsHeader } : {}),
      });
    }

    // 1) WMS Map(keyFull -> 입고수량 합)
    const wmsMap = new Map();
    for (const r of wmsRows) {
      const keyFull = normKey(r?.[0]);
      if (!keyFull) continue;
      const qty = toNumber(r?.[wmsQtyIndex]);
      wmsMap.set(keyFull, (wmsMap.get(keyFull) || 0) + qty);
    }

    // 2) SAP invoice 필터 + 결과
    const items = [];
    const noticeSet = new Set();

    const summary = {
      invoice,
      date: "-",
      country: "-",
      container: "-",
      cbm: "-",
      load_loc: "-",
      load_time: "-",
      qty: 0,
      wmsQty: 0,
      notice: "",
    };

    let cntMissing = 0, cntPartial = 0, cntDone = 0, cntOver = 0;
    let sampleOver = null;
    let maxDiff = { diff: -Infinity, row: null };

    for (const r of sapRows) {
      if (!r || r.length < 2) continue; // ✅ 최소만 체크 (invoice 읽을 정도)

      const safe = (i) => clean(r[i] ?? "");

      const keyFull = normKey(safe(0));
      const inv = safe(1).replace(/[^0-9]/g, "");
      if (inv !== invoice) continue;

      const date = safe(4);       // E
      const country = safe(5);    // F
      const code = safe(6);       // G
      const name = safe(7);       // H
      const sapQty = toNumber(safe(8)); // I
      const box = safe(9);        // J
      const container = safe(14); // O
      const work = safe(18);      // S
      const cbm = safe(19);       // T
      const loc = safe(22);       // W (없어도 OK)
      const note = safe(23);      // X (없어도 OK)

      const wmsQty = toNumber(wmsMap.get(keyFull));
      const diff = wmsQty - sapQty;

      summary.qty += sapQty;
      summary.wmsQty += wmsQty;

      if (summary.date === "-" && date) summary.date = date;
      if (summary.country === "-" && country) summary.country = country;
      if (summary.container === "-" && container) summary.container = container;
      if (summary.cbm === "-" && cbm) summary.cbm = cbm;
      if (summary.load_loc === "-" && loc) summary.load_loc = loc;

      if (note) noticeSet.add(note);

      let status = "입고완료";
      let statusClass = "text-emerald-600";

      if (wmsQty === 0) {
        status = "미입고";
        statusClass = "text-slate-500";
        cntMissing++;
      } else if (diff < 0) {
        status = "부분입고";
        statusClass = "text-amber-600";
        cntPartial++;
      } else if (diff > 0) {
        status = "초과입고";
        statusClass = "text-rose-600";
        cntOver++;
        if (!sampleOver) sampleOver = { box, code, name, sapQty, wmsQty, diff, keyFull };
      } else {
        cntDone++;
      }

      if (diff > maxDiff.diff) maxDiff = { diff, row: { box, code, name, sapQty, wmsQty, keyFull } };

      items.push({
        no: items.length + 1,
        keyFull,
        invoice: inv,
        date,
        country,
        code,
        name,
        box,
        sapQty,
        wmsQty,
        diff,
        container,
        cbm,
        loc,
        work,
        note,
        status,
        statusClass,
      });
    }

    summary.notice = Array.from(noticeSet).join("\n");

    const payload = { ok: true, invoice, summary, rows: items.length, data: items };

    if (debug) {
      payload.debugInfo = {
        wmsQtyIndex,
        cntMissing,
        cntPartial,
        cntDone,
        cntOver,
        sampleOver,
        maxDiff,
        sapHeader,
        wmsHeader,
      };
    }

    return res.status(200).json(payload);
  } catch (err) {
    console.error("IN-DETAIL API ERROR:", err);
    return res.status(500).json({ ok: false, error: err.message || String(err) });
  }
}

/* ===== helpers ===== */
function findHeaderIndex(headerRow, candidates) {
  const norm = headerRow.map((h) => clean(h).toLowerCase().replace(/\s+/g, ""));
  for (const c of candidates) {
    const key = String(c).toLowerCase().replace(/\s+/g, "");
    const idx = norm.indexOf(key);
    if (idx >= 0) return idx;
  }
  return -1;
}

function parseCSV(text) {
  text = String(text || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (inQuotes && text[i + 1] === '"') { field += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (c === "," && !inQuotes) {
      row.push(field); field = "";
    } else if (c === "\n" && !inQuotes) {
      row.push(field); rows.push(row);
      row = []; field = "";
    } else {
      field += c;
    }
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows;
}

function clean(str) {
  return String(str || "")
    .replace(/\uFEFF/g, "")
    .replace(/\r/g, "")
    .replace(/\n/g, " ")
    .trim();
}

function normKey(s) {
  return clean(s).replace(/\s+/g, "");
}

function toNumber(v) {
  if (v === null || v === undefined) return 0;
  const s = String(v).trim();
  if (!s || s === "-") return 0;
  const cleaned = s.replace(/[^0-9,.\-]/g, "").replace(/,/g, "");
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n;
}
