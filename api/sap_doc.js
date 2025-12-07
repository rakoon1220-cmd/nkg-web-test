import { loadCsv } from "./_csv.js";

const CSV_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vRAWmUNAeyndXfdxHjR-1CakW_Tm3OzmMTng5RkB53umXwucqpxABqMMcB0y8H5cHNg7aoHYqFztz0F/pub?gid=1070360000&single=true&output=csv";

export default async function handler(req, res) {
  const { inv } = req.query;

  if (!inv) {
    return res.status(200).json({ ok: false, message: "인보이스가 없습니다." });
  }

  try {
    const rows = await loadCsv(CSV_URL);

    const row = rows.find(r => r["인보이스"] === inv.trim());
    if (!row) {
      return res.status(200).json({ ok: false, message: "인보이스를 찾을 수 없습니다." });
    }

    return res.status(200).json({ ok: true, data: row });

  } catch (err) {
    res.status(200).json({ ok: false, message: err.message });
  }
}
