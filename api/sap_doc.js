// api/sap_doc.js
import { loadCsv } from "./_csv.js";

const SAP_DOC_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vRAWmUNAeyndXfdxHjR-1CakW_Tm3OzmMTng5RkB53umXwucqpxABqMMcB0y8H5cHNg7aoHYqFztz0F/pub?gid=1070360000&single=true&output=csv";

/*
SAP 문서 헤더 (네가 준 내용 기준)
인보이스	수정	문서번호	출고일	국가	출고	단위	분류	정보
컨테이너	유형	CBM	제품 스티커	외박스 스티커	합계	작업여부
상차위치	특이사항	파레트	상차시간
*/

export default async function handler(req, res) {
  const { inv } = req.query;

  if (!inv) {
    return res.status(200).json({ ok: false, message: "인보이스가 없습니다." });
  }

  try {
    const rows = await loadCsv(SAP_DOC_URL);

    const row = rows.find(r => (r["인보이스"] || "").trim() === inv.trim());

    if (!row) {
      return res.status(200).json({
        ok: false,
        message: `인보이스(${inv})를 찾을 수 없습니다.`,
      });
    }

    // 필요한 필드만 정리
    const data = {
      인보이스: row["인보이스"] ?? "",
      문서번호: row["문서번호"] ?? "",
      출고일: row["출고일"] ?? "",
      국가: row["국가"] ?? "",
      출고: row["출고"] ?? "",
      단위: row["단위"] ?? "",
      컨테이너: row["컨테이너"] ?? "",
      유형: row["유형"] ?? "",
      CBM: row["CBM"] ?? "",
      상차위치: row["상차위치"] ?? "",
      상차시간: row["상차시간"] ?? "",
      특이사항: row["특이사항"] ?? "",
      파레트: row["파레트"] ?? "",
    };

    return res.status(200).json({ ok: true, data });

  } catch (err) {
    console.error("SAP_DOC ERROR:", err);
    return res.status(200).json({
      ok: false,
      message: "SAP 문서 조회 오류",
      error: err.message,
    });
  }
}
