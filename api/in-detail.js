// /api/in-detail.js — ✅ 최종 (행 누락 0% + 상태 정확)

const SAP_CSV_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vRAWmUNAeyndXfdxHjR-1CakW_Tm3OzmMTng5RkB53umXwucqpxABqMMcB0y8H5cHNg7aoHYqFztz0F/pub?gid=221455512&single=true&output=csv";

const WMS_CSV_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vRAWmUNAeyndXfdxHjR-1CakW_Tm3OzmMTng5RkB53umXwucqpxABqMMcB0y8H5cHNg7aoHYqFztz0F/pub?gid=1850233363&single=true&output=csv";

export default async function handler(req, res) {
  // ✅ 캐시 방지(반영 즉시)
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
  res.setHeader("Pragma", "no-cache");

  try {
    // 1) invoice 정규화 (숫자만)
    let invoice = String(req.query.invoice || "").trim().replace(/[^0-9]/g, "");
    if (!invoice) {
      return res.status(400).json({ ok: false, msg: "invoice 값이 없습니다. 예: /api/in-detail?invoice=775803" });
    }

    // 2) CSV 로드 (병렬)
    const [sapResp, wmsResp] = await Promise.all([fetch(SAP_CSV_URL), fetch(WMS_CSV_URL)]);
    if (!sapResp.ok) throw new Error("SAP CSV 요청 실패: " + sapResp.status);
    if (!wmsResp.ok) throw new Error("WMS CSV 요청 실패: " + wmsResp.status);

    const [sapText, wmsText] = await Promise.all([sapResp.text(), wmsResp.text()]);

    const sapRows = parseCSV(sapText).slice(1);
    const wmsRows = parseCSV(wmsText).slice(1);

    // ✅ keyFull 정규화(공백 제거)
    const normKey = (v) => clean(v).replace(/\s+/g, "");

    // 3) WMS → Map(keyFull → 입고수량 합계)
    const wmsMap = new Map();
    for (const r of wmsRows) {
      if (!r || r.length < 1) continue;

      const keyFull = normKey(r[0]); // A
      if (!keyFull) continue;

      // WMS 수량(E=4) (없으면 0)
      const qty = toNumber(r?.[4]);
      wmsMap.set(keyFull, (wmsMap.get(keyFull) || 0) + qty);
    }

    // 4) SAP → invoice 필터 + 상세내역
    const items = [];

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
    const noticeSet = new Set();

    for (const r of sapRows) {
      if (!r || r.length < 2) continue; // ✅ 최소만 체크

      const safe = (i) => clean(r?.[i] ?? "");

      const keyFull = normKey(safe(0));                    // A
      const inv = safe(1).replace(/[^0-9]/g, "");          // B
      if (inv !== invoice) continue;

      const date = safe(4);         // E
      const country = safe(5);      // F
      const code = safe(6);         // G
      const name = safe(7);         // H
      const sapQty = toNumber(safe(8)); // I
      const box = safe(9);          // J
      const container = safe(14);   // O
      const work = safe(18);        // S
      const cbm = safe(19);         // T
      const loc = safe(22);         // W (없어도 OK)
      const note = safe(23);        // X (없어도 OK)

      const wmsQty = toNumber(wmsMap.get(keyFull)); // ✅ 매칭 실패 시 0
      const diff = wmsQty - sapQty;

      // ✅ 상태 정확히
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

/* ===========================
   CSV 파서 (따옴표/콤마/줄바꿈 100%)
=========================== */
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

function toNumber(v) {
  const n = parseFloat(String(v ?? "").replace(/,/g, ""));
  return isNaN(n) ? 0 : n;
}
