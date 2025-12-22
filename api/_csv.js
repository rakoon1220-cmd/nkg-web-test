// api/_csv.js

// Vercel / Node18+ 에서는 fetch 내장
export async function loadCsv(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error("CSV 로딩 실패: HTTP " + res.status);
    }

    const text = await res.text();
    return parseCsv(text);
  } catch (err) {
    console.error("CSV LOAD ERROR:", err);
    throw new Error("CSV 파싱 오류: " + err.message);
  }
}

/**
 * 따옴표 안의 콤마/줄바꿈까지 처리하는 CSV 파서
 */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (ch === '"') {
      // "" → " 로 처리
      if (inQuotes && text[i + 1] === '"') {
        field += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "\r") {
      // 무시
      continue;
    } else if (ch === "\n") {
      if (inQuotes) {
        // 셀 내부 줄바꿈
        field += "\n";
      } else {
        // 행 끝
        row.push(field);
        rows.push(row);
        row = [];
        field = "";
      }
    } else if (ch === "," && !inQuotes) {
      // 셀 끝
      row.push(field);
      field = "";
    } else {
      field += ch;
    }
  }

  // 마지막 필드/행
  row.push(field);
  rows.push(row);

  if (rows.length === 0) return [];

  const header = rows[0].map(h => h.trim());
  const dataRows = rows.slice(1);

  const result = dataRows
    .filter(r => r.some(v => v && String(v).trim() !== ""))
    .map(cols => {
      const obj = {};
      header.forEach((h, idx) => {
        obj[h] = (cols[idx] ?? "").toString().trim();
      });
      return obj;
    });

  return result;
}
