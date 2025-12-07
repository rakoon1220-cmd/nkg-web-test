// CSV 로더 - fetch는 Vercel Node API 환경에서 기본 제공됨

async function loadCsv(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error("CSV 로딩 실패: " + res.status);
    }

    const text = await res.text();

    // 줄 분리
    const lines = text.trim().split(/\r?\n/);

    // 헤더
    const header = safeSplit(lines.shift());

    let rows = [];

    for (const line of lines) {
      const cols = safeSplit(line);
      const row = {};

      header.forEach((h, idx) => {
        row[h.trim()] = (cols[idx] ?? "").trim();
      });

      rows.push(row);
    }

    return rows;
  } catch (err) {
    console.error("CSV LOAD ERROR:", err.message);
    throw new Error("CSV 파싱 오류: " + err.message);
  }
}

// 안전한 CSV split (따옴표 포함 처리)
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

module.exports = {
  loadCsv,
};
