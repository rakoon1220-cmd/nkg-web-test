// ship.js — 정렬 강화 + 색상 태그 + 시간 파싱 + D-1 강조 + 필터 유지

const tbody = document.getElementById("shipTableBody");
const statusTxt = document.getElementById("shipStatus");

let shipData = []; // 전체 데이터 저장용

// 날짜 포맷 통일: "2025. 12. 3" → "2025-12-03"
function normalizeDate(str) {
  if (!str) return "";
  const cleaned = str.replace(/\./g, "-").replace(/\s+/g, "");
  const parts = cleaned.split("-").filter(Boolean);
  if (parts.length !== 3) return str;
  const [y, m, d] = parts;
  return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

// 상차시간 통일: "07시30분" → "07:30", "7시" → "07:00"
function normalizeTime(str) {
  if (!str) return "";

  str = String(str).trim();

  // "HH:MM" 형태면 그대로
  if (/^\d{1,2}:\d{1,2}$/.test(str)) {
    let [h, m] = str.split(":");
    return `${h.padStart(2, "0")}:${m.padStart(2, "0")}`;
  }

  // "HH시MM분"
  if (/^\d{1,2}시\d{1,2}분$/.test(str)) {
    const h = str.match(/(\d{1,2})시/)?.[1];
    const m = str.match(/시(\d{1,2})분/)?.[1];
    return `${h.padStart(2, "0")}:${m.padStart(2, "0")}`;
  }

  // "HH시"
  if (/^\d{1,2}시$/.test(str)) {
    const h = str.replace("시", "");
    return `${h.padStart(2, "0")}:00`;
  }

  // "HH시MM"
  if (/^\d{1,2}시\d{1,2}$/.test(str)) {
    const h = str.match(/(\d{1,2})시/)?.[1];
    const m = str.match(/시(\d{1,2})/)?.[1];
    return `${h.padStart(2, "0")}:${m.padStart(2, "0")}`;
  }

  // "HH시 MM분" 공백 포함
  if (/\d시\s*\d+분/.test(str)) {
    const h = str.match(/(\d{1,2})시/)?.[1];
    const m = str.match(/시\s*(\d{1,2})분/)?.[1];
    return `${h.padStart(2, "0")}:${m.padStart(2, "0")}`;
  }

  // 숫자만 오면 → HH:00
  if (/^\d{1,2}$/.test(str)) {
    return `${str.padStart(2, "0")}:00`;
  }

  return "";
}

// 유형 색상 태그
function typeTag(type) {
  if (type === "수출")
    return `<span class="px-2 py-1 rounded-lg bg-blue-100 text-blue-700 font-semibold">${type}</span>`;
  if (type === "배송")
    return `<span class="px-2 py-1 rounded-lg bg-green-100 text-green-700 font-semibold">${type}</span>`;
  return `<span class="px-2 py-1 rounded-lg bg-slate-200 text-slate-700 font-semibold">${type}</span>`;
}

// 컨테이너 색상 태그
function containerTag(text) {
  const t = text.toUpperCase();
  if (t.includes("20"))
    return `<span class="px-2 py-1 rounded bg-orange-100 text-orange-700 font-semibold">${text}</span>`;
  if (t.includes("40"))
    return `<span class="px-2 py-1 rounded bg-purple-100 text-purple-700 font-semibold">${text}</span>`;
  return `<span class="px-2 py-1 rounded bg-slate-200 text-slate-700 font-semibold">${text}</span>`;
}

// 파레트 색상 태그
function palletTag(text) {
  const num = parseInt(String(text).replace(/[^0-9]/g, ""));
  if (isNaN(num)) return text;

  const colors = [
    "bg-blue-100 text-blue-700",
    "bg-green-100 text-green-700",
    "bg-yellow-100 text-yellow-700",
    "bg-red-100 text-red-700",
    "bg-indigo-100 text-indigo-700",
    "bg-teal-100 text-teal-700",
    "bg-pink-100 text-pink-700",
    "bg-purple-100 text-purple-700",
    "bg-orange-100 text-orange-700",
    "bg-slate-200 text-slate-700"
  ];

  const idx = num % colors.length;
  return `<span class="px-2 py-1 rounded font-semibold ${colors[idx]}">${text}</span>`;
}

// 출고일 D-1 강조
function isDminus1(dateNorm) {
  const today = new Date();
  const d1 = new Date(dateNorm);
  const diff = (d1 - today) / (1000 * 60 * 60 * 24);
  return Math.floor(diff) === -1;
}

// ▣ 1) 서버에서 데이터 불러오기
async function loadData() {
  statusTxt.textContent = "불러오는 중...";

  try {
    const res = await fetch("/api/shipping");
    const { ok, data } = await res.json();

    if (!ok) return statusTxt.textContent = "불러오기 실패";

    shipData = data.map(row => ({
      ...row,
      dateNorm: normalizeDate(row.date),
      timeNorm: normalizeTime(row.time)
    }));

    renderTable(shipData);
    statusTxt.textContent = `${shipData.length}건 표시됨`;

  } catch (e) {
    statusTxt.textContent = "서버 오류";
  }
}

// ▣ 2) 정렬 강화 (날짜 → 유형 → 위치 → 상차시간)
function sortList(list) {
  return [...list].sort((a, b) => {
    // 1) 날짜
    const d1 = new Date(a.dateNorm);
    const d2 = new Date(b.dateNorm);
    if (d1 - d2 !== 0) return d1 - d2;

    // 2) 유형: 수출 → 배송
    const pt = { "수출": 1, "배송": 2 };
    const t1 = pt[a.type] || 99;
    const t2 = pt[b.type] || 99;
    if (t1 !== t2) return t1 - t2;

    // 3) 위치: A → B → C
    const loc1 = (a.location || "").toUpperCase();
    const loc2 = (b.location || "").toUpperCase();
    if (loc1 < loc2) return -1;
    if (loc1 > loc2) return 1;

    // 4) 상차시간
    if (a.timeNorm && b.timeNorm) {
      const T1 = new Date(`1970-01-01T${a.timeNorm}:00`);
      const T2 = new Date(`1970-01-01T${b.timeNorm}:00`);
      return T1 - T2;
    }

    return 0;
  });
}

// ▣ 3) 테이블 렌더링
function renderTable(list) {
  tbody.innerHTML = "";
  const sorted = sortList(list);

  sorted.forEach((r, i) => {
    const tr = document.createElement("tr");

    tr.classList.add("hover:bg-sky-50", "transition");

    if (isDminus1(r.dateNorm)) {
      tr.classList.add("bg-yellow-50");
    } else if (i % 2 === 1) {
      tr.classList.add("bg-slate-50");
    }

    tr.innerHTML = `
      <td class="px-3 py-2 border-b">${r.date}</td>
      <td class="px-3 py-2 border-b">${r.invoice}</td>
      <td class="px-3 py-2 border-b">${r.country}</td>
      <td class="px-3 py-2 border-b">${r.location}</td>
      <td class="px-3 py-2 border-b">${palletTag(r.pallet)}</td>
      <td class="px-3 py-2 border-b">${r.time}</td>
      <td class="px-3 py-2 border-b">${r.cbm}</td>
      <td class="px-3 py-2 border-b">${containerTag(r.container)}</td>
      <td class="px-3 py-2 border-b">${r.work}</td>
      <td class="px-3 py-2 border-b">${typeTag(r.type)}</td>
    `;

    tbody.appendChild(tr);
  });
}

// ▣ 4) 필터 기능
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

// ▣ 5) 전체조회 → 필터 초기화
document.getElementById("btnAll")?.addEventListener("click", () => {
  document.getElementById("filterDate").value = "";
  document.getElementById("filterInvoice").value = "";
  document.getElementById("filterType").value = "";

  renderTable(shipData);
  statusTxt.textContent = `${shipData.length}건 표시됨`;
});

// 최초 실행
loadData();
