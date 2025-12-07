/* ============================================================
   출고검수 스캔 - 최종 안정판 (요약 + 스캔 + 중복 + 팝업)
============================================================ */

const IS_FILE = location.protocol === "file:";
const API_BASE = window.location.origin;

/* ===== DOM 요소 ===== */
const invInput = document.getElementById("invInput");
const btnLoadInv = document.getElementById("btnLoadInv");
const btnNoticeOpen = document.getElementById("btnNoticeOpen");

const inv_no = document.getElementById("inv_no");
const country = document.getElementById("country");
const containerEl = document.getElementById("container");
const cbm = document.getElementById("cbm");
const qty = document.getElementById("qty");
const load_time = document.getElementById("load_time");
const load_loc = document.getElementById("load_loc");

const barcodeInput = document.getElementById("barcodeInput");

const recentScanStatus = document.getElementById("recentScanStatus");
const recentScanDetail = document.getElementById("recentScanDetail");

const progress_now = document.getElementById("progress_now");
const progress_total = document.getElementById("progress_total");
const progress_bar = document.getElementById("progress_bar");
const error_count = document.getElementById("error_count");
const dup_count = document.getElementById("dup_count");

const scanList = document.getElementById("scanList");
const scanTableBody = document.getElementById("scanTableBody");

/* ===== 모달 ===== */
const noticeModal = document.getElementById("noticeModal");
const noticeText = document.getElementById("noticeText");
const noticeCloseBtn = document.getElementById("noticeCloseBtn");

let currentNotice = "";

/* ===== 모달 표시 ===== */
function showNoticeModal(text) {
  if (!text) return;
  currentNotice = text;
  noticeText.textContent = text;
  noticeModal.classList.remove("hidden");
}

noticeCloseBtn.addEventListener("click", () => {
  noticeModal.classList.add("hidden");
  barcodeInput.focus();
});

/* ===== 특이사항 버튼 ===== */
btnNoticeOpen.addEventListener("click", () => {
  if (!currentNotice) {
    alert("특이사항이 없습니다.");
    return;
  }
  showNoticeModal(currentNotice);
});

/* ------------------------------------------------------------
   인보이스 조회 → 팝업은 여기서만 자동 실행됨
------------------------------------------------------------ */
async function loadInvoice() {
  const inv = invInput.value.trim();
  if (!inv) {
    alert("인보이스를 입력하세요.");
    return;
  }

  resetUI();

  // file:/// 테스트 모드
  if (IS_FILE) {
    inv_no.textContent = inv;
    country.textContent = "테스트국가";
    containerEl.textContent = "40FT";
    cbm.textContent = "28.5";
    qty.textContent = "1450";
    load_time.textContent = "14:00";
    load_loc.textContent = "A02";

    currentNotice = "테스트 특이사항입니다.\n조회 후 팝업이 정상적으로 뜹니다.";
    showNoticeModal(currentNotice);
    return;
  }

  // 실제 서버 조회 모드
  try {
    const res = await fetch(`${API_BASE}/api/sap_doc?inv=${encodeURIComponent(inv)}`);
    const json = await res.json();

    if (!json.ok) {
      alert(json.message || "인보이스 정보를 찾을 수 없습니다.");
      return;
    }

    const row = json.data;

    inv_no.textContent = row["인보이스"] || "-";
    country.textContent = row["국가"] || "-";
    containerEl.textContent = row["컨테이너"] || "-";
    cbm.textContent = row["CBM"] || "-";
    qty.textContent = row["출고"] || "-";
    load_time.textContent = row["상차시간"] || "-";
    load_loc.textContent = row["상차위치"] || "-";

    // ★★★★★ 팝업은 인보이스 조회 이후에만 자동 표시됨
    if (row["특이사항"] && row["특이사항"].trim() !== "") {
      currentNotice = row["특이사항"];
      showNoticeModal(currentNotice);
    }

    barcodeInput.focus();

  } catch (err) {
    alert("서버 오류 또는 네트워크 오류");
  }
}

btnLoadInv.addEventListener("click", loadInvoice);
invInput.addEventListener("keydown", e => {
  if (e.key === "Enter") loadInvoice();
});

/* ------------------------------------------------------------
   스캔 처리
------------------------------------------------------------ */

let scannedCodes = [];
let duplicateCodes = [];
let errorCodes = [];

barcodeInput.addEventListener("keydown", e => {
  if (e.key === "Enter") {
    const code = barcodeInput.value.trim();
    barcodeInput.value = "";
    processScan(code);
  }
});

function processScan(code) {
  if (!code) return;

  const isDup = scannedCodes.includes(code);
  scannedCodes.push(code);

  if (isDup) {
    duplicateCodes.push(code);
    recentScanStatus.textContent = "중복";
    recentScanStatus.className = "text-lg font-bold text-amber-600";
    recentScanDetail.textContent = `${code} (이미 스캔됨)`;
  } else {
    recentScanStatus.textContent = "정상";
    recentScanStatus.className = "text-lg font-bold text-green-600";
    recentScanDetail.textContent = code;
  }

  renderScanList();
  updateProgress();
}

/* ------------------------------------------------------------
   리스트 & 진행 상태 업데이트
------------------------------------------------------------ */

function renderScanList() {
  scanList.innerHTML = "";

  scannedCodes.forEach((code, idx) => {
    const firstIdx = scannedCodes.indexOf(code);
    const isDup = firstIdx !== idx;
    const label = isDup ? `${code} (중복)` : code;
    const cls = isDup ? "text-amber-700" : "text-green-700";

    scanList.innerHTML += `<div class="${cls}">${label}</div>`;
  });
}

function updateProgress() {
  const totalScan = scannedCodes.length;
  const uniqueCount = new Set(scannedCodes).size;

  progress_now.textContent = totalScan;
  dup_count.textContent = totalScan - uniqueCount;
  error_count.textContent = errorCodes.length;

  progress_bar.style.width = "0%";
  progress_total.textContent = "/ 0 품목";
}

/* ------------------------------------------------------------
   초기화
------------------------------------------------------------ */
function resetUI() {
  inv_no.textContent = "-";
  country.textContent = "-";
  containerEl.textContent = "-";
  cbm.textContent = "-";
  qty.textContent = "-";
  load_time.textContent = "-";
  load_loc.textContent = "-";

  scannedCodes = [];
  duplicateCodes = [];
  errorCodes = [];

  scanList.innerHTML = `<div class="text-slate-400">아직 스캔된 항목 없음…</div>`;
  scanTableBody.innerHTML = "";

  progress_now.textContent = "0";
  dup_count.textContent = "0";
  error_count.textContent = "0";
  progress_bar.style.width = "0%";
  progress_total.textContent = "/ 0 품목";

  recentScanStatus.textContent = "-";
  recentScanDetail.textContent = "-";
}
