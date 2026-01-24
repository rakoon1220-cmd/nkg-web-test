// api/shipping-detail.js — 출고 상세내역 최종 안정판 (9자리 인보이스/지수표기 FIX + WMS 0 FIX)
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

  // 콤마/공백 제거 후 숫자만
  const s = s0.replace(/,/g, "");
  const n = Number(s.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : def;
}

/**
 * ✅ 인보이스 정규화
 * - "123456" / "123456789" 정상
 * - "268377822.0" => "268377822"
 * - "2.68377822E+08" => "268377822"  (지수표기 복원)
 * - 콤마/공백/문자 섞임 제거
 */
function normalizeInv(v) {
  if (v === null || v === undefined) return "";
  let s = String(v).trim();
  if (!s) return "";

  // 이미 숫자만이면 OK
  if (/^\d+$/.test(s)) return s.replace(/^0+/, "");

  // 콤마 제거
  s = s.replace(/,/g, "");

  // 268377822.0 같은 형태 처리
  if (/^\d+\.0+$/.test(s)) s = s.replace(/\.0+$/, "");

  // 지수표기 처리 (예: 2.68377822E+08)
  if (/[eE]/.test(s)) {
    const n = Number(s);
    if (Number.isFinite(n)) return String(Math.round(n)).replace(/^0+/, "");
  }

  // 마지막 fallback: 숫자만 추출
  const digits = s.replace(/[^0-9]/g, "");
  return digits.replace(/^0+/, "");
}

/**
 * ✅ 자재코드 정규화 (숫자만)
 * - "268377822" / "268377822.0" / "268,377,822" 모두 동일 처리
 */
function normalizeMat(v) {
  if (v === null || v === undefined) return "";
  let s = String(v).trim();
  if (!s) return "";

  s = s.replace(/,/g, "");
  if (/^\d+\.0+$/.test(s)) s = s.replace(/\.0+$/, "");

  // 지수표기까지 들어오는 경우도 혹시 대비
  if (/[eE]/.test(s)) {
    const n = Number(s);
    if (Number.isFinite(n)) return String(Math.round(n)).replace(/^0+/, "");
  }

  const digits = s.replace(/[^0-9]/g, "");
  return digits.replace(/^0+/, "");
}

// ✅ keyFull 정규화(공백/BOM/제로폭 제거)
function normalizeKeyFull(v) {
  if (!v) return "";
  return String(v)
    .replace(/[\s\uFEFF\u200B\u00A0]/g, "")
    .trim();
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

// ✅ key 후보 생성: inv/mat 모두 정규화
function makeKeyCandidates(inv, mat) {
  const i = normalizeInv(inv);
  const m = normalizeMat(mat);
  if (!i || !m) return [];
  return [`${i}__${m}`, `${i}${m}`];
}

export default async function handler(req, res) {
  try {
    // ✅ 캐시 금지
    res.setHeader("Cache-Control", "no-store, max-age=0");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");

    /* ----------------------------------------------------
       1) invoice 정규화
    ---------------------------------------------------- */
    const invoiceRaw = String(req.query.invoice || "").trim();
    const invoice = normalizeInv(invoiceRaw);

    if (!invoice) {
      return res.status(400).json({ ok: false, msg: "invoice 값이 없습니다." });
    }

    const dbg = String(req.query.debug || "") === "1";

    /* ----------------------------------------------------
       2) CSV 로드 (헤더 기반)
    ---------------------------------------------------- */
    const [sapRows, wmsRows] = await Promise.all([
      loadCsv(bust(SAP_CSV_URL)),
      loadCsv(bust(WMS_CSV_URL)),
    ]);

    /* ----------------------------------------------------
       3) WMS → Map(keyFull → 입고수량 합계)
       - keyFull 우선
       - 없으면 inv+mat 후보로 키 생성
       - keyFull / inv / mat 모두 정규화 저장
    ---------------------------------------------------- */
    const wmsMap = new Map();

    for (const r of wmsRows || []) {
      const invRaw = pickLoose(r, ["인보이스", "INV", "INVNO", "INV NO"]);
      const matRaw = pickLoose(r, [
        "상품코드",
        "자재코드",
        "자재번호",
        "품목코드",
        "상품 코드",
        "자재 코드",
      ]);

      const qty = asNum(
        pickLoose(r, ["수량", "QTY", "qty", "입고", "입고수량", "입고 수량"]),
        0
      );

      const keyFullDirectRaw = pickLoose(r, [
        "인보이스+자재코드",
        "인보이스+자재",
        "KEYFULL",
        "INV+MAT",
      ]);

      const keys = [];

      const keyFullDirect = normalizeKeyFull(keyFullDirectRaw);
      if (keyFullDirect) keys.push(keyFullDirect);

      keys.push(...makeKeyCandidates(invRaw, matRaw));

      for (const k of keys) {
        if (!k) continue;
        wmsMap.set(k, (wmsMap.get(k) || 0) + qty);
      }
    }

    /* ----------------------------------------------------
       4) SAP → invoice 필터 + 상세내역 구성
       - invoice 매칭이 핵심 (6자리/9자리 모두)
    ---------------------------------------------------- */
    const result = [];

    for (const r of sapRows || []) {
      const sapInvRaw = pickLoose(r, ["인보이스"]) || r["인보이스"];
      const inv = normalizeInv(sapInvRaw);
      if (inv !== invoice) continue;

      const keyFullRaw =
        pickLoose(r, ["인보이스+자재코드", "인보이스+자재", "KEYFULL"]) ||
        asText(r["인보이스+자재코드"]);
      const keyFull = normalizeKeyFull(keyFullRaw);

      const date = pickLoose(r, ["출고일"]) || asText(r["출고일"]);
      const country = pickLoose(r, ["국가"]) || asText(r["국가"]);

      const codeRaw =
        pickLoose(r, ["자재코드", "자재번호", "상품코드"]) || asText(r["자재코드"]);
      const codeNorm = normalizeMat(codeRaw);

      const name =
        pickLoose(r, ["자재내역", "품명", "상품명"]) || asText(r["자재내역"]);

      const outQty = asNum(pickLoose(r, ["출고"]) || r["출고"], 0);
      const box = pickLoose(r, ["박스번호", "박스 번호"]) || asText(r["박스번호"]);
      const work = pickLoose(r, ["작업여부", "작업 여부", "작업", "WORK"]) || "";
      const container = pickLoose(r, ["컨테이너", "CONTAINER"]) || asText(r["컨테이너"]);
      const cbm = asText(pickLoose(r, ["CBM", "cbm"]) || r["CBM"]);
      const note = pickLoose(r, ["비고", "특이사항", "NOTE"]) || asText(r["비고"]);

      // ✅ WMS 입고수량 매칭: keyFull 우선, 없으면 inv+mat 후보로 재시도
      let inQty = 0;

      if (keyFull && wmsMap.has(keyFull)) {
        inQty = asNum(wmsMap.get(keyFull), 0);
      } else {
        const cands = makeKeyCandidates(invoice, codeNorm);
        for (const k of cands) {
          if (wmsMap.has(k)) {
            inQty = asNum(wmsMap.get(k), 0);
            break;
          }
        }
      }

      const diff = inQty - outQty;

      result.push({
        invoice: invoiceRaw, // 화면에는 원본 유지
        date,
        country,
        code: codeRaw, // 원본 표시
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

    if (dbg) {
      // invoice가 안 잡힐 때 원인 확인용 샘플
      const sapInvSamples = [];
      for (let i = 0; i < Math.min(30, (sapRows || []).length); i++) {
        const r = sapRows[i];
        const raw = pickLoose(r, ["인보이스"]) || r["인보이스"];
        sapInvSamples.push({
          raw: asText(raw),
          norm: normalizeInv(raw),
        });
      }

      return res.status(200).json({
        ok: true,
        data: result,
        meta: {
          invoiceRaw,
          invoiceNorm: invoice,
          sapCount: sapRows?.length || 0,
          wmsCount: wmsRows?.length || 0,
          sapKeys0: sapRows?.[0] ? Object.keys(sapRows[0]) : [],
          wmsKeys0: wmsRows?.[0] ? Object.keys(wmsRows[0]) : [],
          wmsMapSize: wmsMap.size,
          sampleWmsMapKeys: Array.from(wmsMap.keys()).slice(0, 30),
          sapInvSamples, // ✅ SAP 인보이스 raw/norm 샘플 30개
        },
      });
    }

    return res.status(200).json({ ok: true, data: result });
  } catch (err) {
    console.error("SHIPPING-DETAIL API ERROR:", err);
    return res.status(500).json({ ok: false, error: err.message });
  }
}
