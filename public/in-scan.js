// in-scan.js — ✅ 최종본
// - 미입고(WMS=0) 행만 숨김
// - 초과입고/부분입고/입고완료는 전부 표시
// - 상태는 diff 기준으로 프론트에서 한 번 더 보정(안전)

const API_BASE = window.location.origin;
const API_IN_DETAIL = `${API_BASE}/api/in-detail`;
const $ = (id) => document.getElementById(id);

let currentItems = [];
let boxMap = new Map(); // box -> item

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

    // ✅ 미입고만 숨김
    if (wms === 0) continue;

    const { status, cls, diff } = normalizeStatus(sap, wms);

    // 비교 칸 표시
    let diffText = "0";
    let diffClass = "text-emerald-600 font-bold";

    if (diff > 0) {
      diffText = `+${diff}`;
      diffClass = "text-rose-600 font-bold";
    } else if (diff < 0) {
      diffText = "부분입고"; // 숫자 숨김
      diffClass = "text-amber-600 font-bold";
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
        <td class="px-3 py-2 text-right ${diffClass}">${diffText}</td>
        <td class="px-3 py-2">${escapeHtml(it.keyFull || "")}</td>
        <td class="px-3 py-2"><span class="${cls} font-bold">${status}</span></td>
      </tr>
    `;
  }

  if (!shown) {
    tbody.innerHTML = `<tr><td class="px-3 py-3 text-slate-400" colspan="9">표시할 데이터 없음 (미입고=WMS 0은 숨김)</td></tr>`;
    return;
  }

  tbody.innerHTML = html;
}

function pushRecentScan(text) {
  const list = $("scanList");
  if (!list) return;

  const now = new Date();
  const t =
    `${String(now.getHours()).padStart(2, "0")}:` +
    `${String(now.getMinutes()).padStart(2, "0")}:` +
    `${String(now.getSeconds()).padStart(2, "0")}`;

  const div = document.createElement("div");
  div.textContent = `${t}  ${text}`;
  div.className = "truncate";

  if (list.firstElementChild && list.firstElementChild.classList.contains("text-slate-400")) {
    list.innerHTML = "";
  }
  list.prepend(div);

  while (list.children.length > 3) list.removeChild(list.lastElementChild);
}

async function loadInvoice() {
  const inv = String($("invInput")?.value || "").trim().replace(/[^0-9]/g, "");
  if (!inv) return alert("INV NO를 입력하세요.");

  $("scanTableBody").innerHTML = `<tr><td class="px-3 py-3 text-slate-400" colspan="9">불러오는 중...</td></tr>`;

  const url = `${API_IN_DETAIL}?invoice=${encodeURIComponent(inv)}`;
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

  pushRecentScan(`INV 조회 완료: ${inv} (rows ${json.rows})`);
  $("barcodeInput")?.focus();
}

function onScanEnter(e) {
  if (e.key !== "Enter") return;

  const code = String($("barcodeInput")?.value || "").trim();
  if (!code) return;

  $("barcodeInput").value = "";

  const it = boxMap.get(code);
  if (!it) return pushRecentScan(`❌ 미매칭: ${code}`);

  const sap = toNum(it.sapQty);
  const wms = toNum(it.wmsQty);
  const { status, diff } = normalizeStatus(sap, wms);

  pushRecentScan(`✅ ${it.box} | ${it.name} | ${status} (diff:${diff})`);
}

function openNotice() { $("noticeModal")?.classList.remove("hidden"); }
function closeNotice() { $("noticeModal")?.classList.add("hidden"); }

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
