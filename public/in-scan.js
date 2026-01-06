// in-scan.js — ✅ 최종 안정판
// 규칙:
// 1) WMS==0 → 미입고 → "행 숨김" (표에서 안 보이게)
// 2) WMS>0 → 무조건 표시
//    - diff>0 : 초과입고
//    - diff<0 : 부분입고
//    - diff==0: 입고완료
//
// ⚠️ 중요: API에서 status/statusClass가 혹시 틀려도 여기서 diff로 강제 보정한다.

const API_BASE = window.location.origin;
const API_IN_DETAIL = `${API_BASE}/api/in-detail`;

const $ = (id) => document.getElementById(id);

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
    const b = String(it.box || "").trim();
    if (b) boxMap.set(b, it);
  }
}

/** ✅ diff 기준 상태/색상 강제 보정 */
function normalizeStatus(it) {
  const sap = numTo0(it.sapQty);
  const wms = numTo0(it.wmsQty);
  const diff = wms - sap;

  if (wms === 0) {
    return { status: "미입고", cls: "text-slate-500", diff };
  }
  if (diff > 0) {
    return { status: "초과입고", cls: "text-rose-600", diff };
  }
  if (diff < 0) {
    return { status: "부분입고", cls: "text-amber-600", diff };
  }
  return { status: "입고완료", cls: "text-emerald-600", diff };
}

function renderTable(items) {
  const tbody = $("scanTableBody");
  if (!tbody) return;

  if (!items || items.length === 0) {
    tbody.innerHTML = `<tr><td class="px-3 py-3 text-slate-400" colspan="9">데이터 없음</td></tr>`;
    return;
  }

  let html = "";
  let shown = 0;

  for (const it of items) {
    const wms = numTo0(it.wmsQty);

    // ✅ 미입고(WMS=0) 행 숨김
    if (wms === 0) continue;

    const sap = numTo0(it.sapQty);
    const { status, cls, diff } = normalizeStatus(it);

    // ✅ 비교 칸 표시 규칙
    let diffText = "0";
    let diffClass = "text-emerald-600 font-bold";

    if (diff > 0) {
      diffText = `+${diff}`;
      diffClass = "text-rose-600 font-bold";
    } else if (diff < 0) {
      diffText = "부분입고"; // 숫자 숨김
      diffClass = "text-amber-600 font-bold";
    } else {
      diffText = "0";
      diffClass = "text-emerald-600 font-bold";
    }

    shown++;

    html += `
      <tr class="border-b">
        <td class="px-3 py-2">${escapeHtml(it.no ?? "")}</td>
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

  if (shown === 0) {
    tbody.innerHTML = `<tr><td class="px-3 py-3 text-slate-400" colspan="9">표시할 데이터 없음 (WMS=0 미입고는 숨김)</td></tr>`;
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

  const tbody = $("scanTableBody");
  if (tbody) tbody.innerHTML = `<tr><td class="px-3 py-3 text-slate-400" colspan="9">불러오는 중...</td></tr>`;

  const url = `${API_IN_DETAIL}?invoice=${encodeURIComponent(inv)}`;
  const res = await fetch(url, { cache: "no-store" });
  const json = await res.json();

  if (!json.ok) {
    if (tbody) tbody.innerHTML = `<tr><td class="px-3 py-3 text-rose-600" colspan="9">오류: ${escapeHtml(json.msg || json.error || "unknown")}</td></tr>`;
    return;
  }

  const items = json.data || [];
  buildMaps(items);

  renderSummary(json.summary || {});
  renderNotice(json.summary || {});
  renderTable(items);

  pushRecentScan(`INV 조회 완료: ${inv} (총 ${json.rows ?? items.length}행 / 표시=WMS>0)`);
  $("barcodeInput")?.focus();
}

function onScanEnter(e) {
  if (e.key !== "Enter") return;

  const code = String($("barcodeInput")?.value || "").trim();
  if (!code) return;

  $("barcodeInput").value = "";

  const it = boxMap.get(code);
  if (!it) return pushRecentScan(`❌ 미매칭: ${code}`);

  const wms = numTo0(it.wmsQty);
  const sap = numTo0(it.sapQty);
  const diff = wms - sap;

  let st = "입고완료";
  if (wms === 0) st = "미입고";
  else if (diff > 0) st = "초과입고";
  else if (diff < 0) st = "부분입고";

  pushRecentScan(`✅ ${it.box} | ${it.name} | ${st}`);
}

function numTo0(v) {
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

  $("btnNoticeOpen")?.addEventListener("click", () => $("noticeModal")?.classList.remove("hidden"));
  $("noticeCloseBtn")?.addEventListener("click", () => $("noticeModal")?.classList.add("hidden"));

  $("invInput")?.focus();
});
