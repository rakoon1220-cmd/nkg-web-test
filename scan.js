/* ============================================================
   출고검수 스캔 최종 안정판 (2025-12-07)
   - SAP 문서 + SAP 자재자동 + WMS + 바코드 완전 매핑
   - 스캔 사운드 적용 (ok / dup / error / modal)
   - 특이사항 자동 팝업 + 사운드
   - 진행률 %, 완료 표시, 중복/미등록 표시
============================================================ */

const IS_FILE = location.protocol === "file:";
const API_BASE = window.location.origin;

/* ===== DOM ===== */
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

/* ===== 모달 ===== */
const noticeModal = document.getElementById("noticeModal");
const noticeText = document.getElementById("noticeText");
const noticeCloseBtn = document.getElementById("noticeCloseBtn");

let currentNotice = "";

/* ===== 사운드 로드 ===== */
let snd_ok, snd_dup, snd_error, snd_modal;

if (!IS_FILE) {
  snd_ok = new Audio("/sound/ok.mp3");
  snd_dup = new Audio("/sound/dup.mp3");
  snd_error = new Audio("/sound/error.mp3");
  snd_modal = new Audio("/sound/modal.mp3");
}

function playSafe(sound) {
  if (!sound) return;
  sound.currentTime = 0;
  sound.play().catch(() => {});
}

/* ===== 데이터 ===== */
let outboundItems = [];
let scannedCodesSet = new Set();
let scanHistory = [];
let lastScannedBarcode = null;

let barcodeIndexByMat = {};     // { 자재번호 : {box, barcode, name} }
let barcodeIndexByCode = {};    // { 바코드 : {box, name} }

/* ============================================================
   모달 표시 + 사운드
============================================================ */
function showNoticeModal(text) {
  if (!text) return;

  playSafe(snd_modal);

  currentNotice = text;
  noticeText.textContent = text;
  noticeModal.classList.remove("hidden");
}

noticeCloseBtn.addEventListener("click", () => {
  noticeModal.classList.add("hidden");
  barcodeInput.focus();
});

/* ============================================================
   인보이스 조회 → 상단 + 목록 + 특이사항
============================================================ */
btnLoadInv.addEventListener("click", loadInvoice);
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

    if (!json.ok) {
      alert(json.message || "인보이스 없음");
      return;
    }

    const row = json.data;

    inv_no.textContent = row["인보이스"] || "-";
    country.textContent = row["국가"] || "-";
    containerEl.textContent = row["컨테이너"] || "-";
    cbm.textContent = row["CBM"] || "-";
    qty.textContent = Number(row["출고"] || 0).toLocaleString();
    load_time.textContent = row["상차시간"] || "-";
    load_loc.textContent = row["상차위치"] || "-";

    // 🔔 특이사항 자동 팝업
    if (row["특이사항"]?.trim()) {
      showNoticeModal(row["특이사항"]);
    }

    await loadOutboundItems(inv);
    barcodeInput.focus();
  } catch (err) {
    console.error(err);
    alert("서버 오류 또는 네트워크 오류");
  }
}

/* ============================================================
   출고 검수 목록 로드
============================================================ */
async function loadOutboundItems(inv) {
  try {
    // 바코드 index 먼저 로드해야 정확히 매칭됨
    await loadBarcodeIndex();

    const res = await fetch(`/api/outbound_items?inv=${inv}`);
    const json = await res.json();
    if (!json.ok) {
      alert("출고 검수 목록 로드 실패");
      return;
    }

    outboundItems = json.items.map(it => ({
      ...it,
      scanned: 0,
      status: "미검수",
    }));

    renderOutboundTable();
    updateProgress();
  } catch (err) {
    console.error(err);
    alert("출고 목록 호출 오류");
  }
}

/* ============================================================
   바코드 테이블 로드 (자재번호 + 박스번호 매칭용)
============================================================ */
async function loadBarcodeIndex() {
  const res = await fetch(`/api/barcode_table`);
  const json = await res.json();

  if (!json.ok) {
    alert("바코드 매핑 테이블 오류");
    return;
  }

  barcodeIndexByMat = {};
  barcodeIndexByCode = {};

  json.rows.forEach(r => {
    const mat = (r.mat || "").trim();
    const box = (r.box || "").trim();
    const name = r.name || "";
    const barcode = (r.barcode || "").trim();

    if (mat && barcode) {
      barcodeIndexByMat[mat] = { box, name, barcode };
      barcodeIndexByCode[barcode] = { box, name };
    }
  });
}

/* ============================================================
   출고 검수 목록 렌더링
============================================================ */
function renderOutboundTable() {
  scanTableBody.innerHTML = "";

  outboundItems.forEach(item => {
    let cls = "";

    if (item.status === "완료") cls = "bg-emerald-50";
    if (item.status === "초과") cls = "bg-red-50";
    if (item.status === "진행중") cls = "bg-sky-50";

    if (item.barcode === lastScannedBarcode) {
      cls += " ring-2 ring-amber-400";
    }

    const diff = item.sap - item.wms;

    const tr = document.createElement("tr");
    tr.className = cls;

    tr.innerHTML = `
      <td class="px-2 py-1">${item.no}</td>
      <td class="px-2 py-1 whitespace-nowrap">${item.mat}</td>
      <td class="px-2 py-1 whitespace-nowrap">${item.box}</td>
      <td class="px-2 py-1 whitespace-nowrap">${item.name}</td>
      <td class="px-2 py-1 text-right">${item.sap}</td>
      <td class="px-2 py-1 text-right">${item.wms}</td>
      <td class="px-2 py-1 text-right">${diff}</td>
      <td class="px-2 py-1">${item.barcode}</td>
      <td class="px-2 py-1">${item.status}</td>
    `;

    scanTableBody.appendChild(tr);
  });
}

/* ============================================================
   스캔 처리
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

  const existed = scannedCodesSet.has(code);
  scannedCodesSet.add(code);

  const idx = outboundItems.findIndex(it => it.barcode === code);
  const item = idx >= 0 ? outboundItems[idx] : null;

  /* ❌ 미등록 */
  if (!item) {
    error_count.textContent = Number(error_count.textContent) + 1;

    let detail = `[미등록] 바코드: ${code}`;
    const meta = barcodeIndexByCode[code];
    if (meta) {
      detail += ` / 박스번호:${meta.box} / ${meta.name}`;
    }

    recentScanStatus.textContent = "미등록";
    recentScanStatus.className = "text-lg font-bold text-red-600";
    recentScanDetail.textContent = detail;

    scanHistory.push({ code, type: "error", meta });

    playSafe(snd_error);
    renderScanList();
    updateProgress();
    return;
  }

  /* 정상 스캔 */
  lastScannedBarcode = code;
  item.scanned++;

  const sapQty = item.sap;

  if (item.scanned < sapQty) {
    item.status = "진행중";
  } else if (item.scanned === sapQty) {
    item.status = "완료";
  } else {
    item.status = "초과";
  }

  /* 상태별 UI + 사운드 */
  if (existed) {
    recentScanStatus.textContent = "중복";
    recentScanStatus.className = "text-lg font-bold text-amber-600";
    playSafe(snd_dup);
  } else if (item.status === "초과") {
    recentScanStatus.textContent = "초과";
    recentScanStatus.className = "text-lg font-bold text-red-600";
    playSafe(snd_error);
  } else {
    recentScanStatus.textContent = "정상";
    recentScanStatus.className = "text-lg font-bold text-green-600";
    playSafe(snd_ok);
  }

  recentScanDetail.textContent =
    `${code} / 박스:${item.box} / ${item.name} / ${item.scanned}/${sapQty}`;

  scanHistory.push({ code, type: existed ? "dup" : "ok", item });
  renderScanList();
  renderOutboundTable();
  updateProgress();
}

/* ============================================================
   스캔 목록 표시
============================================================ */
function renderScanList() {
  if (scanHistory.length === 0) {
    scanList.innerHTML = `<div class="text-slate-400">아직 스캔 없음…</div>`;
    return;
  }

  scanList.innerHTML = "";

  scanHistory.forEach(h => {
    let cls = "";
    if (h.type === "error") cls = "text-red-600";
    if (h.type === "dup") cls = "text-amber-700";
    if (h.type === "ok") cls = "text-green-700";

    let text = h.code;
    if (h.item) text += ` (${h.item.box}) - ${h.item.name}`;
    if (h.meta && !h.item) text += ` (${h.meta.box}) - ${h.meta.name}`;

    scanList.innerHTML += `<div class="${cls}">${text}</div>`;
  });
}

/* ============================================================
   진행률 업데이트
============================================================ */
function updateProgress() {
  const total = outboundItems.length;
  const completed = outboundItems.filter(
    it => it.scanned >= it.sap && it.sap > 0
  ).length;

  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;

  progress_now.textContent = completed;
  progress_total.textContent = `/ ${total} 품목`;
  progress_percent.textContent = `${percent}%`;
  progress_bar.style.width = `${percent}%`;

  dup_count.textContent = scanHistory.filter(h => h.type === "dup").length;
}

/* ============================================================
   초기화
============================================================ */
function resetUI() {
  scannedCodesSet.clear();
  scanHistory = [];
  outboundItems = [];
  lastScannedBarcode = null;

  inv_no.textContent = "-";
  country.textContent = "-";
  containerEl.textContent = "-";
  cbm.textContent = "-";
  qty.textContent = "-";
  load_time.textContent = "-";
  load_loc.textContent = "-";

  recentScanStatus.textContent = "-";
  recentScanDetail.textContent = "";

  scanList.innerHTML = `<div class="text-slate-400">아직 스캔 없음…</div>`;
  scanTableBody.innerHTML = "";

  progress_now.textContent = "0";
  progress_total.textContent = "/ 0 품목";
  progress_percent.textContent = "0%";
  progress_bar.style.width = "0%";
  dup_count.textContent = "0";
  error_count.textContent = "0";
}
