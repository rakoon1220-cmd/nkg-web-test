import fetch from "node-fetch";

const CSV_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vRAWmUNAeyndXfdxHjR-1CakW_Tm3OzmMTng5RkB53umXwucqpxABqMMcB0y8H5cHNg7aoHYqFztz0F/pub?gid=1070360000&single=true&output=csv";

export default async function handler(req, res) {
  try {
    const csv = await fetch(CSV_URL).then(r => r.text());
    const rows = parseCSV(csv);

    const today = getDate(0);

    // 오늘 이전 데이터 제거
    const valid = rows.filter(r => r.date && r.date >= today);

    const { all, key, summary } = req.query;

    // 요약 계산
    if (summary === "true") {
      return res.status(200).json({ ok: true, summary: calcSummary(valid) });
    }

    // 전체 조회
    if (all === "true") {
      return res.status(200).json({ ok: true, data: valid });
    }

    // 키워드 조회
    if (key) {
      const data = filterKey(valid, key);
      return res.status(200).json({ ok: true, data });
    }

    return res.status(200).json({ ok: true, data: valid });

  } catch (e) {
    return res.status(500).json({ ok: false, msg: e.message });
  }
}


/* -----------------------------
   텍스트 → 컬럼 매핑
------------------------------*/
function parseCSV(text) {
  const lines = text.split(/\r?\n/).slice(1);
  const out = [];

  for (const line of lines) {
    if (!line.trim()) continue;
    const c = safeParse(line);

    out.push({
      invoice:     c[0],   // A
      type:        c[10],  // K
      container:   c[9],   // J
      cbm:         c[11],  // L
      date:        c[3],   // D
      country:     c[4],   // E
      work:        c[15],  // P
      location:    c[16],  // Q
      pallet:      c[18],  // S
      time:        c[19],  // T
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


/* -----------------------------
   요약 계산 (오늘 / 내일)
------------------------------*/
function calcSummary(rows) {
  const today = getDate(0);
  const tom = getDate(1);

  let t20=0,t40=0,tL=0;
  let n20=0,n40=0,nL=0;

  rows.forEach(r => {
    if (!r.date) return;
    const J = (r.container || "").toUpperCase();

    if (r.date === today) {
      if (J.includes("20")) t20++;
      else if (J.includes("40")) t40++;
      else if (J.includes("LCL")) tL++;
    }

    if (r.date === tom) {
      if (J.includes("20")) n20++;
      else if (J.includes("40")) n40++;
      else if (J.includes("LCL")) nL++;
    }
  });

  return {
    today: { pt20: t20, pt40: t40, lcl: tL },
    tomorrow:{ pt20: n20, pt40: n40, lcl: nL }
  };
}


/* -----------------------------
   부분 검색 / 날짜 검색 / 전체 검색
------------------------------*/
function filterKey(rows, key) {
  const raw = key.trim();

  // 8자리 날짜 YYYYMMDD
  if (/^\d{8}$/.test(raw)) {
    const y = raw.substring(0,4);
    const m = raw.substring(4,6);
    const d = raw.substring(6,8);
    const full = `${y}-${m}-${d}`;
    return rows.filter(r => r.date === full);
  }

  // 3~4자리 부분 날짜 MMDD
  if (/^\d{3,4}$/.test(raw)) {
    return rows.filter(r =>
      r.date && r.date.replace(/-/g,"").endsWith(raw)
    );
  }

  // 일반 문자열 검색
  const lower = raw.toLowerCase();
  return rows.filter(r =>
    Object.values(r).some(v =>
      String(v).toLowerCase().includes(lower)
    )
  );
}

/* 날짜 조합 */
function getDate(add) {
  const d = new Date();
  d.setDate(d.getDate() + add);
  return d.toISOString().split("T")[0];
}
