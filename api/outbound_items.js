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

// ✅ 여러 후보 키 중 존재하는 컬럼을 찾아 값 리턴
function pick(r, keys) {
  for (const k of keys) {
    if (Object.prototype.hasOwnProperty.call(r, k)) return asText(r[k]);
  }
  return "";
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
    // ✅ 각 CSV URL에 timestamp 붙여서 최신 강제
    const [sapRows, wmsRows, barcodeRows] = await Promise.all([
      loadCsv(bust(SAP_ITEM_URL)),
      loadCsv(bust(WMS_URL)),
      loadCsv(bust(BARCODE_URL)),
    ]);

    const targetInv = normalizeInv(inv);

    // 1) SAP 자재자동에서 해당 인보이스만 필터
    const sapList = sapRows.filter(r => {
      const invCol = normalizeInv(r["인보이스"]);
      return invCol === targetInv;
    });

    // 2) WMS 맵 (인보이스 + 자재코드 + 박스번호 기준)
    const wmsMap = {};
    wmsRows.forEach(r => {
      const invKey = normalizeInv(r["인보이스"]);
      const mat = asText(r["상품코드"]);
      const box = asText(r["박스번호"]);
      const qty = Number(r["수량"] || 0);

      if (!invKey || !mat || !box) return;

      const key = `${invKey}__${mat}__${box}`;
      wmsMap[key] = qty;
    });

    // 3) 바코드 맵 (자재번호 + 박스번호 → 바코드)
    const barcodeMap = {};
    barcodeRows.forEach(r => {
      const mat = asText(r["자재번호"]);
      const box = asText(r["박스번호"]);
      const barcode = asText(r["바코드"]);
      if (!mat || !barcode) return;

      const key = `${mat}__${box}`;
      if (!barcodeMap[key]) {
        barcodeMap[key] = {
          barcode,
          name: r["자재내역"] || "",
          box,
        };
      }
    });

    // 4) 최종 아이템 리스트 구성 (+ work 추가)
    const items = sapList.map(r => {
      const no = asText(r["번호"]);
      const mat = asText(r["자재코드"]);
      const box = asText(r["박스번호"]);
      const name = asText(r["자재내역"]);
      const sapQty = Number(r["출고"] || 0);
      const unit = asText(r["단위"]);

      const invMatKey = asText(r["인보이스+자재코드"]);
      const wmsKey = `${targetInv}__${mat}__${box}`;
      const wmsQty = Number(wmsMap[wmsKey] || 0);

      const compare = sapQty - wmsQty;

      // ✅ sap자재자동 S열 값 (헤더명 후보)
      // S열 헤더가 "작업"이면 바로 잡힘.
      // 혹시 다른 이름이면 여기 배열에 추가하면 됨.
      const work = pick(r, ["작업", "WORK", "work", "작업구분", "작업내용", "S", "S열"]);

      // 바코드 매핑: 자재번호 + 박스번호 기준
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
        work, // ✅ 추가
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
