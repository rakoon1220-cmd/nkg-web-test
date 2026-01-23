// api/_csv.js
// Vercel / Node18+ fetch 내장

export async function loadCsv(url) {
  try {
    const res = await fetch(url, {
      // 구글 pub 캐시/프록시 캐시 영향 줄이기
      cache: "no-store",
      headers: { "Cache-Control": "no-cache" },
    });

    if (!res.ok) {
      throw new Error("CSV 로딩 실패: HTTP " + res.status);
    }

    const text = await res.text();

    // ✅ CSV 대신 HTML(구글 오류/차단/로그인 페이지) 들어오는 경우 방지
    const head = text.slice(0, 200).toLowerCase();
    if (head.includes("<!doctype") || head.includes("<html") || head.includes("google")) {
      // 그래도 CSV일 수 있어 과한 차단은 안 하고, 너무 확실한 html만 체크
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

/**
 * ✅ 따옴표 안 콤마/줄바꿈 처리 + ✅ 헤더/값 정규화
 */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (ch === '"') {
      // "" -> " 처리
      if (inQuotes && text[i + 1] === '"') {
        field += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    // 구분자 처리
    if (!inQuotes && (ch === "," || ch === "\n" || ch === "\r")) {
      // \r\n 처리
      if (ch === "\r" && text[i + 1] === "\n") i++;

      row.push(field);
      field = "";

      if (ch === "\n" || ch === "\r") {
        // 빈 줄 방지(전부 빈값이면 스킵)
        if (row.some(v => String(v ?? "").trim() !== "")) rows.push(row);
        row = [];
      }
      continue;
    }

    field += ch;
  }

  // 마지막 필드/행 처리
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    if (row.some(v => String(v ?? "").trim() !== "")) rows.push(row);
  }

  if (!rows.length) return [];

  // ✅ 헤더 정규화 (BOM/제로폭/nbsp/공백 제거 + trim)
  const cleanKey = (s) =>
    String(s ?? "")
      .replace(/[\uFEFF\u200B\u00A0]/g, "") // BOM + 제로폭 + nbsp
      .replace(/\s+/g, " ")                // 연속 공백 정리(가독성)
      .trim();

  const cleanVal = (s) =>
    String(s ?? "")
      .replace(/[\uFEFF\u200B\u00A0]/g, "")
      .trim();

  const headersRaw = rows[0].map(h => cleanKey(h));

  // ✅ 데이터 -> 객체로 변환
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
