// api/barcode_lookup.js
import { loadCsv } from "./_csv.js";

// 🔹 바코드 시트 CSV (자재번호, 박스번호, 자재내역, 바코드)
const CSV_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vRAWmUNAeyndXfdxHjR-1CakW_Tm3OzmMTng5RkB53umXwucqpxABqMMcB0y8H5cHNg7aoHYqFztz0F/pub?gid=1454119997&single=true&output=csv";

export default async function handler(req, res) {
  const { code } = req.query;

  if (!code) {
    return res.status(200).json({
      ok: false,
      message: "바코드가 없습니다.",
    });
  }

  try {
    // CSV 로드
    let rows = await loadCsv(CSV_URL);

    // 헤더 / 값 공백 정리
    rows = rows.map((r) => {
      const cleaned = {};
      Object.keys(r).forEach((k) => {
        cleaned[k.trim()] = (r[k] ?? "").toString().trim();
      });
      return cleaned;
    });

    // 바코드 열 이름 가정: "바코드"
    const target = rows.find((r) => r["바코드"] === code.trim());

    if (!target) {
      return res.status(200).json({
        ok: false,
        message: `바코드(${code})를 바코드 시트에서 찾을 수 없습니다.`,
      });
    }

    // 🎯 클라이언트에서 쓰기 편하도록 통일된 키로도 같이 내려줌
    const mapped = {
      mat: target["자재번호"] || target["자재코드"] || "",
      box: target["박스번호"] || "",
      name: target["자재내역"] || "",
      barcode: target["바코드"] || code,
      raw: target,
    };

    return res.status(200).json({
      ok: true,
      data: mapped,
    });
  } catch (err) {
    console.error("BARCODE LOOKUP ERROR:", err);
    return res.status(200).json({
      ok: false,
      message: "바코드 조회 서버 오류",
      error: err.message,
    });
  }
}
