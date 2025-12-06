// 자동 포커싱
const input = document.getElementById("scanInput");
input.focus();
window.addEventListener("click", () => input.focus());

// 스캔 기록 저장
let scannedList = [];
let errorCount = 0;

// ===== 스캔 처리 =====
input.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    const code = input.value.trim();
    if (code === "") return;

    processScan(code);
    input.value = "";
    input.focus();
  }
});

function processScan(code) {
  const tbody = document.getElementById("scanTableBody");
  const soundOK = document.getElementById("sound_ok");
  const soundDup = document.getElementById("sound_dup");
  const soundErr = document.getElementById("sound_err");

  let status = "";
  let bgClass = "";

  // 중복 스캔
  if (scannedList.includes(code)) {
    status = "중복";
    bgClass = "bg-blue-50";
    soundDup.play();
  }
  else {
    scannedList.push(code);

    // ★ 이후 여기에서 SAP/WMS 매칭으로 상태 판정
    // 지금은 임시로 정상 처리
    status = "정상";
    bgClass = "bg-yellow-50";
    soundOK.play();
  }

  // 테이블에 추가
  const row = document.createElement("tr");
  row.className = bgClass;

  row.innerHTML = `
    <td class="px-3 py-2">-</td>
    <td class="px-3 py-2">-</td>
    <td class="px-3 py-2">-</td>
    <td class="px-3 py-2 text-right">-</td>
    <td class="px-3 py-2 text-right">-</td>
    <td class="px-3 py-2">-</td>
    <td class="px-3 py-2">${code}</td>
    <td class="px-3 py-2">${status}</td>
  `;

  tbody.prepend(row);

  // 최근 스캔 정보 업데이트
  document.getElementById("last_status").textContent = status;
  document.getElementById("last_info").textContent = `바코드: ${code}`;

  // 누적 카운트
  document.getElementById("scan_count").textContent = scannedList.length;
}

// ===== 모달 기능 =====
function openMemoModal() {
  document.getElementById("memoModal").classList.remove("hidden");
}

function closeMemoModal() {
  document.getElementById("memoModal").classList.add("hidden");
}

function saveMemo() {
  const memo = document.getElementById("memoText").value.trim();
  if (memo.length === 0) {
    alert("내용을 입력하세요.");
    return;
  }

  alert("특이사항 저장됨\n\n" + memo);
  closeMemoModal();
}
