// /api/csv.js
export default async function handler(req, res) {
  try {
    const url = req.query?.url;

    if (!url) {
      res.status(400).send("missing url");
      return;
    }

    // 구글 CSV 가져오기
    const r = await fetch(url);
    if (!r.ok) {
      res.status(502).send("upstream fetch failed: " + r.status);
      return;
    }

    const text = await r.text();

    // CSV로 그대로 전달
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.status(200).send(text);
  } catch (e) {
    res.status(500).send("error: " + e.message);
  }
}
