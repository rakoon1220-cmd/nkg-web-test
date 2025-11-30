// /api/defect.js (Vercel Functions)
export default async function handler(req, res) {
  try {
    const { key } = req.query;

    if (!key) {
      return res.status(400).json({
        ok: false,
        error: "검색 키(key)가 없습니다."
      });
    }

    const SHEET_URL =
      "https://docs.google.com/spreadsheets/d/e/2PACX-YYY/pub?gid=0&single=true&output=csv";

    const response = await fetch(SHEET_URL);
    const csvText = await response.text();

    const rows = csvText.split("\n").map(r => r.split(","));
    const header = rows[0];
    const dataRows = rows.slice(1);

    const filtered = dataRows.filter(r =>
      r.some(col => String(col).toLowerCase().includes(key.toLowerCase()))
    );

    const resultRows = filtered.map(r => {
      let obj = {};
      header.forEach((h, i) => {
        obj[h.trim()] = r[i] ? r[i].trim() : "";
      });
      return obj;
    });

    return res.status(200).json({
      ok: true,
      rows: resultRows
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: err.toString()
    });
  }
}
