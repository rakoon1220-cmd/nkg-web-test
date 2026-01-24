// api/outbound_items.js — 최종 안정판 (조회키 우선 + 6/9자리 + 지수표기 + 중복헤더 방어)
import { loadCsv } from "./_csv.js";

const SAP_ITEM_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vRAWmUNAeyndXfdxHjR-1CakW_Tm3OzmMTng5RkB53umXwucqpxABqMMcB0y8H5cHNg7aoHYqFztz0F/pub?gid=221455512&single=true&output=csv";

const WMS_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vRAWmUNAeyndXfdxHjR-1CakW_Tm3OzmMTng5RkB53umXwucqpxABqMMcB0y8H5cHNg7aoHYqFztz0F/pub?gid=1850233363&single=true&output=csv";

const BARCODE_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vRAWmUNAeyndXfdxHjR-1CakW_Tm3OzmMTng5RkB53umXwucqpxABqMMcB0y8H5cHNg7aoHYqFztz0F/pub?gid=1454119997&single=true&output=csv";

// ✅ cache bust
function bust(url) {
  const t = Date.now();
  return url.includes("?") ? `${url}&t=${t}` : `${url}?t=${t}`;
}

function asText(v) {
  if (v === null || v === undefined) return "";
  return String(v).trim();
}

function asNum(v, def = 0) {
  const s0 = asText(v);
  if (!s0) return def;
  const s = s0.replace(/,/g, "");
  const n = Number(s.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : def;
}

/**
 * ✅ 숫자 ID 정규화(인보이스/문서번호 공용)
 * - 268377822.0 / 2.683E+08 / 콤마 모두 처리
 */
function normalizeId(v) {
  if (v === null || v === undefined) return "";
  let s = String(v).trim();
  if (!s) return "";

  if (/^\d+$/.test(s)) return s.replace(/^0+/, "");

  s = s.replace(/,/g, "");
  if (/^\d+\.0+$/.test(s)) s = s.replace(/\.0+$/, "");

  if (/[eE]/.test(s)) {
    const n = Number(s);
    if (Number.isFinite(n)) return String(Math.round(n)).replace(/^0+/, "");
  }

  const digits = s.replace(/[^0-9]/g, "");
  return digits.replace(/^0+/, "");
}

/**
 * ✅ 공백/BOM/제로폭/nbsp 제거해서 헤더 매칭
 */
function pickLoose(r, keys) {
  const clean = (s) =>
    String(s ?? "")
      .replace(/[\s\uFEFF\u200B\u00A0]/g, "")
      .trim();

  const norm = {};
  for (const k of Object.keys(r || {})) norm[clean(k)] = r[k];

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
    return res.status(200).json({ ok: false, message: "인보이스/문서번호(조회키)가 없습니다." });
  }

  try {
    const [sapRows, wmsRows, barcodeRows] = await Promise.all([
      loadCsv(bust(SAP_ITEM_URL)),
      loadCsv(bust(WMS_URL)),
      loadCsv(bust(BARCODE_URL)),
    ]);

    const meta = {
      queryRaw: String(inv),
      queryNorm: normalizeId(inv),
      sapCount: Array.isArray(sapRows) ? sapRows.length : -1,
      wmsCount: Array.isArray(wmsRows) ? wmsRows.length : -1,
      barcodeCount: Array.isArray(barcodeRows) ? barcodeRows.length : -1,
      sapKeys0: sapRows?.[0] ? Object.keys(sapRows[0]) : [],
      wmsKeys0: wmsRows?.[0] ? Object.keys(wmsRows[0]) : [],
      barcodeKeys0: barcodeRows?.[0] ? Object.keys(barcodeRows[0]) : [],
    };

    const targetKey = normalizeId(inv);

    /* ------------------------------------------------------------
       1) SAP에서 조회키 기준 필터
       - 최우선: "조회키"(B열)  ← 너가 합쳐둔 컬럼
       - 없으면: 인보이스/문서번호 둘 다 비교
    ------------------------------------------------------------ */
    const sapList = (sapRows || []).filter((r) => {
      const keyRaw = pickLoose(r, ["조회키", "INV_KEY", "KEY", "검색키"]);
      const invRaw = pickLoose(r, ["인보이스", "INV", "INVOICE", "INVNO", "INV NO"]) || r?.["인보이스"];
      const docRaw = pickLoose(r, ["문서번호", "문서 번호", "출고문서", "납품문서", "DELIVERY", "Delivery"]) || r?.["문서번호"];

      const keyNorm = normalizeId(keyRaw);
      const invNorm = normalizeId(invRaw);
      const docNorm = normalizeId(docRaw);

      // 조회키 있으면 조회키 우선, 없으면 inv/doc 둘 중 하나라도
      if (keyNorm) return keyNorm === targetKey;
      return invNorm === targetKey || docNorm === targetKey;
    });

    /* ------------------------------------------------------------
       2) WMS 맵 생성 (inv는 normalizeId로)
       key: inv__mat__box  (mat/box는 문자열 그대로 trim)
    ------------------------------------------------------------ */
    const wmsMap = Object.create(null);

    (wmsRows || []).forEach((r) => {
      const invKey = normalizeId(
        pickLoose(r, ["인보이스", "INV", "INVNO", "INV NO", "INVOICE"]) || r?.["인보이스"]
      );

      const mat =
        pickLoose(r, ["상품코드", "자재코드", "자재번호", "품목코드", "상품 코드", "자재 코드", "MATERIAL", "MAT"]) ||
        asText(r?.["상품코드"]) ||
        asText(r?.["자재코드"]);

      const box =
        pickLoose(r, ["박스번호", "박스 번호", "BOX", "BOXNO", "BOX NO"]) ||
        asText(r?.["박스번호"]);

      const qty = asNum(pickLoose(r, ["수량", "QTY", "qty", "수량합계", "입고", "입고수량"]) || r?.["수량"], 0);

      if (!invKey || !mat || !box) return;

      const k = `${invKey}__${asText(mat)}__${asText(box)}`;
      wmsMap[k] = (wmsMap[k] || 0) + qty; // ✅ 같은 키가 여러 줄이면 합산
    });

    /* ------------------------------------------------------------
       3) 바코드 맵: key = mat__box
    ------------------------------------------------------------ */
    const barcodeMap = Object.create(null);

    (barcodeRows || []).forEach((r) => {
      const mat =
        pickLoose(r, ["자재번호", "자재코드", "상품코드", "MATERIAL", "MAT"]) ||
        asText(r?.["자재번호"]) ||
        asText(r?.["자재코드"]);

      const box = pickLoose(r, ["박스번호", "박스 번호", "BOX"]) || asText(r?.["박스번호"]);
      const barcode = pickLoose(r, ["바코드", "BARCODE", "barcode"]) || asText(r?.["바코드"]);
      const name = pickLoose(r, ["자재내역", "품명", "상품명", "NAME"]) || asText(r?.["자재내역"]);

      if (!mat || !barcode) return;

      const key = `${asText(mat)}__${asText(box)}`;
      if (!barcodeMap[key]) barcodeMap[key] = { barcode, name, box };
    });

    /* ------------------------------------------------------------
       4) 아이템 구성
    ------------------------------------------------------------ */
    const items = sapList.map((r) => {
      const no = asText(r?.["번호"]);
      const mat = asText(r?.["자재코드"]) || pickLoose(r, ["자재코드", "자재번호", "상품코드"]);
      const box = asText(r?.["박스번호"]) || pickLoose(r, ["박스번호", "박스 번호"]);
      const name = asText(r?.["자재내역"]) || pickLoose(r, ["자재내역", "품명", "상품명"]);

      const sapQty = asNum(r?.["출고"], 0);
      const unit = asText(r?.["단위"]);

      // 인보이스+자재코드(있으면 유지)
      const invMatKey = asText(r?.["인보이스+자재코드"]) || pickLoose(r, ["인보이스+자재코드", "인보이스+자재", "KEYFULL"]);

      const wmsKey = `${targetKey}__${asText(mat)}__${asText(box)}`;
      const wmsQty = asNum(wmsMap[wmsKey] ?? 0, 0);
      const compare = sapQty - wmsQty;

      const work = pickLoose(r, ["작업여부", "작업 여부", "작업", "WORK", "work"]);

      const binfo = barcodeMap[`${asText(mat)}__${asText(box)}`];
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

    items.sort((a, b) => Number(a.no || 0) - Number(b.no || 0));

    if (String(debug) === "1") {
      return res.status(200).json({
        ok: true,
        items,
        meta: { ...meta, sapMatched: sapList.length, wmsMapSize: Object.keys(wmsMap).length },
      });
    }

    return res.status(200).json({ ok: true, items });
  } catch (err) {
    console.error("OUTBOUND_ITEMS ERROR:", err);
    return res.status(200).json({ ok: false, message: "출고 품목 조회 오류", error: err.message });
  }
}
