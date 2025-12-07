/* ============================================================
   출고검수 스캔 - 최종 안정판 (요약 + 스캔 + 중복 + 팝업 + 매핑)
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

/* ===== 데이터 상태 ===== */
let scannedCodes = [];      // 전체 스캔 바코드
let duplicateCodes = [];    // 중복 스캔 바코드
let errorCodes = [];        // 미등록 바코드
let outboundItems = [];     // 출고 검수 목록 (API에서 로드)
let lastScannedBarcode = null; // 마지막 스캔 바코드 (행 하이라이트용)

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
   인보이스 조회 → 상단정보 + 특이사항 + 출고목록 로드
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

    // 특이사항 자동 팝업
    if (row["특이사항"] && row["특이사항"].trim() !== "") {
      currentNotice = row["특이사항"];
      showNoticeModal(currentNotice);
    }

    // 출고 검수 목록 로드
    await loadOutboundItems(inv);

    barcodeInput.focus();

  } catch (err) {
    console.error(err);
    alert("서버 오류 또는 네트워크 오류");
  }
}

btnLoadInv.addEventListener("click", loadInvoice);
invInput.addEventListener("keydown", e => {
  if (e.key === "Enter") loadInvoice();
});

/* ==================================================
   출고 검수 목록 로드 (SAP + WMS + 바코드 통합)
================================================== */
async function loadOutboundItems(inv) {
  try {
    const res = await fetch(`/api/outbound_items?inv=${encodeURIComponent(inv)}`);
    const json = await res.json();

    if (!json.ok) {
      alert("출고 품목 목록을 불러오지 못했습니다.");
      return;
    }

    // 기본 상태값 정리
    outboundItems = (json.items || []).map(it => ({
      ...it,
      sap: Number(it.sap || 0),
      wms: Number(it.wms || 0),
      scanned: Number(it.scanned || 0),
      status: it.status || "미검수",
    }));

    renderOutboundTable();
    updateProgress();

  } catch (err) {
    console.error("OUTBOUND LOAD ERROR:", err);
    alert("출고 품목 목록 호출 중 오류");
  }
}

/* ==================================================
   출고 검수 테이블 렌더링
================================================== */
function renderOutboundTable() {
  scanTableBody.innerHTML = "";

  outboundItems.forEach(item => {
    const tr = document.createElement("tr");

    // 상태에 따른 색상
    let statusClass = "";
    if (item.status === "완료") {
      statusClass = "bg-emerald-50 text-emerald-800";
    } else if (item.status === "진행중") {
      statusClass = "bg-sky-50";
    } else if (item.status === "초과") {
      statusClass = "bg-red-50 text-red-700";
    }

    // 마지막 스캔 건 하이라이트
    if (item.barcode === lastScannedBarcode) {
      statusClass += " ring-2 ring-amber-400";
    }

    tr.className = statusClass.trim();

    tr.innerHTML = `
      <td class="px-3 py-2">${item.mat}</td>
      <td class="px-3 py-2">${item.box}</td>
      <td class="px-3 py-2">${item.name}</td>
      <td class="px-3 py-2 text-right">${item.sap}</td>
      <td class="px-3 py-2 text-right">${item.wms}</td>
      <td class="px-3 py-2">${item.unit}</td>
      <td class="px-3 py-2">${item.barcode}</td>
      <td class="px-3 py-2">${item.status}</td>
    `;

    scanTableBody.appendChild(tr);
  });

  // 총 품목 수 업데이트
  progress_total.textContent = `/ ${outboundItems.length} 품목`;
}

/* ------------------------------------------------------------
   스캔 처리 (목록 매핑 + 상태 업데이트)
------------------------------------------------------------ */

barcodeInput.addEventListener("keydown", e => {
  if (e.key === "Enter") {
    const code = barcodeInput.value.trim();
    barcodeInput.value = "";
    processScan(code);
  }
});

function processScan(code) {
  if (!code) return;

  const isDupCode = scannedCodes.includes(code);
  scannedCodes.push(code);

  // 출고 목록에서 해당 바코드 찾기
  const idx = outboundItems.findIndex(it => it.barcode === code);
  const item = idx >= 0 ? outboundItems[idx] : null;

  // 미등록 바코드
  if (!item) {
    errorCodes.push(code);
    recentScanStatus.textContent = "미등록";
    recentScanStatus.className = "text-lg font-bold text-red-600";
    recentScanDetail.textContent = `${code} (출고 목록에 없음)`;

    renderScanList();
    updateProgress();
    return;
  }

  // 정상 품목 스캔
  lastScannedBarcode = code;

  if (typeof item.scanned !== "number") item.scanned = 0;
  item.scanned += 1;

  // 상태 판정
  const sapQty = item.sap || 0;
  let statusText = "미검수";

  if (sapQty <= 0) {
    statusText = "SAP미설정";
  } else if (item.scanned < sapQty) {
    statusText = "진행중";
  } else if (item.scanned === sapQty) {
    statusText = "완료";
  } else if (item.scanned > sapQty) {
    statusText = "초과";
  }

  item.status = statusText;
  outboundItems[idx] = item;

  // 최근 스캔 결과 메시지
  if (!isDupCode && statusText !== "초과") {
    recentScanStatus.textContent = "정상";
    recentScanStatus.className = "text-lg font-bold text-green-600";
  } else if (statusText === "초과") {
    recentScanStatus.textContent = "초과";
    recentScanStatus.className = "text-lg font-bold text-red-600";
  } else {
    duplicateCodes.push(code);
    recentScanStatus.textContent = "중복";
    recentScanStatus.className = "text-lg font-bold text-amber-600";
  }

  recentScanDetail.textContent =
    `${code} / ${item.name} / 스캔: ${item.scanned} / SAP: ${sapQty}`;

  renderScanList();
  renderOutboundTable();
  updateProgress();
}

/* ------------------------------------------------------------
   스캔 리스트 & 진행 상태 업데이트
------------------------------------------------------------ */

function renderScanList() {
  if (scannedCodes.length === 0 && errorCodes.length === 0) {
    scanList.innerHTML = `<div class="text-slate-400">아직 스캔된 항목 없음…</div>`;
    return;
  }

  scanList.innerHTML = "";
  const errorSet = new Set(errorCodes);

  scannedCodes.forEach((code, idx) => {
    const firstIdx = scannedCodes.indexOf(code);
    const isDup = firstIdx !== idx;
    const isError = errorSet.has(code);

    let label = code;
    let cls = "text-green-700";

    if (isError) {
      label += " (미등록)";
      cls = "text-red-600";
    } else if (isDup) {
      label += " (중복)";
      cls = "text-amber-700";
    } else {
      label += " (정상)";
    }

    scanList.innerHTML += `<div class="${cls}">${label}</div>`;
  });
}

function updateProgress() {
  const totalScan = scannedCodes.length;
  const uniqueCount = new Set(scannedCodes).size;

  dup_count.textContent = totalScan - uniqueCount;
  error_count.textContent = errorCodes.length;

  const totalItems = outboundItems.length;
  if (totalItems > 0) {
    const completedItems = outboundItems.filter(
      it => it.sap > 0 && it.scanned >= it.sap
    ).length;

    progress_now.textContent = String(completedItems);
    const percent = Math.min(100, (completedItems / totalItems) * 100);
    progress_bar.style.width = `${percent}%`;
    progress_total.textContent = `/ ${totalItems} 품목`;
  } else {
    progress_now.textContent = "0";
    progress_bar.style.width = "0%";
    progress_total.textContent = "/ 0 품목";
  }
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
  outboundItems = [];
  lastScannedBarcode = null;

  scanList.innerHTML = `<div class="text-slate-400">아직 스캔된 항목 없음…</div>`;
  scanTableBody.innerHTML = "";

  progress_now.textContent = "0";
  dup_count.textContent = "0";
  error_count.textContent = "0";
  progress_bar.style.width = "0%";
  progress_total.textContent = "/ 0 품목";

  recentScanStatus.textContent = "-";
  recentScanStatus.className = "text-lg font-bold text-slate-700";
  recentScanDetail.textContent = "";
}
