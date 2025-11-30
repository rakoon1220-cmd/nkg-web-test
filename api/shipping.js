import fetch from "node-fetch";

const CSV_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vRAWmUNAeyndXfdxHjR-1CakW_Tm3OzmMTng5RkB53umXwucqpxABqMMcB0y8H5cHNg7aoHYqFztz0F/pub?gid=1070360000&single=true&output=csv";

export default async function handler(req, res) {
  try {
    const csv = await fetch(CSV_URL).then(r => r.text());
    const rows = parseCSV(csv);

    const { all, key, summary } = req.query;

    // 요약 계산
    if (summary === "true") {
      return res.status(200).json({ ok: true, summary: calcSummary(rows) });
    }

    // 전체 조회 (필터 없이)
    if (all === "true") {
      return res.status(200).json({ ok: true, data: rows });
    }

    // 검색
    if (key) {
      return res.status(200).json({ ok: true, data: filterKey(rows, key) });
    }

    return res.status(200).json({ ok: true, data: rows });

  } catch (e) {
    return res.status(500).json({ ok: false, msg: e.message });
  }
}


/* ----------------------------------------------------
   문자열 정리 (숨은 문자 제거 + trim)
---------------------------------------------------- */
function clean(str) {
  if (!str) return "";
  return String(str)
    .replace(/\uFEFF/g, "") // BOM 제거
    .replace(/\r/g, "")
    .replace(/\n/g, "")
    .trim();
}


/* ----------------------------------------------------
   CSV 파싱
---------------------------------------------------- */
function parseCSV(text) {
  const lines = text.split(/\r?\n/).slice(1);
  const out = [];

  for (let line of lines) {
    if (!line.trim()) continue;

    const c = safeParse(line);

    out.push({
      invoice:   clean(c[0]),  // A
      type:      clean(c[10]), // K
      container: clean(c[9]),  // J
      cbm:       clean(c[11]), // L
      date:      clean(c[3]),  // D (2025.12.01)
      country:   clean(c[4]),  // E
      work:      clean(c[15]), // P
      location:  clean(c[16]), // Q
      pallet:    clean(c[18]), // S
      time:      clean(c[19]), // T
    });
  }
  return out;
}

function safeParse(row) {
  let out = [], cur = "", inside = false;
  for (let c of row) {
    if (c === '"' && inside) inside = false;
    else if (c === '"' && !inside) inside = true;
    else if (c === "," && !inside) { out.push(cur); cur = ""; }
    else cur += c;
  }
  out.push(cur);
  return out;
}


/* ----------------------------------------------------
   요약 계산
---------------------------------------------------- */
function calcSummary(rows) {
  const today = getDate(0);
  const tomorrow = getDate(1);

  let t20=0,t40=0,tL=0;
  let n20=0,n40=0,nL=0;

  rows.forEach(r => {
    if (!r.date) return;

    const d = toDash(clean(r.date));   // YYYY-MM-DD
    const J = clean(r.container).toUpperCase();

    if (d === today) {
      if (J.includes("20")) t20++;
      else if (J.includes("40")) t40++;
      else if (J.includes("LCL")) tL++;
    }

    if (d === tomorrow) {
      if (J.includes("20")) n20++;
      else if (J.includes("40")) n40++;
      else if (J.includes("LCL")) nL++;
    }
  });

  return {
    today:    { pt20: t20, pt40: t40, lcl: tL },
    tomorrow: { pt20: n20, pt40: n40, lcl: nL }
  };
}


/* ----------------------------------------------------
   검색 (인보이스 / 날짜 / 국가 / 텍스트)
---------------------------------------------------- */
function filterKey(rows, key) {
  const k = clean(key);

  // ① 인보이스 (6~9자리 숫자)
  if (/^\d{6,9}$/.test(k)) {
    return rows.filter(r => clean(r.invoice).includes(k));
  }

  // ② YYYYMMDD → YYYY.MM.DD
  if (/^\d{8}$/.test(k)) {
    const d = `${k.substring(0,4)}.${k.substring(4,6)}.${k.substring(6,8)}`;
    return rows.filter(r => clean(r.date) === d);
  }

  // ③ MMDD 부분 날짜 검색
  if (/^\d{3,4}$/.test(k)) {
    return rows.filter(r => clean(r.date).replace(/[.]/g,"").endsWith(k));
  }

  // ④ 국가 / 기타 텍스트
  const lower = k.toLowerCase();
  return rows.filter(r =>
    Object.values(r).some(v => clean(v).toLowerCase().includes(lower))
  );
}


/* ----------------------------------------------------
   날짜 변환
---------------------------------------------------- */
function toDash(d) {
  return d.replace(/\./g, "-");
}

function getDate(add) {
  const d = new Date();
  d.setDate(d.getDate() + add);
  return d.toISOString().substring(0,10);
}
