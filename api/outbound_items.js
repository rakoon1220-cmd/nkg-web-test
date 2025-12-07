// /api/outbound_items.js
import { loadCsv } from "./_csv.js";

// SAP 자재자동
const SAP_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vRAWmUNAeyndXfdxHjR-1CakW_Tm3OzmMTng5RkB53umXwucqpxABqMMcB0y8H5cHNg7aoHYqFztz0F/pub?gid=221455512&single=true&output=csv";

// WMS 자동
const WMS_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vRAWmUNAeyndXfdxHjR-1CakW_Tm3OzmMTng5RkB53umXwucqpxABqMMcB0y8H5cHNg7aoHYqFztz0F/pub?gid=1850233363&single=true&output=csv";

// 바코드 표
const BARCODE_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vRAWmUNAeyndXfdxHjR-1CakW_Tm3OzmMTng5RkB53umXwucqpxABqMMcB0y8H5cHNg7aoHYqFztz0F/pub?gid=1454119997&single=true&output=csv";

export default async function handler(req, res) {
  const { inv } = req.query;

  if (!inv) {
    return res.status(200).json({ ok: false, message: "인보이스 없음" });
  }

  try {
    // CSV 로드
    let sap = await loadCsv(SAP_URL);
    let wms = await loadCsv(WMS_URL);
    let bar = await loadCsv(BARCODE_URL);

    // 키/값 공백 제거
    sap = sap.map(cleanRow);
    wms = wms.map(cleanRow);
    bar = bar.map(cleanRow);

    // ===== 1) SAP 자재자동 기준 목록 =====
    const sapItems = sap
      .filter((r) => r["인보이스"] === inv.trim())
      .map((r) => ({
        invoice: r["인보이스"],
        mat: r["자재코드"],
        name: r["자재내역"],
        sap: Number(r["출고"] || 0),
        box: r["박스번호"],
        unit: r["단위"],
        no: r["번호"],

        // 상단 요약용(여기선 안 쓰지만 함께 보유)
        country: r["국가"],
        container: r["컨테이너"],
        cbm: r["CBM"],
        load_loc:
          r["상차위치"] || r["상차 위치"] || r["상차 위치 "] || "",
        load_time:
          r["상차시간"] ||
          r["상차 시간"] ||
          r["상차 時間"] ||
          r["상차 시간 "] ||
          "",
        notice: r["특이사항"],

        // 나중에 스캔용
        wms: 0,
        barcode: "",
        scanned: 0,
        status: "미검수",
      }));

    // ===== 2) WMS 수량 매핑 =====
    for (const item of sapItems) {
      const hit = wms.find(
        (w) =>
          w["인보이스"] === item.invoice &&
          w["상품코드"] === item.mat &&
          w["박스번호"] === item.box
      );
      if (hit) {
        item.wms = Number(hit["수량"] || 0);
      }
    }

    // ===== 3) 바코드 매핑 =====
    for (const item of sapItems) {
      const bc = bar.find(
        (b) => b["자재번호"] === item.mat && b["박스번호"] === item.box
      );
      if (bc) {
        item.barcode = bc["바코드"];
      }
    }

    return res.status(200).json({
      ok: true,
      items: sapItems,
    });
  } catch (err) {
    console.error("OUTBOUND ERROR:", err);
    return res.status(200).json({
      ok: false,
      message: "서버 오류",
      error: err.message,
    });
  }
}

function cleanRow(r) {
  const cleaned = {};
  Object.keys(r).forEach((k) => {
    cleaned[k.trim()] = (r[k] ?? "").toString().trim();
  });
  return cleaned;
}
