import fetch from "node-fetch";

// 공통 CSV 로더
export async function loadCsv(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error("CSV 로딩 실패: " + res.status);

  const text = await res.text();

  const lines = text.trim().split("\n");
  const header = lines.shift().split(",");

  return lines.map(row => {
    const cols = row.split(",");
    let obj = {};
    header.forEach((h, i) => {
      obj[h.trim()] = (cols[i] || "").trim();
    });
    return obj;
  });
}
