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

// ✅ Google pub CSV 캐시 깨기용
function bust(url) {
  const t = Date.now();
  return url.includes("?") ? `${url}&t=${t}` : `${url}?t=${t}`;
}

// ✅ 값 안전 문자열
function asText(v) {
  if (v === null || v === undefined) return "";
  return String(v).trim();
}

// ✅ 공백/BOM/제로폭/nbsp 등 “보이지 않는 문자”까지 제거해서 느슨하게 컬럼 찾기
function pickLoose(r, keys) {
  const clean = (s) =>
    String(s ?? "")
      .replace(/[\s\uFEFF\u200B\u00A0]/g, "") // 공백 + BOM + 제로폭 + nbsp 제거
      .trim();

  const norm = {};
  for (const k of Object.keys(r)) {
    norm[clean(k)] = r[k];
  }

  for (const want of keys) {
    const v = norm[clean(want)];
    if (v !== undefined) return asText(v);
  }
  return "";
}

function asNum(v, def = 0) {
  const s = asText(v);
  if (!s) return def;
  const n = Number(s.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : def;
}

export default async function handler(req, res) {
  // ✅ API 응답 캐시 금지
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");

  const { inv } = req.query;

  if (!inv) {
    return res.status(200).json({ ok: false, message: "인보이스가 없습니다." });
  }

  try {
    const [sapRows, wmsRows, barcodeRows] = await Promise.all([
      loadCsv(bust(SAP_ITEM_URL)),
      loadCsv(bust(WMS_URL)),
      loadCsv(bust(BARCODE_URL)),
    ]);

    const targetInv = normalizeInv(inv);

    // 1) SAP 자재자동에서 해당 인보이스만 필터 (SAP는 기존 키로도 잘 읽히지만 안전하게 loose도 섞음)
    const sapList = sapRows.filter((r) => {
      const invCol = normalizeInv(pickLoose(r, ["인보이스"]) || r["인보이스"]);
      return invCol === targetInv;
    });

    // 2) WMS 맵 (인보이스 + 자재코드 + 박스번호 기준)  ✅ 여기서 loose로 읽어야 0 문제 해결
    const wmsMap = {};
    wmsRows.forEach((r) => {
      const invKey = normalizeInv(pickLoose(r, ["인보이스", "INV", "INVNO", "INV NO"]) || r["인보이스"]);
      const mat = pickLoose(r, ["상품코드", "자재코드", "품목코드", "상품 코드", "자재 코드"]);
      const box = pickLoose(r, ["박스번호", "박스 번호", "BOX", "BOXNO", "BOX NO"]);
      const qty = asNum(pickLoose(r, ["수량", "QTY", "qty", "수량합계"]) || r["수량"], 0);

      if (!invKey || !mat || !box) return;

      const key = `${invKey}__${mat}__${box}`;
      wmsMap[key] = qty;
    });

    // 3) 바코드 맵 (자재번호 + 박스번호 → 바코드) ✅ 이것도 loose로 안전하게
    const barcodeMap = {};
    barcodeRows.forEach((r) => {
      const mat = pickLoose(r, ["자재번호", "자재코드", "상품코드"]);
      const box = pickLoose(r, ["박스번호", "박스 번호"]);
      const barcode = pickLoose(r, ["바코드", "BARCODE", "barcode"]);
      const name = pickLoose(r, ["자재내역", "품명", "상품명"]);

      if (!mat || !barcode) return;

      const key = `${mat}__${box}`;
      if (!barcodeMap[key]) {
        barcodeMap[key] = { barcode, name, box };
      }
    });

    // 4) 최종 아이템 리스트 구성 (+ work 추가)
    const items = sapList.map((r) => {
      const no = asText(r["번호"]);
      const mat = asText(r["자재코드"]);
      const box = asText(r["박스번호"]);
      const name = asText(r["자재내역"]);
      const sapQty = asNum(r["출고"], 0);
      const unit = asText(r["단위"]);

      const invMatKey = asText(r["인보이스+자재코드"]);
      const wmsKey = `${targetInv}__${mat}__${box}`;
      const wmsQty = asNum(wmsMap[wmsKey] ?? 0, 0);

      const compare = sapQty - wmsQty;

      // ✅ S열 작업여부(O/X)
      const work = pickLoose(r, ["작업여부", "작업 여부", "작업", "WORK", "work"]);

      // 바코드 매핑
      const barcodeKey = `${mat}__${box}`;
      const binfo = barcodeMap[barcodeKey];
      const barcode = binfo ? binfo.barcode : "";

      return {
        invKey: invMatKey,
        no,
        mat,
        box,
        name,
        sap: sapQty,
        wms: wmsQty,
        compare,
        unit,
        work,
        barcode,
        status: "미완료",
      };
    });

    // 번호 오름차순 정렬
    items.sort((a, b) => {
      const na = Number(a.no || 0);
      const nb = Number(b.no || 0);
      return na - nb;
    });

    return res.status(200).json({ ok: true, items });
  } catch (err) {
    console.error("OUTBOUND_ITEMS ERROR:", err);
    return res.status(200).json({
      ok: false,
      message: "출고 품목 조회 오류",
      error: err.message,
    });
  }
}
