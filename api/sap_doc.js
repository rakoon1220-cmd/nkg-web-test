import { loadCsv } from "./_csv.js";

// SAP 문서 CSV (출고 상단)
const SAP_DOC_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vRAWmUNAeyndXfdxHjR-1CakW_Tm3OzmMTng5RkB53umXwucqpxABqMMcB0y8H5cHNg7aoHYqFztz0F/pub?gid=1070360000&single=true&output=csv";

export default async function handler(req, res) {
  const { inv } = req.query;

  if (!inv) {
    return res.status(200).json({ ok: false, message: "인보이스가 없습니다." });
  }

  try {
    const rows = await loadCsv(SAP_DOC_URL);
    if (!rows || rows.length === 0) {
      return res.status(200).json({ ok: false, message: "SAP 문서가 비어있습니다." });
    }

    // 헤더 그대로 사용
    const header = Object.keys(rows[0]);

    // T열 = index 19
    const loadTimeKey = header[19]; // 자동 추출

    const row = rows.find(r => r["인보이스"] === inv.trim());

    if (!row) {
      return res.status(200).json({ ok: false, message: "인보이스를 찾을 수 없습니다." });
    }

    // 상차시간(T열)
    row["상차시간"] = row[loadTimeKey] ?? "";

    return res.status(200).json({
      ok: true,
      data: row,
    });

  } catch (err) {
    console.error("SAP_DOC ERROR:", err);
    return res.status(200).json({
      ok: false,
      message: "SAP 문서 조회 오류",
      error: err.message,
    });
  }
}
