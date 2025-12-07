// Vercel의 Serverless 환경 기반 - fetch 내장됨
// CSV 안전 파서 (콤마 포함 문자열까지 지원)

export async function loadCsv(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error("CSV 로딩 실패: " + res.status);

    const text = await res.text();
    const lines = text.trim().split(/\r?\n/);

    const header = safeSplit(lines.shift()); // 첫 줄 = 헤더
    const rows = [];

    for (const line of lines) {
      const cols = safeSplit(line);
      const obj = {};

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

// 콤마와 큰따옴표 처리
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
