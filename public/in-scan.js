// in-scan.js — ✅ 최종: 미입고(WMS=0)만 숨김, 부분/완료/초과 전부 표시

const API_BASE = window.location.origin;
const API_IN_DETAIL = `${API_BASE}/api/in-detail`;
const $ = (id) => document.getElementById(id);

let currentItems = [];
let boxMap = new Map();

function setText(id, v) {
  const el = $(id);
  if (el) el.textContent = (v === undefined || v === null || v === "") ? "-" : String(v);
}

function renderSummary(summary) {
  setText("inv_no", summary.invoice || "-");
  setText("country", summary.country || "-");
  setText("load_loc", summary.load_loc || "-");
  setText("load_time", summary.load_time || "-");
  setText("container", summary.container || "-");
  setText("cbm", summary.cbm || "-");
  setText("qty", summary.qty ?? 0);
}

function renderNotice(summary) {
  const txt = (summary.notice || "").trim();
  const el = $("noticeText");
  if (el) el.textContent = txt ? txt : "특이사항 없음";
}

function buildMaps(items) {
  boxMap = new Map();
  for (const it of items) {
    if (it.box) boxMap.set(String(it.box).trim(), it);
  }
}

function normalizeStatus(sapQty, wmsQty) {
  const diff = wmsQty - sapQty;

  if (wmsQty === 0) return { status: "미입고", cls: "text-slate-500", diff };
  if (diff > 0) return { status: "초과입고", cls: "text-rose-600", diff };
  if (diff < 0) return { status: "부분입고", cls: "text-amber-600", diff };
  return { status: "입고완료", cls: "text-emerald-600", diff };
}

function renderTable(items) {
  const tbody = $("scanTableBody");
  if (!tbody) return;

  if (!items.length) {
    tbody.innerHTML = `<tr><td class="px-3 py-3 text-slate-400" colspan="9">데이터 없음</td></tr>`;
    return;
  }

  let html = "";
  let shown = 0;

  for (const it of items) {
    const sap = toNum(it.sapQty);
    const wms = toNum(it.wmsQty);

    // ✅ 오직 미입고만 숨김
    if (wms === 0) continue;

    const { status, cls, diff } = normalizeStatus(sap, wms);

    // 비교 표시: 초과는 +숫자 / 부분은 "부분입고" / 완료는 "입고완료"
    let compareText = "입고완료";
    let compareCls = "text-emerald-600 font-bold";

    if (diff > 0) {
      compareText = `+${diff} (초과입고)`;
      compareCls = "text-rose-600 font-bold";
    } else if (diff < 0) {
      compareText = `${Math.abs(diff)} (부분입고)`;
      compareCls = "text-amber-600 font-bold";
    }

    shown++;

    html += `
      <tr class="border-b">
        <td class="px-3 py-2">${escapeHtml(it.no)}</td>
        <td class="px-3 py-2">${escapeHtml(it.code || "")}</td>
        <td class="px-3 py-2">${escapeHtml(it.box || "")}</td>
        <td class="px-3 py-2">${escapeHtml(it.name || "")}</td>
        <td class="px-3 py-2 text-right">${sap}</td>
        <td class="px-3 py-2 text-right">${wms}</td>
        <td class="px-3 py-2 text-right ${compareCls}">${compareText}</td>
        <td class="px-3 py-2">${escapeHtml(it.keyFull || "")}</td>
        <td class="px-3 py-2"><span class="${cls} font-bold">${status}</span></td>
      </tr>
    `;
  }

  if (!shown) {
    tbody.innerHTML = `<tr><td class="px-3 py-3 text-slate-400" colspan="9">표시할 데이터 없음 (미입고=WMS 0만 숨김)</td></tr>`;
    return;
  }

  tbody.innerHTML = html;
}

async function loadInvoice() {
  const inv = String($("invInput")?.value || "").trim().replace(/[^0-9]/g, "");
  if (!inv) return alert("INV NO를 입력하세요.");

  $("scanTableBody").innerHTML = `<tr><td class="px-3 py-3 text-slate-400" colspan="9">불러오는 중...</td></tr>`;

  const url = `${API_IN_DETAIL}?invoice=${encodeURIComponent(inv)}&t=${Date.now()}`;
  const res = await fetch(url, { cache: "no-store" });
  const json = await res.json();

  if (!json.ok) {
    $("scanTableBody").innerHTML = `<tr><td class="px-3 py-3 text-rose-600" colspan="9">오류: ${escapeHtml(json.msg || json.error || "unknown")}</td></tr>`;
    return;
  }

  currentItems = json.data || [];
  buildMaps(currentItems);

  renderSummary(json.summary || {});
  renderNotice(json.summary || {});
  renderTable(currentItems);
  $("barcodeInput")?.focus();
}

function onScanEnter(e) {
  if (e.key !== "Enter") return;
  const code = String($("barcodeInput")?.value || "").trim();
  if (!code) return;

  $("barcodeInput").value = "";

  const it = boxMap.get(code);
  if (!it) return;

  const sap = toNum(it.sapQty);
  const wms = toNum(it.wmsQty);
  const { status, diff } = normalizeStatus(sap, wms);

  // 최근 스캔 표시 생략(필요하면 다시 넣어줄게)
  console.log("SCAN:", it.box, status, diff);
}

function openNotice(){ $("noticeModal")?.classList.remove("hidden"); }
function closeNotice(){ $("noticeModal")?.classList.add("hidden"); }

function toNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

window.addEventListener("DOMContentLoaded", () => {
  $("btnLoadInv")?.addEventListener("click", loadInvoice);
  $("invInput")?.addEventListener("keydown", (e) => { if (e.key === "Enter") loadInvoice(); });
  $("barcodeInput")?.addEventListener("keydown", onScanEnter);
  $("btnNoticeOpen")?.addEventListener("click", openNotice);
  $("noticeCloseBtn")?.addEventListener("click", closeNotice);
  $("invInput")?.focus();
});
