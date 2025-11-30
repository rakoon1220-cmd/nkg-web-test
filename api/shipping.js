// ship.js — 출고정보 심플 자동표시 버전
// - 페이지 들어오면 자동으로 CSV 불러와서
//   오늘 이후 출고만 상세내역에 표시함

// 🔗 CSV 주소
const CSV_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vRAWmUNAeyndXfdxHjR-1CakW_Tm3OzmMTng5RkB53umXwucqpxABqMMcB0y8H5cHNg7aoHYqFztz0F/pub?gid=1070360000&single=true&output=csv";

// DOM
const tbody = document.getElementById("shipTableBody");
const statusTxt = document.getElementById("shipStatus");

// 문자열 정리 (공백, BOM, 개행 제거)
function clean(str) {
  if (str == null) return "";
  return String(str)
    .replace(/\uFEFF/g, "")
    .replace(/\r/g, "")
    .replace(/\n/g, "")
    .trim();
}

// 오늘 날짜를 CSV와 같은 형식으로 (YYYY.MM.DD)
function getTodayDot() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}.${m}.${day}`;
}

// CSV 한 줄 안전 파싱
function parseRow(row) {
  const out = [];
  let cur = "";
  let inside = false;

  for (let ch of row) {
    if (ch === '"' && inside) {
      inside = false;
    } else if (ch === '"' && !inside) {
      inside = true;
    } else if (ch === "," && !inside) {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

// CSV 전체 파싱
function parseCSV(text) {
  const lines = text.split(/\r?\n/);
  const data = [];

  // 0번째 줄은 헤더라 가정하고 1부터
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line || !line.trim()) continue;
    const cols = parseRow(line);
    data.push(cols);
  }
  return data;
}

// 테이블 렌더링 (오늘 이후만)
function renderTable(rows) {
  tbody.innerHTML = "";

  rows.forEach((r, idx) => {
    const 출고일 = clean(r[3]);   // D
    const 인보이스 = clean(r[0]); // A
    const 국가 = clean(r[4]);     // E
    const 위치 = clean(r[16]);    // Q
    const 파레트 = clean(r[18]);  // S
    const 상차시간 = clean(r[19]);// T
    const CBM = clean(r[11]);     // L
    const 컨테이너 = clean(r[9]); // J
    const 작업 = clean(r[15]);    // P
    const 유형 = clean(r[10]);    // K

    const tr = document.createElement("tr");
    if (idx % 2 === 1) tr.classList.add("bg-slate-50"); // 짝수행 색

    tr.innerHTML = `
      <td class="px-3 py-2 border-b sticky left-0 bg-white z-10">${출고일}</td>
      <td class="px-3 py-2 border-b">${인보이스}</td>
      <td class="px-3 py-2 border-b">${국가}</td>
      <td class="px-3 py-2 border-b">${위치}</td>
      <td class="px-3 py-2 border-b">${파레트}</td>
      <td class="px-3 py-2 border-b">${상차시간}</td>
      <td class="px-3 py-2 border-b">${CBM}</td>
      <td class="px-3 py-2 border-b">${컨테이너}</td>
      <td class="px-3 py-2 border-b">${작업}</td>
      <td class="px-3 py-2 border-b">${유형}</td>
    `;
    tbody.appendChild(tr);
  });

  statusTxt.textContent = `${rows.length}건 표시됨 (오늘 이후 출고)`;
}

// 메인: CSV 불러와서 오늘 이후만 표시
async function loadShipping() {
  try {
    statusTxt.textContent = "출고정보 불러오는 중...";

    const res = await fetch(CSV_URL);
    const text = await res.text();
    const allRows = parseCSV(text);

    const todayDot = getTodayDot(); // "2025.12.01" 이런 형식

    // D열 기준으로 오늘 이후만 필터
    const filtered = allRows.filter(cols => {
      const d = clean(cols[3]); // D열
      if (!d) return false;
      return d >= todayDot; // "YYYY.MM.DD"라 문자열 비교 가능
    });

    renderTable(filtered);
  } catch (err) {
    console.error(err);
    statusTxt.textContent = "출고정보 로딩 중 오류 발생: " + err;
  }
}

// 페이지 들어오면 자동 실행
loadShipping();
