import { loadCsv } from "./_csv.js";

//
// ▼ Google Sheet CSV 주소들
//
const URL_DOC =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vRAWmUNAeyndXfdxHjR-1CakW_Tm3OzmMTng5RkB53umXwucqpxABqMMcB0y8H5cHNg7aoHYqFztz0F/pub?gid=1070360000&single=true&output=csv";

const URL_ITEM =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vRAWmUNAeyndXfdxHjR-1CakW_Tm3OzmMTng5RkB53umXwucqpxABqMMcB0y8H5cHNg7aoHYqFztz0F/pub?gid=221455512&single=true&output=csv";

const URL_WMS =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vRAWmUNAeyndXfdxHjR-1CakW_Tm3OzmMTng5RkB53umXwucqpxABqMMcB0y8H5cHNg7aoHYqFztz0F/pub?gid=1850233363&single=true&output=csv";

const URL_BARCODE =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vRAWmUNAeyndXfdxHjR-1CakW_Tm3OzmMTng5RkB53umXwucqpxABqMMcB0y8H5cHNg7aoHYqFztz0F/pub?gid=1454119997&single=true&output=csv";


//
// ▼ 안정판 Serverless Function
//
export default async function handler(req, res) {
  const { inv } = req.query;

  if (!inv) {
    return res.status(200).json({ ok: false, message: "인보이스값이 없습니다." });
  }

  try {
    //
    // 1) CSV 4종 로딩 (안전 모드)
    //
    let docRows = [];
    let itemRows = [];
    let wmsRows = [];
    let barcodeRows = [];

    try {
      docRows = await loadCsv(URL_DOC);
      itemRows = await loadCsv(URL_ITEM);
      wmsRows = await loadCsv(URL_WMS);
      barcodeRows = await loadCsv(URL_BARCODE);
    } catch (err) {
      console.error("CSV LOAD ERROR:", err);
      return res.status(200).json({ ok: false, message: "CSV 로딩 실패" });
    }

    //
    // 2) 인보이스 정보 찾기
    //
    const docRow = docRows.find(r => r["인보이스"] === inv.trim());
    if (!docRow) {
      return res.status(200).json({ ok: false, message: "인보이스 정보 없음" });
    }

    //
    // 3) 해당 인보이스의 품목 목록 찾기
    //    → Google Sheet에서 출고 품목이 어떤 식으로 저장돼있는지에 따라 조정 가능
    //
    const invoiceItems = itemRows.filter(r =>
      (r["인보이스"] || "").trim() === inv.trim()
    );

    //
    // 4) 최종 매핑 리스트 생성
    //
    const result = invoiceItems.map(it => {
      const mat = it["자재"] || "";
      const box = it["박스"] || "";
      const unit = it["단위"] || "";
      const sapQty = Number(it["수량"] || 0);

      // 자재명 매핑
      const itemInfo = itemRows.find(r => r["자재"] === mat);
      const name = itemInfo?.["자재내역"] || "";

      // WMS 재고 매핑
      const wmsInfo = wmsRows.find(r =>
        (r["자재"] === mat) && (r["박스"] === box)
      );
      const wmsQty = Number(wmsInfo?.["수량"] || 0);

      // 바코드 매핑
      const barInfo = barcodeRows.find(r =>
        (r["자재"] === mat) && (r["박스"] === box)
      );
      const barcode = barInfo?.["바코드"] || "";

      return {
        mat,
        box,
        name,
        sap: sapQty,
        wms: wmsQty,
        unit,
        barcode,
        scanned: 0,
        status: "미검수"
      };
    });

    //
    // 5) 응답
    //
    return res.status(200).json({
      ok: true,
      header: docRow,   // 상단 요약 정보도 같이 제공
      items: result
    });

  } catch (err) {
    console.error("SERVER ERROR:", err);
    return res.status(200).json({ ok: false, message: err.message });
  }
}
