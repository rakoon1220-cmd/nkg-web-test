// /api/in-detail.js — 최종본 (입고검수 IN 인보이스 상세)
// ✅ 상태: 미입고 / 부분입고 / 입고완료 / 초과입고 (diff 기준)
// ✅ summary 포함 (상단 카드, 특이사항 모달)

const SAP_CSV_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vRAWmUNAeyndXfdxHjR-1CakW_Tm3OzmMTng5RkB53umXwucqpxABqMMcB0y8H5cHNg7aoHYqFztz0F/pub?gid=221455512&single=true&output=csv";

const WMS_CSV_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vRAWmUNAeyndXfdxHjR-1CakW_Tm3OzmMTng5RkB53umXwucqpxABqMMcB0y8H5cHNg7aoHYqFztz0F/pub?gid=1850233363&single=true&output=csv";

export default async function handler(req, res) {
  try {
    // 1) invoice 정규화
    let invoice = String(req.query.invoice || "").trim().replace(/[^0-9]/g, "");
    if (!invoice) {
      return res.status(400).json({
        ok: false,
        msg: "invoice 값이 없습니다. 예: /api/in-detail?invoice=775803",
      });
    }

    // 2) CSV 로드 (병렬)
    const [sapResp, wmsResp] = await Promise.all([fetch(SAP_CSV_URL), fetch(WMS_CSV_URL)]);
    if (!sapResp.ok) throw new Error("SAP CSV 요청 실패: " + sapResp.status);
    if (!wmsResp.ok) throw new Error("WMS CSV 요청 실패: " + wmsResp.status);

    const [sapText, wmsText] = await Promise.all([sapResp.text(), wmsResp.text()]);
    const sapRows = parseCSV(sapText).slice(1);
    const wmsRows = parseCSV(wmsText).slice(1);

    // 3) WMS Map(keyFull -> qty 합)
    const wmsMap = new Map();
    for (const r of wmsRows) {
      if (!r || r.length < 5) continue;
      const keyFull = clean(r[0]); // A
      if (!keyFull) continue;
      const qty = toNumber(r[4]);  // E
      wmsMap.set(keyFull, (wmsMap.get(keyFull) || 0) + qty);
    }

    // 4) SAP invoice 필터 + items
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
      qty: 0,       // SAP 합
      wmsQty: 0,    // WMS 합
      notice: "",
    };

    for (const r of sapRows) {
      if (!r || r.length < 24) continue;

      const keyFull = clean(r[0]); // A
      const inv = clean(r[1]).replace(/[^0-9]/g, ""); // B
      if (inv !== invoice) continue;

      const date = clean(r[4]);       // E
      const country = clean(r[5]);    // F
      const code = clean(r[6]);       // G
      const name = clean(r[7]);       // H
      const sapQty = toNumber(r[8]);  // I
      const box = clean(r[9]);        // J
      const container = clean(r[14]); // O
      const work = clean(r[18]);      // S
      const cbm = clean(r[19]);       // T
      const loc = clean(r[22]);       // W
      const note = clean(r[23]);      // X

      const wmsQty = toNumber(wmsMap.get(keyFull));
      const diff = wmsQty - sapQty;

      // ✅ 상태 분기 (diff 기준: 초과입고 누락 방지)
      let status = "입고완료";
      let statusClass = "text-emerald-600";

      if (wmsQty === 0) {
        status = "미입고";
        statusClass = "text-slate-500";
      } else if (diff < 0) {
        status = "부분입고";
        statusClass = "text-amber-600";
      } else if (diff > 0) {
        status = "초과입고";
        statusClass = "text-rose-600";
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

      // summary
      if (summary.date === "-" && date) summary.date = date;
      if (summary.country === "-" && country) summary.country = country;
      if (summary.container === "-" && container) summary.container = container;
      if (summary.cbm === "-" && cbm) summary.cbm = cbm;
      if (summary.load_loc === "-" && loc) summary.load_loc = loc;

      summary.qty += sapQty;
      summary.wmsQty += wmsQty;

      if (note) noticeSet.add(note);
    }

    summary.notice = Array.from(noticeSet).join("\n");

    return res.status(200).json({
      ok: true,
      invoice,
      summary,
      rows: items.length,
      data: items,
    });
  } catch (err) {
    console.error("IN-DETAIL API ERROR:", err);
    return res.status(500).json({ ok: false, error: err.message || String(err) });
  }
}

/* CSV 파서 */
function parseCSV(text) {
  text = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
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
      row.push(field); rows.push(row); row = []; field = "";
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

function toNumber(v) {
  const n = parseFloat(String(v || "").replace(/,/g, ""));
  return isNaN(n) ? 0 : n;
}
