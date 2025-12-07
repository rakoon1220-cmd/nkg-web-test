// ▣ 테스트용 출고정보 조회 API
export default function handler(req, res) {
  const { inv } = req.query;

  // 테스트용 인보이스
  if (inv !== "775803") {
    return res.status(200).json({
      ok: false,
      message: "해당 인보이스를 찾을 수 없습니다."
    });
  }

  // 테스트 데이터 (UI 확인용)
  return res.status(200).json({
    ok: true,
    data: {
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
  });
}
