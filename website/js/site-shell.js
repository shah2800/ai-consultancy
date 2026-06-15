(function () {
  "use strict";

  var WA =
    "https://wa.me/923142638901?text=" +
    encodeURIComponent("Assalam o Alaikum, I want to know about study abroad programs");

  function ready(fn) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", fn);
    } else {
      fn();
    }
  }

  function ensureSkipLink() {
    if (document.querySelector(".skip-link")) return;
    var main = document.getElementById("main") || document.querySelector("main") || document.querySelector(".article-wrap");
    if (!main || !main.id) {
      if (main) main.id = "main";
      else return;
    }
    var a = document.createElement("a");
    a.className = "skip-link";
    a.href = "#" + main.id;
    a.textContent = "Skip to main content";
    document.body.insertBefore(a, document.body.firstChild);
  }

  function ensureMobileBar() {
    if (document.getElementById("nsMobileBar") || document.getElementById("mobileBar")) return;
    var bar = document.createElement("div");
    bar.className = "ns-mobile-bar";
    bar.id = "nsMobileBar";
    bar.setAttribute("role", "region");
    bar.setAttribute("aria-label", "Quick actions");
    bar.innerHTML =
      '<a class="bar-apply" href="apply.html">Apply Free</a>' +
      '<a class="bar-wa" href="' +
      WA +
      '" target="_blank" rel="noopener noreferrer" aria-label="WhatsApp">' +
      '<svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22" aria-hidden="true"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.134.558 4.133 1.532 5.866L.057 23.857a.5.5 0 00.606.606l6.056-1.467A11.944 11.944 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.818 9.818 0 01-5.013-1.375l-.36-.213-3.733.904.921-3.648-.233-.376A9.818 9.818 0 1112 21.818z"/></svg></a>';
    document.body.appendChild(bar);
    window.addEventListener(
      "scroll",
      function () {
        bar.classList.toggle("is-visible", window.scrollY > 220);
      },
      { passive: true }
    );
  }

  function initReadingProgress() {
    var article = document.querySelector(".article-wrap article");
    if (!article) return;
    var bar = document.createElement("div");
    bar.className = "read-progress";
    bar.setAttribute("aria-hidden", "true");
    document.body.appendChild(bar);
    function update() {
      var rect = article.getBoundingClientRect();
      var total = article.offsetHeight - window.innerHeight;
      if (total <= 0) {
        bar.style.width = "0";
        return;
      }
      var scrolled = window.scrollY - (article.offsetTop - 80);
      var pct = Math.min(100, Math.max(0, (scrolled / total) * 100));
      bar.style.width = pct + "%";
    }
    window.addEventListener("scroll", update, { passive: true });
    update();
  }

  function initArticleMobileTools() {
    var wrap = document.querySelector(".article-wrap");
    var sidebar = document.querySelector(".article-wrap .sidebar");
    if (!wrap || !sidebar) return;

    var tools = document.createElement("div");
    tools.className = "article-tools";
    tools.innerHTML =
      '<button type="button" class="article-tools-btn" id="articleGuideBtn">📚 More guides</button>' +
      '<button type="button" class="article-tools-btn" id="articleApplyBtn">Apply free →</button>';
    wrap.insertBefore(tools, wrap.querySelector("article"));

    document.getElementById("articleApplyBtn").addEventListener("click", function () {
      window.location.href = "apply.html";
    });

    var sheet = document.createElement("div");
    sheet.className = "sidebar-sheet";
    sheet.id = "sidebarSheet";
    sheet.innerHTML =
      '<div class="sidebar-sheet-panel" role="dialog" aria-label="Related articles">' +
      sidebar.innerHTML +
      '<button type="button" style="margin-top:12px;width:100%;min-height:44px;border:1px solid var(--border);border-radius:10px;background:var(--bg);font:inherit;font-weight:700" id="closeSheet">Close</button></div>';
    document.body.appendChild(sheet);

    function openSheet() {
      sheet.classList.add("open");
      document.body.style.overflow = "hidden";
    }
    function closeSheet() {
      sheet.classList.remove("open");
      document.body.style.overflow = "";
    }

    document.getElementById("articleGuideBtn").addEventListener("click", openSheet);
    document.getElementById("closeSheet").addEventListener("click", closeSheet);
    sheet.addEventListener("click", function (e) {
      if (e.target === sheet) closeSheet();
    });
  }

  function markMain() {
    var wrap = document.querySelector(".article-wrap");
    if (wrap && !wrap.id) wrap.id = "main";
    var main = document.querySelector("main:not([id])");
    if (main) main.id = "main";
  }

  ready(function () {
    document.body.classList.add("ns-site");
    if (!document.body.classList.contains("has-mobile-bar") && !document.getElementById("mobileBar")) {
      document.body.classList.add("has-mobile-bar");
    }
    markMain();
    ensureSkipLink();
    ensureMobileBar();
    initReadingProgress();
    initArticleMobileTools();
  });
})();
