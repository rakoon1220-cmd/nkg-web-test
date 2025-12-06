/* ============================================================
   ▣ tomorrow_detail.js — 내일 출고 상세 화면
   ============================================================ */

// 저장된 내일 출고 데이터 불러오기
let rows = JSON.parse(localStorage.getItem("tomorrowExportData") || "[]");

// CSV 컬럼 매핑
const COL = {
  invoice: 0,    // A열
  box: 5,        // F열
  country: 4,    // E열
  container: 8,  // I열
  cbm: 11,       // L열
  location: 16,  // Q열
  time: 19       // T열
};

// 시간 정규화 ("07시30분" → "07:30")
function normalizeTime(str) {
  if (!str) return "99:99";
  str = str.replace(/\s/g, "");

  // HH시MM분
  if (/^\d{1,2}시\d{1,2}분$/.test(str)) {
    const h = str.match(/(\d{1,2})시/)[1];
    const m = str.match(/시(\d{1,2})분/)[1];
    return `${h.padStart(2, "0")}:${m.padStart(2, "0")}`;
  }

  // HH시
  if (/^\d{1,2}시$/.test(str)) {
    return str.replace("시","").padStart(2,"0") + ":00";
  }

  return "99:99";
}

// 상차시간 비교용 Date 객체 변환
function timeToDate(t) {
  return new Date(`1970-01-01T${t}:00`);
}

// 정렬: 위치 → 상차시간
rows = rows
  .map(r => ({
    invoice: r[COL.invoice],
    country: r[COL.country],
    location: r[COL.location],
    time: normalizeTime(r[COL.time]),
    container: r[COL.container],
    cbm: r[COL.cbm],
    box: r[COL.box]
  }))
  .sort((a, b) => {
    if (a.location < b.location) return -1;
    if (a.location > b.location) return 1;
    return timeToDate(a.time) - timeToDate(b.time);
  });

// 테이블 렌더링
const body = document.getElementById("tomorrowDetailBody");

body.innerHTML = rows
  .map(r => `
    <tr class="hover:bg-slate-50">
      <td class="px-3 py-2">${r.invoice}</td>
      <td class="px-3 py-2">${r.country}</td>
      <td class="px-3 py-2">${r.location}</td>
      <td class="px-3 py-2">${r.time}</td>
      <td class="px-3 py-2">${r.container}</td>
      <td class="px-3 py-2">${r.cbm}</td>
      <td class="px-3 py-2">${r.box}</td>
    </tr>
  `)
  .join("");
