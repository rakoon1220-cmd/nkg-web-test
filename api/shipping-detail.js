// api/shipping-detail.js — 출고 상세내역 최종 안정판 (WMS 0 FIX + MAT NORMALIZE FIX)
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
  const s = asText(v);
  if (!s) return def;
  const n = Number(s.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : def;
}

// ✅ invoice 정규화(숫자만)
function normalizeInv(v) {
  if (!v) return "";
  return String(v).replace(/[^0-9]/g, "").replace(/^0+/, "");
}

// ✅ 자재코드 정규화(숫자만)  ← ★ 이번 이슈 핵심
function normalizeMat(v) {
  if (!v) return "";
  return String(v)
    .replace(/[^0-9]/g, "")   // 콤마, .0, 공백, 문자 제거
    .replace(/^0+/, "");
}

// ✅ keyFull 정규화(공백/BOM/제로폭 제거)
function normalizeKeyFull(v) {
  if (!v) return "";
  return String(v)
    .replace(/[\s\uFEFF\u200B\u00A0]/g, "") // 스페이스/개행/nbsp/제로폭 제거
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

// ✅ key 후보 생성: inv는 숫자정규화, mat도 숫자정규화
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
       - keyFull 컬럼이 있으면 우선
       - 없으면 inv+mat로 key 후보 만들어 저장
       - ★ keyFull / mat 전부 정규화해서 저장
    ---------------------------------------------------- */
    const wmsMap = new Map();

    for (const r of wmsRows || []) {
      const invRaw = pickLoose(r, ["인보이스", "INV", "INVNO", "INV NO"]);
      const matRaw = pickLoose(r, ["상품코드", "자재코드", "품목코드", "상품 코드", "자재 코드"]);

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

      // keyFullDirect는 정규화해서 Map 키로 저장
      const keyFullDirect = normalizeKeyFull(keyFullDirectRaw);
      if (keyFullDirect) keys.push(keyFullDirect);

      // inv+mat 후보도 inv/mat 정규화 반영
      keys.push(...makeKeyCandidates(invRaw, matRaw));

      for (const k of keys) {
        if (!k) continue;
        wmsMap.set(k, (wmsMap.get(k) || 0) + qty);
      }
    }

    /* ----------------------------------------------------
       4) SAP → invoice 필터 + 상세내역 구성
       - ★ SAP keyFull / code도 정규화해서 매칭
    ---------------------------------------------------- */
    const result = [];

    for (const r of sapRows || []) {
      const inv = normalizeInv(pickLoose(r, ["인보이스"]) || r["인보이스"]);
      if (inv !== invoice) continue;

      const keyFullRaw =
        pickLoose(r, ["인보이스+자재코드", "인보이스+자재", "KEYFULL"]) ||
        asText(r["인보이스+자재코드"]);

      const keyFull = normalizeKeyFull(keyFullRaw);

      const date = pickLoose(r, ["출고일"]) || asText(r["출고일"]);
      const country = pickLoose(r, ["국가"]) || asText(r["국가"]);

      const codeRaw =
        pickLoose(r, ["자재코드", "자재번호", "상품코드"]) || asText(r["자재코드"]);
      const code = normalizeMat(codeRaw); // ★ 숫자정규화

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
        const cands = makeKeyCandidates(invoice, code);
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
        code: codeRaw, // 화면 표시는 원본 코드 유지(원하면 code(정규화)로 바꿔도 됨)
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
        },
      });
    }

    return res.status(200).json({ ok: true, data: result });
  } catch (err) {
    console.error("SHIPPING-DETAIL API ERROR:", err);
    return res.status(500).json({ ok: false, error: err.message });
  }
}
