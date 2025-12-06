// api/shipping-detail.js — 출고 상세내역 안정판

const SAP_CSV_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vRAWmUNAeyndXfdxHjR-1CakW_Tm3OzmMTng5RkB53umXwucqpxABqMMcB0Y8H5HNg7aoHYqFztz0F/pub?gid=221455512&single=true&output=csv";

const WMS_CSV_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vRAWmUNAeyndXfdxHjR-1CakW_Tm3OzmMTng5RkB53umXwucqpxABqMMcB0Y8H5HNg7aoHYqFztz0F/pub?gid=1850233363&single=true&output=csv";

export default async function handler(req, res) {
  try {
    const invoice = String(req.query.invoice || "").trim();
    if (!invoice) {
      return res.status(400).json({ ok: false, msg: "invoice 값이 없습니다." });
    }

    // 1) SAP CSV 로드
    const sapRes = await fetch(SAP_CSV_URL);
    const sapText = await sapRes.text();
    const sapRows = parseCSV(sapText).slice(1); // 헤더 제외

    // 2) WMS CSV 로드
    const wmsRes = await fetch(WMS_CSV_URL);
    const wmsText = await wmsRes.text();
    const wmsRows = parseCSV(wmsText).slice(1);

    // ▣ WMS → Map(keyFull → 입고수량 합계)
    const wmsMap = new Map();
    for (const r of wmsRows) {
      const keyFull = clean(r[0]);
      if (!keyFull) continue;
      const qty = toNumber(r[4]);
      wmsMap.set(keyFull, (wmsMap.get(keyFull) || 0) + qty);
    }

    // ▣ SAP → 특정 invoice 검색
    const list = [];

    for (const r of sapRows) {
      const keyFull = clean(r[0]);   // A
      const inv = clean(r[1]);       // B
      if (inv !== invoice) continue; // 인보이스 필터

      const date = clean(r[4]);      // E
      const country = clean(r[5]);   // F
      const code = clean(r[6]);      // G 자재코드
      const name = clean(r[7]);      // H 자재내역
      const outQty = toNumber(r[8]); // I 출고수량
      const box = clean(r[9]);       // J 박스번호
      const container = clean(r[14]); // O 컨테이너
      const cbm = clean(r[19]);      // T CBM
      const work = clean(r[18]);     // S 작업여부
      const note = clean(r[23]);     // X 특이사항

      const inQty = toNumber(wmsMap.get(keyFull));
      const diff = inQty - outQty;

      list.push({
        invoice,
        date,
        country,
        code,
        name,
        box,
        outQty,
        inQty,
        diff,
        container,
        cbm,
        work,
        note
      });
    }

    return res.status(200).json({ ok: true, data: list });
  } catch (err) {
    console.error("SHIPPING-DETAIL API ERROR:", err);
    return res.status(500).json({ ok: false, error: err.message });
  }
}

/* ========================= 유틸 ========================= */

function parseCSV(text) {
  text = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const rows = [];
  let row = [];
  let field = "";
  let inside = false;

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

  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function clean(str) {
  if (str == null) return "";
  return String(str)
    .replace(/\uFEFF/g, "")
    .replace(/\n/g, " ")
    .trim();
}

function toNumber(v) {
  if (v == null) return 0;
  const n = parseFloat(String(v).replace(/,/g, "").trim());
  return isNaN(n) ? 0 : n;
}
