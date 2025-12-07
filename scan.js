/* ============================================================
   출고검수 스캔 - 최종 안정판
   (요약 + 스캔 + 중복 + 팝업 + 매핑 + 진행률% + 바코드 상세 + 사운드)
============================================================ */

const IS_FILE = location.protocol === "file:";
const API_BASE = window.location.origin;

/* ===== 사운드 경로 설정 =====
   - 배포:  /sound/ok.wav ...
   - 로컬(file): ./public/sound/ok.wav ...
============================================================ */
const SOUND_BASE = IS_FILE ? "./public/sound" : "/sound";

function makeAudio(src) {
  try {
    const a = new Audio(src);
    return a;
  } catch (e) {
    console.warn("AUDIO INIT FAIL:", src, e);
    return null;
  }
}

const soundOk = makeAudio(`${SOUND_BASE}/ok.wav`);
const soundDup = makeAudio(`${SOUND_BASE}/dup.wav`);
const soundError = makeAudio(`${SOUND_BASE}/error.wav`);
const soundModal = makeAudio(`${SOUND_BASE}/modal.wav`);

function playSound(a) {
  if (!a) return;
  try {
    a.currentTime = 0;
    a.play();
  } catch (e) {
    console.warn("AUDIO PLAY FAIL:", e);
  }
}

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
let outboundItems = [];          // 출고 품목 목록
let scannedCodes = [];           // 스캔된 바코드 전체
let errorCodes = [];             // 미등록 바코드
let lastScannedBarcode = null;   // 마지막 스캔 바코드
let barcodeMetaCache = {};       // {barcode: {mat, box, name, barcode}}

/* ------------------------------------------------------------
   공통: JSON fetch helper
------------------------------------------------------------ */
async function fetchJson(url) {
  const res = await fetch(url);
  return await res.json();
}

/* ------------------------------------------------------------
   모달 처리
------------------------------------------------------------ */
function showNoticeModal(text) {
  if (!text) return;
  currentNotice = text;
  noticeText.textContent = text;
  noticeModal.classList.remove("hidden");
  // 특이사항 팝업 사운드
  playSound(soundModal);
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
   바코드 시트 조회 API (캐시 적용)
------------------------------------------------------------ */
async function lookupBarcodeMeta(code) {
  if (!code) return null;
  if (barcodeMetaCache[code] !== undefined) {
    return barcodeMetaCache[code];
  }

  if (IS_FILE) {
    // 로컬 file 모드에서는 API 호출 X
    barcodeMetaCache[code] = null;
    return null;
  }

  try {
    const json = await fetchJson(
      `${API_BASE}/api/barcode_lookup?code=${encodeURIComponent(code)}`
    );

    if (json.ok && json.data) {
      barcodeMetaCache[code] = json.data;
      return json.data;
    }
  } catch (err) {
    console.error("BARCODE LOOKUP ERROR:", err);
  }

  barcodeMetaCache[code] = null;
  return null;
}

/* ------------------------------------------------------------
   인보이스 조회 → 상단 요약 + 특이사항 + 출고목록 로드
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
    const json = await fetchJson(
      `${API_BASE}/api/sap_doc?inv=${encodeURIComponent(inv)}`
    );

    if (!json.ok) {
      alert(json.message || "인보이스 정보를 찾을 수 없습니다.");
      return;
    }

    const row = json.data || {};

    inv_no.textContent = row["인보이스"] || "-";
    country.textContent = row["국가"] || "-";
    containerEl.textContent = row["컨테이너"] || "-";
    cbm.textContent = row["CBM"] || "-";
    qty.textContent = row["출고"] || "-";

    // 상차시간 컬럼명이 애매할 수 있어서 여러 패턴 지원
    let lt =
      row["상차시간"] ||
      row["상차 시간"] ||
      row["상차"] ||
      "";

    if (!lt) {
      // 키에 "상차" 포함된 컬럼 자동 검색
      for (const k of Object.keys(row)) {
        const kk = k.replace(/\s+/g, "");
        if (kk.includes("상차") && kk.includes("시간")) {
          lt = row[k];
          break;
        }
      }
    }
    load_time.textContent = lt || "-";

    load_loc.textContent = row["상차위치"] || "-";

    // 특이사항 자동 팝업 (여러 줄 그대로 표시)
    const noticeRaw = row["특이사항"] || "";
    if (noticeRaw.trim()) {
      currentNotice = noticeRaw;
      showNoticeModal(currentNotice);
    }

    // 출고 품목 목록 로드
    await loadOutboundItems(inv);
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
   출고 검수 목록 로드 (API)
------------------------------------------------------------ */
async function loadOutboundItems(inv) {
  try {
    const json = await fetchJson(
      `${API_BASE}/api/outbound_items?inv=${encodeURIComponent(inv)}`
    );

    if (!json.ok) {
      alert(json.message || "출고 품목 목록을 불러오지 못했습니다.");
      return;
    }

    outboundItems = (json.items || []).map(it => ({
      ...it,
      sap: Number(it.sap || 0),
      wms: Number(it.wms || 0),
      scanned: Number(it.scanned || 0) || 0,
      status: it.status || "미검수",
    }));

    renderOutboundTable();
    updateProgress();

  } catch (err) {
    console.error("OUTBOUND LOAD ERROR:", err);
    alert("출고 품목 목록 호출 중 오류");
  }
}

/* ------------------------------------------------------------
   출고 검수 테이블 렌더링
   - 번호 오름차순
   - 상태별 색상
   - 중복 스캔된 바코드 → 연한 초록색
   - 마지막 스캔 → 테두리 강조
------------------------------------------------------------ */
function renderOutboundTable() {
  scanTableBody.innerHTML = "";

  // 번호 오름차순 정렬
  const sorted = [...outboundItems].sort((a, b) => {
    const an = Number((a.no || "").toString().replace(/[^\d]/g, "")) || 0;
    const bn = Number((b.no || "").toString().replace(/[^\d]/g, "")) || 0;
    return an - bn;
  });

  sorted.forEach(item => {
    const tr = document.createElement("tr");

    let cls = "";

    // 상태별 기본 색상
    if (item.status === "완료") {
      cls += " bg-yellow-100 text-yellow-800";
    } else if (item.status === "진행중") {
      cls += " bg-sky-50";
    } else if (item.status === "초과") {
      cls += " bg-red-50 text-red-700";
    }

    // 중복 스캔된 바코드 → 연한 초록색
    const dupCountForItem = scannedCodes.filter(c => c === item.barcode).length;
    if (dupCountForItem > 1) {
      cls += " bg-emerald-50";
    }

    // 마지막 스캔 행 하이라이트
    if (item.barcode === lastScannedBarcode) {
      cls += " ring-2 ring-emerald-400";
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
   스캔 처리 (바코드 → 바코드시트 → 출고목록 매핑)
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

  // 1️⃣ 바코드시트에서 정보 조회
  const bcInfo = await lookupBarcodeMeta(code);

  // 2️⃣ 출고목록에서 자재번호+박스번호로 우선 매칭
  let targetItem = null;

  if (bcInfo) {
    const matKey = (bcInfo.mat || "").trim();
    const boxKey = (bcInfo.box || "").trim();

    if (matKey) {
      // (1) 자재번호 + 박스번호 완전 일치
      targetItem = outboundItems.find(
        it =>
          (it.mat || "").trim() === matKey &&
          (it.box || "").trim() === boxKey
      );

      // (2) 자재번호만 일치 (박스번호가 비어있거나 관리 안 하는 경우)
      if (!targetItem) {
        targetItem = outboundItems.find(
          it => (it.mat || "").trim() === matKey
        );
      }
    }
  }

  // 3️⃣ 그래도 못 찾으면 → 출고목록 바코드 직접 매칭(대표바코드)
  if (!targetItem) {
    targetItem = outboundItems.find(
      it => (it.barcode || "").trim() === code
    );
  }

  // 4️⃣ 출고목록에도 없으면 → 진짜 미등록
  if (!targetItem) {
    errorCodes.push(code);

    recentScanStatus.textContent = "미등록";
    recentScanStatus.className = "text-lg font-bold text-red-600";

    if (bcInfo) {
      recentScanDetail.textContent =
        `바코드: ${code} / 박스번호: ${bcInfo.box || "-"} / ${bcInfo.name} (출고 목록 없음)`;
    } else {
      recentScanDetail.textContent =
        `바코드: ${code} (바코드 시트에도 없음)`;
    }

    playSound(soundError);

    renderScanList();
    updateProgress();
    return;
  }

  // 5️⃣ 정상 매칭
  lastScannedBarcode = code;

  if (typeof targetItem.scanned !== "number") {
    targetItem.scanned = 0;
  }
  targetItem.scanned += 1;

  // 상태 판정 (SAP 기준)
  const sapQty = targetItem.sap || 0;
  if (sapQty <= 0) {
    targetItem.status = "SAP미설정";
  } else if (targetItem.scanned < sapQty) {
    targetItem.status = "진행중";
  } else if (targetItem.scanned === sapQty) {
    targetItem.status = "완료";
  } else {
    targetItem.status = "초과";
  }

  // 최근 스캔 표시 + 사운드
  if (!isDupScan && targetItem.status !== "초과") {
    recentScanStatus.textContent = "정상";
    recentScanStatus.className = "text-lg font-bold text-green-600";
    playSound(soundOk);
  } else if (targetItem.status === "초과") {
    recentScanStatus.textContent = "초과";
    recentScanStatus.className = "text-lg font-bold text-red-600";
    playSound(soundError);
  } else {
    recentScanStatus.textContent = "중복";
    recentScanStatus.className = "text-lg font-bold text-amber-600";
    playSound(soundDup);
  }

  recentScanDetail.textContent =
    `바코드: ${code} / 박스번호: ${targetItem.box || "-"} / ${targetItem.name}`;

  renderScanList();
  renderOutboundTable();
  updateProgress();
}

/* ------------------------------------------------------------
   스캔 리스트 렌더링
   - 출고목록 있으면: 초록
   - 출고목록 없고 바코드시트만 있으면: 빨간 + 품명/박스 표시
------------------------------------------------------------ */
function renderScanList() {
  if (scannedCodes.length === 0 && errorCodes.length === 0) {
    scanList.innerHTML = `<div class="text-slate-400">아직 스캔된 항목 없음…</div>`;
    return;
  }

  scanList.innerHTML = "";

  const errorSet = new Set(errorCodes);

  scannedCodes.forEach(code => {
    const item = outboundItems.find(it => it.barcode === code);
    const meta = barcodeMetaCache[code];
    let cls = "";
    let text = "";

    if (item) {
      cls = "text-green-700";
      text = `${code} (${item.box || "-"}) - ${item.name}`;
    } else if (errorSet.has(code) && meta) {
      cls = "text-red-600";
      text = `${code} (${meta.box || "-"}) - ${meta.name} (미등록)`;
    } else if (errorSet.has(code)) {
      cls = "text-red-600";
      text = `${code} (미등록 바코드)`;
    } else {
      cls = "text-slate-700";
      text = code;
    }

    const div = document.createElement("div");
    div.className = cls;
    div.textContent = text;
    scanList.appendChild(div);
  });
}

/* ------------------------------------------------------------
   진행률 업데이트
   - 총 SAP 수량 대비 스캔 수량 비율(%)
   - 상단 "누적 진행" 숫자는 스캔 Box 합계
   - 중복 / 미등록 카운트
------------------------------------------------------------ */
function updateProgress() {
  // 총 SAP 수량, 총 스캔 수량(초과분은 SAP까지로 cap)
  let totalSap = 0;
  let totalScanned = 0;

  outboundItems.forEach(it => {
    const sap = Number(it.sap || 0);
    const scanned = Number(it.scanned || 0);

    if (sap > 0) {
      totalSap += sap;
      totalScanned += Math.min(scanned, sap);
    }
  });

  progress_now.textContent = String(totalScanned);
  progress_total.textContent = totalSap > 0
    ? `/ ${totalSap} Box`
    : "/ 0 Box";

  const percent = totalSap > 0
    ? Math.round((totalScanned / totalSap) * 100)
    : 0;

  progress_percent.textContent = `${percent}%`;
  progress_bar.style.width = `${percent}%`;

  const totalScan = scannedCodes.length;
  const uniqueCount = new Set(scannedCodes).size;

  dup_count.textContent = String(totalScan - uniqueCount);
  error_count.textContent = String(errorCodes.length);
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

  scannedCodes = [];
  errorCodes = [];
  outboundItems = [];
  lastScannedBarcode = null;
  barcodeMetaCache = {};

  scanList.innerHTML = `<div class="text-slate-400">아직 스캔된 항목 없음…</div>`;
  scanTableBody.innerHTML = "";

  progress_now.textContent = "0";
  progress_total.textContent = "/ 0 Box";
  progress_percent.textContent = "0%";
  progress_bar.style.width = "0%";

  dup_count.textContent = "0";
  error_count.textContent = "0";

  recentScanStatus.textContent = "-";
  recentScanStatus.className = "text-lg font-bold text-slate-700";
  recentScanDetail.textContent = "";
}
