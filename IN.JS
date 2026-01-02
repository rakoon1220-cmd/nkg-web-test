/* =====================================================
   IN.js (입고 검수용 / 모바일&태블릿)
   - sap자재자동 + wms자동 CSV 로드
   - INV 조회 → 상단 요약 + 테이블 로드
   - 바코드(박스번호) 스캔 → 최근 3개만 표시 + 테이블 상태 갱신
===================================================== */

/* ✅ 적용 완료: 너가 준 CSV URL */
const CSV_URL_SAP_MAT =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vRAWmUNAeyndXfdxHjR-1CakW_Tm3OzmMTng5RkB53umXwucqpxABqMMcB0y8H5cHNg7aoHYqFztz0F/pub?gid=221455512&single=true&output=csv";

const CSV_URL_WMS =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vRAWmUNAeyndXfdxHjR-1CakW_Tm3OzmMTng5RkB53umXwucqpxABqMMcB0y8H5cHNg7aoHYqFztz0F/pub?gid=1850233363&single=true&output=csv";

/* ===== DOM ===== */
const $ = (id) => document.getElementById(id);

const invInput = $("invInput");
const btnLoadInv = $("btnLoadInv");
const barcodeInput = $("barcodeInput");

const elInvNo = $("inv_no");
const elCountry = $("country");
const elLoadLoc = $("load_loc");
const elLoadTime = $("load_time");
const elContainer = $("container");
const elCbm = $("cbm");
const elQty = $("qty");

const scanListEl = $("scanList");
const tableBody = $("scanTableBody");

const btnNoticeOpen = $("btnNoticeOpen");
const noticeModal = $("noticeModal");
const noticeText = $("noticeText");
const noticeCloseBtn = $("noticeCloseBtn");

/* ===== 상태 ===== */
let sapRows = [];
let wmsRows = [];

let currentInv = "";
let invSapRows = [];
let invWmsRows = [];

let validBoxSet = new Set(); // 미등록 판정 기준(기본: WMS 박스목록)
let scannedSet = new Set();
let scanHistory = []; // 최근 3개만 표시

/* =====================================================
   CSV 파서(따옴표 포함 대응)
===================================================== */
function parseCSV(text) {
  const rows = [];
  let row = [];
  let cur = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (ch === '"') {
      if (inQuotes && next === '"') { cur += '"'; i++; }
      else inQuotes = !inQuotes;
      continue;
    }

    if (!inQuotes && ch === ",") {
      row.push(cur); cur = ""; continue;
    }

    if (!inQuotes && (ch === "\n" || ch === "\r")) {
      if (ch === "\r" && next === "\n") i++;
      row.push(cur); cur = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
      continue;
    }

    cur += ch;
  }

  if (cur.length || row.length) { row.push(cur); rows.push(row); }
  return rows.filter(r => r.some(v => String(v).trim() !== ""));
}

function normalizeHeaders(headers) {
  // 헤더 중복(예: 인보이스가 2개) 대비 → 인보이스__2 형태
  const seen = new Map();
  return headers.map(h => {
    const key = String(h || "").trim();
    const n = (seen.get(key) || 0) + 1;
    seen.set(key, n);
    return n === 1 ? key : `${key}__${n}`;
  });
}

function csvToObjects(csvText) {
  const matrix = parseCSV(csvText);
  if (!matrix.length) return [];
  const headers = normalizeHeaders(matrix[0]);
  const out = [];

  for (let i = 1; i < matrix.length; i++) {
    const r = matrix[i];
    const obj = {};
    headers.forEach((h, idx) => obj[h] = (r[idx] ?? "").trim());
    out.push(obj);
  }
  return out;
}

async function fetchCsv(url) {
  const u = url + (url.includes("?") ? "&" : "?") + "t=" + Date.now();
  const res = await fetch(u, { cache: "no-store" });
  if (!res.ok) throw new Error("CSV fetch failed: " + res.status);
  const text = await res.text();
  return csvToObjects(text);
}

/* =====================================================
   유틸
===================================================== */
function safe(v, def = "-") {
  const s = (v ?? "").toString().trim();
  return s ? s : def;
}
function toNum(v) {
  const s = (v ?? "").toString().replace(/,/g, "").trim();
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}
function uniqCount(arr, key) {
  const set = new Set(arr.map(x => (x[key] ?? "").trim()).filter(Boolean));
  return set.size;
}

/* =====================================================
   UI: 최근 3개
===================================================== */
function renderRecent3() {
  if (!scanHistory.length) {
    scanListEl.innerHTML = `<div class="text-slate-400">아직 스캔 없음…</div>`;
    return;
  }

  const recent3 = scanHistory.slice(-3).reverse();

  scanListEl.innerHTML = recent3.map(item => {
    const badge =
      item.type === "OK" ? `bg-emerald-50 text-emerald-700 border-emerald-200` :
      item.type === "DUP" ? `bg-amber-50 text-amber-700 border-amber-200` :
      `bg-rose-50 text-rose-700 border-rose-200`;

    const label =
      item.type === "OK" ? "정상" :
      item.type === "DUP" ? "중복" : "미등록";

    return `
      <div class="flex items-center justify-between gap-2 rounded-xl border px-3 py-2 bg-slate-50">
        <div class="font-extrabold tracking-wide">${item.box}</div>
        <span class="text-[11px] font-bold px-2 py-1 rounded-full border ${badge}">${label}</span>
      </div>
    `;
  }).join("");
}

/* =====================================================
   UI: 테이블 렌더
===================================================== */
function renderTable() {
  tableBody.innerHTML = "";

  if (!invSapRows.length) return;

  tableBody.innerHTML = invSapRows.map((r) => {
    const no = safe(r["번호"]);
    const mat = safe(r["자재코드"]);
    const box = safe(r["박스번호"]);
    const name = safe(r["자재내역"]);
    const qtySap = toNum(r["출고"] || r["합계"] || r["수량"]);

    // WMS 수량(있으면 비교)
    const wmsRow = invWmsRows.find(x => (x["박스번호"] ?? "").trim() === box);
    const qtyWms = wmsRow ? toNum(wmsRow["수량"]) : 0;
    const cmp = (qtySap && qtyWms) ? (qtySap === qtyWms ? "OK" : "DIFF") : "-";

    const scanned = scannedSet.has(box);
    const statusText = scanned ? "스캔" : "-";
    const statusCls = scanned ? "text-emerald-700 font-bold" : "text-slate-400";

    return `
      <tr class="${scanned ? "bg-emerald-50/40" : ""}">
        <td class="px-3 py-2 whitespace-nowrap">${no}</td>
        <td class="px-3 py-2 whitespace-nowrap">${mat}</td>
        <td class="px-3 py-2 whitespace-nowrap font-semibold">${box}</td>
        <td class="px-3 py-2">${name}</td>
        <td class="px-3 py-2 text-right whitespace-nowrap">${qtySap || ""}</td>
        <td class="px-3 py-2 text-right whitespace-nowrap">${qtyWms || ""}</td>
        <td class="px-3 py-2 text-right whitespace-nowrap">${cmp}</td>
        <td class="px-3 py-2 whitespace-nowrap">${box}</td>
        <td class="px-3 py-2 whitespace-nowrap ${statusCls}">${statusText}</td>
      </tr>
    `;
  }).join("");
}

/* =====================================================
   INV 조회
===================================================== */
async function ensureLoaded() {
  if (!sapRows.length) sapRows = await fetchCsv(CSV_URL_SAP_MAT);
  if (!wmsRows.length) wmsRows = await fetchCsv(CSV_URL_WMS);
}

function resetInv(inv) {
  currentInv = inv;
  invSapRows = [];
  invWmsRows = [];
  validBoxSet = new Set();
  scannedSet = new Set();
  scanHistory = [];
  renderRecent3();
  tableBody.innerHTML = "";
}

function fillSummary() {
  const r0 = invSapRows[0] || {};

  // sap자재자동 헤더에 인보이스가 중복일 수 있어 인보이스__2도 대비
  elInvNo.textContent = safe(r0["인보이스"] || r0["인보이스__2"] || currentInv);
  elCountry.textContent = safe(r0["국가"]);
  elLoadLoc.textContent = safe(r0["상차위치"]);
  elLoadTime.textContent = safe(r0["상차시간"]);
  elContainer.textContent = safe(r0["컨테이너"]);
  elCbm.textContent = safe(r0["CBM"]);

  // 출고수량(Box) = WMS 박스 유니크 우선
  const totalBoxesWms = uniqCount(invWmsRows, "박스번호");
  const totalBoxesSap = uniqCount(invSapRows, "박스번호");
  elQty.textContent = String(totalBoxesWms || totalBoxesSap || 0);

  const notice = safe(r0["특이사항"], "");
  noticeText.textContent = notice || "특이사항 없음";
}

async function loadInvoice(inv) {
  const invNo = (inv || "").trim();
  if (!invNo) return alert("인보이스를 입력하세요.");

  resetInv(invNo);

  try {
    await ensureLoaded();

    // sap자재자동 INV 필터 (중복 헤더 대응)
    invSapRows = sapRows.filter(r => {
      const v = (r["인보이스"] || r["인보이스__2"] || "").trim();
      return v === invNo;
    });

    // wms자동 INV 필터
    invWmsRows = wmsRows.filter(r => (r["인보이스"] ?? "").trim() === invNo);

    if (!invSapRows.length && !invWmsRows.length) {
      alert("해당 인보이스 데이터가 없습니다.");
      return;
    }

    // ✅ 미등록 판정 기준: WMS 박스번호(가장 정확)
    // (WMS가 비어있으면 SAP 박스번호로 대체)
    const base = invWmsRows.length ? invWmsRows : invSapRows;
    base.forEach(r => {
      const b = (r["박스번호"] ?? "").trim();
      if (b) validBoxSet.add(b);
    });

    // 요약 + 테이블
    if (invSapRows.length) fillSummary();
    else {
      // SAP가 없으면 최소 표시
      elInvNo.textContent = invNo;
      elCountry.textContent = "-";
      elLoadLoc.textContent = "-";
      elLoadTime.textContent = "-";
      elContainer.textContent = "-";
      elCbm.textContent = "-";
      elQty.textContent = String(uniqCount(invWmsRows, "박스번호") || 0);
      noticeText.textContent = "특이사항 없음";
    }

    renderTable();
    setTimeout(() => barcodeInput.focus(), 100);

  } catch (e) {
    console.error(e);
    alert("스프레드시트 불러오기 실패 (공유/URL 확인)");
  }
}

/* =====================================================
   스캔 처리
===================================================== */
function onScan(value) {
  const box = (value || "").trim();
  if (!box) return;

  if (!currentInv) {
    alert("먼저 인보이스를 조회하세요.");
    barcodeInput.value = "";
    invInput.focus();
    return;
  }

  let type = "OK";

  // 미등록
  if (validBoxSet.size && !validBoxSet.has(box)) {
    type = "ERR";
  } else {
    // 중복
    if (scannedSet.has(box)) type = "DUP";
  }

  // 최근 3개 기록
  scanHistory.push({ box, type, ts: Date.now() });

  // 정상일 때만 테이블 상태 반영
  if (type === "OK") scannedSet.add(box);

  renderRecent3();
  renderTable();

  barcodeInput.value = "";
  barcodeInput.focus();
}

/* =====================================================
   특이사항 모달
===================================================== */
btnNoticeOpen?.addEventListener("click", () => noticeModal?.classList.remove("hidden"));
noticeCloseBtn?.addEventListener("click", () => noticeModal?.classList.add("hidden"));
noticeModal?.addEventListener("click", (e) => {
  if (e.target === noticeModal) noticeModal.classList.add("hidden");
});

/* =====================================================
   이벤트 바인딩
===================================================== */
btnLoadInv.addEventListener("click", () => loadInvoice(invInput.value));
invInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") loadInvoice(invInput.value);
});

barcodeInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    onScan(barcodeInput.value);
  }
});

// 초기
renderRecent3();
