// /api/defect.js — FINAL (조회키 우선 + HEADER SAFE + WMS 0 FIX)
import { loadCsv } from "./_csv.js";

const SAP_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vRAWmUNAeyndXfdxHjR-1CakW_Tm3OzmMTng5RkB53umXwucqpxABqMMcB0y8H5cHNg7aoHYqFztz0F/pub?gid=221455512&single=true&output=csv";

const WMS_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vRAWmUNAeyndXfdxHjR-1CakW_Tm3OzmMTng5RkB53umXwucqpxABqMMcB0y8H5cHNg7aoHYqFztz0F/pub?gid=1850233363&single=true&output=csv";

// ✅ cache bust
function bust(url) {
  const t = Date.now();
  return url.includes("?") ? `${url}&t=${t}` : `${url}?t=${t}`;
}

function asText(v) {
  if (v === null || v === undefined) return "";
  return String(v).trim();
}

function asNum(v, def = 0) {
  const s0 = asText(v);
  if (!s0) return def;
  const s = s0.replace(/,/g, "");
  const n = Number(s.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : def;
}

/**
 * ✅ 숫자 ID 정규화 (조회키/인보이스/문서번호 공용)
 */
function normalizeId(v) {
  if (v === null || v === undefined) return "";
  let s = String(v).trim();
  if (!s) return "";

  if (/^\d+$/.test(s)) return s.replace(/^0+/, "");

  s = s.replace(/,/g, "");
  if (/^\d+\.0+$/.test(s)) s = s.replace(/\.0+$/, "");

  if (/[eE]/.test(s)) {
    const n = Number(s);
    if (Number.isFinite(n)) return String(Math.round(n)).replace(/^0+/, "");
  }

  const digits = s.replace(/[^0-9]/g, "");
  return digits.replace(/^0+/, "");
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

// ✅ SAP/WMS keyFull 후보 생성 (환경별 형태 차이 대응)
function makeKeyCandidates(inv, mat) {
  const i = normalizeId(inv);
  const m = normalizeId(mat);
  if (!i || !m) return [];
  return [`${i}__${m}`, `${i}${m}`];
}

function convertToYMD(dateStr) {
  if (!dateStr) return 0;
  const s = String(dateStr).trim();
  // "2025. 12. 1" / "2025.12.01" / "2025-12-1" / "2025/12/01"
  const m = s.match(/^(\d{4})\s*[.\-\/]\s*(\d{1,2})\s*[.\-\/]\s*(\d{1,2})$/);
  if (!m) return 0;

  const y = m[1];
  const mo = String(m[2]).padStart(2, "0");
  const d = String(m[3]).padStart(2, "0");
  const ymd = Number(`${y}${mo}${d}`);
  return Number.isFinite(ymd) ? ymd : 0;
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
    res.setHeader("Cache-Control", "no-store, max-age=0");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");

    const { key, debug } = req.query;

    if (!key) {
      return res.status(400).json({
        ok: false,
        msg: "검색 키(key)가 없습니다. 예: /api/defect?key=775803",
      });
    }

    const queryRaw = String(key).trim();
    const queryKey = normalizeId(queryRaw);
    const today = getTodayYMD();

    const [sapRows, wmsRows] = await Promise.all([
      loadCsv(bust(SAP_URL)),
      loadCsv(bust(WMS_URL)),
    ]);

    const dbg = String(debug || "") === "1";
    const meta = dbg
      ? {
          queryRaw,
          queryKey,
          sapCount: sapRows?.length || 0,
          wmsCount: wmsRows?.length || 0,
          sapKeys0: sapRows?.[0] ? Object.keys(sapRows[0]) : [],
          wmsKeys0: wmsRows?.[0] ? Object.keys(wmsRows[0]) : [],
          sapRow0: sapRows?.[0] || null,
          wmsRow0: wmsRows?.[0] || null,
        }
      : null;

    /* ------------------------------------------------------------
       1) WMS map 생성 (keyFull 후보 → 합계수량)
    ------------------------------------------------------------ */
    const wmsMap = new Map();

    for (const r of wmsRows || []) {
      const inv = pickLoose(r, ["인보이스", "INV", "INVNO", "INV NO", "INVOICE"]);
      const mat = pickLoose(r, ["상품코드", "자재코드", "자재번호", "품목코드", "상품 코드", "자재 코드", "MATERIAL", "MAT"]);
      const qty = asNum(pickLoose(r, ["수량", "QTY", "qty", "입고", "입고수량", "입고 수량"]), 0);

      const keyFullDirect = pickLoose(r, ["인보이스+자재코드", "인보이스+자재", "INV+MAT", "KEYFULL"]);

      const keys = [];
      if (keyFullDirect) keys.push(asText(keyFullDirect));
      keys.push(...makeKeyCandidates(inv, mat));

      for (const k of keys) {
        if (!k) continue;
        wmsMap.set(k, (wmsMap.get(k) || 0) + qty);
      }
    }

    /* ------------------------------------------------------------
       2) SAP + WMS 매칭 (조회키 우선)
       - sap 조회키(B열) 있으면 그걸로 비교
       - 없으면 인보이스/문서번호 둘 중 하나 비교
    ------------------------------------------------------------ */
    const result = [];

    for (const r of sapRows || []) {
      const keyFull =
        pickLoose(r, ["인보이스+자재코드", "인보이스+자재", "KEYFULL"]) ||
        asText(r["인보이스+자재코드"]);

      const sapKeyRaw = pickLoose(r, ["조회키", "INV_KEY", "KEY", "검색키"]);
      const sapInvRaw = pickLoose(r, ["인보이스", "INV", "INVOICE", "INVNO", "INV NO"]) || r["인보이스"];
      const sapDocRaw =
        pickLoose(r, ["문서번호", "문서 번호", "출고문서", "납품문서", "DELIVERY", "Delivery"]) || r["문서번호"];

      const keyNorm = normalizeId(sapKeyRaw);
      const invNorm = normalizeId(sapInvRaw);
      const docNorm = normalizeId(sapDocRaw);

      const matched = keyNorm ? keyNorm === queryKey : invNorm === queryKey || docNorm === queryKey;
      if (!matched) continue;

      const dateStr = pickLoose(r, ["출고일"]) || r["출고일"];
      const ymd = convertToYMD(dateStr);

      // 오늘 이전 제외 (연도 없는 값은 ymd=0 → 제외 안 함 / 기존 로직 유지)
      if (ymd && ymd < today) continue;

      const country = pickLoose(r, ["국가"]) || r["국가"];
      const material = pickLoose(r, ["자재코드", "자재번호", "상품코드"]) || r["자재코드"];
      const desc = pickLoose(r, ["자재내역", "품명", "상품명"]) || r["자재내역"];
      const outQty = asNum(pickLoose(r, ["출고"]) || r["출고"], 0);
      const box = pickLoose(r, ["박스번호", "박스 번호"]) || r["박스번호"];
      const cntr = pickLoose(r, ["컨테이너"]) || r["컨테이너"];
      const cbm = asNum(pickLoose(r, ["CBM"]) || r["CBM"], 0);
      const loc = pickLoose(r, ["상차위치", "로케이션", "LOC"]) || r["상차위치"] || "";
      const note = pickLoose(r, ["비고", "NOTE"]) || r["비고"] || "";
      const work = pickLoose(r, ["작업여부", "작업 여부", "작업", "WORK"]) || "";

      // ✅ WMS 입고수량
      let inQty = 0;
      if (keyFull && wmsMap.has(keyFull)) {
        inQty = asNum(wmsMap.get(keyFull), 0);
      } else {
        const cands = makeKeyCandidates(queryKey, material);
        for (const k of cands) {
          if (wmsMap.has(k)) {
            inQty = asNum(wmsMap.get(k), 0);
            break;
          }
        }
      }

      result.push({
        keyFull: keyFull || "",
        invoice: queryRaw, // 화면 표시용(입력 그대로)
        date: dateStr || "",
        country: country || "",
        material: material || "",
        desc: desc || "",
        box: box || "",
        outQty,
        inQty,
        diff: inQty - outQty,
        cntr: cntr || "",
        cbm,
        loc,
        note,
        work,
      });
    }

    const payload = {
      ok: true,
      invoice: queryRaw,
      rows: result.length,
      data: result,
    };

    if (dbg) {
      payload.meta = meta;
      payload.meta.wmsMapSize = wmsMap.size;
      payload.meta.sampleWmsMapKeys = Array.from(wmsMap.keys()).slice(0, 20);
    }

    return res.status(200).json(payload);
  } catch (err) {
    console.error("DEFECT API ERROR:", err);
    return res.status(500).json({ ok: false, error: err.message });
  }
}
