// detail_defect.js — 결품 상세 화면

// 오늘 날짜 계산 (YYYY-MM-DD)
function getKRDate() {
  const now = new Date();
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  const kr = new Date(utc + 9 * 3600000);

  const y = kr.getFullYear();
  const m = String(kr.getMonth() + 1).padStart(2, "0");
  const d = String(kr.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// 테이블 렌더링
function renderDetailTable(rows) {
  const tbody = document.getElementById("defectDetailBody");
  tbody.innerHTML = "";

  rows.forEach(r => {
    const tr = document.createElement("tr");

    tr.innerHTML = `
      <td class="px-3 py-2">${r.invoice}</td>
      <td class="px-3 py-2">${r.country}</td>
      <td class="px-3 py-2">${r.location}</td>
      <td class="px-3 py-2 ${
        r.status.includes("입고")
          ? "text-emerald-600"
          : "text-rose-600 font-semibold"
      }">${r.status}</td>
    `;

    tbody.appendChild(tr);
  });
}

// 데이터 불러오기
async function loadDetailData() {
  const CSV_URL =
    "https://docs.google.com/spreadsheets/d/e/2PACX-1vRAWmUNAeyndXfdxHjR-1CakW_Tm3OzmMTng5RkB53umXwucqpxABqMMcB0y8H5cHNg7aoHYqFztz0F/pub?gid=1308072172&single=true&output=csv";

  const res = await fetch(CSV_URL);
  const rows = (await res.text()).split("\n").map(r => r.split(","));

  const today = getKRDate();
  let list = [];

  rows.forEach(r => {
    const date = r[1]?.trim();   // B
    const invoice = r[0]?.trim(); // A
    const country = r[2]?.trim(); // C
    const defect = r[4]?.trim();  // E
    const location = r[7]?.trim(); // H

    if (date === today) {
      list.push({
        invoice,
        country,
        location,
        status: defect
      });
    }
  });

  renderDetailTable(list);
}

loadDetailData();
