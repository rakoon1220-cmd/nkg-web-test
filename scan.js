/* ============================================================
   출고검수 스캔 - 안정판
   (인보이스 조회 + 특이사항 팝업 + 스캔매핑 + 중복/미등록 + 진행률%)
   - 바코드 매핑 기준: 자재번호 + 박스번호 (바코드 시트 참조)
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

/* ===== 상태 변수 ===== */
let currentNotice = "";
let outboundItems = [];       // 출고 검수 목록 (sap자재자동 기준)
let scannedCodes = [];        // 전체 스캔 바코드
let duplicateCodes = [];      // 중복 스캔 바코드
let errorCodes = [];          // 미등록 바코드
let lastScannedBarcode = null;

// 바코드 → {mat, box, name, barcode} 캐시 (바코드 시트 기준)
const barcodeCache = {};

/* ------------------------------------------------------------
   모달
------------------------------------------------------------ */
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

btnNoticeOpen.addEventListener("click", () => {
  if (!currentNotice) {
    alert("특이사항이 없습니다.");
    return;
  }
  showNoticeModal(currentNotice);
});

/* ------------------------------------------------------------
   바코드 시트 조회 (barcode_lookup API 사용)
   - code: 스캔된 바코드
   - return: {mat, box, name, barcode} 또는 null
------------------------------------------------------------ */
async function lookupBarcode(code) {
  if (!code) return null;
  if (barcodeCache[code]) return barcodeCache[code];

  if (IS_FILE) {
    // 로컬 file:/// 테스트 모드에선 서버 호출 못하니 생략
    return null;
  }

  try {
    const res = await fetch(
      `${API_BASE}/api/barcode_lookup?code=${encodeURIComponent(code)}`
    );
    const json = await res.json();

    if (!json.ok || !json.data) {
      return null;
    }

    barcodeCache[code] = json.data;
    return json.data;
  } catch (err) {
    console.error("BARCODE LOOKUP ERROR:", err);
    return null;
  }
}

/* ------------------------------------------------------------
   인보이스 조회 → 상단 정보 + 특이사항 + 출고목록 로드
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

  try {
    const res = await fetch(
      `${API_BASE}/api/sap_doc?inv=${encodeURIComponent(inv)}`
    );
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

    // 상차시간 키가 약간 달라도 대비
    load_time.textContent =
      row["상차시간"] || row["상차 시간"] || row["상차"] || "-";
    load_loc.textContent = row["상차위치"] || "-";

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
invInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") loadInvoice();
});

/* ============================================================
   출고 검수 목록 로드 (sap자재자동 + wms + 바코드 통합)
   ※ API: /api/outbound_items?inv=xxxx  에서 가져온다고 가정
============================================================ */
async function loadOutboundItems(inv) {
  if (IS_FILE) {
    outboundItems = [];
    renderOutboundTable();
    updateProgress();
    return;
  }

  try {
    const res = await fetch(
      `${API_BASE}/api/outbound_items?inv=${encodeURIComponent(inv)}`
    );
    const json = await res.json();

    if (!json.ok) {
      alert("출고 품목 목록을 불러오지 못했습니다.");
      return;
    }

    outboundItems = (json.items || []).map((it) => ({
      ...it,
      sap: Number(it.sap || 0),
      wms: Number(it.wms || 0),
      scanned: Number(it.scanned || 0),
      status: it.status || "미검수",
    }));

    // 번호 오름차순 정렬
    outboundItems.sort((a, b) => {
      const na = Number(a.no || a.번호 || 0);
      const nb = Number(b.no || b.번호 || 0);
      return na - nb;
    });

    renderOutboundTable();
    updateProgress();
  } catch (err) {
    console.error("OUTBOUND LOAD ERROR:", err);
    alert("출고 품목 목록 호출 중 오류");
  }
}

/* ============================================================
   출고 검수 테이블 렌더링
============================================================ */
function renderOutboundTable() {
  scanTableBody.innerHTML = "";

  outboundItems.forEach((item) => {
    const tr = document.createElement("tr");

    // 상태별 색상
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
      <td class="px-3 py-2 whitespace-nowrap">${item.no || item.번호 || "-"}</td>
      <td class="px-3 py-2 whitespace-nowrap">${item.mat || ""}</td>
      <td class="px-3 py-2 whitespace-nowrap">${item.box || ""}</td>
      <td class="px-3 py-2 whitespace-nowrap">${item.name || ""}</td>
      <td class="px-3 py-2 text-right whitespace-nowrap">${item.sap}</td>
      <td class="px-3 py-2 text-right whitespace-nowrap">${item.wms}</td>
      <td class="px-3 py-2 whitespace-nowrap">${item.unit || ""}</td>
      <td class="px-3 py-2 whitespace-nowrap">${item.barcode || ""}</td>
      <td class="px-3 py-2 whitespace-nowrap">${item.status || "미검수"}</td>
    `;

    scanTableBody.appendChild(tr);
  });

  progress_total.textContent = `/ ${outboundItems.length} 품목`;
}

/* ============================================================
   스캔 처리 (자재번호 + 박스번호 매칭)
============================================================ */

barcodeInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    const code = barcodeInput.value.trim();
    barcodeInput.value = "";
    processScan(code);
  }
});

async function processScan(code) {
  if (!code) return;

  const isDupCode = scannedCodes.includes(code);
  scannedCodes.push(code);

  // 1단계: 출고목록에서 직접 바코드 매칭 (대표 바코드)
  let idx = outboundItems.findIndex((it) => it.barcode === code);
  let item = idx >= 0 ? outboundItems[idx] : null;

  // 2단계: 바코드 시트에서 조회 → 자재번호 + 박스번호 기준으로 출고목록 매칭
  let bcInfo = null;
  if (!item && !IS_FILE) {
    bcInfo = await lookupBarcode(code);

    if (bcInfo) {
      const matKey = (bcInfo.mat || "").toString().trim();
      const boxKey = (bcInfo.box || "").toString().trim();

      idx = outboundItems.findIndex((it) => {
        const mat = (it.mat || "").toString().trim();
        const box = (it.box || "").toString().trim();
        return mat === matKey && box === boxKey;
      });

      if (idx >= 0) {
        item = outboundItems[idx];
        // 대표 바코드가 비어 있으면 이번 스캔 바코드를 대표로 세팅
        if (!item.barcode) {
          item.barcode = code;
        }
      }
    }
  }

  // 3단계: 출고목록에도 없고, 바코드시트에도 없으면 → 완전 미등록
  if (!item) {
    errorCodes.push(code);
    recentScanStatus.textContent = "미등록";
    recentScanStatus.className = "text-lg font-bold text-red-600";

    if (bcInfo) {
      // 바코드 시트에는 있음 → 품목 정보만 안내
      recentScanDetail.textContent =
        `바코드: ${code} / 박스번호: ${bcInfo.box || "-"} / ${bcInfo.name || "-"}` +
        " (현재 출고 검수 목록에는 없음)";
    } else {
      recentScanDetail.textContent = `${code} (바코드 시트에도 없음)`;
    }

    renderScanList();
    updateProgress();
    return;
  }

  // === 여기부터는 "정상적으로 매칭된 출고 품목" ===
  lastScannedBarcode = code;

  if (typeof item.scanned !== "number") item.scanned = 0;
  item.scanned += 1;

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

  // 최근 스캔 상태 색상
  if (!isDupCode && statusText !== "초과") {
    recentScanStatus.textContent = "정상";
    recentScanStatus.className = "text-lg font-bold text-green-600";
  } else if (statusText === "초과") {
    recentScanStatus.textContent = "초과";
    recentScanStatus.className = "text-lg font-bold text-red-600";
  } else {
    duplicateCodes.push(code);
    recentScanStatus.textContent = "중복";
    recentScanStatus.className = "text-lg font-bold text-emerald-700";
  }

  // 상세 메시지: 바코드 / 박스번호 / 자재내역 / 스캔 vs SAP
  const boxLabel = item.box || (bcInfo && bcInfo.box) || "";
  const nameLabel = item.name || (bcInfo && bcInfo.name) || "";

  recentScanDetail.textContent =
    `바코드: ${code} / 박스번호: ${boxLabel} / ${nameLabel}` +
    ` / 스캔: ${item.scanned} / SAP: ${sapQty}`;

  renderScanList();
  renderOutboundTable();
  updateProgress();
}

/* ============================================================
   스캔 리스트 & 진행 상태
============================================================ */
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

    const item = outboundItems.find((it) => it.barcode === code);
    const bcInfo = barcodeCache[code];

    let label = `바코드: ${code}`;
    let cls = "text-green-700";

    if (item) {
      label += ` (${item.box || ""}) - ${item.name || ""}`;
    } else if (bcInfo) {
      label += ` (${bcInfo.box || ""}) - ${bcInfo.name || ""}`;
    }

    if (isError) {
      label += " [미등록]";
      cls = "text-red-600";
    } else if (isDup) {
      label += " [중복]";
      cls = "text-emerald-700";
    } else {
      label += " [정상]";
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
  let completedItems = 0;

  if (totalItems > 0) {
    completedItems = outboundItems.filter(
      (it) => it.sap > 0 && it.scanned >= it.sap
    ).length;
  }

  progress_now.textContent = String(completedItems);
  progress_total.textContent = `/ ${totalItems} 품목`;

  const percent =
    totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;

  if (progress_percent) {
    progress_percent.textContent = `${percent}%`;
  }

  progress_bar.style.width = `${percent}%`;
}

/* ============================================================
   초기화
============================================================ */
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
  progress_total.textContent = "/ 0 품목";
  if (progress_percent) progress_percent.textContent = "0%";
  progress_bar.style.width = "0%";

  dup_count.textContent = "0";
  error_count.textContent = "0";

  recentScanStatus.textContent = "-";
  recentScanStatus.className = "text-lg font-bold text-slate-700";
  recentScanDetail.textContent = "";
}
