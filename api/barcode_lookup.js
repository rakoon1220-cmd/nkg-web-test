// api/barcode_lookup.js
import { loadCsv } from "./_csv.js";

const BARCODE_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vRAWmUNAeyndXfdxHjR-1CakW_Tm3OzmMTng5RkB53umXwucqpxABqMMcB0y8H5cHNg7aoHYqFztz0F/pub?gid=1454119997&single=true&output=csv";

/*
바코드 CSV 헤더 (요약)
(빈) (빈) (빈) 자재번호 박스번호 자재내역 바코드 입수량 유통기한 ...
→ loadCsv 에서는 실제로:
"자재번호", "박스번호", "자재내역", "바코드", ...
만 사용
*/

export default async function handler(req, res) {
  const { code } = req.query;

  if (!code) {
    return res.status(200).json({ ok: false, message: "바코드가 없습니다." });
  }

  try {
    const rows = await loadCsv(BARCODE_URL);

    const hit = rows.find(
      r => (r["바코드"] || "").trim() === code.trim()
    );

    if (!hit) {
      return res.status(200).json({
        ok: false,
        message: "바코드 목록에 없는 코드입니다.",
      });
    }

    return res.status(200).json({
      ok: true,
      data: {
        mat: hit["자재번호"] || "",
        box: hit["박스번호"] || "",
        name: hit["자재내역"] || "",
        barcode: hit["바코드"] || "",
      },
    });

  } catch (err) {
    console.error("BARCODE_LOOKUP ERROR:", err);
    return res.status(200).json({
      ok: false,
      message: "바코드 조회 오류",
      error: err.message,
    });
  }
}
