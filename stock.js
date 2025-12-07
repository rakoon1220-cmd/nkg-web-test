/* -----------------------------------------
   재고조회 클라이언트 → Vercel Functions API
------------------------------------------ */

/** 현재 도메인 기준(API_BASE = nkg-web-test.vercel.app 등) */
const API_BASE = window.location.origin;
/** 재고조회 API 엔드포인트 */
const API_URL_STOCK = `${API_BASE}/api/stock`;

/* 로딩 표시 */
function showLoading(msg = "조회중...") {
  document.getElementById("stockStatus").textContent = msg;
}

/* 조회 실행 */
async function searchStock() {
  const key = document.getElementById("stockKey").value.trim();
  const status = document.getElementById("stockStatus");
  const tbody = document.getElementById("stockTableBody");

  if (!key) {
    status.textContent = "조회값을 입력하세요.";
    tbody.innerHTML = "";
    return;
  }

  showLoading("서버에서 불러오는 중...");
  tbody.innerHTML = "";

  try {
    const url = `${API_URL_STOCK}?key=${encodeURIComponent(key)}`;
    const res = await fetch(url);
    const json = await res.json();

    if (!json.ok) {
      status.textContent = "서버 오류: " + (json.msg || json.error);
      return;
    }

    const rows = json.data;

    if (!rows || rows.length === 0) {
      status.textContent = "오늘 이후 출고 데이터 없음";
      return;
    }

    /* -----------------------------
       상세내역 테이블 행 생성
       (인보이스 sticky + 줄바뀜 없음)
    ------------------------------*/
    for (const r of rows) {
      const tr = document.createElement("tr");
      tr.className = "border-b border-slate-200 hover:bg-slate-50";

      /* 비교 컬럼 색상 처리 */
      let diffColor = "";
      let diffText = r.diff;

      if (r.diff === 0 && r.outQty !== 0) {
        diffText = "입고완료";
        diffColor = "bg-green-100 text-green-700";
      }
      if (r.diff < 0) {
        diffColor = "bg-red-100 text-red-600 font-semibold";
      }

      tr.innerHTML = `
        <!-- 인보이스: sticky left -->
        <td class="px-3 py-2 bg-white sticky left-0 z-20 whitespace-nowrap">
          ${r.invoice}
        </td>

        <td class="px-3 py-2 whitespace-nowrap">${r.country}</td>
        <td class="px-3 py-2 whitespace-nowrap">${r.date}</td>
        <td class="px-3 py-2 whitespace-nowrap">${r.material}</td>
        <td class="px-3 py-2 whitespace-nowrap">${r.box}</td>

        <!-- 자재내역: 줄바뀜 없음 + 말줄임 -->
        <td class="px-3 py-2 whitespace-nowrap max-w-[200px] overflow-hidden text-ellipsis">
          ${r.desc}
        </td>

        <td class="px-3 py-2 text-right whitespace-nowrap">
          ${r.outQty.toLocaleString()}
        </td>

        <td class="px-3 py-2 text-right whitespace-nowrap">
          ${r.inQty.toLocaleString()}
        </td>

        <td class="px-3 py-2 text-right whitespace-nowrap ${diffColor}">
          ${diffText}
        </td>

        <td class="px-3 py-2 whitespace-nowrap">${r.work}</td>
      `;

      tbody.appendChild(tr);
    }

    status.textContent = `${rows.length}건 조회됨`;
  } catch (err) {
    console.error(err);
    status.textContent = "오류: " + err.message;
  }
}

/* 이벤트 연결 */
document.getElementById("stockSearchBtn").onclick = searchStock;
document.getElementById("stockKey").addEventListener("keydown", (e) => {
  if (e.key === "Enter") searchStock();
});
