(function () {
  "use strict";

  // Google Analytics 4 (gtag.js) — loaded once here so every page that includes
  // site-shell.js is tracked. Property: Next Step Internationals.
  (function loadGA() {
    var GA_ID = "G-KL5PD5VVTN";
    if (window.gtag) return; // already loaded
    var s = document.createElement("script");
    s.async = true;
    s.src = "https://www.googletagmanager.com/gtag/js?id=" + GA_ID;
    document.head.appendChild(s);
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    window.gtag("js", new Date());
    window.gtag("config", GA_ID);
  })();

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

  // Honest urgency: render a live "closes in N days" counter from a real date.
  // Markup: <div class="deadline-banner" data-deadline="2026-09-15"
  //              data-intake="September 2026 Intake" data-region="Georgia & Europe"></div>
  function initDeadlineBanners() {
    var els = document.querySelectorAll(".deadline-banner[data-deadline]");
    if (!els.length) return;
    var DAY = 86400000;
    Array.prototype.forEach.call(els, function (el) {
      var deadline = new Date(el.getAttribute("data-deadline") + "T23:59:59");
      if (isNaN(deadline.getTime())) { el.hidden = true; return; }
      var days = Math.ceil((deadline - new Date()) / DAY);
      if (days < 0) { el.hidden = true; return; } // past deadline → hide until date is updated
      var intake = el.getAttribute("data-intake") || "Next intake";
      var region = el.getAttribute("data-region") || "";
      var cta = el.getAttribute("data-cta") || "apply.html";
      var label = days === 0 ? "today" : days === 1 ? "1 day" : days + " days";
      var urgent = days <= 21 ? " urgent" : "";
      var title = intake + (region ? " — " + region : "");
      el.innerHTML =
        '<div class="dl-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg></div>' +
        '<div class="dl-text"><strong class="dl-title">' + title + '</strong>' +
        '<span class="dl-sub">Applications close in <b class="dl-count' + urgent + '">' + label +
        '</b>. Start your free profile evaluation today to submit on time.</span></div>' +
        '<a class="dl-cta" href="' + cta + '">Start Free Evaluation' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="15" height="15" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M5 12h14M13 6l6 6-6 6"/></svg></a>';
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
    initDeadlineBanners();
  });
})();
