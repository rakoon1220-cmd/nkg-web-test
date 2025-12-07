/* ============================================================
   ▣ 출고검수 스캔 시스템 – 자동 도메인 기반 버전 (완전 안정판)
   - 인보이스 조회
   - 바코드 스캔
   - 진행률 표시
============================================================ */

// 현재 실행 도메인 자동 감지
const API_BASE = window.location.origin;
const API_INV_URL = `${API_BASE}/api/outbound`;

// DOM 요소
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

// 데이터 저장
let outboundData = null;
let scannedList = [];
let errorList = [];

/* ============================================================
   ▣ 인보이스 조회
============================================================ */
async function loadInvoice() {
  let inv = invInput.value.trim();

  if (!inv) {
    alert("인보이스 번호를 입력하세요.");
    return;
  }

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
      alert(data.message || "인보이스 정보를 찾을 수 없습니다.");
      return;
    }

    outboundData = data.data;

    // 상단 요약 표시
    inv_no.textContent = outboundData.inv;
    country.textContent = outboundData.country;
    container.textContent = outboundData.container;
    cbm.textContent = outboundData.cbm;
    qty.textContent = outboundData.qty;
    load_time.textContent = outboundData.load_time;
    load_loc.textContent = outboundData.load_loc;

    renderOutboundTable();
    updateProgress();

    barcodeInput.focus();

  } catch (err) {
    console.error(err);
    alert("서버 오류 또는 네트워크 문제입니다.");
  }
}

/* ============================================================
   ▣ 출고검수 테이블 표시
============================================================ */
function renderOutboundTable() {
  scanTableBody.innerHTML = "";

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
function processScan(code) {
  code = code.trim();
  if (!code) return;

  const item = outboundData.items.find(i => i.barcode === code);

  if (item) {
    scannedList.push(code);
    recentScanStatus.textContent = "정상";
    recentScanStatus.className = "text-lg font-bold text-green-600";
    recentScanDetail.textContent = `${item.mat} / ${item.box}박스 / ${item.name}`;

    const td = document.getElementById(`row_status_${code}`);
    if (td) td.textContent = "OK";
  } else {
    errorList.push(code);
    recentScanStatus.textContent = "미등록";
    recentScanStatus.className = "text-lg font-bold text-red-600";
    recentScanDetail.textContent = `${code} (출고목록에 없음)`;
  }

  renderScanList();
  updateProgress();
}

/* ============================================================
   ▣ 스캔 리스트 갱신
============================================================ */
function renderScanList() {
  scanList.innerHTML = "";

  scannedList.forEach(c => {
    scanList.innerHTML += `<div class="text-green-700">${c}</div>`;
  });

  errorList.forEach(c => {
    scanList.innerHTML += `<div class="text-red-600">${c}</div>`;
  });
}

/* ============================================================
   ▣ 진행률
============================================================ */
function updateProgress() {
  progress_now.textContent = scannedList.length;
  error_count.textContent = errorList.length;

  const total = outboundData?.items.length || 0;
  if (total === 0) {
    progress_bar.style.width = "0%";
    return;
  }

  const percent = (scannedList.length / total) * 100;
  progress_bar.style.width = `${percent}%`;
}

/* ============================================================
   ▣ 초기화
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
  error_count.textContent = "0";
  progress_bar.style.width = "0%";
}

/* ============================================================
   ▣ 이벤트 바인딩
============================================================ */
btnLoadInv.addEventListener("click", loadInvoice);
invInput.addEventListener("keydown", e => { if (e.key === "Enter") loadInvoice(); });

barcodeInput.addEventListener("keydown", e => {
  if (e.key === "Enter") {
    processScan(barcodeInput.value);
    barcodeInput.value = "";
  }
});
