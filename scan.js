/* ============================================================
   출고검수 스캔 - 최종 안정판
   (요약 + 스캔 + 중복 + 팝업 + 매핑 + 완료강조 + 진행률%)
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
let outboundItems = [];       // 출고 검수 전체 목록 (SAP+WMS+바코드)
let scannedCodes = [];        // 스캔된 바코드 전체
let duplicateCodes = [];      // 중복 스캔된 바코드 리스트
let errorCodes = [];          // 출고목록에 없는 바코드 리스트
let lastScannedBarcode = null; // 마지막 스캔 바코드

// 바코드 전체 테이블 (미등록 바코드 상세 확인용)
let barcodeTable = [];
let barcodeTableLoaded = false;

/* ------------------------------------------------------------
   공용: 상차시간/상차위치 안전 추출 (컬럼명 가변 대응)
------------------------------------------------------------ */
function getSafeValue(row, keys, defaultValue = "-") {
  if (!row) return defaultValue;
  for (const k of keys) {
    if (row[k] && String(row[k]).trim() !== "") {
      return String(row[k]).trim();
    }
  }
  return defaultValue;
}

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

/* ============================================================
   인보이스 조회 → 상단정보 + 특이사항 + 출고목록 + 바코드테이블 로드
============================================================ */
async function loadInvoice() {
  const inv = invInput.value.trim();
  if (!inv) {
    alert("인보이스를 입력하세요.");
    return;
  }

  resetUI();

  // ----- file:/// 로컬 테스트 모드 -----
  if (IS_FILE) {
    inv_no.textContent = inv;
    country.textContent = "테스트국가";
    containerEl.textContent = "40FT";
    cbm.textContent = "28.5";
    qty.textContent = "1450";
    load_time.textContent = "07시 30분";
    load_loc.textContent = "A02";

    currentNotice = "테스트 특이사항입니다.\n조회 후 팝업이 정상적으로 뜹니다.";
    showNoticeModal(currentNotice);

    // 로컬 테스트용 더미 데이터
    outboundItems = [
      {
        no: 1,
        mat: "2141971",
        box: "AA01",
        name: "테스트 간장",
        sap: 100,
        wms: 100,
        unit: "BOX",
        barcode: "111111111",
        scanned: 0,
        status: "미검수",
      },
      {
        no: 2,
        mat: "2141972",
        box: "AA02",
        name: "테스트 고추장",
        sap: 50,
        wms: 50,
        unit: "BOX",
        barcode: "222222222",
        scanned: 0,
        status: "미검수",
      },
    ];
    renderOutboundTable();
    updateProgress();
    return;
  }

  // ----- 실제 서버 모드 -----
  try {
    // 1) 인보이스 상단 정보 (sap_doc)
    const res = await fetch(
      `${API_BASE}/api/sap_doc?inv=${encodeURIComponent(inv)}`
    );
    const json = await res.json();

    if (!json.ok) {
      alert(json.message || "인보이스 정보를 찾을 수 없습니다.");
      return;
    }

    const row = json.data || {};

    inv_no.textContent = getSafeValue(row, ["인보이스", "Invoice", "invoice"]);
    country.textContent = getSafeValue(row, ["국가", "Country"]);
    containerEl.textContent = getSafeValue(row, ["컨테이너"]);
    cbm.textContent = getSafeValue(row, ["CBM"]);
    qty.textContent = getSafeValue(row, ["출고", "출고수량", "출고수량(Box)"]);

    // ★ 상차시간 / 상차위치 - 여러 헤더명 대응
    load_time.textContent = getSafeValue(
      row,
      ["상차시간", "상차 시간", "상차시간 ", "상차 시간 "]
    );
    load_loc.textContent = getSafeValue(
      row,
      ["상차위치", "상차 위치", "상차위치 ", "상차 위치 "]
    );

    // 특이사항 자동 팝업
    const notice = getSafeValue(row, ["특이사항", "특이 사항", "비고"], "");
    if (notice) {
      currentNotice = notice;
      showNoticeModal(currentNotice);
    }

    // 2) 출고 검수 목록 로드
    await loadOutboundItems(inv);

    // 3) 바코드 전체 테이블 로드 (미등록 바코드 상세 확인용)
    await loadBarcodeTable();

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
   출고 검수 목록 로드 (SAP + WMS + 바코드 통합)
============================================================ */
async function loadOutboundItems(inv) {
  if (IS_FILE) return; // 위에서 더미 세팅함

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

    // 번호 오름차순 한번 더 보장
    outboundItems.sort((a, b) => (a.no || 0) - (b.no || 0));

    renderOutboundTable();
    updateProgress();
  } catch (err) {
    console.error("OUTBOUND LOAD ERROR:", err);
    alert("출고 품목 목록 호출 중 오류");
  }
}

/* ============================================================
   바코드 전체 테이블 로드 (미등록 바코드 상세 확인용)
============================================================ */
async function loadBarcodeTable() {
  if (IS_FILE) {
    barcodeTable = [];
    barcodeTableLoaded = true;
    return;
  }
  try {
    const res = await fetch(`${API_BASE}/api/barcode_table`);
    const json = await res.json();

    if (!json.ok) {
      console.warn("바코드 테이블 로딩 실패:", json.message);
      return;
    }

    barcodeTable = json.items || [];
    barcodeTableLoaded = true;
  } catch (err) {
    console.error("BARCODE TABLE LOAD ERROR:", err);
  }
}

/* ============================================================
   출고 검수 테이블 렌더링
============================================================ */
function renderOutboundTable() {
  scanTableBody.innerHTML = "";

  // 중복 여부 계산용 맵
  const dupMap = {};
  scannedCodes.forEach((code) => {
    dupMap[code] = (dupMap[code] || 0) + 1;
  });

  outboundItems.forEach((item) => {
    const tr = document.createElement("tr");

    // 상태별 색상
    let rowClass = "";

    // 1) 중복 스캔된 바코드면 연한 초록색 우선
    const isDuplicated = dupMap[item.barcode] > 1;
    if (isDuplicated) {
      rowClass = "bg-emerald-50 text-emerald-800";
    } else {
      // 2) 그 외 상태별 색상
      if (item.status === "완료") {
        rowClass = "bg-yellow-50 text-yellow-800"; // 완료: 연노랑
      } else if (item.status === "진행중") {
        rowClass = "bg-sky-50";
      } else if (item.status === "초과") {
        rowClass = "bg-red-50 text-red-700";
      }
    }

    // 마지막 스캔 건 하이라이트 테두리
    if (item.barcode === lastScannedBarcode) {
      rowClass += " ring-2 ring-amber-400";
    }

    tr.className = rowClass.trim();

    tr.innerHTML = `
      <td class="px-3 py-2 whitespace-nowrap">${item.no ?? "-"}</td>
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

  progress_total.textContent = `/ ${outboundItems.length} 품목`;
}

/* ============================================================
   스캔 처리 (목록 매핑 + 상태 업데이트 + 미등록 처리)
============================================================ */
barcodeInput.addEventListener("keydown", (e) => {
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

  // 출고 목록에서 바코드 찾기
  const idx = outboundItems.findIndex((it) => it.barcode === code);
  const item = idx >= 0 ? outboundItems[idx] : null;

  /* ----- 출고 목록에 없는 경우 = "미등록" 처리 ----- */
  if (!item) {
    errorCodes.push(code);

    recentScanStatus.textContent = "미등록";
    recentScanStatus.className = "text-lg font-bold text-red-600";

    // 바코드 테이블에서도 찾아보기
    let detailText = `${code} (출고 목록에 없음)`;

    if (barcodeTableLoaded && barcodeTable.length > 0) {
      const b = barcodeTable.find((b) => b.barcode === code);
      if (b) {
        detailText = `${code} (출고목록 없음) / 박스번호: ${b.box} / ${b.name}`;
      } else {
        detailText = `${code} (출고목록, 바코드표 모두 없음)`;
      }
    }

    recentScanDetail.textContent = detailText;

    renderScanList();
    updateProgress();
    return;
  }

  // ----- 출고 목록에 존재하는 정상 품목 스캔 -----
  lastScannedBarcode = code;
  if (typeof item.scanned !== "number") item.scanned = 0;
  item.scanned += 1;

  // SAP 기준 상태 판정
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

  // 최근 스캔 상태 색 + 텍스트
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

  // 상세 정보 (바코드 + 박스 + 품명 + 스캔수량)
  recentScanDetail.textContent = `바코드: ${code} / 박스번호: ${item.box} / ${item.name} / 스캔: ${item.scanned} / SAP: ${sapQty}`;

  renderScanList();
  renderOutboundTable();
  updateProgress();
}

/* ============================================================
   스캔된 목록 표시
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

    // 출고 목록에서 찾기
    const item = outboundItems.find((it) => it.barcode === code);

    let text = code;
    let cls = "text-green-700";

    if (isError) {
      // 미등록 → 바코드 테이블에서 정보 찾기
      let extra = "";
      if (barcodeTableLoaded && barcodeTable.length > 0) {
        const b = barcodeTable.find((b) => b.barcode === code);
        if (b) {
          extra = ` / 박스번호: ${b.box} / ${b.name}`;
        } else {
          extra = " / (바코드표에도 없음)";
        }
      }
      text = `${code} (미등록)${extra}`;
      cls = "text-red-600";
    } else if (isDup) {
      text = `${code} (중복)`;
      cls = "text-amber-700";
      if (item) {
        text += ` / 박스번호: ${item.box} / ${item.name}`;
      }
    } else {
      // 정상 첫 스캔
      if (item) {
        text = `${code} (정상) / 박스번호: ${item.box} / ${item.name}`;
      } else {
        text = `${code} (정상)`;
      }
    }

    const div = document.createElement("div");
    div.className = cls;
    div.textContent = text;

    scanList.appendChild(div);
  });
}

/* ============================================================
   진행률 / 중복 / 미등록 카운트 갱신
============================================================ */
function updateProgress() {
  const totalItems = outboundItems.length;

  // 완료 품목 수 (스캔 >= SAP, SAP > 0)
  const completedItems = outboundItems.filter(
    (it) => it.sap > 0 && it.scanned >= it.sap
  ).length;

  // 완료 품목 수 및 퍼센트
  progress_now.textContent = String(completedItems);
  progress_total.textContent = `/ ${totalItems} 품목`;

  const percent =
    totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;
  progress_percent.textContent = `${percent}%`;
  progress_bar.style.width = `${percent}%`;

  // 중복 / 미등록 카운트
  const totalScan = scannedCodes.length;
  const uniqueCount = new Set(scannedCodes).size;
  dup_count.textContent = String(totalScan - uniqueCount);
  error_count.textContent = String(errorCodes.length);
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

  barcodeTable = [];
  barcodeTableLoaded = false;

  scanList.innerHTML = `<div class="text-slate-400">아직 스캔된 항목 없음…</div>`;
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
