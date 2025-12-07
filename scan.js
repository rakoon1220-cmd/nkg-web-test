/* ============================================================
   출고검수 스캔 - 2025 최신 안정판 (FULL 리빌드 버전)
   - SAP 문서 조회 (sap_doc)
   - 출고검수 목록 (outbound_items)
   - 바코드 전체 테이블 로드 (barcode_table)
   - 스캔 기능: 정상 / 완료 / 초과 / 중복 / 미등록
   - 색상 강조 / 사운드 / 진행률 / 마지막 스캔 강조
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
const progress_percent = document.getElementById("progress_percent");
const progress_bar = document.getElementById("progress_bar");

const error_count = document.getElementById("error_count");
const dup_count = document.getElementById("dup_count");

const scanList = document.getElementById("scanList");
const scanTableBody = document.getElementById("scanTableBody");

const noticeModal = document.getElementById("noticeModal");
const noticeText = document.getElementById("noticeText");
const noticeCloseBtn = document.getElementById("noticeCloseBtn");

/* ===== 사운드 ===== */
let soundOk, soundDup, soundError, soundModal;
if (!IS_FILE) {
  soundOk = new Audio("/sound/ok.mp3");
  soundDup = new Audio("/sound/dup.mp3");
  soundError = new Audio("/sound/error.mp3");
  soundModal = new Audio("/sound/modal.mp3");
}

function playSound(audio) {
  if (!audio) return;
  audio.currentTime = 0;
  audio.play().catch(()=>{});
}

/* ===== 데이터 ===== */
let currentNotice = "";
let outboundItems = [];
let barcodeIndexByCode = {};
let scanHistory = [];
let scannedCodesSet = new Set();
let errorCountValue = 0;
let dupCountValue = 0;
let lastScannedBarcode = null;

/* ============================================================
   특이사항 모달
============================================================ */
function showNoticeModal(text) {
  if (!text) return;

  playSound(soundModal);

  currentNotice = text;
  noticeText.textContent = text;
  noticeModal.classList.remove("hidden");
}

noticeCloseBtn.addEventListener("click", () => {
  noticeModal.classList.add("hidden");
  barcodeInput.focus();
});

btnNoticeOpen.addEventListener("click", () => {
  if (!currentNotice) return alert("특이사항이 없습니다.");
  showNoticeModal(currentNotice);
});

/* ============================================================
   바코드 전체 테이블 로드
============================================================ */
async function loadBarcodeTable() {
  if (IS_FILE) return;

  try {
    const res = await fetch(`${API_BASE}/api/barcode_table`);
    const json = await res.json();
    if (!json.ok) return;

    barcodeIndexByCode = {};
    json.list.forEach(r => {
      if (!r.barcode) return;
      barcodeIndexByCode[r.barcode] = {
        mat: r.mat,
        box: r.box,
        name: r.name
      };
    });
  } catch (err) {
    console.error("BARCODE LOAD ERROR:", err);
  }
}

/* ============================================================
   인보이스 조회
============================================================ */
async function loadInvoice() {
  const inv = invInput.value.trim();
  if (!inv) return alert("인보이스를 입력하세요.");

  resetUI();

  try {
    /* 1) SAP 문서 */
    const resDoc = await fetch(`${API_BASE}/api/sap_doc?inv=${inv}`);
    const jsonDoc = await resDoc.json();

    if (!jsonDoc.ok) return alert(jsonDoc.message);

    const row = jsonDoc.data;

    inv_no.textContent = row["인보이스"] || "-";
    country.textContent = row["국가"] || "-";
    containerEl.textContent = row["컨테이너"] || "-";
    cbm.textContent = row["CBM"] || "-";
    qty.textContent = row["출고"] || "-";
    load_time.textContent = row["상차시간"] || "-";
    load_loc.textContent = row["상차위치"] || "-";

    if (row["특이사항"]?.trim()) showNoticeModal(row["특이사항"]);

    /* 2) 출고 검수 목록 */
    const resItems = await fetch(`${API_BASE}/api/outbound_items?inv=${inv}`);
    const jsonItems = await resItems.json();

    if (!jsonItems.ok) return alert(jsonItems.message);

    outboundItems = jsonItems.items.map(it => ({
      ...it,
      status: "미완료",
      dup: false
    }));

    outboundItems.forEach(i => {
      i.compare = Number(i.sap) - Number(i.wms);
    });

    renderOutboundTable();
    updateProgress();

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

/* ============================================================
   출고 검수 목록 렌더링
============================================================ */
function renderOutboundTable() {
  scanTableBody.innerHTML = "";

  outboundItems.forEach(item => {
    const tr = document.createElement("tr");

    let cls = "";
    if (item.status === "완료") cls += " bg-yellow-50 ";
    if (item.dup) cls += " bg-emerald-50 ";
    if (item.barcode === lastScannedBarcode) cls += " ring-2 ring-amber-400 ";

    tr.className = cls.trim();

    tr.innerHTML = `
      <td class="px-3 py-2 whitespace-nowrap">${item.no}</td>
      <td class="px-3 py-2 whitespace-nowrap">${item.mat}</td>
      <td class="px-3 py-2 whitespace-nowrap">${item.box}</td>
      <td class="px-3 py-2 whitespace-nowrap">${item.name}</td>
      <td class="px-3 py-2 text-right whitespace-nowrap">${item.sap}</td>
      <td class="px-3 py-2 text-right whitespace-nowrap">${item.wms}</td>
      <td class="px-3 py-2 text-right whitespace-nowrap">${item.compare}</td>
      <td class="px-3 py-2 whitespace-nowrap">${item.barcode}</td>
      <td class="px-3 py-2 whitespace-nowrap">${item.status}</td>
    `;

    scanTableBody.appendChild(tr);
  });

  progress_total.textContent = `/ ${outboundItems.length} 품목`;
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

  const idx = outboundItems.findIndex(i => i.barcode === code);
  const item = idx >= 0 ? outboundItems[idx] : null;

  /* ========== 미등록 바코드 ========== */
  if (!item) {
    errorCountValue++;
    const meta = barcodeIndexByCode[code];

    let detail = `[미등록] ${code}`;
    if (meta) detail += ` / 박스:${meta.box} / ${meta.name}`;

    recentScanStatus.textContent = "미등록";
    recentScanStatus.className = "text-lg font-bold text-red-600";
    recentScanDetail.textContent = detail;

    scanHistory.push({ code, type: "error", meta });

    playSound(soundError);
    renderScanList();
    updateProgress();
    return;
  }

  /* ========== 정상 품목 스캔 ========== */
  lastScannedBarcode = code;

  if (!item.scanned) item.scanned = 0;
  item.scanned++;

  if (item.status === "완료") {
    dupCountValue++;
    item.dup = true;

    recentScanStatus.textContent = "중복";
    recentScanStatus.className = "text-lg font-bold text-amber-600";
    recentScanDetail.textContent = `[중복] ${code} / ${item.box} / ${item.name}`;

    scanHistory.push({ code, type: "dup", item });
    playSound(soundDup);
  } else {
    if (item.scanned < item.sap) item.status = "진행중";
    else if (item.scanned === item.sap) item.status = "완료";
    else item.status = "초과";

    recentScanStatus.textContent = item.status;
    recentScanStatus.className =
      item.status === "완료"
        ? "text-lg font-bold text-green-600"
        : item.status === "초과"
        ? "text-lg font-bold text-red-600"
        : "text-lg font-bold text-amber-600";

    recentScanDetail.textContent = `${code} / 박스:${item.box} / ${item.name}`;

    scanHistory.push({ code, type: existed ? "dup" : "ok", item });

    playSound(
      existed ? soundDup :
      item.status === "초과" ? soundError :
      soundOk
    );
  }

  renderOutboundTable();
  renderScanList();
  updateProgress();
}

/* ============================================================
   스캔 목록 렌더링
============================================================ */
function renderScanList() {
  if (scanHistory.length === 0) {
    scanList.innerHTML = `<div class="text-slate-400">아직 스캔 없음…</div>`;
    return;
  }

  scanList.innerHTML = "";

  scanHistory.slice().reverse().forEach(s => {
    let text = "";
    let cls = "";

    if (s.type === "ok") {
      cls = "text-green-700";
      text = `✅ ${s.code} (${s.item.box}) - ${s.item.name}`;
    } else if (s.type === "dup") {
      cls = "text-amber-700";
      text = `🔁 중복: ${s.code} (${s.item.box}) - ${s.item.name}`;
    } else if (s.type === "error") {
      cls = "text-red-600";
      text = s.meta
        ? `⛔ 미등록: ${s.code} / 박스:${s.meta.box} / ${s.meta.name}`
        : `⛔ 미등록: ${s.code} / 바코드표에도 없음`;
    }

    const div = document.createElement("div");
    div.className = cls;
    div.textContent = text;
    scanList.appendChild(div);
  });
}

/* ============================================================
   진행률 업데이트
============================================================ */
function updateProgress() {
  const total = outboundItems.length;
  const done = outboundItems.filter(i => i.status === "완료").length;

  progress_now.textContent = done;
  progress_total.textContent = `/ ${total} 품목`;

  const percent = total ? Math.round((done / total) * 100) : 0;
  progress_percent.textContent = `${percent}%`;
  progress_bar.style.width = `${percent}%`;

  error_count.textContent = errorCountValue;
  dup_count.textContent = dupCountValue;
}

/* ============================================================
   초기화
============================================================ */
function resetUI() {
  outboundItems = [];
  barcodeIndexByCode = {};
  scanHistory = [];
  scannedCodesSet = new Set();
  lastScannedBarcode = null;
  errorCountValue = 0;
  dupCountValue = 0;

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
  progress_percent.textContent = "0%";
  progress_bar.style.width = "0%";
  progress_total.textContent = "/ 0 품목";

  error_count.textContent = "0";
  dup_count.textContent = "0";

  recentScanStatus.textContent = "-";
  recentScanDetail.textContent = "";
}

/* ============================================================
   초기 실행
============================================================ */
loadBarcodeTable();
