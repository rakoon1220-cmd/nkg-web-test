/* ============================================================
   출고검수 스캔 — 완전 안정판 (CSV 컬럼번호 기반)
   SAP 문서 + SAP 자재 + WMS + 바코드 매칭
   소리 + 중복 + 오류 + 상태 반영 + 진행률
============================================================ */

const API_BASE = window.location.origin;
const IS_FILE = location.protocol === "file:";

/* ===== 상단 DOM ===== */
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

const recentScanStatus = document.getElementById("recentScanStatus");
const recentScanDetail = document.getElementById("recentScanDetail");

const progress_now = document.getElementById("progress_now");
const progress_total = document.getElementById("progress_total");
const progress_percent = document.getElementById("progress_percent");
const progress_bar = document.getElementById("progress_bar");

const error_count = document.getElementById("error_count");
const dup_count = document.getElementById("dup_count");

const scanList = document.getElementById("scanList");
const scanTableBody = document.getElementById("scanTableBody");

/* ===== Modal ===== */
const noticeModal = document.getElementById("noticeModal");
const noticeText = document.getElementById("noticeText");
const noticeCloseBtn = document.getElementById("noticeCloseBtn");

/* ===== Sound ===== */
const sndOK = new Audio("/sound/ok.wav");
const sndDup = new Audio("/sound/dup.wav");
const sndErr = new Audio("/sound/error.wav");
const sndModal = new Audio("/sound/modal.wav");

/* ===== Data ===== */
let outboundItems = [];
let scannedCodes = [];
let duplicateCodes = [];
let errorCodes = [];
let lastScannedBarcode = null;
let currentNotice = "";

/* ============================================================
   특이사항 모달
============================================================ */
function showNoticeModal(text) {
  if (!text) return;
  currentNotice = text;
  noticeText.textContent = text;
  noticeModal.classList.remove("hidden");
  sndModal.play();
}

noticeCloseBtn.onclick = () => {
  noticeModal.classList.add("hidden");
  barcodeInput.focus();
};

btnNoticeOpen.onclick = () => {
  if (!currentNotice) return alert("특이사항 없음");
  showNoticeModal(currentNotice);
};

/* ============================================================
   인보이스 조회 → 상단 + 출고 목록
============================================================ */
btnLoadInv.onclick = loadInvoice;
invInput.addEventListener("keydown", e => {
  if (e.key === "Enter") loadInvoice();
});

async function loadInvoice() {
  const inv = invInput.value.trim();
  if (!inv) return alert("인보이스 입력하세요.");

  resetUI();

  try {
    // SAP 문서 정보 조회
    const doc = await fetch(`${API_BASE}/api/sap_doc?inv=${inv}`);
    const docJson = await doc.json();

    if (!docJson.ok) {
      alert(docJson.message);
      return;
    }

    const row = docJson.data;

    // 상단 표시
    inv_no.textContent = row["인보이스"] || "-";
    country.textContent = row["국가"] || "-";
    containerEl.textContent = row["컨테이너"] || "-";
    cbm.textContent = row["CBM"] || "-";
    qty.textContent = row["출고"] || "-";
    load_time.textContent = row["상차시간"] || "-";
    load_loc.textContent = row["상차위치"] || "-";

    // 특이사항
    if (row["특이사항"]?.trim()) {
      showNoticeModal(row["특이사항"]);
    }

    // 출고 검수 목록
    await loadOutboundItems(inv);
    barcodeInput.focus();

  } catch (e) {
    console.error(e);
    alert("서버 오류 또는 네트워크 오류");
  }
}

/* ============================================================
   출고 목록 조회
============================================================ */
async function loadOutboundItems(inv) {
  const res = await fetch(`${API_BASE}/api/outbound_items?inv=${inv}`);
  const json = await res.json();

  if (!json.ok) {
    alert(json.message);
    return;
  }

  outboundItems = json.items;
  renderOutboundTable();
  updateProgress();
}

/* ============================================================
   테이블 렌더링
============================================================ */
function renderOutboundTable() {
  scanTableBody.innerHTML = "";

  outboundItems.forEach(item => {
    const tr = document.createElement("tr");

    // 색상
    let cls = "";
    if (item.status === "완료") cls = "bg-yellow-100";
    if (item.status === "미완료") cls = "";
    if (duplicateCodes.includes(item.barcode)) cls = "bg-emerald-100";

    if (lastScannedBarcode === item.barcode)
      cls += " ring-2 ring-amber-400";

    tr.className = cls;

    tr.innerHTML = `
      <td class="px-2 py-1">${item.no}</td>
      <td class="px-2 py-1">${item.mat}</td>
      <td class="px-2 py-1">${item.box}</td>
      <td class="px-2 py-1">${item.name}</td>
      <td class="px-2 py-1 text-right">${item.sap}</td>
      <td class="px-2 py-1 text-right">${item.wms}</td>
      <td class="px-2 py-1 text-right">${item.diff}</td>
      <td class="px-2 py-1">${item.barcode}</td>
      <td class="px-2 py-1">${item.status}</td>
    `;

    scanTableBody.appendChild(tr);
  });

  progress_total.textContent = `/ ${outboundItems.length} 품목`;
}

/* ============================================================
   바코드 스캔 처리
============================================================ */

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

  const idx = outboundItems.findIndex(it => it.barcode === code);
  const item = idx >= 0 ? outboundItems[idx] : null;

  /* === 미등록 === */
  if (!item) {
    errorCodes.push(code);
    recentScanStatus.textContent = "미등록";
    recentScanStatus.className = "text-lg font-bold text-red-600";

    renderScanList();
    sndErr.play();
    updateProgress();
    return;
  }

  /* === 정상 스캔 === */
  lastScannedBarcode = code;

  item.scanned += 1;

  if (item.scanned >= item.sap) item.status = "완료";
  else item.status = "미완료";

  recentScanStatus.textContent = item.status;
  recentScanStatus.className =
    item.status === "완료"
      ? "text-lg font-bold text-green-700"
      : "text-lg font-bold text-slate-700";

  recentScanDetail.textContent = `바코드:${code} 박스번호:${item.box} / ${item.name}`;

  if (isDup) {
    duplicateCodes.push(code);
    sndDup.play();
  } else {
    sndOK.play();
  }

  renderScanList();
  renderOutboundTable();
  updateProgress();
}

/* ============================================================
   스캔 목록 표시
============================================================ */
function renderScanList() {
  scanList.innerHTML = "";

  scannedCodes.forEach(code => {
    const item = outboundItems.find(it => it.barcode === code);

    if (!item) {
      scanList.innerHTML += `<div class="text-red-600">${code} (미등록)</div>`;
    } else {
      scanList.innerHTML += `<div class="text-green-700">${code} (${item.box}) - ${item.name}</div>`;
    }
  });
}

/* ============================================================
   진행률 업데이트
============================================================ */
function updateProgress() {
  const total = outboundItems.length;
  const completed = outboundItems.filter(it => it.status === "완료").length;

  progress_now.textContent = completed;
  progress_percent.textContent = `${Math.round((completed / total) * 100)}%`;
  progress_bar.style.width = `${(completed / total) * 100}%`;

  dup_count.textContent = duplicateCodes.length;
  error_count.textContent = errorCodes.length;
}

/* ============================================================
   초기화
============================================================ */
function resetUI() {
  scannedCodes = [];
  duplicateCodes = [];
  errorCodes = [];
  outboundItems = [];
  lastScannedBarcode = null;

  inv_no.textContent = "-";
  country.textContent = "-";
  containerEl.textContent = "-";
  cbm.textContent = "-";
  qty.textContent = "-";
  load_time.textContent = "-";
  load_loc.textContent = "-";

  scanList.innerHTML = `<div class="text-slate-400">아직 스캔 없음…</div>`;
  scanTableBody.innerHTML = "";

  progress_now.textContent = "0";
  progress_total.textContent = "/ 0 품목";
  progress_percent.textContent = "0%";
  progress_bar.style.width = "0%";

  recentScanStatus.textContent = "-";
  recentScanDetail.textContent = "";
}
