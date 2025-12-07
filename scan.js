/* ============================================================
   출고검수 스캔 - 최종 안정판
   - 인보이스 조회 (sap_doc)
   - 출고 검수 목록 로드 (outbound_items)
   - 바코드 전체 테이블 로드 (barcode_table)
   - 스캔 매핑 / 완료 상태 / 중복 / 미등록 / 진행률 / 사운드
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
const progress_percent = document.getElementById("progress_percent");

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
  soundOk = new Audio("/sound/ok.wav");
  soundDup = new Audio("/sound/dup.wav");
  soundError = new Audio("/sound/error.wav");
  soundModal = new Audio("/sound/modal.wav");
}

/* ===== 상태 ===== */
let currentNotice = "";
let outboundItems = [];   // 출고 검수 목록
let scanHistory = [];     // [{code, type, item, meta}]
let scannedCodesSet = new Set(); // 중복 체크
let dupCountValue = 0;
let errorCountValue = 0;
let lastScannedBarcode = null;

// 바코드 전체 테이블 (미등록 상세 표기용)
let barcodeIndexByCode = {}; // barcode → {mat, box, name}

/* ------------------------------------------------------------
   공통 유틸
------------------------------------------------------------ */
function playSafe(audio) {
  if (!audio) return;
  audio.currentTime = 0;
  audio.play().catch(() => {});
}

/* ===== 모달 표시 ===== */
function showNoticeModal(text) {
  if (!text) return;
  currentNotice = text;
  noticeText.textContent = text;
  noticeModal.classList.remove("hidden");
  playSafe(soundModal);
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
   바코드 전체 테이블 로드
------------------------------------------------------------ */
async function loadBarcodeTable() {
  if (IS_FILE) return; // file 모드는 생략

  try {
    const res = await fetch(`${API_BASE}/api/barcode_table`);
    const json = await res.json();
    if (!json.ok) return;

    barcodeIndexByCode = {};
    (json.list || []).forEach(row => {
      if (!row.barcode) return;
      barcodeIndexByCode[row.barcode] = {
        mat: row.mat,
        box: row.box,
        name: row.name,
      };
    });
  } catch (err) {
    console.error("BARCODE TABLE LOAD ERROR:", err);
  }
}

/* ------------------------------------------------------------
   인보이스 조회
------------------------------------------------------------ */
async function loadInvoice() {
  const inv = invInput.value.trim();
  if (!inv) {
    alert("인보이스를 입력하세요.");
    return;
  }

  resetUI();

  // file 모드는 테스트용만
  if (IS_FILE) {
    inv_no.textContent = inv;
    country.textContent = "테스트국가";
    containerEl.textContent = "40FT";
    cbm.textContent = "28.5";
    qty.textContent = "1450";
    load_time.textContent = "07:30";
    load_loc.textContent = "A02";

    currentNotice = "테스트 특이사항입니다.\n실제 서버 환경에서는 SAP 문서의 특이사항이 표시됩니다.";
    showNoticeModal(currentNotice);

    // 테스트용 더미 아이템
    outboundItems = [
      {
        invKey: "TEST_1",
        no: "1",
        mat: "2141971",
        box: "001",
        name: "올인원 KBBQ 간장",
        sap: 100,
        wms: 100,
        compare: 0,
        unit: "BOX",
        barcode: "2141971001",
        status: "미완료",
        dup: false,
      },
    ];
    renderOutboundTable();
    updateProgress();
    barcodeInput.focus();
    return;
  }

  try {
    // 1) 상단 SAP 문서
    const resDoc = await fetch(`${API_BASE}/api/sap_doc?inv=${encodeURIComponent(inv)}`);
    const jsonDoc = await resDoc.json();

    if (!jsonDoc.ok) {
      alert(jsonDoc.message || "인보이스 정보를 찾을 수 없습니다.");
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

    if (row["특이사항"] && row["특이사항"].trim() !== "") {
      currentNotice = row["특이사항"];
      showNoticeModal(currentNotice);
    }

    // 2) 출고 검수 목록
    const resItems = await fetch(`${API_BASE}/api/outbound_items?inv=${encodeURIComponent(inv)}`);
    const jsonItems = await resItems.json();

    if (!jsonItems.ok) {
      alert(jsonItems.message || "출고 품목 목록을 불러오지 못했습니다.");
      return;
    }

    outboundItems = (jsonItems.items || []).map(it => ({
      ...it,
      status: it.status || "미완료",
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
   출고 검수 테이블 렌더링
------------------------------------------------------------ */
function renderOutboundTable() {
  scanTableBody.innerHTML = "";

  outboundItems.forEach(item => {
    const tr = document.createElement("tr");

    let rowClass = "";

    if (item.status === "완료") {
      rowClass += " bg-yellow-50";
    }

    if (item.dup) {
      // 중복 스캔된 항목은 연한 초록
      rowClass += " bg-emerald-50";
    }

    if (item.barcode && item.barcode === lastScannedBarcode) {
      rowClass += " ring-2 ring-amber-400";
    }

    tr.className = rowClass.trim();

    tr.innerHTML = `
      <td class="px-3 py-2 whitespace-nowrap">${item.no || ""}</td>
      <td class="px-3 py-2 whitespace-nowrap">${item.mat || ""}</td>
      <td class="px-3 py-2 whitespace-nowrap">${item.box || ""}</td>
      <td class="px-3 py-2 whitespace-nowrap">${item.name || ""}</td>
      <td class="px-3 py-2 text-right whitespace-nowrap">${item.sap ?? ""}</td>
      <td class="px-3 py-2 text-right whitespace-nowrap">${item.wms ?? ""}</td>
      <td class="px-3 py-2 text-right whitespace-nowrap">${item.compare ?? ""}</td>
      <td class="px-3 py-2 whitespace-nowrap">${item.barcode || ""}</td>
      <td class="px-3 py-2 whitespace-nowrap">${item.status || ""}</td>
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

  const idx = outboundItems.findIndex(it => it.barcode === code);
  const item = idx >= 0 ? outboundItems[idx] : null;

  if (!item) {
    // ▣ 출고 목록에 없는 바코드 → 미등록
    errorCountValue++;

    let detail = `[미등록] 바코드: ${code}`;
    const meta = barcodeIndexByCode[code];
    if (meta) {
      detail += ` / 박스번호: ${meta.box || "-"} / ${meta.name || ""}`;
    }

    recentScanStatus.textContent = "미등록";
    recentScanStatus.className = "text-lg font-bold text-red-600";
    recentScanDetail.textContent = detail;

    scanHistory.push({
      code,
      type: "error",
      item: null,
      meta,
    });

    playSafe(soundError);
    renderScanList();
    updateProgress();
    return;
  }

  // 출고 목록에 있는 바코드
  lastScannedBarcode = code;

  if (item.status === "완료") {
    // 이미 완료된 박스 → 중복
    dupCountValue++;
    item.dup = true;

    recentScanStatus.textContent = "중복";
    recentScanStatus.className = "text-lg font-bold text-amber-600";
    recentScanDetail.textContent =
      `[중복] 바코드: ${code} / 박스번호: ${item.box || "-"} / ${item.name || ""}`;

    scanHistory.push({
      code,
      type: "dup",
      item,
      meta: null,
    });

    playSafe(soundDup);
  } else {
    // 처음 완료
    item.status = "완료";
    item.dup = false;

    recentScanStatus.textContent = "완료";
    recentScanStatus.className = "text-lg font-bold text-green-600";
    recentScanDetail.textContent =
      `바코드: ${code} / 박스번호: ${item.box || "-"} / ${item.name || ""}`;

    scanHistory.push({
      code,
      type: "ok",
      item,
      meta: null,
    });

    playSafe(soundOk);
  }

  outboundItems[idx] = item;

  renderOutboundTable();
  renderScanList();
  updateProgress();
}

/* ------------------------------------------------------------
   스캔 리스트 표시
------------------------------------------------------------ */
function renderScanList() {
  if (scanHistory.length === 0) {
    scanList.innerHTML = `<div class="text-slate-400">아직 스캔 없음…</div>`;
    return;
  }

  scanList.innerHTML = "";

  scanHistory.slice().reverse().forEach(entry => {
    let text = "";
    let cls = "";

    if (entry.type === "ok") {
      cls = "text-green-700";
      text = `✅ [완료] ${entry.code} (${entry.item?.box || "-"}) - ${entry.item?.name || ""}`;
    } else if (entry.type === "dup") {
      cls = "text-amber-700";
      text = `🔁 [중복] ${entry.code} (${entry.item?.box || "-"}) - ${entry.item?.name || ""}`;
    } else if (entry.type === "error") {
      cls = "text-red-600";
      if (entry.meta) {
        text = `⛔ [미등록] ${entry.code} (바코드표 등록) 박스:${entry.meta.box || "-"} / ${entry.meta.name || ""}`;
      } else {
        text = `⛔ [미등록] ${entry.code} (바코드표에도 없음)`;
      }
    }

    const div = document.createElement("div");
    div.className = cls;
    div.textContent = text;
    scanList.appendChild(div);
  });
}

/* ------------------------------------------------------------
   진행률 업데이트
------------------------------------------------------------ */
function updateProgress() {
  const totalItems = outboundItems.length;
  const completedItems = outboundItems.filter(it => it.status === "완료").length;

  progress_now.textContent = completedItems.toString();
  progress_total.textContent = `/ ${totalItems} 품목`;

  const percent = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;
  progress_percent.textContent = `${percent}%`;
  progress_bar.style.width = `${percent}%`;

  error_count.textContent = errorCountValue.toString();
  dup_count.textContent = dupCountValue.toString();
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

  scanList.innerHTML = `<div class="text-slate-400">아직 스캔 없음…</div>`;
  scanTableBody.innerHTML = "";

  progress_now.textContent = "0";
  progress_total.textContent = "/ 0 품목";
  progress_percent.textContent = "0%";
  progress_bar.style.width = "0%";

  error_count.textContent = "0";
  dup_count.textContent = "0";

  recentScanStatus.textContent = "-";
  recentScanStatus.className = "text-lg font-bold text-slate-700";
  recentScanDetail.textContent = "";
}

/* ------------------------------------------------------------
   초기 실행
------------------------------------------------------------ */
if (!IS_FILE) {
  loadBarcodeTable();
}
