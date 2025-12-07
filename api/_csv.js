// Vercel 환경: fetch 내장, node-fetch 금지

// CSV 한 줄을 안전하게 콤마 분리 (따옴표 안의 콤마는 유지)
function safeSplit(str) {
  const result = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < str.length; i++) {
    const ch = str[i];

    if (ch === '"') {
      // "" → " 로 처리
      if (inQuotes && str[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
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

// 전체 CSV 텍스트를 "줄"로 나눌 때도 따옴표 안의 줄바꿈은 유지
function splitCsvRecords(text) {
  const records = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (ch === '"') {
      // "" → " 처리
      if (inQuotes && text[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if ((ch === "\n" || ch === "\r") && !inQuotes) {
      // 개행 분리 (CRLF, LF 모두 대응)
      // \r\n 같이 붙어있으면 한번에 처리
      if (ch === "\r" && text[i + 1] === "\n") {
        i++;
      }
      records.push(current);
      current = "";
    } else {
      current += ch;
    }
  }

  if (current !== "") {
    records.push(current);
  }

  return records.filter(r => r !== "");
}

// 공통 CSV 로더
export async function loadCsv(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error("CSV 로딩 실패: " + res.status);
    }

    const text = await res.text();

    const records = splitCsvRecords(text);
    if (records.length === 0) return [];

    const header = safeSplit(records.shift());
    const rows = [];

    for (const record of records) {
      if (!record) continue;
      const cols = safeSplit(record);
      const obj = {};

      header.forEach((h, i) => {
        const key = (h || "").toString().trim();
        const val = (cols[i] ?? "").toString().trim();
        obj[key] = val;
      });

      rows.push(obj);
    }

    return rows;
  } catch (err) {
    console.error("CSV LOAD ERROR:", err);
    throw new Error("CSV 파싱 오류: " + err.message);
  }
}
