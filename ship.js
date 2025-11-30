/* ---------------------------------------------------------
   ship.js (API 기반 최종 버전)
   - API: /api/shipping
   - 기능: 전체보기 / 키워드검색 / 날짜검색 / 요약 표시
--------------------------------------------------------- */

// DOM
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

// API BASE
const API = "/api/shipping";


/* ---------------------------------------------------------
   초기: 요약 로딩
--------------------------------------------------------- */
async function loadSummary() {
  try {
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
  } catch {
    statusTxt.textContent = "요약 로딩 실패";
  }
}


/* ---------------------------------------------------------
   테이블 렌더링
--------------------------------------------------------- */
function renderRows(list) {
  tbody.innerHTML = "";

  list.forEach((r, i) => {
    const tr = document.createElement("tr");

    // 짝수행 색상
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


/* ---------------------------------------------------------
   전체조회
--------------------------------------------------------- */
async function loadAll() {
  statusTxt.textContent = "전체 데이터 불러오는 중...";

  const res = await fetch(`${API}?all=true`);
  const json = await res.json();

  if (!json.ok) {
    statusTxt.textContent = "데이터 로드 실패";
    return;
  }

  renderRows(json.data);
}


/* ---------------------------------------------------------
   검색
--------------------------------------------------------- */
async function searchKeyword() {
  const key = document.getElementById("shipKey").value.trim();
  if (!key) {
    statusTxt.textContent = "검색 키를 입력하세요.";
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


/* ---------------------------------------------------------
   날짜검색
--------------------------------------------------------- */
async function dateSearch() {
  const pick = prompt("조회 날짜 선택:\n1 = 오늘\n2 = 내일\n직접입력 = YYYY-MM-DD");
  if (!pick) return;

  let target = "";

  if (pick === "1") target = getDateStr(0);
  else if (pick === "2") target = getDateStr(1);
  else target = pick;

  statusTxt.textContent = `${target} 조회 중...`;

  const res = await fetch(`${API}?date=${target}`);
  const json = await res.json();

  if (!json.ok) {
    statusTxt.textContent = "날짜 조회 실패";
    return;
  }

  renderRows(json.data);
}


/* ---------------------------------------------------------
   날짜 포맷
--------------------------------------------------------- */
function getDateStr(add) {
  const d = new Date();
  d.setDate(d.getDate() + add);
  return d.toISOString().split("T")[0];
}


/* ---------------------------------------------------------
   이벤트 연결
--------------------------------------------------------- */
btnSearch.addEventListener("click", searchKeyword);
btnAll?.addEventListener("click", loadAll);
btnDate?.addEventListener("click", dateSearch);


/* ---------------------------------------------------------
   페이지 시작 시 동작
--------------------------------------------------------- */
loadSummary();
