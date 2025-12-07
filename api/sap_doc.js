import { loadCsv } from "./_csv.js";

const CSV_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vRAWmUNAeyndXfdxHjR-1CakW_Tm3OzmMTng5RkB53umXwucqpxABqMMcB0y8H5cHNg7aoHYqFztz0F/pub?gid=1070360000&single=true&output=csv";

export default async function handler(req, res) {
  const { inv } = req.query;

  if (!inv) {
    return res.status(200).json({ ok: false, message: "인보이스가 없습니다." });
  }

  try {
    // CSV 로드
    let rows = [];
    try {
      rows = await loadCsv(CSV_URL);
    } catch (err) {
      console.error("CSV LOAD ERROR:", err);
      return res.status(200).json({
        ok: false,
        message: "CSV를 불러오지 못했습니다.",
        error: err.message,
      });
    }

    // ★ key 정규화: 공백 제거, 앞뒤 trim
    rows = rows.map(r => {
      const cleaned = {};
      Object.keys(r).forEach(key => {
        cleaned[key.trim()] = (r[key] ?? "").toString().trim();
      });
      return cleaned;
    });

    // ★ 다양한 인보이스 키를 지원
    const possibleKeys = ["인보이스", "인보이스번호", "문서번호", "Invoice", "invoice"];

    let row = null;

    for (const r of rows) {
      for (const key of possibleKeys) {
        if (r[key] && r[key].toString().trim() === inv.trim()) {
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
    console.error("SERVER ERROR:", err);
    return res.status(200).json({
      ok: false,
      message: "서버 오류가 발생했습니다.",
      error: err?.message ?? err,
    });
  }
}
