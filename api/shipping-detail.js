// api/shipping-detail.js — 출고 상세내역 최종본 (조회키 우선 + 6/9자리 + 지수표기 + WMS 0 FIX)
import { loadCsv } from "./_csv.js";

const SAP_CSV_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vRAWmUNAeyndXfdxHjR-1CakW_Tm3OzmMTng5RkB53umXwucqpxABqMMcB0y8H5cHNg7aoHYqFztz0F/pub?gid=221455512&single=true&output=csv";

const WMS_CSV_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vRAWmUNAeyndXfdxHjR-1CakW_Tm3OzmMTng5RkB53umXwucqpxABqMMcB0y8H5cHNg7aoHYqFztz0F/pub?gid=1850233363&single=true&output=csv";

// ✅ cache bust (브라우저/서버 캐시 무력화)
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
 * ✅ 숫자 ID 정규화(인보이스/문서번호 공용)
 * - "123456" -> "123456"
 * - "123456789" -> "123456789"
 * - "268377822.0" -> "268377822"
 * - "2.68377822E+08" -> "268377822"
 * - 콤마/공백/문자 섞임 제거
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

/**
 * ✅ keyFull 정규화 (공백/BOM/제로폭 제거)
 */
function normalizeKeyFull(v) {
  if (!v) return "";
  return String(v).replace(/[\s\uFEFF\u200B\u00A0]/g, "").trim();
}

/**
 * ✅ 헤더명 후보 중 값 뽑기 (공백/BOM/제로폭까지 무시)
 */
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

/**
 * ✅ inv+mat 키 후보 생성 (WMS keyFull 없을 때 대비)
 */
function makeKeyCandidates(inv, mat) {
  const i = normalizeId(inv);
  const m = normalizeId(mat);
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
       1) 조회키(인보이스/문서번호) 정규화
    ---------------------------------------------------- */
    const invoiceRaw = String(req.query.invoice || "").trim();
    const queryKey = normalizeId(invoiceRaw);

    if (!queryKey) {
      return res.status(400).json({ ok: false, msg: "invoice 값이 없습니다." });
    }

    const dbg = String(req.query.debug || "") === "1";

    /* ----------------------------------------------------
       2) CSV 로드
    ---------------------------------------------------- */
    const [sapRows, wmsRows] = await Promise.all([
      loadCsv(bust(SAP_CSV_URL)),
      loadCsv(bust(WMS_CSV_URL)),
    ]);

    /* ----------------------------------------------------
       3) WMS → Map(keyFull → 입고수량 합계)
       - keyFull 우선
       - 없으면 inv+mat 후보 키 생성
    ---------------------------------------------------- */
    const wmsMap = new Map();

    for (const r of wmsRows || []) {
      const invRaw = pickLoose(r, ["인보이스", "INV", "INVNO", "INV NO", "INVOICE"]);
      const matRaw = pickLoose(r, [
        "상품코드",
        "자재코드",
        "자재번호",
        "품목코드",
        "상품 코드",
        "자재 코드",
        "MATERIAL",
        "MAT",
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
       4) SAP → "조회키" 우선 필터링
       - 조회키(B열) = C(인보이스) 있으면 C, 없으면 D(문서번호)
       - 헤더 중복 이슈 제거(조회키로 고정)
    ---------------------------------------------------- */
    const result = [];

    for (const r of sapRows || []) {
      // ✅ 최우선: B열 '조회키' (너가 만든 합쳐진 키)
      //    없으면 fallback으로 인보이스/문서번호 각각 비교
      const sapKeyRaw =
        pickLoose(r, ["조회키", "INV_KEY", "KEY", "검색키"]) ||
        ""; // 없으면 아래 fallback

      const sapInvRaw =
        pickLoose(r, ["인보이스", "INV", "INVOICE", "INVNO", "INV NO"]) || r["인보이스"];
      const sapDocRaw =
        pickLoose(r, [
          "문서번호",
          "문서 번호",
          "출고문서",
          "출고 문서",
          "납품문서",
          "납품 문서",
          "Delivery",
          "DELIVERY",
          "DELIVERYNO",
          "DELIVERY NO",
        ]) || r["문서번호"];

      const keyNorm = normalizeId(sapKeyRaw);
      const invNorm = normalizeId(sapInvRaw);
      const docNorm = normalizeId(sapDocRaw);

      // ✅ 매칭 조건:
      // - 조회키가 있으면 조회키로
      // - 없으면 인보이스/문서번호 둘 중 하나라도
      const matched = keyNorm
        ? keyNorm === queryKey
        : invNorm === queryKey || docNorm === queryKey;

      if (!matched) continue;

      // -------- 상세 필드 --------
      const keyFullRaw =
        pickLoose(r, ["인보이스+자재코드", "인보이스+자재", "KEYFULL"]) ||
        asText(r["인보이스+자재코드"]);
      const keyFull = normalizeKeyFull(keyFullRaw);

      const date = pickLoose(r, ["출고일", "출고 일", "DATE"]) || asText(r["출고일"]);
      const country = pickLoose(r, ["국가", "COUNTRY"]) || asText(r["국가"]);

      const codeRaw =
        pickLoose(r, ["자재코드", "자재번호", "상품코드", "MATERIAL", "MAT"]) ||
        asText(r["자재코드"]);
      const codeNorm = normalizeId(codeRaw);

      const name =
        pickLoose(r, ["자재내역", "품명", "상품명", "NAME"]) || asText(r["자재내역"]);

      const outQty = asNum(
        pickLoose(r, ["출고", "출고수량", "OUT", "OUTQTY"]) || r["출고"],
        0
      );

      const box =
        pickLoose(r, ["박스번호", "박스 번호", "BOX"]) || asText(r["박스번호"]);

      const work = pickLoose(r, ["작업여부", "작업 여부", "작업", "WORK"]) || "";
      const container =
        pickLoose(r, ["컨테이너", "CONTAINER"]) || asText(r["컨테이너"]);
      const cbm = asText(pickLoose(r, ["CBM", "cbm"]) || r["CBM"]);
      const note =
        pickLoose(r, ["비고", "특이사항", "NOTE"]) || asText(r["비고"]);

      // ✅ WMS 입고수량 매칭: keyFull 우선, 없으면 inv+mat 후보
      let inQty = 0;

      if (keyFull && wmsMap.has(keyFull)) {
        inQty = asNum(wmsMap.get(keyFull), 0);
      } else {
        // key 후보는 "조회키(=queryKey)" + 자재코드 기준으로 생성
        for (const k of makeKeyCandidates(queryKey, codeNorm)) {
          if (wmsMap.has(k)) {
            inQty = asNum(wmsMap.get(k), 0);
            break;
          }
        }
      }

      result.push({
        invoice: invoiceRaw, // 화면에는 사용자가 누른 값 그대로
        date,
        country,
        code: codeRaw,
        name,
        box,
        outQty,
        inQty,
        diff: inQty - outQty,
        container,
        cbm,
        work,
        note,
      });
    }

    /* ----------------------------------------------------
       5) debug=1 진단 출력
    ---------------------------------------------------- */
    if (dbg) {
      return res.status(200).json({
        ok: true,
        data: result,
        meta: {
          queryRaw: invoiceRaw,
          queryNorm: queryKey,
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
