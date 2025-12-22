/* -----------------------------------------
   결품조회 (클라이언트) → Vercel Functions API
------------------------------------------ */

const API_BASE = window.location.origin;
const API_URL_DEFECT = `${API_BASE}/api/defect`;


/* 로딩 표시 */
function showLoading(msg = "조회중...") {
    document.getElementById("statusText").textContent = msg;
}

/* 조회 실행 */
async function searchDefect() {
    const key = document.getElementById("keyInput").value.trim();
    const status = document.getElementById("statusText");
    const tbody = document.getElementById("defectTable");

    if (!key) {
        status.textContent = "값을 입력하세요.";
        tbody.innerHTML = "";
        return;
    }

    showLoading("서버에서 불러오는 중...");
    tbody.innerHTML = "";

    try {
        const url = `${API_URL_DEFECT}?key=${encodeURIComponent(key)}`;
        const res = await fetch(url);
        const json = await res.json();

        if (!json.ok) {
            status.textContent = "조회 오류: " + (json.msg || json.error);
            return;
        }

        const rows = json.data;


        if (!rows || rows.length === 0) {
            status.textContent = "오늘 이후 출고 데이터 없음";
            return;
        }

        /* 출고요약정보 (첫행) */
        const first = rows[0];

        document.getElementById("sum_country").textContent = first.country || "-";
        document.getElementById("sum_date").textContent = first.date || "-";
        document.getElementById("sum_cntr").textContent = first.cntr || "-";
        document.getElementById("sum_cbm").textContent = rows.reduce((s, r) => s + (parseFloat(r.cbm) || 0), 0).toFixed(2);
        document.getElementById("sum_items").textContent = rows.length;
        document.getElementById("sum_loc").textContent = first.loc || "-";
        document.getElementById("sum_note").textContent = first.note || "-";

       /* 상세내역 테이블 */
rows.forEach((r, idx) => {
  const tr = document.createElement("tr");
  tr.className = "border-b border-slate-200 hover:bg-slate-50";

  let bg = "";
  if (r.outQty === 0) bg = "bg-red-600 text-white";
  else if (r.inQty > r.outQty) bg = "bg-green-100";

  let compareText = r.diff;
  if (r.diff === 0 && r.outQty !== 0) compareText = "입고완료";
  if (r.inQty < r.outQty) compareText = "-";

  tr.innerHTML = `
    <td class="hidden-col">${r.keyFull}</td>
    <td class="px-3 py-2 nowrap">${idx + 1}</td>
    <td class="px-3 py-2 nowrap">${r.material}</td>
    <td class="px-3 py-2 nowrap">${r.box}</td>
    <td class="px-3 py-2 nowrap max-w-[200px] overflow-hidden text-ellipsis">${r.desc}</td>
    <td class="px-3 py-2 text-right nowrap ${bg}">${r.outQty}</td>
    <td class="px-3 py-2 text-right nowrap">${r.inQty}</td>
    <td class="px-3 py-2 text-right nowrap">${compareText}</td>
    <td class="px-3 py-2 nowrap">${r.work}</td>
  `;

  tbody.appendChild(tr);
});


        status.textContent = `${rows.length}건 조회됨`;

    } catch (err) {
        console.error(err);
        status.textContent = "오류: " + err.message;
    }
}

/* 이벤트 연결 */
document.getElementById("searchBtn").onclick = searchDefect;
document.getElementById("keyInput").addEventListener("keydown", (e) => {
    if (e.key === "Enter") searchDefect();
});
