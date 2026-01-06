// in-scan.js — 최종본 (IN.html 전용)
// ✅ 조회 시 /api/in-detail 호출
// ✅ 테이블: 미입고/부분입고/초과입고 모두 표시
// ✅ "비교(diff)" 칸: 미입고/부분입고(음수) -> 숫자 숨김(텍스트만), 초과입고 -> +숫자
// ✅ 상태 칸도 diff 기준으로 강제 보정 (초과입고 누락 방지)

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

function renderTable(items) {
  const tbody = $("scanTableBody");
  if (!tbody) return;

  if (!items.length) {
    tbody.innerHTML = `<tr><td class="px-3 py-3 text-slate-400" colspan="9">데이터 없음</td></tr>`;
    return;
  }

  let html = "";
  for (const it of items) {
    const d = Number(it.diff || 0);
    const sap = Number(it.sapQty || 0);
    const wms = Number(it.wmsQty || 0);

    // ✅ 비교(diff) 표시 규칙 (diff 기준 강제)
    let diffText = "0";
    let diffClass = "text-emerald-600 font-bold";

    if (d > 0) {
      diffText = `+${num(d)}`;
      diffClass = "text-rose-600 font-bold";
    } else if (d < 0) {
      diffText = (wms === 0) ? "미입고" : "부분입고"; // 숫자 숨김
      diffClass = (wms === 0) ? "text-slate-500 font-bold" : "text-amber-600 font-bold";
    }

    // ✅ 상태 표시도 diff 기준으로 보정 (API 값이 꼬여도 초과입고가 무조건 보이게)
    let showStatus = it.status || "";
    let showClass = it.statusClass || "";

    if (d > 0) { showStatus = "초과입고"; showClass = "text-rose-600"; }
    else if (d < 0 && wms > 0) { showStatus = "부분입고"; showClass = "text-amber-600"; }
    else if (d < 0 && wms === 0) { showStatus = "미입고"; showClass = "text-slate-500"; }
    else if (d === 0) { showStatus = "입고완료"; showClass = "text-emerald-600"; }

    html += `
      <tr class="border-b">
        <td class="px-3 py-2">${it.no ?? ""}</td>
        <td class="px-3 py-2">${escapeHtml(it.code || "")}</td>
        <td class="px-3 py-2">${escapeHtml(it.box || "")}</td>
        <td class="px-3 py-2">${escapeHtml(it.name || "")}</td>
        <td class="px-3 py-2 text-right">${num(sap)}</td>
        <td class="px-3 py-2 text-right">${num(wms)}</td>
        <td class="px-3 py-2 text-right ${diffClass}">${diffText}</td>
        <td class="px-3 py-2">${escapeHtml(it.keyFull || "")}</td>
        <td class="px-3 py-2"><span class="${escapeHtml(showClass)} font-bold">${escapeHtml(showStatus)}</span></td>
      </tr>
    `;
  }

  tbody.innerHTML = html;
}

function pushRecentScan(text) {
  const list = $("scanList");
  if (!list) return;

  const now = new Date();
  const t = `${String(now.getHours()).padStart(2,"0")}:${String(now.getMinutes()).padStart(2,"0")}:${String(now.getSeconds()).padStart(2,"0")}`;

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
  if (!inv) {
    alert("INV NO를 입력하세요.");
    return;
  }

  const tbody = $("scanTableBody");
  if (tbody) tbody.innerHTML = `<tr><td class="px-3 py-3 text-slate-400" colspan="9">불러오는 중...</td></tr>`;

  const url = `${API_IN_DETAIL}?invoice=${encodeURIComponent(inv)}`;
  const res = await fetch(url, { cache: "no-store" });
  const json = await res.json();

  if (!json.ok) {
    if (tbody) tbody.innerHTML = `<tr><td class="px-3 py-3 text-rose-600" colspan="9">오류: ${escapeHtml(json.msg || json.error || "unknown")}</td></tr>`;
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
  if (!it) {
    pushRecentScan(`❌ 미매칭: ${code}`);
    return;
  }

  // 상태는 화면 보정과 동일하게 diff 기준으로 표시
  const d = Number(it.diff || 0);
  const wms = Number(it.wmsQty || 0);

  let st = "입고완료";
  if (d > 0) st = "초과입고";
  else if (d < 0 && wms > 0) st = "부분입고";
  else if (d < 0 && wms === 0) st = "미입고";

  pushRecentScan(`✅ ${it.box} | ${it.name} | ${st}`);
}

function openNotice() {
  $("noticeModal")?.classList.remove("hidden");
}
function closeNotice() {
  $("noticeModal")?.classList.add("hidden");
}

function num(v) {
  const n = Number(v);
  if (!isFinite(n)) return "-";
  return String(n);
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
