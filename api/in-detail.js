// /api/in-detail.js — ✅ 최종버전 (입고검수용: 미입고 포함 + 초과/부분/완료 정확표시 + debug지원)
// 목적:
// - 미입고(WMS=0)도 "안들어온거 확인"을 위해 ✅표시
// - 부분입고/초과입고/입고완료 ✅표시
// - keyFull 정규화 + 숫자 파싱 강화 + debug=1 카운트/헤더 확인

const SAP_CSV_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vRAWmUNAeyndXfdxHjR-1CakW_Tm3OzmMTng5RkB53umXwucqpxABqMMcB0y8H5cHNg7aoHYqFztz0F/pub?gid=221455512&single=true&output=csv";

const WMS_CSV_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vRAWmUNAeyndXfdxHjR-1CakW_Tm3OzmMTng5RkB53umXwucqpxABqMMcB0y8H5cHNg7aoHYqFztz0F/pub?gid=1850233363&single=true&output=csv";

// ✅ WMS "입고수량" 컬럼 인덱스 (0부터)
// 기본값 4(E열). 만약 debug에서 헤더 보고 다르면 여기만 바꿔.
const WMS_QTY_INDEX = 4;

export default async function handler(req, res) {
  try {
    const debug = String(req.query.debug || "") === "1";

    // 1) invoice 정규화
    let invoice = String(req.query.invoice || "").trim().replace(/[^0-9]/g, "");
    if (!invoice) {
      return res.status(400).json({
        ok: false,
        msg: "invoice 값이 없습니다. 예: /api/in-detail?invoice=775803",
      });
    }

    // 2) CSV 병렬 로드
    const [sapResp, wmsResp] = await Promise.all([fetch(SAP_CSV_URL), fetch(WMS_CSV_URL)]);
    if (!sapResp.ok) throw new Error("SAP CSV 요청 실패: " + sapResp.status);
    if (!wmsResp.ok) throw new Error("WMS CSV 요청 실패: " + wmsResp.status);

    const [sapText, wmsText] = await Promise.all([sapResp.text(), wmsResp.text()]);

    // 3) 파싱
    const sapAll = parseCSV(sapText);
    const wmsAll = parseCSV(wmsText);

    const sapRows = sapAll.slice(1);
    const wmsRows = wmsAll.slice(1);

    // 4) WMS Map(keyFull -> 입고수량 합)
    const wmsMap = new Map();
    for (const r of wmsRows) {
      if (!r || r.length <= WMS_QTY_INDEX) continue;
      const keyFull = normKey(r[0]);
      if (!keyFull) continue;

      const qty = toNumber(r[WMS_QTY_INDEX]);
      wmsMap.set(keyFull, (wmsMap.get(keyFull) || 0) + qty);
    }

    // 5) SAP invoice 필터 + items
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
      qty: 0,     // SAP 합(인보이스 전체)
      wmsQty: 0,  // WMS 합(인보이스 전체)
      notice: "",
    };

    // debug counters
    let cntMissing = 0, cntPartial = 0, cntDone = 0, cntOver = 0;
    let sampleOver = null; // 초과입고 샘플 1개

    for (const r of sapRows) {
      if (!r || r.length < 24) continue;

      const keyFull = normKey(r[0]);                       // A: keyFull
      const inv = clean(r[1]).replace(/[^0-9]/g, "");       // B: invoice
      if (inv !== invoice) continue;

      const date = clean(r[4]);                             // E
      const country = clean(r[5]);                          // F
      const code = clean(r[6]);                             // G
      const name = clean(r[7]);                             // H
      const sapQty = toNumber(r[8]);                        // I
      const box = clean(r[9]);                              // J
      const container = clean(r[14]);                       // O
      const work = clean(r[18]);                            // S
      const cbm = clean(r[19]);                             // T
      const loc = clean(r[22]);                             // W
      const note = clean(r[23]);                            // X

      const wmsQty = toNumber(wmsMap.get(keyFull));
      const diff = wmsQty - sapQty;

      // summary (전체 합)
      summary.qty += sapQty;
      summary.wmsQty += wmsQty;

      if (summary.date === "-" && date) summary.date = date;
      if (summary.country === "-" && country) summary.country = country;
      if (summary.container === "-" && container) summary.container = container;
      if (summary.cbm === "-" && cbm) summary.cbm = cbm;
      if (summary.load_loc === "-" && loc) summary.load_loc = loc;

      if (note) noticeSet.add(note);

      // ✅ 상태 분기 (입고검수 목적: 미입고도 표시)
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
        if (!sampleOver) {
          sampleOver = { box, code, name, sapQty, wmsQty, diff, keyFull };
        }
      } else {
        cntDone++;
      }

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

    const payload = {
      ok: true,
      invoice,
      summary,
      rows: items.length,
      data: items,
    };

    if (debug) {
      payload.debugInfo = {
        WMS_QTY_INDEX,
        sapHeader: sapAll[0] || [],
        wmsHeader: wmsAll[0] || [],
        cntMissing,
        cntPartial,
        cntDone,
        cntOver,
        sampleOver,
        note: "초과입고가 0이면: 1) 실제 초과가 없거나 2) WMS_QTY_INDEX가 틀리거나 3) keyFull 매칭이 어긋난 것",
      };
    }

    return res.status(200).json(payload);
  } catch (err) {
    console.error("IN-DETAIL API ERROR:", err);
    return res.status(500).json({ ok: false, error: err.message || String(err) });
  }
}

/* ============================================================
   CSV 파서 (따옴표/콤마/줄바꿈 안정)
============================================================ */
function parseCSV(text) {
  text = String(text || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
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

  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

/* ============================================================
   문자열/키 정규화
============================================================ */
function clean(str) {
  return String(str || "")
    .replace(/\uFEFF/g, "")
    .replace(/\r/g, "")
    .replace(/\n/g, " ")
    .trim();
}

// ✅ keyFull은 공백 차이로 매칭이 깨지기 쉬워서 공백을 모두 제거
function normKey(str) {
  return clean(str).replace(/\s+/g, "");
}

/* ============================================================
   숫자 변환 강화
============================================================ */
function toNumber(v) {
  if (v === null || v === undefined) return 0;
  const s = String(v).trim();
  if (!s || s === "-") return 0;

  // 숫자/마이너스/소수점/콤마 외 제거 -> 콤마 제거 -> parseFloat
  const cleaned = s.replace(/[^0-9,.\-]/g, "").replace(/,/g, "");
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n;
}
