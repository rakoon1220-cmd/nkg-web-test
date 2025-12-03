// /api/daily-counter.js
import { kv } from "@vercel/kv";

export default async function handler(req, res) {

  // 현재 UTC → 한국시간(UTC+9) 변환
  const now = new Date();
  const koreaTime = new Date(now.getTime() + 9 * 60 * 60 * 1000);

  // 한국 날짜 yyyy-mm-dd
  const todayKST = koreaTime.toISOString().slice(0, 10);

  // KV 저장값 가져오기
  const storedDate = await kv.get("visit_date_kst");
  let count = await kv.get("visit_count_kst");

  if (!count) count = 0;

  // 날짜가 다르면(자정 지나면) 초기화
  if (storedDate !== todayKST) {
    count = 0;
    await kv.set("visit_count_kst", 0);
    await kv.set("visit_date_kst", todayKST);
  }

  // +1
  count++;
  await kv.set("visit_count_kst", count);

  res.status(200).json({ date: todayKST, count });
}
