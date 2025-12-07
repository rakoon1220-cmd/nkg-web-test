import { loadCsv } from "./_csv.js";

const SAP_MAT_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vRAWmUNAeyndXfdxHjR-1CakW_Tm3OzmMTng5RkB53umXwucqpxABqMMcB0y8H5cHNg7aoHYqFztz0F/pub?gid=221455512&single=true&output=csv";

const WMS_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vRAWmUNAeyndXfdxHjR-1CakW_Tm3OzmMTng5RkB53umXwucqpxABqMMcB0y8H5cHNg7aoHYqFztz0F/pub?gid=1850233363&single=true&output=csv";

const BARCODE_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vRAWmUNAeyndXfdxHjR-1CakW_Tm3OzmMTng5RkB53umXwucqpxABqMMcB0y8H5cHNg7aoHYqFztz0F/pub?gid=1454119997&single=true&output=csv";

function normalizeRow(r) {
  const out = {};
  for (const k of Object.keys(r)) {
    let v = r[k];
    if (v == null) v = "";
    v = v.toString().replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    out[k.trim()] = v.trim();
  }
  return out;
}

function key(mat, box) {
  return `${(mat || "").trim()}||${(box || "").trim()}`;
}

export default async function handler(req, res) {
  const invRaw =
    (req.query && req.query.inv) ||
    (req.query && req.query.invoice) ||
    "";

  const inv = invRaw.toString().trim();

  if (!inv) {
    return res
      .status(200)
      .json({ ok: false, message: "인보이스가 없습니다." });
  }

  try {
    const [sapRaw, wmsRaw, bcRaw] = await Promise.all([
      loadCsv(SAP_MAT_URL),
      loadCsv(WMS_URL),
      loadCsv(BARCODE_URL),
    ]);

    const sapRows = sapRaw.map(normalizeRow);
    const wmsRows = wmsRaw.map(normalizeRow);
    const bcRows = bcRaw.map(normalizeRow);

    /* ---------- WMS 맵 구성 (자재코드 + 박스번호 → 수량) ---------- */
    const wmsMap = {};
    for (const r of wmsRows) {
      const mat =
        r["자재코드"] || r["자재번호"] || r["품목코드"] || "";
      const box = r["박스번호"] || r["BOX"] || "";
      if (!mat) continue;

      const k = key(mat, box);

      const qtyText =
        r["수량"] ||
        r["재고수량"] ||
        r["WMS수량"] ||
        r["출고수량"] ||
        "";
      const qty =
        Number(qtyText.toString().replace(/,/g, "")) || 0;

      wmsMap[k] = qty;
    }

    /* ---------- 바코드 맵 (자재코드 + 박스번호 → barcode 정보) ---------- */
    const bcMap = {};
    for (const r of bcRows) {
      const mat = r["자재번호"] || r["자재코드"] || "";
      const box = r["박스번호"] || "";
      const barcode = r["바코드"] || "";
      const name = r["자재내역"] || r["품명"] || "";

      if (!mat || !barcode) continue;

      const k = key(mat, box);
      bcMap[k] = { mat, box, name, barcode };
    }

    /* ---------- SAP 자재에서 해당 인보이스 행만 필터 ---------- */
    const items = [];

    for (const r of sapRows) {
      const invVal =
        (r["인보이스"] ||
          r["invoice"] ||
          r["Invoice"] ||
          r["문서번호"] ||
          "").trim();

      if (invVal !== inv) continue;

      const mat = (r["자재코드"] || r["자재번호"] || "").trim();
      const box = (r["박스번호"] || "").trim();
      const name = (r["자재내역"] || r["품명"] || "").trim();

      const sapText =
        (r["출고"] || r["수량"] || "0").toString().replace(/,/g, "");
      const sap = Number(sapText) || 0;

      const unit = r["단위"] || "";
      const no =
        r["번호"] || r["No"] || r["no"] || r["NO"] || "";

      const kExact = key(mat, box);
      const kNoBox = key(mat, "");

      let wms = 0;
      if (wmsMap[kExact] != null) wms = wmsMap[kExact];
      else if (wmsMap[kNoBox] != null) wms = wmsMap[kNoBox];

      let barcode = "";
      // 바코드는 "자재코드 + 박스번호" 기준으로 우선 매칭
      if (bcMap[kExact]) {
        barcode = bcMap[kExact].barcode;
      } else if (bcMap[kNoBox]) {
        barcode = bcMap[kNoBox].barcode;
      }

      items.push({
        no,
        mat,
        box,
        name,
        sap,
        wms,
        unit,
        barcode,
        status: "미검수",
        scanned: 0,
      });
    }

    // 번호 오름차순 기본 정렬
    items.sort((a, b) => {
      const an =
        Number((a.no || "").toString().replace(/[^\d]/g, "")) ||
        0;
      const bn =
        Number((b.no || "").toString().replace(/[^\d]/g, "")) ||
        0;
      return an - bn;
    });

    return res.status(200).json({
      ok: true,
      items,
    });
  } catch (err) {
    console.error("OUTBOUND_ITEMS ERROR:", err);
    return res.status(200).json({
      ok: false,
      message: "출고 품목 조합 중 오류",
      error: err.message || String(err),
    });
  }
}
