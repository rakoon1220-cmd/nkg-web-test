import fetch from "node-fetch";

export async function loadCsv(url) {
  const res = await fetch(url);

  if (!res.ok) {
    throw new Error(`CSV 로딩 실패: ${res.status} / URL = ${url}`);
  }

  const text = await res.text();
  const lines = text.trim().split("\n");
  const header = lines.shift().split(",");

  return lines.map(row => {
    const cols = row.split(",");
    const obj = {};
    header.forEach((h, idx) => {
      obj[h.trim()] = (cols[idx] || "").trim();
    });
    return obj;
  });
}
