import { loadCsv } from "./_csv.js";

const CSV_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vRAWmUNAeyndXfdxHjR-1CakW_Tm3OzmMTng5RkB53umXwucqpxABqMMcB0y8H5cHNg7aoHYqFztz0F/pub?gid=221455512&single=true&output=csv";

export default async function handler(req, res) {
  const { mat } = req.query;

  try {
    const rows = await loadCsv(CSV_URL);

    let result = rows;

    // 개별 조회
    if (mat) {
      result = rows.find(r => r["자재번호"] === mat.trim());
    }

    return res.status(200).json({ ok: true, data: result });

  } catch (err) {
    res.status(200).json({ ok: false, message: err.message });
  }
}
