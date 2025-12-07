/* ============================================================
    ▣ 출고검수 스캔 시스템 (인보이스 조회 + 스캔)
    - 인보이스 조회 후 상단 요약 자동 세팅
    - 스캔 목록 테이블 업데이트
============================================================ */

// ★ API URL (테스트용, 필요 시 수정)
const API_INV_URL = "https://nkg-web-ptu8.vercel.app/api/outbound";  
// 조회: GET /api/outbound?inv=775803

// DOM 요소 모음
const invInput = document.getElementById("invInput");
const btnLoadInv = document.getElementById("btnLoadInv");

const barcodeInput = document.getElementById("barcodeInput");

const inv_no = document.getElementById("inv_no");
const country = document.getElementById("country");
const container = document.getElementById("container");
const cbm = document.getElementById("cbm");
const qty = document.getElementById("qty");
const load_time = document.getElementById("load_time");
const load_loc = document.getElementById("load_loc");

const recentScanStatus = document.getElementById("recentScanStatus");
const recentScanDetail = document.getElementById("recentScanDetail");

const progress_now = document.getElementById("progress_now");
const progress_total = document.getElementById("progress_total");
const progress_bar = document.getElementById("progress_bar");

const error_count = document.getElementById("error_count");

const scanList = document.getElementById("scanList");
const scanTableBody = document.getElementById("scanTableBody");

// 데이터 저장용
let outboundData = null;
let scannedList = [];
let errorList = [];



/* ============================================================
    ▣ 인보이스 조회
============================================================ */
async function loadInvoice() {
    const inv = invInput.value.trim();

    if (!inv) {
        alert("인보이스 번호를 입력하세요.");
        return;
    }

    // 초기화
    outboundData = null;
    resetSummary();
    scanTableBody.innerHTML = "";
    scanList.innerHTML = `<div class="text-slate-400">아직 스캔된 항목 없음…</div>`;
    scannedList = [];
    errorList = [];
    updateProgress();

    try {
        const res = await fetch(`${API_INV_URL}?inv=${encodeURIComponent(inv)}`);
        const data = await res.json();

        if (!data.ok) {
            alert("인보이스 정보를 찾을 수 없습니다.");
            return;
        }

        outboundData = data.data;

        // 상단 요약 세팅
        inv_no.textContent = outboundData.inv || "-";
        country.textContent = outboundData.country || "-";
        container.textContent = outboundData.container || "-";
        cbm.textContent = outboundData.cbm || "-";
        qty.textContent = outboundData.qty || "-";
        load_time.textContent = outboundData.load_time || "-";
        load_loc.textContent = outboundData.load_loc || "-";

        // 스캔 테이블 준비
        renderOutboundTable();

        updateProgress();

        barcodeInput.focus();

    } catch (err) {
        console.error("조회 오류:", err);
        alert("서버 오류 또는 네트워크 문제입니다.");
    }
}



/* ============================================================
    ▣ 출고 검수 목록 테이블 렌더링
============================================================ */
function renderOutboundTable() {
    scanTableBody.innerHTML = "";

    // outboundData.items 형식 예시:
    // [
    //   { mat:"2141971", box:"1", name:"KBBQ 간장", sap:100, wms:100, unit:"BOX", barcode:"2141971001" }
    // ]

    if (!outboundData || !outboundData.items) return;

    outboundData.items.forEach(item => {
        const tr = document.createElement("tr");

        tr.innerHTML = `
          <td class="px-3 py-1">${item.mat}</td>
          <td class="px-3 py-1">${item.box}</td>
          <td class="px-3 py-1">${item.name}</td>
          <td class="px-3 py-1 text-right">${item.sap}</td>
          <td class="px-3 py-1 text-right">${item.wms}</td>
          <td class="px-3 py-1">${item.unit}</td>
          <td class="px-3 py-1">${item.barcode}</td>
          <td class="px-3 py-1" id="row_status_${item.barcode}">-</td>
        `;

        scanTableBody.appendChild(tr);
    });

    progress_total.textContent = `/ ${outboundData.items.length} 품목`;
}



/* ============================================================
    ▣ 스캔 처리
============================================================ */
function processScan(barcode) {
    barcode = barcode.trim();
    if (!barcode) return;

    // 해당 바코드가 목록에 존재하는지 확인
    const item = outboundData.items.find(i => i.barcode === barcode);

    if (item) {
        // 정상 스캔
        scannedList.push(barcode);

        recentScanStatus.textContent = "정상";
        recentScanStatus.className = "text-lg font-bold text-green-600";
        recentScanDetail.textContent = `${item.mat} / ${item.box}박스 / ${item.name}`;

        // 테이블 표시 갱신
        const td = document.getElementById(`row_status_${barcode}`);
        if (td) td.textContent = "OK";

    } else {
        // 미등록(에러)
        errorList.push(barcode);

        recentScanStatus.textContent = "미등록";
        recentScanStatus.className = "text-lg font-bold text-red-600";
        recentScanDetail.textContent = `${barcode} (출고목록에 없음)`;
    }

    // 스캔 내역 왼쪽 기록 갱신
    renderScanList();

    // 진행률 갱신
    updateProgress();
}



/* ============================================================
    ▣ 스캔 내역 리스트 표시
============================================================ */
function renderScanList() {
    scanList.innerHTML = "";

    scannedList.slice(-50).forEach(code => {
        scanList.innerHTML += `<div class="text-green-700 text-xs">${code}</div>`;
    });

    errorList.slice(-50).forEach(code => {
        scanList.innerHTML += `<div class="text-red-600 text-xs">${code}</div>`;
    });
}



/* ============================================================
    ▣ 진행률 업데이트
============================================================ */
function updateProgress() {
    const now = scannedList.length;
    progress_now.textContent = now;
    error_count.textContent = errorList.length;

    const total = outboundData?.items?.length ?? 0;

    if (total > 0) {
        const percent = Math.min(100, (now / total) * 100);
        progress_bar.style.width = percent + "%";
    } else {
        progress_bar.style.width = "0%";
    }
}



/* ============================================================
    ▣ 요약 초기화 (조회 전 상태로)
============================================================ */
function resetSummary() {
    inv_no.textContent = "-";
    country.textContent = "-";
    container.textContent = "-";
    cbm.textContent = "-";
    qty.textContent = "-";
    load_time.textContent = "-";
    load_loc.textContent = "-";

    recentScanStatus.textContent = "-";
    recentScanDetail.textContent = "";

    progress_now.textContent = "0";
    progress_total.textContent = "/ 0 품목";
    progress_bar.style.width = "0%";

    error_count.textContent = "0";
}



/* ============================================================
    ▣ 이벤트
============================================================ */

// 인보이스 조회 버튼
btnLoadInv.addEventListener("click", loadInvoice);

// 엔터키로 조회 가능
invInput.addEventListener("keydown", e => {
    if (e.key === "Enter") loadInvoice();
});

// 스캔 입력 처리
barcodeInput.addEventListener("keydown", e => {
    if (e.key === "Enter") {
        processScan(barcodeInput.value);
        barcodeInput.value = "";
    }
});
