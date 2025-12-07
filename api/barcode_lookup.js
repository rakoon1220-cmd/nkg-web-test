import { loadCsv } from "./_csv.js";

const BARCODE_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vRAWmUNAeyndXfdxHjR-1CakW_Tm3OzmMTng5RkB53umXwucqpxABqMMcB0y8H5cHNg7aoHYqFztz0F/pub?gid=1454119997&single=true&output=csv";

function normalizeRow(r) {
  const out = {};
  for (const k of Object.keys(r)) {
    let v = r[k];
    if (v == null) v = "";
    v = v.toString().replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    out[k.trim()] = v.trim();
  }
  return out;
}

export default async function handler(req, res) {
  const codeRaw =
    (req.query && req.query.code) ||
    (req.query && req.query.barcode) ||
    "";

  const code = codeRaw.toString().trim();

  if (!code) {
    return res
      .status(200)
      .json({ ok: false, message: "바코드가 없습니다." });
  }

  try {
    const rawRows = await loadCsv(BARCODE_URL);
    const rows = rawRows.map(normalizeRow);

    const matches = rows.filter(r => (r["바코드"] || "") === code);

    if (matches.length === 0) {
      return res.status(200).json({
        ok: false,
        message: `바코드(${code})를 찾을 수 없습니다.`,
      });
    }

    // 일단 첫 번째 매칭만 사용 (동일 바코드 다수는 드문 케이스)
    const r = matches[0];

    const mat = r["자재번호"] || r["자재코드"] || "";
    const box = r["박스번호"] || "";
    const name = r["자재내역"] || r["품명"] || "";
    const barcode = r["바코드"] || code;

    return res.status(200).json({
      ok: true,
      data: { mat, box, name, barcode },
    });
  } catch (err) {
    console.error("BARCODE LOOKUP ERROR:", err);
    return res.status(200).json({
      ok: false,
      message: "바코드 조회 중 오류",
      error: err.message || String(err),
    });
  }
}
