/* ---------------------------------------------------------
   ship.js — 출고정보 최종 완성본
--------------------------------------------------------- */

const tbody = document.getElementById("shipTableBody");
const statusTxt = document.getElementById("shipStatus");

const today20 = document.getElementById("today_20");
const today40 = document.getElementById("today_40");
const todayLCL = document.getElementById("today_lcl");

const tom20 = document.getElementById("tom_20");
const tom40 = document.getElementById("tom_40");
const tomLCL = document.getElementById("tom_lcl");

const btnSearch = document.getElementById("shipSearchBtn");
const btnAll = document.getElementById("btnAll");
const btnDate = document.getElementById("btnDate");

const API = "/api/shipping";


/* -------------------- 요약 --------------------- */

async function loadSummary() {
  const res = await fetch(`${API}?summary=true`);
  const json = await res.json();
  if (!json.ok) return;

  const t = json.summary.today;
  const n = json.summary.tomorrow;

  today20.textContent = t.pt20;
  today40.textContent = t.pt40;
  todayLCL.textContent = t.lcl;

  tom20.textContent = n.pt20;
  tom40.textContent = n.pt40;
  tomLCL.textContent = n.lcl;
}


/* -------------------- 테이블 --------------------- */

function renderRows(list) {
  tbody.innerHTML = "";

  list.forEach((r, i) => {
    const tr = document.createElement("tr");
    if (i % 2 === 1) tr.classList.add("bg-slate-50");

    tr.innerHTML = `
      <td class="px-3 py-2 border-b sticky left-0 bg-white z-10">${r.date}</td>
      <td class="px-3 py-2 border-b">${r.invoice}</td>
      <td class="px-3 py-2 border-b">${r.country}</td>
      <td class="px-3 py-2 border-b">${r.location}</td>
      <td class="px-3 py-2 border-b">${r.pallet}</td>
      <td class="px-3 py-2 border-b">${r.time}</td>
      <td class="px-3 py-2 border-b">${r.cbm}</td>
      <td class="px-3 py-2 border-b">${r.container}</td>
      <td class="px-3 py-2 border-b">${r.work}</td>
      <td class="px-3 py-2 border-b">${r.type}</td>
    `;

    tbody.appendChild(tr);
  });

  statusTxt.textContent = `${list.length}건 조회됨`;
}


/* -------------------- 전체조회 --------------------- */

async function loadAll() {
  statusTxt.textContent = "전체 조회 중...";

  const res = await fetch(`${API}?all=true`);
  const json = await res.json();
  if (!json.ok) {
    statusTxt.textContent = "전체 조회 실패";
    return;
  }

  renderRows(json.data);
}


/* -------------------- 검색 --------------------- */

async function searchKeyword() {
  const key = document.getElementById("shipKey").value.trim();
  if (!key) {
    statusTxt.textContent = "검색어를 입력하세요.";
    return;
  }

  statusTxt.textContent = "검색 중...";

  const res = await fetch(`${API}?key=${encodeURIComponent(key)}`);
  const json = await res.json();

  if (!json.ok) {
    statusTxt.textContent = "검색 실패";
    return;
  }

  renderRows(json.data);
}


/* -------------------- 날짜조회 --------------------- */

async function dateSearch() {
  const pick = prompt("조회 날짜 입력: YYYY-MM-DD 또는 MMDD 또는 1=오늘 2=내일");
  if (!pick) return;

  let key = pick.trim();

  if (key === "1") key = getDate(0);
  if (key === "2") key = getDate(1);

  statusTxt.textContent = `${key} 검색 중...`;

  const res = await fetch(`${API}?key=${encodeURIComponent(key)}`);
  const json = await res.json();

  renderRows(json.data);
}


/* -------------------- 날짜 도우미 --------------------- */

function getDate(add) {
  const d = new Date();
  d.setDate(d.getDate() + add);
  return d.toISOString().split("T")[0];
}


/* -------------------- 이벤트 --------------------- */

btnSearch.addEventListener("click", searchKeyword);
btnAll?.addEventListener("click", loadAll);
btnDate?.addEventListener("click", dateSearch);


/* -------------------- 초기 실행 --------------------- */

loadSummary();
