// /api/defect.js — Stable Serverless Version (HEADER SAFE + WMS 0 FIX)
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

// ✅ 인보이스 정규화 (숫자만)
function normalizeInv(v) {
  if (!v) return "";
  return String(v).replace(/[^0-9]/g, "").replace(/^0+/, "");
}

function asText(v) {
  if (v === null || v === undefined) return "";
  return String(v).trim();
}

function asNum(v, def = 0) {
  const s = asText(v);
  if (!s) return def;
  const n = Number(s.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : def;
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

// ✅ SAP의 "인보이스+자재코드" 형태가 환경마다 다를 수 있어 키 후보 2개 생성
//  - "777611__1105657" 형태
//  - "7776111105657" 형태
function makeKeyCandidates(inv, mat) {
  const i = normalizeInv(inv);
  const m = asText(mat);
  if (!i || !m) return [];
  return [`${i}__${m}`, `${i}${m}`];
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

    const { key, debug } = req.query;

    if (!key) {
      return res.status(400).json({
        ok: false,
        msg: "검색 키(key)가 없습니다. 예: /api/defect?key=775803",
      });
    }

    const invoiceKeyRaw = String(key).trim();
    const invoiceKey = normalizeInv(invoiceKeyRaw);
    const today = getTodayYMD();

    // 1) SAP / WMS CSV (헤더 기반)
    const [sapRows, wmsRows] = await Promise.all([
      loadCsv(bust(SAP_URL)),
      loadCsv(bust(WMS_URL)),
    ]);

    // ✅ 디버그 모드
    const dbg = String(debug || "") === "1";
    const meta = dbg
      ? {
          sapCount: sapRows?.length || 0,
          wmsCount: wmsRows?.length || 0,
          sapKeys0: sapRows?.[0] ? Object.keys(sapRows[0]) : [],
          wmsKeys0: wmsRows?.[0] ? Object.keys(wmsRows[0]) : [],
          sapRow0: sapRows?.[0] || null,
          wmsRow0: wmsRows?.[0] || null,
        }
      : null;

    // 2) WMS map 생성 (keyFull 후보 → 합계수량)
    //    - WMS에 "인보이스+자재코드" 컬럼이 있으면 그걸 우선 사용
    //    - 없으면 inv+mat로 키를 만들어서 SAP keyFull과 매칭
    const wmsMap = new Map();

    for (const r of wmsRows || []) {
      const inv = pickLoose(r, ["인보이스", "INV", "INVNO", "INV NO"]);
      const mat = pickLoose(r, ["상품코드", "자재코드", "품목코드", "상품 코드", "자재 코드"]);
      const qty = asNum(pickLoose(r, ["수량", "QTY", "qty", "입고", "입고수량", "입고 수량"]), 0);

      // WMS에 "인보이스+자재코드"가 있는 경우 우선
      const keyFullDirect = pickLoose(r, ["인보이스+자재코드", "인보이스+자재", "INV+MAT", "KEYFULL"]);

      const keys = [];
      if (keyFullDirect) keys.push(asText(keyFullDirect));
      keys.push(...makeKeyCandidates(inv, mat));

      for (const k of keys) {
        if (!k) continue;
        wmsMap.set(k, (wmsMap.get(k) || 0) + qty);
      }
    }

    // 3) SAP + WMS 매칭
    const result = [];

    for (const r of sapRows || []) {
      // SAP 필드(헤더 기반)
      const keyFull = pickLoose(r, ["인보이스+자재코드", "인보이스+자재", "KEYFULL"]) || asText(r["인보이스+자재코드"]);
      const invoice = normalizeInv(pickLoose(r, ["인보이스"]) || r["인보이스"]);
      const dateStr = pickLoose(r, ["출고일"]) || r["출고일"];
      const ymd = convertToYMD(dateStr);

      // 인보이스 불일치 skip
      if (invoice !== invoiceKey) continue;

      // 오늘 이전 출고 제외
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

      // WMS 입고수량: keyFull 우선 / 없으면 inv+mat 후보로 재시도
      let inQty = 0;

      if (keyFull && wmsMap.has(keyFull)) {
        inQty = asNum(wmsMap.get(keyFull), 0);
      } else {
        // keyFull이 SAP에서 다른 형태일 수 있으니 inv+mat로도 찾아봄
        const cands = makeKeyCandidates(invoiceKey, material);
        for (const k of cands) {
          if (wmsMap.has(k)) {
            inQty = asNum(wmsMap.get(k), 0);
            break;
          }
        }
      }

      const diff = inQty - outQty;

      result.push({
        keyFull: keyFull || "",
        invoice: invoiceKeyRaw,
        date: dateStr || "",
        country: country || "",
        material: material || "",
        desc: desc || "",
        box: box || "",
        outQty,
        inQty,
        diff,
        cntr: cntr || "",
        cbm,
        loc,
        note,
        work,
      });
    }

    const payload = {
      ok: true,
      invoice: invoiceKeyRaw,
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
