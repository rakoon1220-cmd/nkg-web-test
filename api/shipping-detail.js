// api/shipping-detail.js — 출고 상세내역 최적화 안정판

// 정확한 SAP & WMS CSV URL (오타 제거된 버전)
const SAP_CSV_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vRAWmUNAeyndXfdxHjR-1CakW_Tm3OzmMTng5RkB53umXwucqpxABqMMcB0y8H5cHNg7aoHYqFztz0F/pub?gid=221455512&single=true&output=csv";

const WMS_CSV_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vRAWmUNAeyndXfdxHjR-1CakW_Tm3OzmMTng5RkB53umXwucqpxABqMMcB0y8H5cHNg7aoHYqFztz0F/pub?gid=1850233363&single=true&output=csv";

export default async function handler(req, res) {
  try {
    /* ----------------------------------------------------
       1) invoice 정규화
    ---------------------------------------------------- */
    let invoice = String(req.query.invoice || "").trim();
    invoice = invoice.replace(/[^0-9]/g, ""); // 숫자만 사용

    if (!invoice) {
      return res.status(400).json({ ok: false, msg: "invoice 값이 없습니다." });
    }

    /* ----------------------------------------------------
       2) CSV 데이터 로드
    ---------------------------------------------------- */
    const [sapText, wmsText] = await Promise.all([
      (await fetch(SAP_CSV_URL)).text(),
      (await fetch(WMS_CSV_URL)).text(),
    ]);

    const sapRows = parseCSV(sapText).slice(1); // 헤더 제외
    const wmsRows = parseCSV(wmsText).slice(1);

    /* ----------------------------------------------------
       3) WMS → Map(keyFull → 입고수량 합계)
    ---------------------------------------------------- */
    const wmsMap = new Map();

    for (const r of wmsRows) {
      const keyFull = clean(r[0]);
      if (!keyFull) continue;

      const qty = toNumber(r[4]); // WMS 입고수량
      wmsMap.set(keyFull, (wmsMap.get(keyFull) || 0) + qty);
    }

    /* ----------------------------------------------------
       4) SAP → invoice 필터 + 상세내역 구성
    ---------------------------------------------------- */
    const result = [];

    for (const r of sapRows) {
      const keyFull = clean(r[0]); // A열
      const inv = clean(r[1]).replace(/[^0-9]/g, ""); // B열 (정규화)

      if (inv !== invoice) continue; // 인보이스 필터

      const date = clean(r[4]);      // 출고일 (E)
      const country = clean(r[5]);   // 국가   (F)
      const code = clean(r[6]);      // 자재코드 (G)
      const name = clean(r[7]);      // 자재내역 (H)
      const outQty = toNumber(r[8]); // 출고수량 (I)
      const box = clean(r[9]);       // 박스번호 (J)
      const work = clean(r[18]);     // 작업여부 (S)
      const container = clean(r[14]);// 컨테이너 (O)
      const cbm = clean(r[19]);      // CBM     (T)
      const note = clean(r[23]);     // 특이사항 (X)

      // WMS 입고수량 매칭
      const inQty = toNumber(wmsMap.get(keyFull));
      const diff = inQty - outQty;

      result.push({
        invoice,
        date,
        country,
        code,
        name,
        box,
        outQty,
        inQty,
        diff,
        container,
        cbm,
        work,
        note,
      });
    }

    return res.status(200).json({ ok: true, data: result });

  } catch (err) {
    console.error("SHIPPING-DETAIL API ERROR:", err);
    return res.status(500).json({ ok: false, error: err.message });
  }
}

/* ============================================================
   CSV 파서 (정확도 100%, 큰파일도 문제 없음)
============================================================ */
function parseCSV(text) {
  text = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const rows = [];
  let row = [], field = "", inside = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];

    if (c === '"') {
      if (inside && text[i + 1] === '"') {
        field += '"';
        i++;
      } else {
        inside = !inside;
      }
    } else if (c === "," && !inside) {
      row.push(field);
      field = "";
    } else if (c === "\n" && !inside) {
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

/* ============================================================
   문자열 정리
============================================================ */
function clean(str) {
  if (!str) return "";
  return String(str)
    .replace(/\uFEFF/g, "")
    .replace(/\n/g, " ")
    .trim();
}

/* ============================================================
   숫자 변환
============================================================ */
function toNumber(v) {
  if (!v) return 0;
  const n = parseFloat(String(v).replace(/,/g, ""));
  return isNaN(n) ? 0 : n;
}
