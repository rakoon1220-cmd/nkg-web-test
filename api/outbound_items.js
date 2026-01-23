// api/outbound_items.js
import { loadCsv } from "./_csv.js";

const SAP_ITEM_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vRAWmUNAeyndXfdxHjR-1CakW_Tm3OzmMTng5RkB53umXwucqpxABqMMcB0y8H5cHNg7aoHYqFztz0F/pub?gid=221455512&single=true&output=csv";

const WMS_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vRAWmUNAeyndXfdxHjR-1CakW_Tm3OzmMTng5RkB53umXwucqpxABqMMcB0y8H5cHNg7aoHYqFztz0F/pub?gid=1850233363&single=true&output=csv";

const BARCODE_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vRAWmUNAeyndXfdxHjR-1CakW_Tm3OzmMTng5RkB53umXwucqpxABqMMcB0y8H5cHNg7aoHYqFztz0F/pub?gid=1454119997&single=true&output=csv";

// 인보이스 정규화
function normalizeInv(v) {
  if (!v) return "";
  return v.toString().replace(/[^0-9]/g, "").replace(/^0+/, "");
}

// 캐시 깨기
function bust(url) {
  const t = Date.now();
  return url.includes("?") ? `${url}&t=${t}` : `${url}?t=${t}`;
}

function asText(v) {
  if (v === null || v === undefined) return "";
  return String(v).trim();
}

function asNum(v, def = 0) {
  const s = asText(v);
  if (!s) return def;
  const n = Number(s.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : def;
}

// 공백/BOM/제로폭/nbsp 제거해서 헤더 매칭
function pickLoose(r, keys) {
  const clean = (s) =>
    String(s ?? "")
      .replace(/[\s\uFEFF\u200B\u00A0]/g, "")
      .trim();

  const norm = {};
  for (const k of Object.keys(r || {})) {
    norm[clean(k)] = r[k];
  }
  for (const want of keys) {
    const v = norm[clean(want)];
    if (v !== undefined) return asText(v);
  }
  return "";
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");

  const { inv, debug } = req.query;

  if (!inv) {
    return res.status(200).json({ ok: false, message: "인보이스가 없습니다." });
  }

  try {
    const [sapRows, wmsRows, barcodeRows] = await Promise.all([
      loadCsv(bust(SAP_ITEM_URL)),
      loadCsv(bust(WMS_URL)),
      loadCsv(bust(BARCODE_URL)),
    ]);

    // ✅ 디버그용 메타 (CSV가 HTML로 오면 여기서 바로 티남)
    const meta = {
      sapCount: Array.isArray(sapRows) ? sapRows.length : -1,
      wmsCount: Array.isArray(wmsRows) ? wmsRows.length : -1,
      barcodeCount: Array.isArray(barcodeRows) ? barcodeRows.length : -1,
      sapKeys0: sapRows?.[0] ? Object.keys(sapRows[0]) : [],
      wmsKeys0: wmsRows?.[0] ? Object.keys(wmsRows[0]) : [],
      barcodeKeys0: barcodeRows?.[0] ? Object.keys(barcodeRows[0]) : [],
      sapRow0: sapRows?.[0] || null,
      wmsRow0: wmsRows?.[0] || null,
      barcodeRow0: barcodeRows?.[0] || null,
    };

    const targetInv = normalizeInv(inv);

    // 1) SAP에서 인보이스 필터
    const sapList = (sapRows || []).filter((r) => {
      const invCol = normalizeInv(pickLoose(r, ["인보이스"]) || r?.["인보이스"]);
      return invCol === targetInv;
    });

    // 2) WMS 맵 생성 (여기가 실패하면 wmsQty 전부 0)
    const wmsMap = {};
    (wmsRows || []).forEach((r) => {
      const invKey = normalizeInv(
        pickLoose(r, ["인보이스", "INV", "INVNO", "INV NO"]) || r?.["인보이스"]
      );

      const mat =
        pickLoose(r, ["상품코드", "자재코드", "품목코드", "상품 코드", "자재 코드"]) ||
        asText(r?.["상품코드"]) ||
        asText(r?.["자재코드"]);

      const box =
        pickLoose(r, ["박스번호", "박스 번호", "BOX", "BOXNO", "BOX NO"]) ||
        asText(r?.["박스번호"]);

      const qty =
        asNum(pickLoose(r, ["수량", "QTY", "qty", "수량합계"]) || r?.["수량"], 0);

      if (!invKey || !mat || !box) return;
      wmsMap[`${invKey}__${mat}__${box}`] = qty;
    });

    // 3) 바코드 맵
    const barcodeMap = {};
    (barcodeRows || []).forEach((r) => {
      const mat = pickLoose(r, ["자재번호", "자재코드", "상품코드"]) || asText(r?.["자재번호"]);
      const box = pickLoose(r, ["박스번호", "박스 번호"]) || asText(r?.["박스번호"]);
      const barcode = pickLoose(r, ["바코드", "BARCODE", "barcode"]) || asText(r?.["바코드"]);
      const name = pickLoose(r, ["자재내역", "품명", "상품명"]) || asText(r?.["자재내역"]);
      if (!mat || !barcode) return;
      const key = `${mat}__${box}`;
      if (!barcodeMap[key]) barcodeMap[key] = { barcode, name, box };
    });

    // 4) 아이템 구성
    const items = sapList.map((r) => {
      const no = asText(r?.["번호"]);
      const mat = asText(r?.["자재코드"]);
      const box = asText(r?.["박스번호"]);
      const name = asText(r?.["자재내역"]);
      const sapQty = asNum(r?.["출고"], 0);
      const unit = asText(r?.["단위"]);
      const invMatKey = asText(r?.["인보이스+자재코드"]);

      const wmsKey = `${targetInv}__${mat}__${box}`;
      const wmsQty = asNum(wmsMap[wmsKey] ?? 0, 0);
      const compare = sapQty - wmsQty;

      const work = pickLoose(r, ["작업여부", "작업 여부", "작업", "WORK", "work"]);

      const binfo = barcodeMap[`${mat}__${box}`];
      const barcode = binfo ? binfo.barcode : "";

      return { invKey: invMatKey, no, mat, box, name, sap: sapQty, wms: wmsQty, compare, unit, work, barcode, status: "미완료" };
    });

    items.sort((a, b) => Number(a.no || 0) - Number(b.no || 0));

    // ✅ debug=1이면 메타 같이 내려줌
    if (String(debug) === "1") {
      return res.status(200).json({ ok: true, items, meta, sampleWmsMapSize: Object.keys(wmsMap).length });
    }

    return res.status(200).json({ ok: true, items });
  } catch (err) {
    console.error("OUTBOUND_ITEMS ERROR:", err);
    return res.status(200).json({ ok: false, message: "출고 품목 조회 오류", error: err.message });
  }
}
