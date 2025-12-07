export default function handler(req, res) {
  let { inv } = req.query;
  
  if (!inv) {
    return res.status(200).json({
      ok: false,
      message: "인보이스 번호가 전달되지 않았습니다."
    });
  }

  inv = inv.trim();  // ★ 공백 제거 필수

  // 테스트용 인보이스 데이터 목록
  const DB = {
    "775803": {
      inv: "775803",
      country: "캐나다",
      container: "40FT",
      cbm: 28.5,
      qty: 1450,
      load_time: "14:00",
      load_loc: "A02",
      items: [
        {
          mat: "2141971",
          box: "001",
          name: "올인원 KBBQ 간장",
          sap: 100,
          wms: 100,
          unit: "BOX",
          barcode: "2141971001"
        },
        {
          mat: "2141972",
          box: "002",
          name: "올인원 KBBQ 고추장",
          sap: 100,
          wms: 100,
          unit: "BOX",
          barcode: "2141972002"
        }
      ]
    }
  };

  // 데이터 찾기
  const data = DB[inv];

  if (!data) {
    return res.status(200).json({
      ok: false,
      message: "해당 인보이스를 찾을 수 없습니다."
    });
  }

  return res.status(200).json({
    ok: true,
    data
  });
}
