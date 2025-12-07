const { loadCsv } = require("./_csv.js");

// CSV URL 목록
const SAP_DOC_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vRAWmUNAeyndXfdxHjR-1CakW_Tm3OzmMTng5RkB53umXwucqpxABqMMcB0y8H5cHNg7aoHYqFztz0F/pub?gid=1070360000&single=true&output=csv";

const SAP_MAT_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vRAWmUNAeyndXfdxHjR-1CakW_Tm3OzmMTng5RkB53umXwucqpxABqMMcB0y8H5cHNg7aoHYqFztz0F/pub?gid=221455512&single=true&output=csv";

const WMS_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vRAWmUNAeyndXfdxHjR-1CakW_Tm3OzmMTng5RkB53umXwucqpxABqMMcB0y8H5cHNg7aoHYqFztz0F/pub?gid=1850233363&single=true&output=csv";

const BARCODE_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vRAWmUNAeyndXfdxHjR-1CakW_Tm3OzmMTng5RkB53umXwucqpxABqMMcB0y8H5cHNg7aoHYqFztz0F/pub?gid=1454119997&single=true&output=csv";


module.exports = async function handler(req, res) {
  const { inv } = req.query;

  if (!inv) {
    return res.status(200).json({ ok: false, message: "인보이스 없음" });
  }

  try {
    // 1) CSV 파일 모두 로드
    const [sapDoc, sapMat, wms, barcode] = await Promise.all([
      loadCsv(SAP_DOC_URL),
      loadCsv(SAP_MAT_URL),
      loadCsv(WMS_URL),
      loadCsv(BARCODE_URL),
    ]);

    // trim 정리
    const clean = (rows) =>
      rows.map((r) => {
        const out = {};
        Object.keys(r).forEach((k) => {
          out[k.trim()] = (r[k] ?? "").toString().trim();
        });
        return out;
      });

    const sapMatRows = clean(sapMat);
    const wmsRows = clean(wms);
    const barcodeRows = clean(barcode);

    // 2) sap자재자동에서 현재 인보이스만 필터
    const filtered = sapMatRows.filter(
      (r) => r["인보이스"] === inv
    );

    // 3) 결과 구성
    const items = filtered.map((row) => {
      const material = row["자재코드"];
      const box = row["박스번호"];

      // WMS 매칭
      const wmsRow = wmsRows.find(
        (w) => w["자재코드"] === material && w["박스번호"] === box
      );

      // 바코드 매칭 (중복 박스번호 포함 체크)
      const barRows = barcodeRows.filter(
        (b) => b["자재코드"] === material
      );

      // 박스번호 일치하는 것 먼저 탐색
      let barcodeValue = "-";
      const exact = barRows.find((b) => b["박스번호"] === box);
      if (exact) barcodeValue = exact["바코드"];
      else if (barRows.length > 0) barcodeValue = barRows[0]["바코드"];

      return {
        no: row["번호"] ?? "",
        mat: material,
        box: box,
        name: row["자재내역"],
        sap: row["출고"] ?? 0,
        wms: wmsRow ? wmsRow["수량"] : 0,
        unit: row["단위"],
        barcode: barcodeValue,
        status: "미검수",
        scanned: 0,
      };
    });

    return res.status(200).json({
      ok: true,
      items,
    });

  } catch (err) {
    console.error("OUTBOUND ERROR:", err);
    return res.status(200).json({
      ok: false,
      message: "서버 오류",
      error: err.message,
    });
  }
};
