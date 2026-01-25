document.addEventListener("DOMContentLoaded", () => {
  const path = window.location.pathname;
  const page = path.split("/").pop();

  const isActive = (file) =>
    page === file ? "text-sky-300 font-semibold" : "hover:text-sky-300";

  const navHtml = `
    <nav class="bg-[#0A1833] text-white fixed top-0 w-full z-50 shadow">
      <div class="max-w-6xl mx-auto px-4 flex justify-between items-center h-14">

        <a href="/index.html" class="flex items-center gap-2">
          <div class="w-8 h-8 bg-sky-500 rounded-lg flex items-center justify-center text-xs font-bold">NK</div>
          <span class="font-semibold text-sm tracking-wide">남경 검수시스템</span>
        </a>

        <div class="hidden md:flex items-center gap-4 text-sm">
          <a href="/index.html" class="${isActive("index.html")}">홈</a>
          <a href="/index_shipping.html" class="${isActive("index_shipping.html")}">출고정보</a>
          <a href="/index_defect.html" class="${isActive("index_defect.html")}">결품조회</a>
          <a href="/index_stock.html" class="${isActive("index_stock.html")}">재고조회</a>

          <!-- ✅ 추가: 창고별 재고 -->
          <a href="/stock_warehouse.html" class="${isActive("stock_warehouse.html")}">창고별재고</a>

          <a href="/IN.html" class="${isActive("IN.html")}">입고검수</a>
          <a href="/OUT.html" class="${isActive("OUT.html")}">출고검수</a>
          <a href="/scan.html" class="${isActive("scan.html")}">스캔검수</a>

          <button onclick="history.back()"
            class="text-white px-3 py-1 border border-white/30 rounded-lg text-xs hover:bg-white hover:text-[#0A1833] transition">
            ← 뒤로
          </button>
        </div>

        <button id="navToggle" class="md:hidden text-white text-2xl focus:outline-none">☰</button>
      </div>

      <div id="mobileMenu"
        class="md:hidden hidden flex-col bg-[#0A1833] text-white px-6 py-3 space-y-3 text-sm border-t border-white/20">

        <a href="/index.html" class="${isActive("index.html")} block">홈</a>
        <a href="/index_shipping.html" class="${isActive("index_shipping.html")} block">출고정보</a>
        <a href="/index_defect.html" class="${isActive("index_defect.html")} block">결품조회</a>
        <a href="/index_stock.html" class="${isActive("index_stock.html")} block">재고조회</a>

        <!-- ✅ 추가: 창고별 재고 -->
        <a href="/stock_warehouse.html" class="${isActive("stock_warehouse.html")} block">창고별재고</a>

        <a href="/IN.html" class="${isActive("IN.html")} block">입고검수</a>
        <a href="/OUT.html" class="${isActive("OUT.html")} block">출고검수</a>
        <a href="/scan.html" class="${isActive("scan.html")} block">스캔검수</a>

        <button onclick="history.back()"
          class="mt-2 w-full py-2 border border-white/30 rounded-lg text-xs hover:bg-white hover:text-[#0A1833] transition">
          ← 뒤로
        </button>
      </div>
    </nav>

    <div class="h-14"></div>
  `;

  document.body.insertAdjacentHTML("afterbegin", navHtml);

  const navToggle = document.getElementById("navToggle");
  const mobileMenu = document.getElementById("mobileMenu");

  if (navToggle) {
    navToggle.addEventListener("click", () => {
      mobileMenu.classList.toggle("hidden");
    });
  }
});
