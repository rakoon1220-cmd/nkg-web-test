// api/outbound_items.js
import { loadCsv } from "./_csv.js";

/* -------------------------
   CSV URL
------------------------- */
const SAP_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vRAWmUNAeyndXfdxHjR-1CakW_Tm3OzmMTng5RkB53umXwucqpxABqMMcB0y8H5cHNg7aoHYqFztz0F/pub?gid=221455512&single=true&output=csv";

const WMS_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vRAWmUNAeyndXfdxHjR-1CakW_Tm3OzmMTng5RkB53umXwucqpxABqMMcB0y8H5cHNg7aoHYqFztz0F/pub?gid=1850233363&single=true&output=csv";

const BC_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vRAWmUNAeyndXfdxHjR-1CakW_Tm3OzmMTng5RkB53umXwucqpxABqMMcB0y8H5cHNg7aoHYqFztz0F/pub?gid=1454119997&single=true&output=csv";

/* -------------------------
   Handler
------------------------- */
export default async function handler(req, res) {
  const inv = req.query.inv?.trim();
  if (!inv) {
    return res.status(200).json({ ok: false, message: "인보이스 없음" });
  }

  try {
    /* 1) CSV load */
    const [sapCSV, wmsCSV, bcCSV] = await Promise.all([
      loadCsv(SAP_URL),
      loadCsv(WMS_URL),
      loadCsv(BC_URL),
    ]);

    /* -------------------------
       2) SAP 자재자동 파싱
       ※ 컬럼번호 고정
       A: 인보이스+자재코드
       G: 자재코드
       H: 자재내역
       I: 출고 (SAP)
       J: 박스번호
       M: 단위
       V: 번호
------------------------- */

    const sapItems = sapCSV
      .filter(r => r[1] === inv || r[2] === inv) // B 또는 C열 인보이스
      .map(r => ({
        key: r[0],              // 인보이스+자재코드 (A)
        mat: r[6],              // 자재코드 (G)
        name: r[7],             // 자재내역 (H)
        sap: Number(r[8] || 0), // 출고 (I)
        box: r[9],              // 박스번호 (J)
        unit: r[12],            // 단위 (M)
        no: Number(r[21] || 0), // 번호 (V)
      }));

    /* -------------------------
       3) WMS 파싱
       A: 인보이스+자재코드
       B: 인보이스
       C: 자재번호
       D: 박스번호
       E: 수량
------------------------- */
    const wmsMap = {};
    wmsCSV.forEach(r => {
      const key = `${r[0]}__${r[3]}`; // (인보이스+자재코드) + 박스번호
      wmsMap[key] = Number(r[4] || 0);
    });

    /* -------------------------
       4) 바코드 테이블 구성
       A: 자재번호
       B: 박스번호
       C: 자재내역
       D: 바코드
------------------------- */
    const bcMap = {};
    bcCSV.forEach(r => {
      const mat = r[0];
      if (!mat) return;
      if (!bcMap[mat]) bcMap[mat] = [];
      bcMap[mat].push({
        box: r[1],
        name: r[2],
        barcode: r[3],
      });
    });

    /* -------------------------
       5) 최종 아이템 생성
------------------------- */
    const items = sapItems.map(s => {
      // WMS 매칭
      const wmsQty = wmsMap[`${s.key}__${s.box}`] ?? 0;

      // 바코드 매칭
      let barcode = "";
      const bcList = bcMap[s.mat] || [];

      if (bcList.length === 1) {
        barcode = bcList[0].barcode;
      } else if (bcList.length > 1) {
        const exact = bcList.find(b => (b.box || "").trim() === (s.box || "").trim());
        barcode = exact ? exact.barcode : bcList[0].barcode;
      }

      return {
        key: s.key,
        no: s.no,
        mat: s.mat,
        box: s.box,
        name: s.name,
        sap: s.sap,
        wms: wmsQty,
        diff: s.sap - wmsQty,
        unit: s.unit,
        barcode: barcode || "",
        status: "미완료",
        scanned: 0,
      };
    });

    items.sort((a, b) => a.no - b.no);

    return res.status(200).json({ ok: true, items });

  } catch (err) {
    console.error("ITEM PARSE ERR:", err);
    return res.status(200).json({ ok: false, message: err.message });
  }
}
