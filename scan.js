/* =====================================================================
   출고검수 스캔 - 최종 안정판 (소리 + 매핑 + 미등록 상세 + 진행률)
   2025.12 최신 버전
===================================================================== */

const IS_FILE = location.protocol === "file:";
const API_BASE = window.location.origin;

/* ====== 사운드 로드 ====== */
const sound_ok = new Audio("/sound/ok.wav");
const sound_dup = new Audio("/sound/dup.wav");
const sound_err = new Audio("/sound/error.wav");
const sound_modal = new Audio("/sound/modal.wav");

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
const progress_percent = document.getElementById("progress_percent");
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
let outboundItems = [];
let barcodeTable = [];
let scannedCodes = [];
let errorCodes = [];
let duplicateCodes = [];
let lastScannedBarcode = null;

/* =====================================================================
   모달 표시
===================================================================== */
function showNoticeModal(text) {
  if (!text) return;
  currentNotice = text;
  noticeText.textContent = text;
  noticeModal.classList.remove("hidden");
  sound_modal.play();
}

noticeCloseBtn.addEventListener("click", () => {
  noticeModal.classList.add("hidden");
  barcodeInput.focus();
});

btnNoticeOpen.addEventListener("click", () => {
  if (!currentNotice) {
    alert("특이사항이 없습니다.");
    return;
  }
  showNoticeModal(currentNotice);
});

/* =====================================================================
   인보이스 조회 처리
===================================================================== */
async function loadInvoice() {
  const inv = invInput.value.trim();
  if (!inv) return alert("인보이스를 입력하세요.");

  resetUI();

  if (IS_FILE) {
    inv_no.textContent = inv;
    country.textContent = "FILE_TEST";
    containerEl.textContent = "40FT";
    cbm.textContent = "20";
    qty.textContent = "1000";
    load_time.textContent = "07:00";
    load_loc.textContent = "A01";
    currentNotice = "테스트 모드 특이사항";
    showNoticeModal(currentNotice);
    return;
  }

  try {
    // SAP 문서 + 출고 목록 로드
    const res_doc = await fetch(`/api/sap_doc?inv=${inv}`);
    const doc_json = await res_doc.json();

    if (!doc_json.ok) {
      alert(doc_json.message);
      return;
    }

    const row = doc_json.data;

    inv_no.textContent = row["인보이스"];
    country.textContent = row["국가"];
    containerEl.textContent = row["컨테이너"];
    cbm.textContent = row["CBM"];
    qty.textContent = Number(row["출고"]).toLocaleString();
    load_time.textContent = row["상차시간"];
    load_loc.textContent = row["상차위치"];

    if (row["특이사항"]?.trim()) {
      let txt = row["특이사항"].replace(/\\n/g, "\n");
      showNoticeModal(txt);
    }

    // 출고 검수 목록
    await loadOutboundItems(inv);

    // 바코드 테이블도 로드
    await loadBarcodeTable();

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

/* =====================================================================
   바코드 테이블 로드
===================================================================== */
async function loadBarcodeTable() {
  try {
    const res = await fetch("/api/barcode_table");
    const json = await res.json();
    if (json.ok) barcodeTable = json.rows;
  } catch (err) {
    console.error("BARCODE LOAD ERR:", err);
  }
}

/* =====================================================================
   출고 검수 목록 로드
===================================================================== */
async function loadOutboundItems(inv) {
  try {
    const res = await fetch(`/api/outbound_items?inv=${inv}`);
    const json = await res.json();

    if (!json.ok) {
      alert("출고 품목 목록을 불러오지 못했습니다.");
      return;
    }

    outboundItems = json.items || [];
    renderOutboundTable();
    updateProgress();

  } catch (err) {
    console.error("OUTBOUND LOAD ERROR:", err);
    alert("출고 품목 목록 호출 중 오류");
  }
}

/* =====================================================================
   스캔 처리
===================================================================== */
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

  const item = outboundItems.find(it => it.barcode === code);
  lastScannedBarcode = code;

  /* ---------- 미등록 바코드 ---------- */
  if (!item) {
    duplicateCodes.push(code);
    recentScanStatus.textContent = "미등록";
    recentScanStatus.className = "text-lg font-bold text-red-600";

    const bc = barcodeTable.find(b => b.barcode === code);
    if (bc) {
      recentScanDetail.textContent =
        `${code} / ${bc.name} / 박스 ${bc.box || '-'} (바코드 시트 참조)`;
    } else {
      recentScanDetail.textContent = `${code} (바코드 시트에도 없음)`;
    }

    sound_err.play();
    renderScanList();
    updateProgress();
    return;
  }

  /* ---------- 정상 스캔 ---------- */
  item.scanned++;
  const sap = Number(item.sap);

  if (item.scanned < sap) {
    item.status = "진행중";
    recentScanStatus.textContent = "정상";
    recentScanStatus.className = "text-lg font-bold text-green-600";
    sound_ok.play();

  } else if (item.scanned === sap) {
    item.status = "완료";
    recentScanStatus.textContent = "완료";
    recentScanStatus.className = "text-lg font-bold text-emerald-600";
    sound_ok.play();

  } else {
    item.status = "초과";
    recentScanStatus.textContent = "초과";
    recentScanStatus.className = "text-lg font-bold text-red-600";
    sound_err.play();
  }

  if (isDup) {
    recentScanStatus.textContent = "중복";
    recentScanStatus.className = "text-lg font-bold text-amber-600";
    sound_dup.play();
  }

  recentScanDetail.textContent =
    `${code} / ${item.name} / (SAP ${sap}, 스캔 ${item.scanned})`;

  renderScanList();
  renderOutboundTable();
  updateProgress();
}

/* =====================================================================
   스캔된 목록 표시
===================================================================== */
function renderScanList() {
  if (scannedCodes.length === 0) {
    scanList.innerHTML = `<div class="text-slate-400">스캔 없음…</div>`;
    return;
  }

  scanList.innerHTML = "";

  scannedCodes.forEach(code => {
    const item = outboundItems.find(it => it.barcode === code);
    let html = "";

    if (item) {
      html = `<div class="text-green-700">${code} / ${item.box} / ${item.name}</div>`;
    } else {
      const bc = barcodeTable.find(b => b.barcode === code);
      if (bc) {
        html = `<div class="text-red-600">${code} (미등록) - ${bc.name}</div>`;
      } else {
        html = `<div class="text-red-600">${code} (완전 미등록)</div>`;
      }
    }

    scanList.innerHTML += html;
  });
}

/* =====================================================================
   출고 검수 테이블 렌더링
===================================================================== */
function renderOutboundTable() {
  scanTableBody.innerHTML = "";

  outboundItems.forEach(item => {
    let cls = "";

    if (item.barcode === lastScannedBarcode) cls += " ring-2 ring-amber-400 ";
    if (item.status === "완료") cls += " bg-yellow-100 ";
    if (item.status === "초과") cls += " bg-red-50 text-red-700 ";

    const tr = document.createElement("tr");
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

/* =====================================================================
   진행률 업데이트
===================================================================== */
function updateProgress() {
  const total = outboundItems.length;
  const completed = outboundItems.filter(it => it.scanned >= it.sap && it.sap > 0).length;
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;

  progress_now.textContent = completed;
  progress_total.textContent = `/ ${total} 품목`;
  progress_percent.textContent = `${percent}%`;
  progress_bar.style.width = `${percent}%`;

  const uniqueScan = new Set(scannedCodes).size;

  dup_count.textContent = scannedCodes.length - uniqueScan;
  error_count.textContent = errorCodes.length;
}

/* =====================================================================
   초기화
===================================================================== */
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
  lastScannedBarcode = null;

  outboundItems = [];
  scanList.innerHTML = `<div class="text-slate-400">스캔 없음…</div>`;
  scanTableBody.innerHTML = "";

  progress_now.textContent = "0";
  progress_total.textContent = "/ 0 품목";
  progress_percent.textContent = "0%";
  progress_bar.style.width = "0%";

  recentScanStatus.textContent = "-";
  recentScanDetail.textContent = "";
}
