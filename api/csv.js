export default async function handler(req, res) {
  try {
    const { url } = req.query;
    if (!url) return res.status(400).send("missing url");

    const r = await fetch(url);
    if (!r.ok) return res.status(502).send("fetch failed: " + r.status);

    const text = await r.text();
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.status(200).send(text);
  } catch (e) {
    res.status(500).send("error: " + e.message);
  }
}
