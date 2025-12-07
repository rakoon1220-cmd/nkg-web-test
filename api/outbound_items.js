import { loadCsv } from "./_csv.js";

// 📌 Google CSV URL
const SAP_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vRAWmUNAeyndXfdxHjR-1CakW_Tm3OzmMTng5RkB53umXwucqpxABqMMcB0y8H5cHNg7aoHYqFztz0F/pub?gid=1070360000&single=true&output=csv";

const WMS_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-.../pub?gid=XXXXX&single=true&output=csv";

const BARCODE_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-.../pub?gid=XXXXX&single=true&output=csv";

export default async function handler(req, res) {
  try {
    const { inv } = req.query;
    if (!inv) {
      return res.status(200).json({ ok: false, message: "인보이스가 없습니다." });
    }

    // ===== CSV 로드 =====
    const sapRows = await loadCsv(SAP_URL);
    const wmsRows = await loadCsv(WMS_URL);
    const bcRows = await loadCsv(BARCODE_URL);

    // 📌 SAP 필터링
    const items = sapRows.filter(r => r["인보이스"] === inv);

    if (items.length === 0) {
      return res.status(200).json({
        ok: false,
        message: "해당 인보이스의 SAP 데이터가 없습니다."
      });
    }

    // ===== WMS 매핑 준비 =====
    const wmsMap = {};
    wmsRows.forEach(r => {
      const box = r["박스번호"];
      const qty = Number(r["E열"] || r["수량"] || 0);
      if (box) wmsMap[box] = qty;
    });

    // ===== 바코드 테이블 매핑 =====
    // key = barcode + '_' + box
    const barcodeMap = {};
    bcRows.forEach(r => {
      const bc = r["바코드"];
      const box = r["박스번호"];
      const disp = r["표시바코드"] || r["D열"] || bc;

      if (bc && box) {
        barcodeMap[`${bc}_${box}`] = disp;
      }
    });

    // ===== 최종 구조로 변환 =====
    const finalList = items.map(r => {
      const box = r["박스번호"];
      const mat = r["자재코드"];

      // 바코드 찾기
      let barcode = "-";
      const keys = Object.keys(barcodeMap).filter(k => k.includes(`_${box}`));
      if (keys.length > 0) {
        barcode = barcodeMap[keys[0]];
      }

      return {
        no: r["번호"] ?? "",
        mat,
        box,
        name: r["자재내역"],
        sap: Number(r["출고"] || 0),
        unit: r["단위"],
        wms: wmsMap[box] ?? 0,
        barcode,
        scanned: 0,
        status: "미검수"
      };
    });

    return res.status(200).json({ ok: true, items: finalList });

  } catch (err) {
    return res.status(200).json({
      ok: false,
      message: "오류: " + err.message
    });
  }
}
