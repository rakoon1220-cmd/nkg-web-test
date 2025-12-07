/* ============================================================
   출고검수 스캔 - 최신 안정판
============================================================ */

const API_BASE = window.location.origin;

/* DOM 요소 */
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
const progress_percent = document.getElementById("progress_percent");

const error_count = document.getElementById("error_count");
const dup_count = document.getElementById("dup_count");

const scanList = document.getElementById("scanList");
const scanTableBody = document.getElementById("scanTableBody");

const noticeModal = document.getElementById("noticeModal");
const noticeText = document.getElementById("noticeText");
const noticeCloseBtn = document.getElementById("noticeCloseBtn");

let outboundItems = [];
let scannedCodes = [];
let errorCodes = [];
let duplicateCodes = [];
let lastScannedBarcode = null;
let currentNotice = "";

/* 팝업 */
btnNoticeOpen.addEventListener("click", () => {
  if (!currentNotice) return alert("특이사항이 없습니다.");
  noticeModal.classList.remove("hidden");
});
noticeCloseBtn.onclick = () => {
  noticeModal.classList.add("hidden");
  barcodeInput.focus();
};

/* 인보이스 조회 */
btnLoadInv.onclick = loadInvoice;
invInput.addEventListener("keydown", e => {
  if (e.key === "Enter") loadInvoice();
});

async function loadInvoice() {
  const inv = invInput.value.trim();
  if (!inv) return alert("인보이스를 입력하세요.");

  resetUI();

  try {
    const res = await fetch(`${API_BASE}/api/sap_doc?inv=${inv}`);
    const json = await res.json();

    if (!json.ok) return alert(json.message);

    const row = json.data;

    inv_no.textContent = row["인보이스"];
    country.textContent = row["국가"];
    containerEl.textContent = row["컨테이너"];
    cbm.textContent = row["CBM"];
    qty.textContent = row["출고"];
    load_time.textContent = row["상차시간"];
    load_loc.textContent = row["상차위치"];

    // 특이사항
    if (row["특이사항"]?.trim()) {
      currentNotice = row["특이사항"];
      noticeText.textContent = currentNotice;
      noticeModal.classList.remove("hidden");
    }

    await loadOutboundItems(inv);
    barcodeInput.focus();

  } catch (err) {
    alert("서버 오류: " + err.message);
  }
}

/* 출고 목록 */
async function loadOutboundItems(inv) {
  const res = await fetch(`/api/outbound_items?inv=${inv}`);
  const json = await res.json();

  if (!json.ok) return alert(json.message);

  outboundItems = json.items;
  renderOutboundTable();
  updateProgress();
}

/* 테이블 렌더링 */
function renderOutboundTable() {
  scanTableBody.innerHTML = "";

  outboundItems.forEach(item => {
    const tr = document.createElement("tr");

    let cls = "";
    if (item.status === "완료") cls = "bg-yellow-100";
    else if (item.status === "초과") cls = "bg-red-50 text-red-700";
    else if (item.status === "진행중") cls = "bg-sky-50";

    if (item.barcode === lastScannedBarcode) {
      cls += " ring-2 ring-amber-400";
    }

    tr.className = cls;

    tr.innerHTML = `
      <td class="px-3 py-2">${item.no}</td>
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
}

/* 스캔 처리 */
barcodeInput.addEventListener("keydown", e => {
  if (e.key === "Enter") {
    const code = barcodeInput.value.trim();
    barcodeInput.value = "";
    processScan(code);
  }
});

function processScan(code) {
  if (!code) return;

  const isDuplicate = scannedCodes.includes(code);
  scannedCodes.push(code);

  const item = outboundItems.find(it => it.barcode === code);

  if (!item) {
    errorCodes.push(code);
    showRecent("미등록", code + " (목록 없음)", "red");
    renderScanList();
    updateProgress();
    return;
  }

  lastScannedBarcode = code;

  item.scanned = (item.scanned || 0) + 1;

  if (item.scanned < item.sap) item.status = "진행중";
  else if (item.scanned === item.sap) item.status = "완료";
  else item.status = "초과";

  if (isDuplicate) duplicateCodes.push(code);

  if (item.status === "초과") showRecent("초과", `${code} / ${item.name}`, "red");
  else if (isDuplicate) showRecent("중복", `${code} / ${item.name}`, "amber");
  else showRecent("정상", `${code} / ${item.box} / ${item.name}`, "green");

  renderScanList();
  renderOutboundTable();
  updateProgress();
}

function showRecent(status, text, color) {
  recentScanStatus.textContent = status;
  recentScanStatus.className = `text-lg font-bold text-${color}-600`;
  recentScanDetail.textContent = text;
}

/* 스캔 리스트 */
function renderScanList() {
  scanList.innerHTML = "";

  scannedCodes.forEach(code => {
    const item = outboundItems.find(it => it.barcode === code);
    let txt = code;
    let cls = "text-green-700";

    if (errorCodes.includes(code)) {
      txt += " (미등록)";
      cls = "text-red-600";
    } else if (duplicateCodes.includes(code)) {
      txt += " (중복)";
      cls = "text-amber-600";
    } else {
      if (item) txt += ` (${item.box}) - ${item.name}`;
    }

    scanList.innerHTML += `<div class="${cls}">${txt}</div>`;
  });
}

/* 진행률 */
function updateProgress() {
  const total = outboundItems.length;
  const completed = outboundItems.filter(it => it.scanned >= it.sap).length;

  progress_now.textContent = completed;
  progress_total.textContent = `/ ${total} 품목`;

  const percent = total ? Math.round((completed / total) * 100) : 0;
  progress_percent.textContent = `${percent}%`;
  progress_bar.style.width = `${percent}%`;

  dup_count.textContent = duplicateCodes.length;
  error_count.textContent = errorCodes.length;
}

/* 초기화 */
function resetUI() {
  outboundItems = [];
  scannedCodes = [];
  duplicateCodes = [];
  errorCodes = [];
  lastScannedBarcode = null;

  scanTableBody.innerHTML = "";
  scanList.innerHTML = `<div class="text-slate-400">아직 스캔 없음…</div>`;

  progress_now.textContent = "0";
  progress_total.textContent = "/ 0 품목";
  progress_percent.textContent = "0%";
  progress_bar.style.width = "0%";

  dup_count.textContent = "0";
  error_count.textContent = "0";

  recentScanStatus.textContent = "-";
  recentScanDetail.textContent = "";
}
