// /api/barcode_table.js
import { loadCsv } from "./_csv.js";

const CSV_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vRAWmUNAeyndXfdxHjR-1CakW_Tm3OzmMTng5RkB53umXwucqpxABqMMcB0y8H5cHNg7aoHYqFztz0F/pub?gid=1454119997&single=true&output=csv";

export default async function handler(req, res) {
  try {
    const rows = await loadCsv(CSV_URL);

    // key 정규화
    const list = rows.map(r => ({
      barcode: (r["바코드"] || r["barcode"] || "").trim(),
      box: (r["박스번호"] || "").trim(),
      name: (r["자재내역"] || "").trim(),
    }));

    return res.status(200).json({ ok: true, items: list });
  } catch (err) {
    return res.status(200).json({
      ok: false,
      message: "바코드 CSV 로딩 실패",
      error: err.message,
    });
  }
}
