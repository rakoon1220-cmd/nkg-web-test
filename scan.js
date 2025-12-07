// public/scan.js
/* ============================================================
   출고검수 스캔 - 최종 안정판
   (요약 + 스캔 + 중복 + 미등록 + 팝업 + 매핑 + 진행률 + 사운드)
============================================================ */

const IS_FILE = location.protocol === "file:";

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
const SOUND_BASE = "/sound";

function makeAudio(src) {
  const audio = new Audio(src);
  audio.preload = "auto";
  return audio;
}

const soundOk = makeAudio(`${SOUND_BASE}/ok.wav`);
const soundDup = makeAudio(`${SOUND_BASE}/dup.wav`);
const soundError = makeAudio(`${SOUND_BASE}/error.wav`);
const soundModal = makeAudio(`${SOUND_BASE}/modal.wav`);

function playSound(audio) {
  if (!audio) return;
  audio.currentTime = 0;
  audio.play().catch(() => {});
}

/* ===== 상태 변수 ===== */
let currentNotice = "";
let outboundItems = [];
let scannedCodes = [];
let duplicateCodes = [];
let errorCodes = [];
let lastScannedBarcode = null;

/* ===== 모달 표시 ===== */
function showNoticeModal(text) {
  if (!text) return;
  currentNotice = text;
  noticeText.textContent = text;
  noticeModal.classList.remove("hidden");
  playSound(soundModal);
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

  if (IS_FILE) {
    // 로컬 file 테스트용
    inv_no.textContent = inv;
    country.textContent = "테스트국가";
    containerEl.textContent = "40FT";
    cbm.textContent = "28.5";
    qty.textContent = "1450";
    load_time.textContent = "07:30";
    load_loc.textContent = "A02";

    currentNotice = "테스트 특이사항입니다.\n(실서버에서는 SAP 문서 특이사항이 표시됩니다.)";
    showNoticeModal(currentNotice);

    // 더미 출고 목록
    outboundItems = [
      {
        no: "1",
        mat: "2141971",
        box: "001",
        name: "테스트 품목1",
        sap: 10,
        wms: 10,
        unit: "BOX",
        barcode: "TEST001",
        status: "미검수",
        scanned: 0,
      },
    ];
    renderOutboundTable();
    updateProgress();
    barcodeInput.focus();
    return;
  }

  try {
    // 1) 상단 SAP 문서
    const res = await fetch(`/api/sap_doc?inv=${encodeURIComponent(inv)}`);
    if (!res.ok) throw new Error("sap_doc HTTP " + res.status);
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

    if (row["특이사항"] && row["특이사항"].trim() !== "") {
      showNoticeModal(row["특이사항"]);
    }

    // 2) 출고 품목 목록
    await loadOutboundItems(inv);

    barcodeInput.focus();

  } catch (err) {
    console.error("LOAD_INVOICE ERROR:", err);
    alert("서버 오류 또는 네트워크 오류");
  }
}

btnLoadInv.addEventListener("click", loadInvoice);
invInput.addEventListener("keydown", e => {
  if (e.key === "Enter") loadInvoice();
});

/* ==================================================
   출고 검수 목록 로드 (SAP 자재 + WMS 통합)
================================================== */
async function loadOutboundItems(inv) {
  try {
    const res = await fetch(`/api/outbound_items?inv=${encodeURIComponent(inv)}`);
    if (!res.ok) throw new Error("outbound_items HTTP " + res.status);
    const json = await res.json();

    if (!json.ok) {
      alert(json.message || "출고 품목 목록을 불러오지 못했습니다.");
      return;
    }

    outboundItems = (json.items || []).map(it => ({
      ...it,
      sap: Number(it.sap || 0),
      wms: Number(it.wms || 0),
      scanned: Number(it.scanned || 0),
      status: it.status || "미검수",
      lastScanType: null, // "ok" | "dup" | "error"
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

    let cls = "";

    if (item.status === "완료") {
      cls += " bg-yellow-100";
    }

    if (item.lastScanType === "dup") {
      cls = " bg-emerald-50"; // 중복 스캔 강조
    }

    if (item.barcode === lastScannedBarcode) {
      cls += " ring-2 ring-amber-400";
    }

    tr.className = cls.trim();

    tr.innerHTML = `
      <td class="px-3 py-2 whitespace-nowrap">${item.no || "-"}</td>
      <td class="px-3 py-2 whitespace-nowrap">${item.mat}</td>
      <td class="px-3 py-2 whitespace-nowrap">${item.box}</td>
      <td class="px-3 py-2">${item.name}</td>
      <td class="px-3 py-2 text-right whitespace-nowrap">${item.sap}</td>
      <td class="px-3 py-2 text-right whitespace-nowrap">${item.wms}</td>
      <td class="px-3 py-2 whitespace-nowrap">${item.unit}</td>
      <td class="px-3 py-2 whitespace-nowrap">${item.barcode}</td>
      <td class="px-3 py-2 whitespace-nowrap">${item.status}</td>
    `;

    scanTableBody.appendChild(tr);
  });
}

/* ------------------------------------------------------------
   바코드 스캔 처리
------------------------------------------------------------ */
barcodeInput.addEventListener("keydown", e => {
  if (e.key === "Enter") {
    const code = barcodeInput.value.trim();
    barcodeInput.value = "";
    processScan(code);
  }
});

async function processScan(code) {
  if (!code) return;

  const isDupScan = scannedCodes.includes(code);
  scannedCodes.push(code);

  const idx = outboundItems.findIndex(it => it.barcode === code);
  const item = idx >= 0 ? outboundItems[idx] : null;

  // ---- 출고 목록에 없는 바코드 (미등록) ----
  if (!item) {
    errorCodes.push(code);

    recentScanStatus.textContent = "미등록";
    recentScanStatus.className = "text-lg font-bold text-red-600";

    // 바코드 CSV에서 추가 정보 조회
    let detail = `${code} (출고 목록에 없음)`;

    try {
      if (!IS_FILE) {
        const res = await fetch(`/api/barcode_lookup?code=${encodeURIComponent(code)}`);
        if (res.ok) {
          const json = await res.json();
          if (json.ok && json.data) {
            const b = json.data;
            detail = `${code} (${b.box || "-"}) - ${b.name || "바코드 목록 매칭"}`;
          }
        }
      }
    } catch (err) {
      console.error("BARCODE LOOKUP ERROR:", err);
    }

    recentScanDetail.textContent = detail;
    playSound(soundError);

    renderScanList();
    updateProgress();
    return;
  }

  // ---- 출고 목록에 있는 정상/중복 바코드 ----
  lastScannedBarcode = code;

  if (typeof item.scanned !== "number") item.scanned = 0;
  item.scanned += 1;

  // 상태: SAP 기준 (완료 / 미검수)
  if (item.sap > 0 && item.scanned >= item.sap) {
    item.status = "완료";
  } else {
    item.status = "미검수";
  }

  // 스캔 타입 기록
  if (isDupScan) {
    duplicateCodes.push(code);
    item.lastScanType = "dup";

    recentScanStatus.textContent = "중복";
    recentScanStatus.className = "text-lg font-bold text-amber-600";
    playSound(soundDup);
  } else {
    item.lastScanType = "ok";

    recentScanStatus.textContent = item.status;
    recentScanStatus.className =
      item.status === "완료"
        ? "text-lg font-bold text-emerald-700"
        : "text-lg font-bold text-green-600";
    playSound(soundOk);
  }

  recentScanDetail.textContent =
    `바코드: ${code} / 박스번호: ${item.box} / ${item.name}`;

  outboundItems[idx] = item;

  renderScanList();
  renderOutboundTable();
  updateProgress();
}

/* ------------------------------------------------------------
   스캔 리스트
------------------------------------------------------------ */
function renderScanList() {
  if (scannedCodes.length === 0 && errorCodes.length === 0) {
    scanList.innerHTML = `<div class="text-slate-400">아직 스캔 없음…</div>`;
    return;
  }

  scanList.innerHTML = "";
  const errorSet = new Set(errorCodes);

  scannedCodes.forEach((code, idx) => {
    const firstIdx = scannedCodes.indexOf(code);
    const isDup = firstIdx !== idx;
    const isError = errorSet.has(code);

    let cls = "text-green-700";
    let label = code;

    if (isError) {
      cls = "text-red-600";
      label = `${code} (미등록)`;
    } else if (isDup) {
      cls = "text-amber-700";
      label = `${code} (중복)`;
    } else {
      label = `${code} (정상)`;
    }

    const item = outboundItems.find(it => it.barcode === code);
    if (item) {
      label += ` / ${item.box} / ${item.name}`;
    }

    scanList.innerHTML += `<div class="${cls}">${label}</div>`;
  });
}

/* ------------------------------------------------------------
   진행률 업데이트 (완료 품목 기준 %)
------------------------------------------------------------ */
function updateProgress() {
  const totalScan = scannedCodes.length;
  const uniqueScan = new Set(scannedCodes).size;

  dup_count.textContent = totalScan - uniqueScan;
  error_count.textContent = errorCodes.length;

  const totalItems = outboundItems.length;
  let completedItems = 0;
  if (totalItems > 0) {
    completedItems = outboundItems.filter(
      it => it.sap > 0 && it.scanned >= it.sap
    ).length;
  }

  progress_now.textContent = String(completedItems);
  progress_total.textContent = `/ ${totalItems} 품목`;

  const percent = totalItems > 0
    ? Math.round((completedItems / totalItems) * 100)
    : 0;

  progress_percent.textContent = `${percent}%`;
  progress_bar.style.width = `${percent}%`;
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

  currentNotice = "";
  outboundItems = [];
  scannedCodes = [];
  duplicateCodes = [];
  errorCodes = [];
  lastScannedBarcode = null;

  scanList.innerHTML = `<div class="text-slate-400">아직 스캔 없음…</div>`;
  scanTableBody.innerHTML = "";

  progress_now.textContent = "0";
  progress_total.textContent = "/ 0 품목";
  progress_percent.textContent = "0%";
  progress_bar.style.width = "0%";

  dup_count.textContent = "0";
  error_count.textContent = "0";

  recentScanStatus.textContent = "-";
  recentScanStatus.className = "text-lg font-bold text-slate-700";
  recentScanDetail.textContent = "";
}
