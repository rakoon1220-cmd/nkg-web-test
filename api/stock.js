// /api/stock.js — FINAL COMPLETE
// ✅ 인보이스 표시 빈칸 제거(조회키 우선 표시)
// ✅ 자재코드 숫자/지수표기/소수/콤마 정규화
// ✅ 출고일은 원본 그대로 표시
// ✅ 필터/정렬은 "연도 포함 날짜"만 인정
// ✅ 오늘 이전 제외 + ✅ 출고일 기준 정렬 + ✅ WMS 0 FIX

import { loadCsv } from "./_csv.js";

const SAP_CSV_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vRAWmUNAeyndXfdxHjR-1CakW_Tm3OzmMTng5RkB53umXwucqpxABqMMcB0y8H5cHNg7aoHYqFztz0F/pub?gid=221455512&single=true&output=csv";

const WMS_CSV_URL =
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
 * ✅ 숫자 ID 정규화 (조회키/인보이스/문서번호/자재코드 공용)
 * - "268377822.0" -> "268377822"
 * - "2.68377822E+08" -> "268377822"
 * - "268,377,822" -> "268377822"
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

// ✅ SAP/WMS에서 keyFull 형태가 다를 수 있어 후보 2개 생성
function makeKeyCandidates(invOrKey, mat) {
  const i = normalizeId(invOrKey);
  const m = normalizeId(mat);
  if (!i || !m) return [];
  return [`${i}__${m}`, `${i}${m}`];
}

/**
 * ✅ 연도 포함 날짜만 허용 (공백 포함 강력 지원)
 * - "2025. 12. 1" / "2025.12.01" / "2025-12-1" / "2025/12/01" 모두 OK
 * - "12/01" 같은 연도 없는 값은 0 반환 (제외)
 */
function convertToYMD(str) {
  if (!str) return 0;
  const s = String(str).trim();
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
      return res.status(400).json({ ok: false, msg: "검색 키가 없습니다." });
    }

    const rawKey = String(key).trim();
    const isNumericSearch = /^[0-9]+$/.test(rawKey); // 숫자면 자재코드, 아니면 박스

    // ✅ 숫자 검색일 때는 자재코드 정규화 비교
    const searchMatKey = isNumericSearch ? normalizeId(rawKey) : "";
    const searchBoxKey = isNumericSearch ? "" : rawKey.toUpperCase();

    const today = getTodayYMD();

    // 1) SAP & WMS 로드
    const [sapRows, wmsRows] = await Promise.all([
      loadCsv(bust(SAP_CSV_URL)),
      loadCsv(bust(WMS_CSV_URL)),
    ]);

    // 2) WMS 입고수량 맵 생성 (keyFull 후보 → 합계수량)
    const wmsMap = new Map();

    for (const r of wmsRows || []) {
      const inv = pickLoose(r, ["인보이스", "INV", "INVNO", "INV NO", "INVOICE"]);
      const mat = pickLoose(r, ["상품코드", "자재코드", "자재번호", "품목코드", "상품 코드", "자재 코드", "MATERIAL", "MAT"]);
      const qty = asNum(pickLoose(r, ["수량", "QTY", "qty", "입고", "입고수량", "입고 수량"]), 0);

      const keyFullDirect = pickLoose(r, ["인보이스+자재코드", "인보이스+자재", "KEYFULL", "INV+MAT"]);

      const keys = [];
      if (keyFullDirect) keys.push(asText(keyFullDirect));
      keys.push(...makeKeyCandidates(inv, mat));

      for (const k of keys) {
        if (!k) continue;
        wmsMap.set(k, (wmsMap.get(k) || 0) + qty);
      }
    }

    // 3) SAP + WMS 결합 & 필터링
    const matched = [];

    for (const r of sapRows || []) {
      const keyFull =
        pickLoose(r, ["인보이스+자재코드", "인보이스+자재", "KEYFULL"]) ||
        asText(r["인보이스+자재코드"]);

      // ✅ 표시용/매칭용 조회키(인보이스 있으면 인보이스, 없으면 문서번호)
      const invKeyRaw =
        pickLoose(r, ["조회키", "INV_KEY", "KEY", "검색키"]) ||
        pickLoose(r, ["인보이스", "INV", "INVOICE", "INVNO", "INV NO"]) ||
        pickLoose(r, ["문서번호", "문서 번호", "출고문서", "납품문서", "DELIVERY", "Delivery"]) ||
        asText(r["인보이스"]) ||
        asText(r["문서번호"]);

      const dateStr = pickLoose(r, ["출고일"]) || asText(r["출고일"]);
      const ymd = convertToYMD(dateStr);

      if (!ymd) continue;         // 연도 없는 날짜 제외
      if (ymd < today) continue;  // 오늘 이전 제외

      const country = pickLoose(r, ["국가"]) || asText(r["국가"]);

      const materialRaw =
        pickLoose(r, ["자재코드", "자재번호", "상품코드", "MATERIAL", "MAT"]) ||
        asText(r["자재코드"]);
      const materialNorm = normalizeId(materialRaw);

      const desc = pickLoose(r, ["자재내역", "품명", "상품명"]) || asText(r["자재내역"]);
      const outQty = asNum(pickLoose(r, ["출고"]) || r["출고"], 0);

      const box =
        pickLoose(r, ["박스번호", "박스 번호", "BOX", "BOXNO", "BOX NO"]) ||
        asText(r["박스번호"]);

      const work = pickLoose(r, ["작업여부", "작업 여부", "작업", "WORK"]) || "";

      // ✅ 검색 조건
      if (isNumericSearch) {
        if (materialNorm !== searchMatKey) continue;
      } else {
        if (box.toUpperCase() !== searchBoxKey) continue;
      }

      // ✅ WMS 매칭: keyFull 우선, 없으면 (조회키+자재코드) 후보로
      let inQty = 0;

      if (keyFull && wmsMap.has(keyFull)) {
        inQty = asNum(wmsMap.get(keyFull), 0);
      } else {
        const cands = makeKeyCandidates(invKeyRaw, materialNorm);
        for (const k of cands) {
          if (wmsMap.has(k)) {
            inQty = asNum(wmsMap.get(k), 0);
            break;
          }
        }
      }

      matched.push({
        keyFull: keyFull || "",
        invoice: invKeyRaw || "",     // ✅ 빈칸 제거 (조회키 표시)
        country: country || "",
        date: dateStr || "",          // ✅ 원본 그대로 표시
        material: materialRaw || "",
        box: box || "",
        desc: desc || "",
        outQty,
        inQty,
        diff: inQty - outQty,
        work,
        _ymd: ymd, // 정렬용
      });
    }

    matched.sort((a, b) => a._ymd - b._ymd);
    const data = matched.map(({ _ymd, ...rest }) => rest);

    if (String(debug || "") === "1") {
      return res.status(200).json({
        ok: true,
        rows: data.length,
        data,
        meta: {
          searchKeyRaw: rawKey,
          isNumericSearch,
          searchMatKey,
          searchBoxKey,
          sapCount: sapRows?.length || 0,
          wmsCount: wmsRows?.length || 0,
          sapKeys0: sapRows?.[0] ? Object.keys(sapRows[0]) : [],
          wmsKeys0: wmsRows?.[0] ? Object.keys(wmsRows[0]) : [],
          wmsMapSize: wmsMap.size,
          sampleWmsMapKeys: Array.from(wmsMap.keys()).slice(0, 20),
        },
      });
    }

    return res.status(200).json({ ok: true, rows: data.length, data });
  } catch (err) {
    console.error("STOCK API ERROR:", err);
    return res.status(500).json({ ok: false, error: err.message });
  }
}
