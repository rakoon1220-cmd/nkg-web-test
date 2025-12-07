// /api/sap_doc.js
import { loadCsv } from "./_csv.js";

// sap문서 상단
const CSV_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vRAWmUNAeyndXfdxHjR-1CakW_Tm3OzmMTng5RkB53umXwucqpxABqMMcB0y8H5cHNg7aoHYqFztz0F/pub?gid=1070360000&single=true&output=csv";

export default async function handler(req, res) {
  const { inv } = req.query;

  if (!inv) {
    return res
      .status(200)
      .json({ ok: false, message: "인보이스가 없습니다." });
  }

  try {
    let rows = await loadCsv(CSV_URL);

    // 키 / 값 공백 제거
    rows = rows.map((r) => {
      const cleaned = {};
      Object.keys(r).forEach((k) => {
        cleaned[k.trim()] = (r[k] ?? "").toString().trim();
      });
      return cleaned;
    });

    const targets = ["인보이스", "Invoice", "invoice", "문서번호"];

    let row = null;
    for (const r of rows) {
      for (const key of targets) {
        if (r[key] && r[key] === inv.trim()) {
          row = r;
          break;
        }
      }
      if (row) break;
    }

    if (!row) {
      return res.status(200).json({
        ok: false,
        message: `인보이스(${inv})를 찾을 수 없습니다.`,
      });
    }

    return res.status(200).json({
      ok: true,
      data: row,
    });
  } catch (err) {
    console.error("SAP_DOC ERROR:", err);
    return res.status(200).json({
      ok: false,
      message: "서버 오류가 발생했습니다.",
      error: err.message,
    });
  }
}
