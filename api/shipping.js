// /api/shipping.js — Stable Serverless Version (HEADER SAFE + 0 FIX)
import { loadCsv } from "./_csv.js";

const CSV_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vRAWmUNAeyndXfdxHjR-1CakW_Tm3OzmMTng5RkB53umXwucqpxABqMMcB0y8H5cHNg7aoHYqFztz0F/pub?gid=1070360000&single=true&output=csv";

// ✅ cache bust
function bust(url) {
  const t = Date.now();
  return url.includes("?") ? `${url}&t=${t}` : `${url}?t=${t}`;
}

function asText(v) {
  if (v === null || v === undefined) return "";
  return String(v).trim();
}

// ✅ 헤더명 후보 중 값 뽑기 (공백/BOM/제로폭까지 무시)
function pickLoose(r, keys) {
  const clean = (s) =>
    String(s ?? "")
      .replace(/[\s\uFEFF\u200B\u00A0]/g, "")
      .trim();

  const norm = {};
  for (const k of Object.keys(r || {})) norm[clean(k)] = r[k];

  for (const want of keys) {
    const v = norm[clean(want)];
    if (v !== undefined) return asText(v);
  }
  return "";
}

function convertToYMD(dateStr) {
  if (!dateStr) return 0;
  const s = String(dateStr).replace(/\s+/g, "");
  const parts = s.split(".");
  if (parts.length !== 3) return 0;
  const y = parts[0];
  const m = String(parts[1] || "").padStart(2, "0");
  const d = String(parts[2] || "").padStart(2, "0");
  return Number(`${y}${m}${d}`);
}

function getTodayYMD() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return Number(`${y}${m}${day}`);
}

export default async function handler(req, res) {
  try {
    // ✅ 캐시 금지
    res.setHeader("Cache-Control", "no-store, max-age=0");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");

    const { debug } = req.query;
    const dbg = String(debug || "") === "1";

    // 1) CSV 로드 (헤더 기반)
    const rows = await loadCsv(bust(CSV_URL));

    if (!rows || rows.length === 0) {
      return res.status(200).json({ ok: true, data: [] });
    }

    const today = getTodayYMD();
    const result = [];

    // 2) 데이터 파싱
    for (const r of rows) {
      // 출고일 (D열로 쓰던 값) → 헤더 기반 후보
      const dateStr =
        pickLoose(r, ["출고일", "출고 일자", "출고일자", "일자", "DATE"]) || "";

      const ymd = convertToYMD(dateStr);
      if (!ymd) continue;

      // 오늘 이전 출고 제외
      if (ymd < today) continue;

      result.push({
        ymd,
        date: dateStr,
        invoice: pickLoose(r, ["인보이스", "INV", "INVNO", "INV NO"]),
        country: pickLoose(r, ["국가", "COUNTRY"]),
        location: pickLoose(r, ["상차위치", "상차 위치", "로케이션", "LOC"]),
        pallet: pickLoose(r, ["파레트", "팔레트", "PALLET"]),
        time: pickLoose(r, ["상차시간", "상차 시간", "TIME"]),
        cbm: pickLoose(r, ["CBM", "cbm"]),
        container: pickLoose(r, ["컨테이너", "CONTAINER"]),
        work: pickLoose(r, ["작업여부", "작업 여부", "작업", "WORK"]),
        type: pickLoose(r, ["유형", "TYPE"]),
      });
    }

    // 3) 날짜 기준 정렬
    result.sort((a, b) => a.ymd - b.ymd);

    if (dbg) {
      return res.status(200).json({
        ok: true,
        data: result,
        meta: {
          count: rows.length,
          keys0: rows?.[0] ? Object.keys(rows[0]) : [],
          row0: rows?.[0] || null,
        },
      });
    }

    return res.status(200).json({ ok: true, data: result });
  } catch (err) {
    console.error("SHIPPING API ERROR:", err);
    return res.status(500).json({
      ok: false,
      error: err.message || String(err),
    });
  }
}
