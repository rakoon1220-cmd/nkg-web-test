// api/sap_doc.js
import { loadCsv } from "./_csv.js";

const SAP_DOC_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vRAWmUNAeyndXfdxHjR-1CakW_Tm3OzmMTng5RkB53umXwucqpxABqMMcB0y8H5cHNg7aoHYqFztz0F/pub?gid=1070360000&single=true&output=csv";

/**
 * 인보이스 번호 정규화
 * - 숫자만 추출
 * - 앞 0 제거
 */
function normalizeInv(v) {
  if (!v) return "";
  return v.toString().replace(/[^0-9]/g, "").replace(/^0+/, "");
}

export default async function handler(req, res) {
  const { inv } = req.query;

  if (!inv) {
    return res.status(200).json({ ok: false, message: "인보이스가 없습니다." });
  }

  try {
    const rows = await loadCsv(SAP_DOC_URL);
    const target = normalizeInv(inv);

    let found = null;

    for (const r of rows) {
      const inv1 = normalizeInv(r["인보이스"]);
      const docNo = normalizeInv(r["문서번호"]);
      if (inv1 === target || docNo === target) {
        found = r;
        break;
      }
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
      message: "SAP 문서 조회 오류",
      error: err.message,
    });
  }
}
