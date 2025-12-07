// api/outbound_items.js
import { loadCsv } from "./_csv.js";

// ▼ SAP 자재자동
const SAP_ITEM_URL =
  "https://docs.google.com/spreadsheets.d/e/2PACX-1vRAWmUNAeyndXfdxHjR-1CakW_Tm3OzmMTng5RkB53umXwucqpxABqMMcB0y8H5cHNg7aoHYqFztz0F/pub?gid=221455512&single=true&output=csv";

// ▼ WMS
const WMS_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vRAWmUNAeyndXfdxHjR-1CakW_Tm3OzmMTng5RkB53umXwucqpxABqMMcB0y8H5cHNg7aoHYqFztz0F/pub?gid=1850233363&single=true&output=csv";

// ▼ 바코드 시트
const BARCODE_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vRAWmUNAeyndXfdxHjR-1CakW_Tm3OzmMTng5RkB53umXwucqpxABqMMcB0y8H5cHNg7aoHYqFztz0F/pub?gid=1454119997&single=true&output=csv";


/* -------------------------------------------------------------
   바코드 매칭 규칙
   1) 자재번호(mat) 같고 박스번호(box) 같은 행 → 우선 선택
   2) 자재번호 같고 자재명(name) 같은 행 → 두 번째 선택
   3) 자재번호만 같을 때 → 첫 번째 바코드 선택
-------------------------------------------------------------- */
function findBarcode(barcodeRows, mat, box, name) {
  if (!mat) return "";

  const matRows = barcodeRows.filter(r => (r.mat || "") === mat);
  if (matRows.length === 0) return "";

  // 1순위: 박스번호 동일
  const matchBox = matRows.find(r => (r.box || "") === (box || ""));
  if (matchBox) return matchBox.barcode;

  // 2순위: 자재내역 동일
  const matchName = matRows.find(r => (r.name || "").trim() === (name || "").trim());
  if (matchName) return matchName.barcode;

  // 3순위: fallback
  return matRows[0].barcode;
}


/* ==============================================================
   ★ 메인 API
============================================================== */
export default async function handler(req, res) {
  const { inv } = req.query;

  if (!inv) {
    return res.status(200).json({ ok: false, message: "인보이스가 없습니다." });
  }

  try {
    // 📌 SAP + WMS + 바코드 3개 CSV 모두 병렬 로드
    const [sapRows, wmsRows, barcodeRowsRaw] = await Promise.all([
      loadCsv(SAP_ITEM_URL),
      loadCsv(WMS_URL),
      loadCsv(BARCODE_URL),
    ]);

    // 📌 바코드 시트 정리
    const barcodeRows = barcodeRowsRaw.map(r => ({
      mat: (r["자재번호"] || "").trim(),
      box: (r["박스번호"] || "").trim(),
      name: (r["자재내역"] || "").trim(),
      barcode: (r["바코드"] || "").trim(),
    }));

    /* ---------------------------------------------------------
       1) SAP 자재자동에서 인보이스 일치하는 행만 가져옴
    ---------------------------------------------------------- */
    const sapList = sapRows.filter(
      r => (r["인보이스"] || "").trim() === inv.trim()
    );

    /* ---------------------------------------------------------
       2) WMS 매핑 테이블
    ---------------------------------------------------------- */
    const wmsMap = {};
    wmsRows.forEach(r => {
      const key = `${(r["인보이스+자재코드"] || "").trim()}__${(r["박스번호"] || "").trim()}`;
      wmsMap[key] = Number(r["수량"] || 0);
    });

    /* ---------------------------------------------------------
       3) 최종 아이템 생성
    ---------------------------------------------------------- */
    const items = sapList.map(r => {
      const invMatKey = (r["인보이스+자재코드"] || "").trim();
      const box = (r["박스번호"] || "").trim();
      const mat = (r["자재코드"] || "").trim();
      const name = (r["자재내역"] || "").trim();
      const wmsKey = `${invMatKey}__${box}`;

      // ★ 바코드 매칭 (여기!)
      const barcode = findBarcode(barcodeRows, mat, box, name);

      return {
        no: r["번호"] || "",
        mat,
        box,
        name,
        sap: Number(r["출고"] || 0),
        wms: Number(wmsMap[wmsKey] ?? 0),
        unit: r["단위"] || "",
        barcode,
        status: "미검수",
        scanned: 0,
      };
    });

    // 번호 순 정렬
    items.sort((a, b) => Number(a.no || 0) - Number(b.no || 0));

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
