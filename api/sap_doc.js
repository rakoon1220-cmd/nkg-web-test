import { loadCsv } from "./_csv.js";

const SAP_DOC_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vRAWmUNAeyndXfdxHjR-1CakW_Tm3OzmMTng5RkB53umXwucqpxABqMMcB0y8H5cHNg7aoHYqFztz0F/pub?gid=1070360000&single=true&output=csv";

function normalizeRow(r) {
  const out = {};
  for (const k of Object.keys(r)) {
    let v = r[k];
    if (v == null) v = "";
    // 줄바꿈 복원
    v = v.toString().replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    out[k.trim()] = v.trim();
  }
  return out;
}

export default async function handler(req, res) {
  const invRaw =
    (req.query && req.query.inv) ||
    (req.query && req.query.invoice) ||
    "";

  const inv = invRaw.toString().trim();

  if (!inv) {
    return res
      .status(200)
      .json({ ok: false, message: "인보이스가 없습니다." });
  }

  try {
    const rawRows = await loadCsv(SAP_DOC_URL);
    const rows = rawRows.map(normalizeRow);

    const keys = ["인보이스", "문서번호", "Invoice", "invoice"];

    let found = null;

    for (const r of rows) {
      for (const k of keys) {
        if (r[k] && r[k].toString().trim() === inv) {
          found = r;
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
    console.error("SAP_DOC ERROR:", err);
    return res.status(200).json({
      ok: false,
      message: "상단 인보이스 정보 로딩 중 오류",
      error: err.message || String(err),
    });
  }
}

