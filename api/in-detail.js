// /api/in-detail.js — 입고검수(IN) 인보이스 상세 (최적화 안정판)

const SAP_CSV_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vRAWmUNAeyndXfdxHjR-1CakW_Tm3OzmMTng5RkB53umXwucqpxABqMMcB0y8H5cHNg7aoHYqFztz0F/pub?gid=221455512&single=true&output=csv";

const WMS_CSV_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vRAWmUNAeyndXfdxHjR-1CakW_Tm3OzmMTng5RkB53umXwucqpxABqMMcB0y8H5cHNg7aoHYqFztz0F/pub?gid=1850233363&single=true&output=csv";

export default async function handler(req, res) {
  try {
    // 1) invoice 정규화 (숫자만)
    let invoice = String(req.query.invoice || "").trim();
    invoice = invoice.replace(/[^0-9]/g, "");
    if (!invoice) {
      return res.status(400).json({ ok: false, msg: "invoice 값이 없습니다. 예: /api/in-detail?invoice=775803" });
    }

    // 2) CSV 로드 (병렬)
    const [sapResp, wmsResp] = await Promise.all([
      fetch(SAP_CSV_URL),
      fetch(WMS_CSV_URL),
    ]);

    if (!sapResp.ok) throw new Error("SAP CSV 요청 실패: " + sapResp.status);
    if (!wmsResp.ok) throw new Error("WMS CSV 요청 실패: " + wmsResp.status);

    const [sapText, wmsText] = await Promise.all([sapResp.text(), wmsResp.text()]);

    const sapRows = parseCSV(sapText).slice(1); // 헤더 제외
    const wmsRows = parseCSV(wmsText).slice(1);

    // 3) WMS → Map(keyFull → 입고수량 합계)
    const wmsMap = new Map();
    for (const r of wmsRows) {
      if (!r || r.length < 5) continue;
      const keyFull = clean(r[0]);       // A: keyFull
      if (!keyFull) continue;
      const qty = toNumber(r[4]);        // E: WMS 수량
      wmsMap.set(keyFull, (wmsMap.get(keyFull) || 0) + qty);
    }

    // 4) SAP → invoice 필터 + 상세내역
    const items = [];

    // 요약(상단 카드용)
    let summary = {
      invoice,
      date: "-",
      country: "-",
      container: "-",
      cbm: "-",
      load_loc: "-",   // 네 IN.html 상단에 맞춰 필드명 유지
      load_time: "-",  // SAP에 없으면 "-" 유지
      qty: 0,          // SAP 총수량
      wmsQty: 0,       // WMS 총수량
      notice: "",      // 특이사항(여러개면 합쳐서)
    };

    const noticeSet = new Set();

    for (const r of sapRows) {
      if (!r || r.length < 24) continue;

      const keyFull = clean(r[0]);                 // A: keyFull (inv+자재 등)
      const inv = clean(r[1]).replace(/[^0-9]/g, ""); // B: invoice (정규화)
      if (inv !== invoice) continue;

      const date = clean(r[4]);         // E: 출고일(또는 일자)
      const country = clean(r[5]);      // F: 국가
      const code = clean(r[6]);         // G: 자재코드
      const name = clean(r[7]);         // H: 자재내역
      const sapQty = toNumber(r[8]);    // I: SAP 수량
      const box = clean(r[9]);          // J: 박스번호
      const container = clean(r[14]);   // O: 컨테이너
      const work = clean(r[18]);        // S: 작업여부
      const cbm = clean(r[19]);         // T: CBM (문자 유지)
      const loc = clean(r[22]);         // W: 상차/작업 위치(네 데이터 기준)
      const note = clean(r[23]);        // X: 특이사항

      const wmsQty = toNumber(wmsMap.get(keyFull)); // WMS 입고 수량
      const diff = wmsQty - sapQty;

      // 상태(프론트에서 색칠하기 좋게)
      // - diff < 0 : 미입고(부족)
      // - diff == 0: 입고완료
      // - diff > 0 : 초과(또는 오류)
      let status = "입고완료";
      let statusClass = "text-emerald-600";
      if (diff < 0) { status = "미입고"; statusClass = "text-blue-600"; }
      else if (diff > 0) { status = "초과"; statusClass = "text-rose-600"; }

      items.push({
        no: items.length + 1,
        keyFull,          // 바코드/키(숨김열로 써도 됨)
        invoice: inv,
        date,
        country,
        code,
        name,
        box,
        sapQty,
        wmsQty,
        diff,
        container,
        cbm,
        loc,
        work,
        note,
        status,
        statusClass,
      });

      // summary 채우기(첫 행 기반)
      if (summary.date === "-" && date) summary.date = date;
      if (summary.country === "-" && country) summary.country = country;
      if (summary.container === "-" && container) summary.container = container;
      if (summary.cbm === "-" && cbm) summary.cbm = cbm;
      if (summary.load_loc === "-" && loc) summary.load_loc = loc;

      summary.qty += sapQty;
      summary.wmsQty += wmsQty;

      if (note) noticeSet.add(note);
    }

    summary.notice = Array.from(noticeSet).join("\n");

    return res.status(200).json({
      ok: true,
      invoice,
      summary,
      rows: items.length,
      data: items,
    });

  } catch (err) {
    console.error("IN-DETAIL API ERROR:", err);
    return res.status(500).json({ ok: false, error: err.message || String(err) });
  }
}

/* ===========================
   CSV 파서 (따옴표/콤마/줄바꿈 100%)
=========================== */
function parseCSV(text) {
  text = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];

    if (c === '"') {
      if (inQuotes && text[i + 1] === '"') {
        field += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (c === "," && !inQuotes) {
      row.push(field);
      field = "";
    } else if (c === "\n" && !inQuotes) {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += c;
    }
  }

  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function clean(str) {
  return String(str || "")
    .replace(/\uFEFF/g, "")
    .replace(/\r/g, "")
    .replace(/\n/g, " ")
    .trim();
}

function toNumber(v) {
  const n = parseFloat(String(v || "").replace(/,/g, ""));
  return isNaN(n) ? 0 : n;
}
