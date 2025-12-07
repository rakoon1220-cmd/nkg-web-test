// api/outbound_items.js
import { loadCsv } from "./_csv.js";

/* ==========================
   CSV 주소
========================== */
const SAP_ITEM_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vRAWmUNAeyndXfdxHjR-1CakW_Tm3OzmMTng5RkB53umXwucqpxABqMMcB0y8H5cHNg7aoHYqFztz0F/pub?gid=221455512&single=true&output=csv";

const WMS_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vRAWmUNAeyndXfdxHjR-1CakW_Tm3OzmMTng5RkB53umXwucqpxABqMMcB0y8H5cHNg7aoHYqFztz0F/pub?gid=1850233363&single=true&output=csv";

const BARCODE_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vRAWmUNAeyndXfdxHjR-1CakW_Tm3OzmMTng5RkB53umXwucqpxABqMMcB0y8H5cHNg7aoHYqFztz0F/pub?gid=1454119997&single=true&output=csv";

/* ==========================
   헤더 자동 정규화
========================== */
function normalizeRow(row) {
  const clean = {};
  Object.keys(row).forEach(k => {
    const nk = k.replace(/\s+/g, "").trim(); // 공백 제거
    clean[nk] = (row[k] ?? "").toString().trim();
  });
  return clean;
}

/* ==========================
   API 본문
========================== */
export default async function handler(req, res) {
  const { inv } = req.query;

  if (!inv) {
    return res.status(200).json({ ok: false, message: "인보이스 없음" });
  }

  try {
    /* --- 1) CSV 로드 --- */
    const [sapRaw, wmsRaw, barcodeRaw] = await Promise.all([
      loadCsv(SAP_ITEM_URL),
      loadCsv(WMS_URL),
      loadCsv(BARCODE_URL)
    ]);

    // 헤더 정규화
    const sapRows = sapRaw.map(normalizeRow);
    const wmsRows = wmsRaw.map(normalizeRow);
    const barcodeRows = barcodeRaw.map(normalizeRow);

    /* ==========================
         2) SAP 자재자동 필터링
       ========================== */

    const sapList = sapRows.filter(r =>
      r["인보이스"] === inv ||
      r["인보이스2"] === inv ||   // CSV에 인보이스가 2개 존재하는 구조 고려
      r["문서번호"] === inv
    );

    if (sapList.length === 0) {
      return res.status(200).json({
        ok: false,
        message: `SAP 자재자동에서 인보이스(${inv})를 찾을 수 없음`
      });
    }

    /* ==========================
         3) WMS 맵 구성
       ========================== */
    const wmsMap = {};
    wmsRows.forEach(r => {
      const key = (r["인보이스+자재코드"] || "").trim() + "__" + (r["박스번호"] || "").trim();
      wmsMap[key] = Number(r["수량"] || 0);
    });

    /* ==========================
         4) 바코드 테이블 정리
       ========================== */
    const bcMap = {};
    barcodeRows.forEach(r => {
      const mat = r["자재번호"];
      if (!mat) return;
      if (!bcMap[mat]) bcMap[mat] = [];
      bcMap[mat].push({
        box: r["박스번호"],
        name: r["자재내역"],
        barcode: r["바코드"]
      });
    });

    /* ==========================
         5) 최종 아이템 생성
       ========================== */
    const items = sapList.map(r => {
      const invMat = r["인보이스+자재코드"];
      const box = r["박스번호"];
      const mat = r["자재코드"];

      const wmsQty = wmsMap[`${invMat}__${box}`] ?? 0;

      /* --- 바코드 매칭: 자재번호 기준 + 박스번호 우선 매칭 --- */
      let bc = "";
      const bcList = bcMap[mat] || [];

      if (bcList.length === 1) {
        bc = bcList[0].barcode;
      } else if (bcList.length > 1) {
        // 박스번호 동일한 항목 우선
        const exact = bcList.find(b => (b.box || "").trim() === box.trim());
        bc = exact ? exact.barcode : bcList[0].barcode;
      }

      return {
        no: Number(r["번호"] || 0),
        mat,
        box,
        name: r["자재내역"] || "",
        sap: Number(r["출고"] || 0),
        wms: Number(wmsQty),
        unit: r["단위"] || "",
        barcode: bc || "",
        status: "미검수",
        scanned: 0
      };
    });

    // 번호 기준 정렬
    items.sort((a, b) => a.no - b.no);

    return res.status(200).json({ ok: true, items });

  } catch (err) {
    console.error("OUTBOUND_ITEMS ERROR:", err);
    return res.status(200).json({
      ok: false,
      message: "출고 품목 조회 오류",
      error: err.message
    });
  }
}
