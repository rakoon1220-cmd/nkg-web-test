import { loadCsv } from "./_csv.js";

const SAP_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vRAWmUNAeyndXfdxHjR-1CakW_Tm3OzmMTng5RkB53umXwucqpxABqMMcB0y8H5cHNg7aoHYqFztz0F/pub?gid=221455512&single=true&output=csv";

const WMS_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vRAWmUNAeyndXfdxHjR-1CakW_Tm3OzmMTng5RkB53umXwucqpxABqMMcB0y8H5cHNg7aoHYqFztz0F/pub?gid=1850233363&single=true&output=csv";

export default async function handler(req, res) {
  const { inv } = req.query;

  if (!inv) {
    return res.status(200).json({ ok: false, message: "인보이스가 없습니다." });
  }

  try {
    const sapRows = await loadCsv(SAP_URL);
    const wmsRows = await loadCsv(WMS_URL);

    // SAP → 인보이스 필터링
    const list = sapRows.filter(r => r["인보이스"] === inv);

    // WMS 맵 생성 (자재번호+박스번호)
    const wmsMap = {};
    wmsRows.forEach(r => {
      const key = `${r["자재번호"]}_${r["박스번호"]}`.trim();
      wmsMap[key] = Number(r["E"] ?? r["wms"] ?? 0);
    });

    const items = list.map(r => {
      const mat = r["자재코드"] || "";
      const box = r["박스번호"] || "";
      const key = `${mat}_${box}`;

      return {
        no: r["번호"] || "",
        mat,
        box,
        name: r["자재내역"] || "",
        sap: Number(r["출고"] || 0),
        wms: wmsMap[key] ?? 0,  // WMS 매칭 정상화
        unit: r["단위"] || "",
        barcode: r["제품 스티커"] || "",
        status: "미검수",
      };
    });

    return res.status(200).json({ ok: true, items });

  } catch (err) {
    console.error("OUTBOUND ERROR:", err);
    return res.status(200).json({ ok: false, message: err.message });
  }
}
