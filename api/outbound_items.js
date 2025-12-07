// api/outbound_items.js
import { loadCsv } from "./_csv.js";

const SAP_ITEM_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vRAWmUNAeyndXfdxHjR-1CakW_Tm3OzmMTng5RkB53umXwucqpxABqMMcB0y8H5cHNg7aoHYqFztz0F/pub?gid=221455512&single=true&output=csv";

const WMS_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vRAWmUNAeyndXfdxHjR-1CakW_Tm3OzmMTng5RkB53umXwucqpxABqMMcB0y8H5cHNg7aoHYqFztz0F/pub?gid=1850233363&single=true&output=csv";

/*
SAP 자재자동 헤더 (요약)
인보이스+자재코드
인보이스
인보이스
문서번호
출고일
국가
자재코드
자재내역
출고
박스번호
(빈)
(빈)
단위
유형
컨테이너
제품 스티커
외박스 스티커
합계
작업여부
CBM
비고
번호
상차위치
특이사항
파레트
상차시간

WMS 헤더
인보이스+자재코드
인보이스
상품코드
박스번호
수량
*/

export default async function handler(req, res) {
  const { inv } = req.query;

  if (!inv) {
    return res.status(200).json({ ok: false, message: "인보이스가 없습니다." });
  }

  try {
    const [sapRows, wmsRows] = await Promise.all([
      loadCsv(SAP_ITEM_URL),
      loadCsv(WMS_URL),
    ]);

    // 1) SAP 자재자동에서 해당 인보이스만 필터
    const sapList = sapRows.filter(
      r => (r["인보이스"] || "").trim() === inv.trim()
    );

    // 2) WMS 맵: 인보이스+자재코드 + 박스번호 기준
    const wmsMap = {};
    wmsRows.forEach(r => {
      const invKey = (r["인보이스+자재코드"] || "").trim();
      const box = (r["박스번호"] || "").trim();
      const qty = Number(r["수량"] ?? 0);
      if (!invKey || !box) return;
      const key = `${invKey}__${box}`;
      wmsMap[key] = qty;
    });

    // 3) 최종 아이템 리스트 구성
    const items = sapList.map(r => {
      const invMatKey = (r["인보이스+자재코드"] || "").trim();
      const box = (r["박스번호"] || "").trim();
      const wmsKey = `${invMatKey}__${box}`;

      return {
        no: r["번호"] || "",
        mat: r["자재코드"] || "",
        box,
        name: r["자재내역"] || "",
        sap: Number(r["출고"] || 0),
        wms: Number(wmsMap[wmsKey] ?? 0),
        unit: r["단위"] || "",
        barcode: r["제품 스티커"] || "",
        status: "미검수",
        scanned: 0,
      };
    });

    // 번호 기준 정렬 (오름차순)
    items.sort((a, b) => {
      const na = Number(a.no || 0);
      const nb = Number(b.no || 0);
      return na - nb;
    });

    return res.status(200).json({ ok: true, items });

  } catch (err) {
    console.error("OUTBOUND_ITEMS ERROR:", err);
    return res.status(200).json({
      ok: false,
      message: "출고 품목 조회 오류",
      error: err.message,
    });
  }
}
