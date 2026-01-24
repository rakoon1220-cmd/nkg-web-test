// api/sap_doc.js — FINAL (조회키/문서번호 지원 + 지수표기/.0/콤마 SAFE + CACHE BUST)
import { loadCsv } from "./_csv.js";

const SAP_DOC_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vRAWmUNAeyndXfdxHjR-1CakW_Tm3OzmMTng5RkB53umXwucqpxABqMMcB0y8H5cHNg7aoHYqFztz0F/pub?gid=1070360000&single=true&output=csv";

// ✅ cache bust
function bust(url) {
  const t = Date.now();
  return url.includes("?") ? `${url}&t=${t}` : `${url}?t=${t}`;
}

/**
 * ✅ 숫자 ID 정규화 (인보이스/문서번호/조회키 공용)
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

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");

  const { inv, debug } = req.query;

  if (!inv) {
    return res.status(200).json({ ok: false, message: "인보이스/문서번호(조회키)가 없습니다." });
  }

  try {
    const rows = await loadCsv(bust(SAP_DOC_URL));
    const target = normalizeId(inv);

    let found = null;

    for (const r of rows || []) {
      // ✅ 조회키(B열) 있으면 최우선
      const keyRaw = pickLoose(r, ["조회키", "INV_KEY", "KEY", "검색키"]);
      const invRaw = pickLoose(r, ["인보이스", "INV", "INVOICE", "INVNO", "INV NO"]) || r["인보이스"];
      const docRaw = pickLoose(r, ["문서번호", "문서 번호", "출고문서", "납품문서", "DELIVERY", "Delivery"]) || r["문서번호"];

      const keyNorm = normalizeId(keyRaw);
      const invNorm = normalizeId(invRaw);
      const docNorm = normalizeId(docRaw);

      const matched = keyNorm ? keyNorm === target : invNorm === target || docNorm === target;
      if (matched) {
        found = r;
        break;
      }
    }

    if (!found) {
      return res.status(200).json({
        ok: false,
        message: `문서(${inv})를 찾을 수 없습니다.`,
      });
    }

    if (String(debug || "") === "1") {
      return res.status(200).json({
        ok: true,
        data: found,
        meta: {
          targetRaw: String(inv),
          targetNorm: target,
          keys0: rows?.[0] ? Object.keys(rows[0]) : [],
          count: rows?.length || 0,
        },
      });
    }

    return res.status(200).json({ ok: true, data: found });
  } catch (err) {
    console.error("SAP_DOC ERROR:", err);
    return res.status(200).json({
      ok: false,
      message: "SAP 문서 조회 오류",
      error: err.message,
    });
  }
}
