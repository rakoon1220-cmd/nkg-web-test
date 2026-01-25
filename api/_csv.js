// api/_csv.js
// ✅ 1) 서버리스 엔드포인트: /api/_csv?url=...
// ✅ 2) 유틸 함수: loadCsv(url)  (다른 api 파일에서 import해서 사용 가능)

export default async function handler(req, res) {
  try {
    const { url } = req.query;
    if (!url) return res.status(400).send("missing url");

    const r = await fetch(url, {
      cache: "no-store",
      headers: { "Cache-Control": "no-cache" },
    });

    if (!r.ok) {
      return res.status(502).send("fetch failed: " + r.status);
    }

    const text = await r.text();

    // ✅ HTML 응답(구글 차단/오류 페이지) 방지
    const head = text.slice(0, 200).toLowerCase();
    if (head.includes("<!doctype") || head.includes("<html")) {
      return res.status(502).send("CSV가 아닌 HTML이 응답되었습니다(구글 차단/오류 가능).");
    }

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Access-Control-Allow-Origin", "*");
    return res.status(200).send(text);
  } catch (e) {
    return res.status(500).send("error: " + e.message);
  }
}

// -----------------------
// ✅ 아래는 기존 유틸 (그대로 유지)
// -----------------------

export async function loadCsv(url) {
  try {
    const res = await fetch(url, {
      cache: "no-store",
      headers: { "Cache-Control": "no-cache" },
    });

    if (!res.ok) {
      throw new Error("CSV 로딩 실패: HTTP " + res.status);
    }

    const text = await res.text();

    const head = text.slice(0, 200).toLowerCase();
    if (head.includes("<!doctype") || head.includes("<html") || head.includes("google")) {
      if (head.includes("<html") || head.includes("<!doctype")) {
        throw new Error("CSV가 아닌 HTML이 응답되었습니다(구글 차단/오류 가능).");
      }
    }

    return parseCsv(text);
  } catch (err) {
    console.error("CSV LOAD ERROR:", err);
    throw new Error("CSV 파싱 오류: " + err.message);
  }
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (ch === '"') {
      if (inQuotes && text[i + 1] === '"') {
        field += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && (ch === "," || ch === "\n" || ch === "\r")) {
      if (ch === "\r" && text[i + 1] === "\n") i++;

      row.push(field);
      field = "";

      if (ch === "\n" || ch === "\r") {
        if (row.some(v => String(v ?? "").trim() !== "")) rows.push(row);
        row = [];
      }
      continue;
    }

    field += ch;
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    if (row.some(v => String(v ?? "").trim() !== "")) rows.push(row);
  }

  if (!rows.length) return [];

  const cleanKey = (s) =>
    String(s ?? "")
      .replace(/[\uFEFF\u200B\u00A0]/g, "")
      .replace(/\s+/g, " ")
      .trim();

  const cleanVal = (s) =>
    String(s ?? "")
      .replace(/[\uFEFF\u200B\u00A0]/g, "")
      .trim();

  const headersRaw = rows[0].map(h => cleanKey(h));

  const out = [];
  for (let r = 1; r < rows.length; r++) {
    const arr = rows[r];
    const obj = {};
    for (let c = 0; c < headersRaw.length; c++) {
      const key = headersRaw[c] || `col${c}`;
      obj[key] = cleanVal(arr[c] ?? "");
    }
    out.push(obj);
  }

  return out;
}
