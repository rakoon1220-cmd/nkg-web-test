const { loadCsv } = require("./_csv.js");

// SAP 문서 CSV URL
const CSV_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vRAWmUNAeyndXfdxHjR-1CakW_Tm3OzmMTng5RkB53umXwucqpxABqMMcB0y8H5cHNg7aoHYqFztz0F/pub?gid=1070360000&single=true&output=csv";

module.exports = async function handler(req, res) {
  const { inv } = req.query;

  if (!inv) {
    return res.status(200).json({
      ok: false,
      message: "인보이스 값이 없습니다.",
    });
  }

  try {
    // CSV Load (안정 처리)
    let rows = [];
    try {
      rows = await loadCsv(CSV_URL);
    } catch (err) {
      console.error("CSV LOAD ERROR:", err.message);
      return res.status(200).json({
        ok: false,
        message: "CSV를 불러오지 못했습니다.",
        error: err.message,
      });
    }

    // 헤더/값 trim 처리
    rows = rows.map((r) => {
      const cleaned = {};
      Object.keys(r).forEach((key) => {
        cleaned[key.trim()] = (r[key] ?? "").toString().trim();
      });
      return cleaned;
    });

    // 다양한 인보이스 컬럼 대응
    const keys = ["인보이스", "문서번호", "invoice", "Invoice"];

    let found = null;
    for (const row of rows) {
      for (const k of keys) {
        if (!row[k]) continue;
        if (row[k].toString().trim() === inv.trim()) {
          found = row;
          break;
        }
      }
      if (found) break;
    }

    if (!found) {
      return res.status(200).json({
        ok: false,
        message: `인보이스(${inv})를 찾을 수 없습니다.`,
      });
    }

    return res.status(200).json({
      ok: true,
      data: found,
    });
  } catch (err) {
    console.error("SERVER ERROR:", err);
    return res.status(200).json({
      ok: false,
      message: "서버 내부 오류",
      error: err.message,
    });
  }
};
