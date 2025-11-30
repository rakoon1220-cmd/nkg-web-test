/* -----------------------------------------
   재고조회 클라이언트 → Vercel Functions API
------------------------------------------ */

const API_URL_STOCK = "https://nkg-web-ptu8.vercel.app/api/stock";

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

        const rows = json.rows;

        if (!rows || rows.length === 0) {
            status.textContent = "오늘 이후 출고 데이터 없음";
            return;
        }

        // 테이블 생성
        for (const r of rows) {
            const tr = document.createElement("tr");
            tr.className = "border-b border-slate-200 hover:bg-slate-50";

            tr.innerHTML = `
                <td class="hidden-col">${r.keyFull}</td>
                <td class="px-2 py-1">${r.invoice}</td>
                <td class="px-2 py-1">${r.country}</td>
                <td class="px-2 py-1">${r.date}</td>
                <td class="px-2 py-1">${r.material}</td>
                <td class="px-2 py-1">${r.box}</td>
                <td class="px-2 py-1 whitespace-nowrap overflow-hidden text-ellipsis max-w-[200px]">${r.desc}</td>
                <td class="px-2 py-1 text-right">${r.outQty.toLocaleString()}</td>
                <td class="px-2 py-1 text-right">${r.inQty.toLocaleString()}</td>
                <td class="px-2 py-1 text-right">${r.diff.toLocaleString()}</td>
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
