// Vercel 환경에서는 fetch 내장됨 → node-fetch 금지

export async function loadCsv(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error("CSV 로딩 실패: " + res.status);

    const text = await res.text();

    // 줄 단위 분리
    const lines = text.trim().split(/\r?\n/);

    // CSV 헤더 (콤마 기준)
    const header = safeSplit(lines.shift());

    let rows = [];

    for (const line of lines) {
      const cols = safeSplit(line);
      let obj = {};

      header.forEach((h, i) => {
        obj[h.trim()] = (cols[i] ?? "").trim();
      });

      rows.push(obj);
    }

    return rows;

  } catch (err) {
    console.error("CSV LOAD ERROR:", err);
    throw new Error("CSV 파싱 오류: " + err.message);
  }
}

// CSV Safe Split, 콤마 포함된 텍스트도 안전하게 처리
function safeSplit(str) {
  const result = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < str.length; i++) {
    const ch = str[i];

    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (ch === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += ch;
    }
  }

  result.push(current);
  return result;
}
