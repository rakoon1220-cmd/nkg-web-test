// api/_csv.js
// Google Sheets CSV 전용 안정형 파서 (줄바꿈/따옴표 안전 처리)

export async function loadCsv(url) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error("CSV 로딩 실패: " + res.status);
  }

  const text = await res.text();

  // ---- CSV 전체를 문자 단위로 파싱 (줄바꿈 포함 필드 지원) ----
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (ch === '"') {
      // "" → " 로 인식
      if (inQuotes && text[i + 1] === '"') {
        field += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    // 줄바꿈 처리 (CR/LF 모두)
    if ((ch === "\n" || ch === "\r") && !inQuotes) {
      // 현재 field/row 확정
      if (field.length > 0 || row.length > 0) {
        row.push(field);
        field = "";
        rows.push(row);
        row = [];
      }
      continue;
    }

    // 콤마 구분
    if (ch === "," && !inQuotes) {
      row.push(field);
      field = "";
    } else {
      field += ch;
    }
  }

  // 마지막 필드/행
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  if (rows.length === 0) return [];

  const header = rows[0].map(h => h.trim());
  const dataRows = rows.slice(1);

  const result = dataRows.map(cols => {
    const obj = {};
    header.forEach((h, idx) => {
      if (!h) return; // 빈 헤더는 무시
      obj[h] = (cols[idx] ?? "").trim();
    });
    return obj;
  });

  return result;
}
