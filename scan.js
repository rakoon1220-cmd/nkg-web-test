/* ============================================================
   출고검수 스캔 - 최종 안정판
   (색상규칙 강화 + 상태 단순화 + 중복 + 미등록 + 바코드미등록 + 사운드)
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

/* ===== 모달 ===== */
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

function playSound(a) {
  if (!a) return;
  a.currentTime = 0;
  a.play().catch(() => {});
}

/* ===== 상태 ===== */
let currentNotice = "";
let outboundItems = [];
let scanHistory = [];
let scannedCodesSet = new Set();
let dupCountValue = 0;
let errorCountValue = 0;
let lastScannedBarcode = null;

// 바코드 테이블(미등록 바코드 상세 표시용)
let barcodeIndexByCode = {};

/* ------------------------------------------------------------
   바코드 전체 표 로드
------------------------------------------------------------ */
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
        name: r.name,
      };
    });
  } catch (err) {
    console.error("BARCODE LOAD ERROR:", err);
  }
}

/* ------------------------------------------------------------
   SAP 문서 조회 + 출고목록 불러오기
------------------------------------------------------------ */
async function loadInvoice() {
  const inv = invInput.value.trim();
  if (!inv) {
    alert("인보이스를 입력하세요.");
    return;
  }

  resetUI();

  try {
    /* ===== 1) SAP 문서 ===== */
    const resDoc = await fetch(`${API_BASE}/api/sap_doc?inv=${encodeURIComponent(inv)}`);
    const jsonDoc = await resDoc.json();

    if (!jsonDoc.ok) {
      alert(jsonDoc.message || "인보이스 조회 실패");
      return;
    }

    const row = jsonDoc.data;

    inv_no.textContent = row["인보이스"] || "-";
    country.textContent = row["국가"] || "-";
    containerEl.textContent = row["컨테이너"] || "-";
    cbm.textContent = row["CBM"] || "-";
    qty.textContent = row["출고"] || "-";
    load_time.textContent = row["상차시간"] || "-";
    load_loc.textContent = row["상차위치"] || "-";

    if (row["특이사항"]?.trim()) {
      currentNotice = row["특이사항"];
      soundModal && playSound(soundModal);
      noticeText.textContent = currentNotice;
      noticeModal.classList.remove("hidden");
    }

    /* ===== 2) 출고 검수 목록 ===== */
    const resItems = await fetch(`${API_BASE}/api/outbound_items?inv=${encodeURIComponent(inv)}`);
    const jsonItems = await resItems.json();

    if (!jsonItems.ok) {
      alert(jsonItems.message || "출고 검수 목록 불러오기 실패");
      return;
    }

    outboundItems = jsonItems.items.map(it => ({
      ...it,
      status: "검수대기",
      dup: false,
    }));

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

/* ------------------------------------------------------------
   compare 표시 규칙 함수 (최종)
------------------------------------------------------------ */
function renderCompare(item) {
  const sap = Number(item.sap);
  const wms = Number(item.wms);
  const compare = Number(item.compare);

  // SAP = 0 → compare 칸 공백
  if (sap === 0) {
    return `<span></span>`;
  }

  // compare = 0 → 입고완료 (초록)
  if (compare === 0) {
    return `<span class="text-green-600 font-semibold">입고완료</span>`;
  }

  // compare = SAP → 미입고 (파랑)
  if (compare === sap) {
    return `<span class="text-blue-600 font-semibold">미입고</span>`;
  }

  // compare < 0 → 초과입고 (음수)
  if (compare < 0) {
    return `<span class="text-blue-600 font-semibold">초과입고</span>`;
  }

  // 0 < compare < SAP → 부분미입고 = 빨강
  if (compare > 0 && compare < sap) {
    return `<span class="text-red-600 font-semibold">${compare} (부분미입고)</span>`;
  }

  return `<span>${compare}</span>`;
}

/* ------------------------------------------------------------
   출고 목록 렌더링 (최종 안정판)
------------------------------------------------------------ */
function renderOutboundTable() {
  scanTableBody.innerHTML = "";

  outboundItems.forEach(item => {
    const tr = document.createElement("tr");

    let cls = "";

    // SAP = 0 → 연빨강
    if (Number(item.sap) === 0) cls += " bg-red-100 ";

    // compare < 0 → 연파랑
    if (Number(item.compare) < 0) cls += " bg-blue-50 ";

    // 스캔 완료 → 연초록
    if (item.status === "검수완료") cls += " bg-green-200 text-green-900 font-semibold ";

    // 중복 스캔 → 연노랑 (최우선)
    if (item.dup) cls += " bg-yellow-100 ";

    // 마지막 스캔 강조
    if (item.barcode === lastScannedBarcode) cls += " ring-2 ring-amber-400 ";

    tr.className = cls.trim();

    // 바코드 미등록 표시
    const barcodeDisplay = item.barcode
      ? item.barcode
      : `<span class="text-red-600 font-semibold">바코드미등록</span>`;

    const workDisplay = (item.work || "").toString().trim() || "-";

    tr.innerHTML = `
      <td class="px-3 py-2 whitespace-nowrap">${item.no}</td>
      <td class="px-3 py-2 whitespace-nowrap">${item.mat}</td>
      <td class="px-3 py-2 whitespace-nowrap">${item.box}</td>
      <td class="px-3 py-2 whitespace-nowrap">${item.name}</td>

      <td class="px-3 py-2 text-right whitespace-nowrap">${item.sap}</td>
      <td class="px-3 py-2 text-right whitespace-nowrap">${item.wms}</td>

      <td class="px-3 py-2 text-right whitespace-nowrap">
        ${renderCompare(item)}
      </td>

      <td class="px-3 py-2 whitespace-nowrap">${workDisplay}</td>

      <td class="px-3 py-2 whitespace-nowrap">${barcodeDisplay}</td>
      <td class="px-3 py-2 whitespace-nowrap">${item.status}</td>
    `;

    scanTableBody.appendChild(tr);
  });

  progress_total.textContent = `/ ${outboundItems.length} 품목`;
}

/* ------------------------------------------------------------
   스캔 처리
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

  const existed = scannedCodesSet.has(code);
  scannedCodesSet.add(code);

  /* 출고 목록 매칭 */
  const idx = outboundItems.findIndex(i => i.barcode === code);
  const item = idx >= 0 ? outboundItems[idx] : null;

  /* ===== 미등록 바코드 ===== */
  if (!item) {
    errorCountValue++;

    const meta = barcodeIndexByCode[code];
    let detail = `[미등록] ${code}`;

    if (meta) {
      detail += ` / 박스:${meta.box} / ${meta.name}`;
    } else {
      detail += ` / 바코드표에도 없음`;
    }

    recentScanStatus.textContent = "미등록";
    recentScanStatus.className = "text-lg font-bold text-red-600";
    recentScanDetail.textContent = detail;

    scanHistory.push({ code, type: "error", meta });
    playSound(soundError);

    renderScanList();
    updateProgress();
    return;
  }

  /* ===== 정상 스캔 ===== */
  lastScannedBarcode = code;

  if (existed) {
    /* ▣ 중복 스캔 */
    dupCountValue++;
    item.dup = true;

    recentScanStatus.textContent = "중복";
    recentScanStatus.className = "text-lg font-bold text-amber-600";
    recentScanDetail.textContent = `${code} / 박스:${item.box} / ${item.name}`;

    scanHistory.push({ code, type: "dup", item });
    playSound(soundDup);
  } else {
    /* ▣ 정상 → 검수완료 */
    item.status = "검수완료";
    item.dup = false;

    recentScanStatus.textContent = "검수완료";
    recentScanStatus.className = "text-lg font-bold text-green-600";
    recentScanDetail.textContent = `${code} / 박스:${item.box} / ${item.name}`;

    scanHistory.push({ code, type: "ok", item });
    playSound(soundOk);
  }

  renderOutboundTable();
  renderScanList();
  updateProgress();
}

/* ------------------------------------------------------------
   스캔 목록
------------------------------------------------------------ */
function renderScanList() {
  if (scanHistory.length === 0) {
    scanList.innerHTML = `<div class="text-slate-400">아직 스캔 없음…</div>`;
    return;
  }

  scanList.innerHTML = "";

  scanHistory.slice().reverse().forEach(entry => {
    const div = document.createElement("div");

    if (entry.type === "ok") {
      div.className = "text-green-700";
      div.textContent = `✅ [완료] ${entry.code} (${entry.item.box}) - ${entry.item.name}`;
    }
    else if (entry.type === "dup") {
      div.className = "text-amber-700";
      div.textContent = `🔁 [중복] ${entry.code} (${entry.item.box}) - ${entry.item.name}`;
    }
    else {
      div.className = "text-red-600";
      if (entry.meta)
        div.textContent = `⛔ [미등록] ${entry.code} / 박스:${entry.meta.box} / ${entry.meta.name}`;
      else
        div.textContent = `⛔ [미등록] ${entry.code} (바코드표 없음)`;
    }

    scanList.appendChild(div);
  });
}

/* ------------------------------------------------------------
   진행률 갱신
------------------------------------------------------------ */
function updateProgress() {
  const total = outboundItems.length;
  const completed = outboundItems.filter(it => it.status === "검수완료").length;

  progress_now.textContent = completed;
  progress_total.textContent = `/ ${total} 품목`;

  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;

  progress_percent.textContent = percent + "%";
  progress_bar.style.width = percent + "%";

  error_count.textContent = errorCountValue;
  dup_count.textContent = dupCountValue;
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

  outboundItems = [];
  scanHistory = [];
  scannedCodesSet = new Set();
  dupCountValue = 0;
  errorCountValue = 0;
  lastScannedBarcode = null;

  scanTableBody.innerHTML = "";
  scanList.innerHTML = `<div class="text-slate-400">아직 스캔 없음…</div>`;

  progress_now.textContent = "0";
  progress_total.textContent = "/ 0 품목";
  progress_percent.textContent = "0%";
  progress_bar.style.width = "0%";

  error_count.textContent = "0";
  dup_count.textContent = "0";

  recentScanStatus.textContent = "-";
  recentScanDetail.textContent = "";
}

/* ------------------------------------------------------------
   초기 실행
------------------------------------------------------------ */
if (!IS_FILE) loadBarcodeTable();

noticeCloseBtn.addEventListener("click", () => {
  noticeModal.classList.add("hidden");
  barcodeInput.focus();
});
btnNoticeOpen.addEventListener("click", () => {
  if (!currentNotice) return alert("특이사항이 없습니다.");
  soundModal && soundModal.play();
  noticeText.textContent = currentNotice;
  noticeModal.classList.remove("hidden");
});
