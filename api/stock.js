import { parseCSV } from "../utils/csv_parser.js";

export default async function handler(req, res) {
  try {
    const { key } = req.query;

    if (!key) {
      return res.status(400).json({ ok: false, msg: "검색 키가 없습니다" });
    }

    const SHEET_URL =
      "https://docs.google.com/spreadsheets/d/e/2PACX-1vRAWmUNAeyndXfdxHjR-1CakW_Tm3OzmMTng5RkB53umXwucqpxABqMMcB0y8H5cHNg7aoHYqFztz0F/pub?gid=221455512&single=true&output=csv";

    const response = await fetch(SHEET_URL);
    const csvText = await response.text();

    const { header, rows } = parseCSV(csvText);

    // 헤더 → 인덱스 맵 생성
    const indexMap = {};
    header.forEach((h, i) => (indexMap[h] = i));

    // 검색 필터
    const filtered = rows.filter(r =>
      r.some(col => String(col).toLowerCase().includes(key.toLowerCase()))
    );

    return res.status(200).json({
      ok: true,
      rows: filtered.map(r => ({
        keyFull: r[indexMap["키"]] || "",
        invoice: r[indexMap["인보이스"]] || "",
        country: r[indexMap["국가"]] || "",
        date: r[indexMap["출고일"]] || "",
        material: r[indexMap["자재코드"]] || "",
        box: r[indexMap["박스번호"]] || "",
        desc: r[indexMap["자재내역"]] || "",
        outQty: Number(r[indexMap["출고"]] || 0),
        inQty: Number(r[indexMap["입고"]] || 0),
        diff: Number(r[indexMap["출고"]] || 0) - Number(r[indexMap["입고"]] || 0),
      })),
    });
  } catch (err) {
    return res.status(500).json({ ok: false, msg: err.toString() });
  }
}
