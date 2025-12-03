// ship.js — 출고정보 자동로드 + 필터 + 정렬 + 날짜 변환 + 유형 색상 태그

const tbody = document.getElementById("shipTableBody");
const statusTxt = document.getElementById("shipStatus");

let shipData = []; // 전체 저장용

// 날짜 포맷 통일: "2025. 12. 3" → "2025-12-03"
function normalizeDate(str) {
  if (!str) return "";
  const cleaned = str.replace(/\./g, "-").replace(/\s+/g, "");
  const parts = cleaned.split("-").filter(Boolean);
  if (parts.length !== 3) return str;
  const [y, m, d] = parts;
  return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

// 유형 색상 태그
function renderTypeTag(type) {
  if (type === "수출") {
    return `<span class="px-2 py-1 rounded-lg bg-blue-100 text-blue-700 font-semibold">${type}</span>`;
  }
  if (type === "배송") {
    return `<span class="px-2 py-1 rounded-lg bg-green-100 text-green-700 font-semibold">${type}</span>`;
  }
  return `<span class="px-2 py-1 rounded-lg bg-slate-200 text-slate-700 font-semibold">${type}</span>`;
}

// ▣ 1) 서버에서 데이터 불러오기
async function loadData() {
  statusTxt.textContent = "불러오는 중...";

  try {
    const res = await fetch("/api/shipping");
    const { ok, data } = await res.json();

    if (!ok) {
      statusTxt.textContent = "불러오기 실패";
      return;
    }

    shipData = data.map(row => ({
      ...row,
      dateNorm: normalizeDate(row.date)
    }));

    renderTable(shipData);
    statusTxt.textContent = `${shipData.length}건 표시됨`;

  } catch (e) {
    statusTxt.textContent = "서버 오류";
  }
}

// ▣ 2) 정렬 (날짜 → 수출 우선)
function sortList(list) {
  return [...list].sort((a, b) => {
    const d1 = new Date(a.dateNorm);
    const d2 = new Date(b.dateNorm);

    if (d1 - d2 !== 0) return d1 - d2;

    const priority = { "수출": 1, "배송": 2 };
    return (priority[a.type] || 99) - (priority[b.type] || 99);
  });
}

// ▣ 3) 테이블 렌더링
function renderTable(list) {
  tbody.innerHTML = "";
  const sorted = sortList(list);

  sorted.forEach((r, i) => {
    const tr = document.createElement("tr");
    if (i % 2 === 1) tr.classList.add("bg-slate-50");

    tr.innerHTML = `
      <td class="px-3 py-2 border-b">${r.date}</td>
      <td class="px-3 py-2 border-b">${r.invoice}</td>
      <td class="px-3 py-2 border-b">${r.country}</td>
      <td class="px-3 py-2 border-b">${r.location}</td>
      <td class="px-3 py-2 border-b">${r.pallet}</td>
      <td class="px-3 py-2 border-b">${r.time}</td>
      <td class="px-3 py-2 border-b">${r.cbm}</td>
      <td class="px-3 py-2 border-b">${r.container}</td>
      <td class="px-3 py-2 border-b">${r.work}</td>
      <td class="px-3 py-2 border-b">${renderTypeTag(r.type)}</td>
    `;

    tbody.appendChild(tr);
  });
}

// ▣ 4) 필터 (출고일 + 인보이스 + 유형)
document.getElementById("btnSearch")?.addEventListener("click", () => {
  const fDate = document.getElementById("filterDate").value;
  const fInv = document.getElementById("filterInvoice").value.trim();
  const fType = document.getElementById("filterType").value;

  const filtered = shipData.filter(v => {
    if (fDate && v.dateNorm !== fDate) return false;
    if (fInv && !v.invoice.includes(fInv)) return false;
    if (fType && v.type !== fType) return false;
    return true;
  });

  renderTable(filtered);
  statusTxt.textContent = `${filtered.length}건 표시됨`;
});

// ▣ 5) 전체 조회
document.getElementById("btnAll")?.addEventListener("click", () => {
  renderTable(shipData);
  statusTxt.textContent = `${shipData.length}건 표시됨`;
});

// ▣ 최초 실행
loadData();
