// /api/outbound_items.js
import { loadCsv } from "./_csv.js";

const SAP_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vRAWmUNAeyndXfdxHjR-1CakW_Tm3OzmMTng5RkB53umXwucqpxABqMMcB0y8H5cHNg7aoHYqFztz0F/pub?gid=221455512&single=true&output=csv";

const WMS_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vRAWmUNAeyndXfdxHjR-1CakW_Tm3OzmMTng5RkB53umXwucqpxABqMMcB0y8H5cHNg7aoHYqFztz0F/pub?gid=1850233363&single=true&output=csv";

const BARCODE_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vRAWmUNAeyndXfdxHjR-1CakW_Tm3OzmMTng5RkB53umXwucqpxABqMMcB0y8H5cHNg7aoHYqFztz0F/pub?gid=1454119997&single=true&output=csv";

export default async function handler(req, res) {
  const { inv } = req.query;

  if (!inv) {
    return res.status(200).json({ ok: false, message: "인보이스 없음" });
  }

  try {
    const sapRows = await loadCsv(SAP_URL);
    const wmsRows = await loadCsv(WMS_URL);
    const barcodeRows = await loadCsv(BARCODE_URL);

    // 바코드 매핑 테이블
    const barcodeMap = {};
    barcodeRows.forEach(r => {
      const bc = (r["바코드"] || "").trim();
      barcodeMap[bc] = {
        barcode: bc,
        box: (r["박스번호"] || "").trim(),
        name: (r["자재내역"] || "").trim(),
      };
    });

    // SAP → 특정 인보이스만
    let items = sapRows
      .filter(r => r["인보이스"] === inv)
      .map(r => ({
        no: Number(r["번호"] || 0),
        mat: r["자재코드"] || "",
        box: r["박스번호"] || "",
        name: r["자재내역"] || "",
        sap: Number(r["출고"] || 0),
        unit: r["단위"] || "",
      }));

    // WMS 매칭
    items = items.map(it => {
      const w = wmsRows.find(r => r["박스번호"] === it.box);
      return {
        ...it,
        wms: Number(w?.["수량"] ?? 0),
      };
    });

    // 바코드 매칭
    items = items.map(it => {
      const bc = barcodeRows.find(b => b["박스번호"] === it.box);
      return {
        ...it,
        barcode: bc?.["바코드"] || "",
      };
    });

    // 정렬: 번호 오름차순
    items.sort((a, b) => a.no - b.no);

    return res.status(200).json({ ok: true, items });
  } catch (err) {
    return res.status(200).json({
      ok: false,
      message: "출고 목록 로딩 실패",
      error: err.message,
    });
  }
}
