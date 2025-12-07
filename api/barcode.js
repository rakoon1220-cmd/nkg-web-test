import { loadCsv } from "./_csv.js";

const CSV_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vRAWmUNAeyndXfdxHjR-1CakW_Tm3OzmMTng5RkB53umXwucqpxABqMMcB0y8H5cHNg7aoHYqFztz0F/pub?gid=1454119997&single=true&output=csv";

export default async function handler(req, res) {
  const { barcode } = req.query;

  try {
    const rows = await loadCsv(CSV_URL);

    if (!barcode) {
      return res.status(200).json({ ok: true, data: rows });
    }

    const row = rows.find(r => r["바코드"] === barcode.trim());

    return res.status(200).json({
      ok: true,
      data: row || null
    });

  } catch (err) {
    res.status(200).json({ ok: false, message: err.message });
  }
}
