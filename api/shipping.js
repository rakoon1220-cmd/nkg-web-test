import fetch from "node-fetch";

const CSV_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vRAWmUNAeyndXfdxHjR-1CakW_Tm3OzmMTng5RkB53umXwucqpxABqMMcB0y8H5cHNg7aoHYqFztz0F/pub?gid=1070360000&single=true&output=csv";

export default async function handler(req, res) {
  try {
    const csv = await fetch(CSV_URL).then(r => r.text());
    const rows = parseCSV(csv);

    const { all, key, date, summary } = req.query;

    // 오늘/내일 계산
    if (summary === "true") {
      const result = calcSummary(rows);
      return res.status(200).json({ ok: true, summary: result });
    }

    // 전체조회
    if (all === "true") {
      return res.status(200).json({ ok: true, data: rows });
    }

    // 날짜검색
    if (date) {
      const filtered = rows.filter(r => r.date === date);
      return res.status(200).json({ ok: true, data: filtered });
    }

    // 키워드 검색
    if (key) {
      const k = key.toLowerCase();
      const filtered = rows.filter(r =>
        Object.values(r).some(v => String(v).toLowerCase().includes(k))
      );
      return res.status(200).json({ ok: true, data: filtered });
    }

    // 기본: 전체
    return res.status(200).json({ ok: true, data: rows });

  } catch (e) {
    return res.status(500).json({ ok: false, msg: e.message });
  }
}


/* ------------------------------
   CSV 파싱
--------------------------------- */
function parseCSV(text) {
  const lines = text.split(/\r?\n/).slice(1);
  const result = [];

  for (const line of lines) {
    if (!line.trim()) continue;
    const cols = safeParse(line);

    result.push({
      invoice: cols[0],
      type: cols[10],
      container: cols[9],
      cbm: cols[11],
      date: cols[3],
      country: cols[4],
      work: cols[15],
      location: cols[16],
      pallet: cols[18],
      time: cols[19]
    });
  }
  return result;
}

function safeParse(row) {
  const out = [];
  let cur = "";
  let inside = false;

  for (let c of row) {
    if (c === '"' && inside) inside = false;
    else if (c === '"' && !inside) inside = true;
    else if (c === "," && !inside) { out.push(cur); cur = ""; }
    else cur += c;
  }
  out.push(cur);
  return out;
}


/* ------------------------------
   오늘/내일 요약 계산
--------------------------------- */
function calcSummary(rows) {
  const today = getDate(0);
  const tomorrow = getDate(1);

  let t20 = 0, t40 = 0, tL = 0;
  let n20 = 0, n40 = 0, nL = 0;

  rows.forEach(r => {
    const ct = (r.container || "").toUpperCase();
    if (!ct) return;

    // 오늘
    if (r.date === today) {
      if (ct.includes("20")) t20++;
      else if (ct.includes("40")) t40++;
      else if (ct.includes("LCL")) tL++;
    }

    // 내일
    if (r.date === tomorrow) {
      if (ct.includes("20")) n20++;
      else if (ct.includes("40")) n40++;
      else if (ct.includes("LCL")) nL++;
    }
  });

  return {
    today: { pt20: t20, pt40: t40, lcl: tL },
    tomorrow: { pt20: n20, pt40: n40, lcl: nL }
  };
}

function getDate(add) {
  const d = new Date();
  d.setDate(d.getDate() + add);
  return d.toISOString().split("T")[0];
}
