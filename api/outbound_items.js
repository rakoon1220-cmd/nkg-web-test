import { loadCsv } from "./_csv.js";

// ▣ Google Sheet CSV URL들
const URL_ITEM =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vRAWmUNAeyndXfdxHjR-1CakW_Tm3OzmMTng5RkB53umXwucqpxABqMMcB0y8H5cHNg7aoHYqFztz0F/pub?gid=221455512&single=true&output=csv"; // sap자재자동

const URL_WMS =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vRAWmUNAeyndXfdxHjR-1CakW_Tm3OzmMTng5RkB53umXwucqpxABqMMcB0y8H5cHNg7aoHYqFztz0F/pub?gid=1850233363&single=true&output=csv"; // wms자동

const URL_BARCODE =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vRAWmUNAeyndXfdxHjR-1CakW_Tm3OzmMTng5RkB53umXwucqpxABqMMcB0y8H5cHNg7aoHYqFztz0F/pub?gid=1454119997&single=true&output=csv"; // 바코드마스터

export default async function handler(req, res) {
  const { inv } = req.query;

  if (!inv) {
    return res
      .status(200)
      .json({ ok: false, message: "인보이스값이 없습니다." });
  }

  try {
    // 1) CSV 로드
    let itemRows = [];
    let wmsRows = [];
    let barcodeRows = [];

    try {
      itemRows = await loadCsv(URL_ITEM);    // sap자재자동
      wmsRows = await loadCsv(URL_WMS);      // wms자동
      barcodeRows = await loadCsv(URL_BARCODE); // 바코드마스터
    } catch (err) {
      console.error("CSV LOAD ERROR:", err);
      return res
        .status(200)
        .json({ ok: false, message: "CSV 로딩 실패: " + err.message });
    }

    // 2) 인보이스 기준으로 sap자재자동 필터링
    const invTrim = inv.trim();
    const invItems = itemRows.filter(r => {
      const iv1 = (r["인보이스"] || "").trim();
      const iv2 = (r["문서번호"] || "").trim(); // 혹시 문서번호로 들어오는 경우 대비
      return iv1 === invTrim || iv2 === invTrim;
    });

    if (invItems.length === 0) {
      return res.status(200).json({
        ok: false,
        message: `sap자재자동에서 인보이스(${invTrim}) 데이터가 없습니다.`,
      });
    }

    // 3) 상단 헤더 정보 (첫 행 기준)
    const first = invItems[0];
    const header = {
      인보이스: first["인보이스"] || invTrim,
      문서번호: first["문서번호"] || "",
      출고일: first["출고일"] || "",
      국가: first["국가"] || "",
      컨테이너: first["컨테이너"] || "",
      CBM: first["CBM"] || "",
      상차위치: first["상차위치"] || "",
      상차시간: first["상차시간"] || "",
      특이사항: first["특이사항"] || "",
      출고합계: invItems.reduce(
        (sum, r) => sum + Number(r["출고"] || 0),
        0
      ),
    };

    // 4) 출고 검수 목록 매핑
    const items = invItems.map(r => {
      const mat = (r["자재코드"] || "").trim();
      const box = (r["박스번호"] || "").trim();

      // WMS 매핑 (자재코드 + 박스번호 기준)
      const wmsRow = wmsRows.find(
        w =>
          (w["자재코드"] || "").trim() === mat &&
          (w["박스번호"] || "").trim() === box
      );
      const wmsQty = Number(wmsRow?.["수량"] || 0);

      // 바코드 매핑 (자재코드 + 박스번호 기준)
      const bcRow = barcodeRows.find(
        b =>
          (b["자재코드"] || "").trim() === mat &&
          (b["박스번호"] || "").trim() === box
      );
      const barcode = (bcRow?.["바코드"] || "").trim();

      return {
        mat,                                     // 자재번호
        box,                                     // 박스번호
        name: r["자재내역"] || "",              // 품명
        sap: Number(r["출고"] || 0),            // SAP 출고 수량
        wms: wmsQty,                             // WMS 수량
        unit: r["단위"] || "",                  // 단위
        country: r["국가"] || "",
        container: r["컨테이너"] || "",
        cbm: r["CBM"] || "",
        load_loc: r["상차위치"] || "",
        load_time: r["상차시간"] || "",
        notice: r["특이사항"] || "",
        pallet: r["파레트"] || "",
        barcode,                                 // 바코드
        scanned: 0,
        status: "미검수",
      };
    });

    return res.status(200).json({
      ok: true,
      header,
      items,
    });
  } catch (err) {
    console.error("SERVER ERROR:", err);
    return res
      .status(200)
      .json({ ok: false, message: "서버 오류: " + err.message });
  }
}
