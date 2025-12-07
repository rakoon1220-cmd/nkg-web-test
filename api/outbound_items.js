import { loadCsv } from "./_csv.js";

// ▼ CSV 주소 4개
const SAP_DOC_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vRAWmUNAeyndXfdxHjR-1CakW_Tm3OzmMTng5RkB53umXwucqpxABqMMcB0y8H5cHNg7aoHYqFztz0F/pub?gid=1070360000&single=true&output=csv";

const SAP_ITEM_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vRAWmUNAeyndXfdxHjR-1CakW_Tm3OzmMTng5RkB53umXwucqpxABqMMcB0y8H5cHNg7aoHYqFztz0F/pub?gid=221455512&single=true&output=csv";

const WMS_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vRAWmUNAeyndXfdxHjR-1CakW_Tm3OzmMTng5RkB53umXwucqpxABqMMcB0y8H5cHNg7aoHYqFztz0F/pub?gid=1850233363&single=true&output=csv";

const BARCODE_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vRAWmUNAeyndXfdxHjR-1CakW_Tm3OzmMTng5RkB53umXwucqpxABqMMcB0y8H5cHNg7aoHYqFztz0F/pub?gid=1454119997&single=true&output=csv";

// ------------------------------------------------------------

export default async function handler(req, res) {
  const { inv } = req.query;

  if (!inv) {
    return res.status(200).json({ ok: false, message: "인보이스 번호 없음" });
  }

  try {
    // 1) SAP 자재자동
    const sapItems = await loadCsv(SAP_ITEM_URL);

    // 2) 해당 인보이스 필터
    const invItems = sapItems.filter(r => r["인보이스"] === inv);

    if (invItems.length === 0) {
      return res.status(200).json({
        ok: false,
        message: "출고 검수 목록이 없습니다."
      });
    }

    // 3) WMS 자동 불러오기
    const wmsRows = await loadCsv(WMS_URL);

    // WMS 매핑 (자재코드 기준)
    const wmsMap = {};
    wmsRows.forEach(r => {
      const mat = r["자재코드"];
      const qty = Number(r["수량"] || 0);
      if (!wmsMap[mat]) wmsMap[mat] = 0;
      wmsMap[mat] += qty;
    });

    // 4) 바코드 마스터
    const barcodeRows = await loadCsv(BARCODE_URL);

    // 바코드 → 자재코드 매핑
    let barcodeList = {};
    barcodeRows.forEach(r => {
      const code = r["바코드"];
      if (!barcodeList[code]) barcodeList[code] = [];
      barcodeList[code].push({
        mat: r["자재코드"],
        box: r["박스번호"]
      });
    });

    // ------------------------------------------------------------
    // 5) 최종 아이템 조립
    // ------------------------------------------------------------

    const finalItems = invItems.map((r, idx) => {
      const mat = r["자재코드"];
      const box = r["박스번호"];
      const name = r["자재내역"];
      const sapQty = Number(r["출고"] || 0);

      // WMS 수량 매핑
      const wmsQty = wmsMap[mat] || 0;

      // 바코드 검색
      let barcode = "-";

      const found = Object.entries(barcodeList).find(([code, arr]) =>
        arr.some(b => b.mat === mat && b.box === box)
      );

      if (found) barcode = found[0];

      return {
        no: idx + 1,
        mat,
        box,
        name,
        sap: sapQty,
        wms: wmsQty,
        unit: r["단위"] || "",
        barcode,
        scanned: 0,
        status: "미검수"
      };
    });

    return res.status(200).json({
      ok: true,
      items: finalItems
    });
  } catch (err) {
    return res.status(200).json({
      ok: false,
      message: "CSV 파싱 오류: " + err.message
    });
  }
}
