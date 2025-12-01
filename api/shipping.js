// =======================================================
// /api/shipping.js — 완전 안정판 (Node.js 강제 + CSV 안전파서)
// =======================================================

// ★★★★★ Node.js 런타임 강제 (defect/stock API 보호)
export const config = {
  runtime: 'nodejs'
};

export default async function handler(req, res) {
  try {
    const CSV_URL =
      "https://docs.google.com/spreadsheets/d/e/2PACX-1vRAWmUNAeyndXfdxHjR-1CakW_Tm3OzmMTng5RkB53umXwucqpxABqMMcB0y8H5cHNg7aoHYqFztz0F/pub?gid=1070360000&single=true&output=csv";

    // CSV 원본
    const original = await fetch(CSV_URL).then(r => r.text());

    // ★★★★★ 셀 내부 줄바꿈 완전 제거 (멀티라인 텍스트 대응)
    const fixed = original.replace(/"[^"]*"/g, block => {
      return block.replace(/\r?\n/g, " ").replace(/\s+/g, " ");
    });

    // CSV 파싱
    const rows = parseCSV(fixed);

    const todayYmd = getTodayYMD();

    // 오늘 포함 + 이후 날짜만 필터
    const filtered = rows.filter(r => r.ymd >= todayYmd);

    // 날짜 순 정렬
    filtered.sort((a, b) => a.ymd - b.ymd);

    return res.status(200).json({ ok: true, data: filtered });

  } catch (err) {
    return res.status(500).json({ ok: false, msg: err.message });
  }
}


// =======================================================
// 1) CSV 파서 (쉼표·줄바꿈·따옴표 100% 안전 처리)
// =======================================================
function parseCSV(text) {
  const rows = [];
  let cur = [];
  let field = "";
  let inside = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];

    if (c === '"') {
      // "" → " 변환
      if (inside && text[i + 1] === '"') {
        field += '"';
        i++;
      } else {
        inside = !inside;
      }
      continue;
    }

    if (c === "," && !inside) {
      cur.push(field);
      field = "";
      continue;
    }

    if ((c === "\n" || c === "\r") && !inside) {
      if (field !== "" || cur.length > 0) {
        cur.push(field);
        rows.push(convertRow(cur));
      }
      cur = [];
      field = "";
      continue;
    }

    field += c;
  }

  // 마지막 줄 처리
  if (field !== "" || cur.length > 0) {
    cur.push(field);
    rows.push(convertRow(cur));
  }

  return rows;
}


// =======================================================
// 2) CSV → 객체 변환
//    (스프레드시트 열 번호 그대로 매핑)
// =======================================================
function convertRow(c) {
  const safe = idx => (c[idx] ? clean(c[idx]) : "");

  const ymd = convertToYMD(safe(3)); // 출고일 D열

  return {
    ymd,
    date: safe(3),        // D
    invoice: safe(0),     // A
    country: safe(4),     // E
    location: safe(16),   // Q (상차위치)
    pallet: safe(18),     // S (★ 문제되던 부분 완전 해결)
    time: safe(19),       // T
    cbm: safe(11),        // L
    container: safe(9),   // J
    work: safe(15),       // P
    type: safe(10)        // K
  };
}


// =======================================================
// 3) 유틸 함수
// =======================================================
function clean(str) {
  return String(str)
    .replace(/\uFEFF/g, "")
    .replace(/\r/g, "")
    .replace(/\n/g, " ")  // 내부 줄바꿈 → 공백
    .trim();
}

function convertToYMD(str) {
  if (!str) return 0;

  const parts = str.split(".");
  if (parts.length !== 3) return 0;

  const y = parts[0];
  const m = parts[1].padStart(2, "0");
  const d = parts[2].padStart(2, "0");

  return Number(`${y}${m}${d}`);
}

function getTodayYMD() {
  const d = new Date();
  return Number(
    d.getFullYear() +
    String(d.getMonth() + 1).padStart(2, "0") +
    String(d.getDate()).padStart(2, "0")
  );
}
