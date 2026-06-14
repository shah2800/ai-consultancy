(function () {
  "use strict";

  function $(sel, root) {
    return (root || document).querySelector(sel);
  }

  function $all(sel, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(sel));
  }

  function setHtml(el, html) {
    if (el && html != null) el.innerHTML = html;
  }

  function setText(el, text) {
    if (el && text != null) el.textContent = text;
  }

  function waUrl(number, text) {
    var n = String(number || "").replace(/\D/g, "");
    var q = text ? "?text=" + encodeURIComponent(text) : "";
    return "https://wa.me/" + n + q;
  }

  function resolveUrl(url, contact) {
    var u = String(url || "").trim();
    if (!u || u === "whatsapp") {
      return waUrl(
        contact && contact.whatsapp,
        "Assalam o Alaikum, I want to know about study abroad programs"
      );
    }
    return u;
  }

  /** Program + showcase images load only when user scrolls near that section. */
  var progImagesQueued = [];

  function apiBase() {
    return String((window.NSI_CONFIG || {}).apiBase || "").replace(/\/+$/, "");
  }

  function resolveMediaUrl(url) {
    var u = String(url || "").trim();
    if (!u) return u;
    if (/^https?:\/\//i.test(u)) return u;
    var base = apiBase();
    if (u.charAt(0) === "/" && base) return base + u;
    return u;
  }

  function displayMediaTitle(title) {
    return String(title || "")
      .replace(/\.(jpe?g|png|gif|webp|avif|mp4|webm|mov|m4v|pdf)$/i, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function registerLazySection(id, onVisible) {
    var sec = document.getElementById(id);
    if (!sec) return;
    if (!("IntersectionObserver" in window)) {
      onVisible();
      return;
    }
    var ob = new IntersectionObserver(
      function (entries) {
        if (entries[0] && entries[0].isIntersecting) {
          onVisible();
          ob.disconnect();
        }
      },
      { rootMargin: "120px 0px", threshold: 0.05 }
    );
    ob.observe(sec);
  }

  function queueProgramImage(img, url) {
    if (!img || !url) return;
    img.dataset.src = resolveMediaUrl(String(url).trim());
    progImagesQueued.push(img);
  }

  function loadProgramImages() {
    progImagesQueued.forEach(function (img) {
      var url = img.dataset.src;
      if (!url || img.getAttribute("src")) return;
      img.onload = function () {
        img.classList.add("is-loaded");
      };
      img.src = url;
    });
    progImagesQueued = [];
  }

  function sectionNearViewport(id) {
    var sec = document.getElementById(id);
    if (!sec) return false;
    var r = sec.getBoundingClientRect();
    return r.top < window.innerHeight + 160;
  }

  function loadVideoGalleryMedia() {
    var grid = document.getElementById("video-gallery-grid");
    if (!grid) return;
    grid.querySelectorAll("[data-lazy-src]").forEach(function (el) {
      var url = el.getAttribute("data-lazy-src");
      if (!url) return;
      el.src = url;
      el.removeAttribute("data-lazy-src");
      if (el.tagName === "VIDEO") el.load();
    });
  }

  registerLazySection("programs", loadProgramImages);
  registerLazySection("video-gallery", loadVideoGalleryMedia);

  var HERO_FALLBACK = "images/hero.webp";

  function applyHeroBackground(imgEl, imgUrl) {
    var preload = document.querySelector("link[data-cms-hero-preload]");
    if (!preload) {
      preload = document.createElement("link");
      preload.rel = "preload";
      preload.as = "image";
      preload.setAttribute("data-cms-hero-preload", "1");
      document.head.appendChild(preload);
    }
    preload.href = imgUrl;
    var safe = imgUrl.replace(/'/g, "%27");
    imgEl.style.backgroundImage = "url('" + safe + "')";

    var probe = new Image();
    probe.onerror = function () {
      if (imgUrl.indexOf(HERO_FALLBACK) === -1) {
        applyHeroBackground(imgEl, HERO_FALLBACK);
      }
    };
    probe.src = imgUrl;
  }

  function applyHero(content) {
    var hero = content.hero || {};
    var contact = content.contact || {};
    setText($(".hero-pill"), hero.pill);
    setHtml($(".hero h1"), hero.title);
    setText($(".hero-desc"), hero.description);

    var heroSection = $(".hero");
    if (heroSection) {
      if (hero.heroVideo) {
        var vid = $(".hero-video");
        if (!vid) {
          vid = document.createElement("video");
          vid.className = "hero-video";
          vid.setAttribute("autoplay", "");
          vid.setAttribute("muted", "");
          vid.setAttribute("loop", "");
          vid.setAttribute("playsinline", "");
          vid.style.cssText =
            "position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:0";
          heroSection.insertBefore(vid, heroSection.firstChild);
        }
        vid.src = resolveMediaUrl(hero.heroVideo);
        var imgBg = $(".hero-img");
        if (imgBg) imgBg.style.opacity = "0.35";
      } else if (hero.heroImage) {
        var imgEl = $(".hero-img");
        if (imgEl) {
          var imgUrl = String(hero.heroImage).trim();
          if (imgUrl) {
            applyHeroBackground(imgEl, resolveMediaUrl(imgUrl));
          }
        }
        var oldVid = $(".hero-video");
        if (oldVid) oldVid.remove();
      }
    }

    var primary = hero.ctaPrimary || {};
    var secondary = hero.ctaSecondary || {};
    var btns = $all(".hero-btns .btn");
    if (btns[0]) {
      btns[0].href = resolveUrl(primary.url, contact);
      var pLabel = btns[0].querySelector("svg") ? btns[0].lastChild : btns[0];
      if (btns[0].childNodes.length > 1) {
        btns[0].childNodes[btns[0].childNodes.length - 1].textContent = " " + (primary.text || "");
      } else {
        setText(btns[0], primary.text);
      }
    }
    if (btns[1]) {
      btns[1].href = resolveUrl(secondary.url, contact);
      if (btns[1].childNodes.length > 1) {
        btns[1].childNodes[btns[1].childNodes.length - 1].textContent = " " + (secondary.text || "");
      } else {
        setText(btns[1], secondary.text);
      }
    }

    var hstats = $all(".hero-stats .hstat");
    (hero.stats || []).forEach(function (s, i) {
      if (!hstats[i]) return;
      var num = hstats[i].querySelector(".hstat-n");
      var lab = hstats[i].querySelector(".hstat-l");
      if (num) {
        if (s.count != null) {
          num.setAttribute("data-count", String(s.count));
          num.setAttribute("data-suffix", s.suffix || "");
          num.textContent = "0";
        } else {
          num.removeAttribute("data-count");
          num.textContent = s.value || "";
        }
      }
      setText(lab, s.label);
    });
  }

  function applyNotice(content) {
    var notice = content.notice || {};
    var bar = $(".notice");
    if (!bar) return;
    bar.style.display = notice.enabled === false ? "none" : "";
    var linkUrl = notice.linkUrl || "apply.html";
    var linkText = notice.linkText || "Apply →";
    var text = notice.text || "";
    bar.innerHTML =
      "<strong>" +
      text.replace(/</g, "&lt;").replace(/>/g, "&gt;") +
      '</strong> <a href="' +
      linkUrl.replace(/"/g, "&quot;") +
      '">' +
      linkText.replace(/</g, "&lt;") +
      "</a>";
  }

  function applyBrand(content) {
    var brand = content.brand || {};
    $all(".logo-name").forEach(function (el) {
      setText(el, brand.name);
    });
    $all(".logo-sub").forEach(function (el) {
      setText(el, brand.tagline);
    });
    if (content.seo && content.seo.title) document.title = content.seo.title;
    var metaDesc = $('meta[name="description"]');
    if (metaDesc && content.seo && content.seo.description) {
      metaDesc.setAttribute("content", content.seo.description);
    }
  }

  function applyContact(content) {
    var c = content.contact || {};
    var wa = waUrl(c.whatsapp, "Assalam o Alaikum, I want to know about study abroad programs");
    $all('a[href*="wa.me"]').forEach(function (a) {
      if (a.classList.contains("wa-float")) return;
      a.href = wa;
    });
    var waFloat = $(".wa-float");
    if (waFloat) waFloat.href = wa;
    $all('.f-col a[href*="wa.me"]').forEach(function (a) {
      a.textContent = "WhatsApp: " + (c.whatsappDisplay || c.whatsapp || "");
    });
    var emailLink = $('.f-col a[href^="mailto:"]');
    if (emailLink && c.email) {
      emailLink.href = "mailto:" + c.email;
      emailLink.textContent = c.email;
    }
    if (c.facebook) {
      var fb = $('.f-col a[href*="facebook"]');
      if (fb) fb.href = c.facebook;
    }
  }

  function applyStatsBand(content) {
    var boxes = $all(".stats-row .sbox");
    (content.statsBand || []).forEach(function (s, i) {
      if (!boxes[i]) return;
      var num = boxes[i].querySelector(".sbox-n");
      var lab = boxes[i].querySelector(".sbox-l");
      if (num) {
        if (s.count != null) {
          num.setAttribute("data-count", String(s.count));
          num.setAttribute("data-suffix", s.suffix || "");
        }
        num.textContent = s.value || "";
      }
      setText(lab, s.label);
    });
  }

  function applyAbout(content) {
    var about = content.about || {};
    var sec = $("#about");
    if (!sec) return;
    setText(sec.querySelector(".eyebrow"), about.eyebrow);
    setHtml(sec.querySelector(".h2"), about.title);
    setText(sec.querySelector(".lead"), about.lead);
    var cards = sec.querySelectorAll("[style*='border-top']");
    (about.cards || []).forEach(function (card, i) {
      if (!cards[i]) return;
      var kids = cards[i].children;
      if (kids[0]) kids[0].textContent = card.icon || "";
      if (kids[1]) kids[1].textContent = card.title || "";
      if (kids[2]) kids[2].textContent = card.text || "";
    });
  }

  function applyPrograms(content) {
    var prog = content.programs || {};
    var sec = $("#programs");
    if (!sec) return;
    setText(sec.querySelector(".eyebrow"), prog.eyebrow);
    setText(sec.querySelector(".h2"), prog.title);
    setText(sec.querySelector(".lead"), prog.lead);
    var map = { mbbs: "#mbbs-btn", bba: "#bba-btn", it: "#it-btn" };
    (prog.items || []).forEach(function (item) {
      var btn = $(map[item.id] || ("#" + item.id + "-btn"));
      if (!btn) return;
      setText(btn.querySelector(".prog-name"), item.name);
      setText(btn.querySelector(".prog-badge"), item.badge);
      setText(btn.querySelector(".prog-fee-val"), item.fee);
      setText(btn.querySelector(".prog-fee-sub"), item.feeSub);
      var img = btn.querySelector(".prog-cover");
      if (img && item.image) queueProgramImage(img, item.image);
      var pills = btn.querySelectorAll(".prog-pill");
      (item.pills || []).forEach(function (p, i) {
        if (pills[i]) pills[i].textContent = p;
      });
    });
    if (sectionNearViewport("programs")) loadProgramImages();
  }

  function applyFaq(content) {
    var faq = content.faq || {};
    var sec = $("#faq");
    if (!sec) return;
    setText(sec.querySelector(".eyebrow"), faq.eyebrow);
    setText(sec.querySelector(".h2"), faq.title);
    var items = sec.querySelectorAll(".fq");
    (faq.items || []).forEach(function (item, i) {
      if (!items[i]) return;
      var summary = items[i].querySelector("summary");
      var body = items[i].querySelector(".fq-body");
      if (summary) {
        var svg = summary.querySelector("svg");
        summary.textContent = item.q || "";
        if (svg) summary.appendChild(svg);
      }
      if (body) body.textContent = item.a || "";
    });
  }

  function applyFooter(content) {
    var foot = content.footer || {};
    var about = $(".f-about");
    if (about && foot.about) about.textContent = foot.about;
  }

  function applyVideoGallery(content) {
    var vg = content.videoGallery || {};
    var sec = $("#video-gallery");
    var divider = $(".vg-divider");
    if (!sec) return;
    var items = Array.isArray(vg.items) ? vg.items.filter(function (it) { return it && it.url; }) : [];
    var show = vg.enabled !== false && items.length > 0;
    sec.style.display = show ? "" : "none";
    sec.setAttribute("aria-hidden", show ? "false" : "true");
    if (divider) divider.style.display = show ? "" : "none";
    if (!show) return;
    setText(sec.querySelector(".vg-eyebrow"), vg.eyebrow);
    setText(sec.querySelector(".vg-title"), vg.title);
    var grid = $("#video-gallery-grid");
    if (!grid) return;
    grid.innerHTML = "";
    if (items.length >= 3) grid.classList.add("cols-3");
    else grid.classList.remove("cols-3");
    items.forEach(function (item) {
      var url = resolveMediaUrl(String(item.url || "").trim());
      if (!url) return;
      var card = document.createElement("article");
      card.className = "video-card";
      var media = document.createElement("div");
      media.className = "video-card-media";
      var isVideo = /\.(mp4|webm|mov|m4v)(\?|$)/i.test(url) || String(item.mime || "").indexOf("video/") === 0;
      if (isVideo) {
        var vid = document.createElement("video");
        vid.setAttribute("data-lazy-src", url);
        vid.controls = true;
        vid.playsInline = true;
        vid.preload = "metadata";
        vid.setAttribute("aria-label", displayMediaTitle(item.title) || "Student video");
        media.appendChild(vid);
      } else {
        var img = document.createElement("img");
        img.setAttribute("data-lazy-src", url);
        img.alt = displayMediaTitle(item.title) || "";
        img.loading = "lazy";
        img.decoding = "async";
        media.appendChild(img);
      }
      card.appendChild(media);
      var capText = displayMediaTitle(item.title);
      if (capText) {
        var cap = document.createElement("div");
        cap.className = "video-card-cap";
        cap.textContent = capText;
        card.appendChild(cap);
      }
      grid.appendChild(card);
    });
    if (sectionNearViewport("video-gallery")) loadVideoGalleryMedia();
  }

  function applyAll(content) {
    if (!content) return;
    applyBrand(content);
    applyNotice(content);
    applyContact(content);
    applyHero(content);
    applyStatsBand(content);
    applyAbout(content);
    applyVideoGallery(content);
    applyPrograms(content);
    applyFaq(content);
    applyFooter(content);
  }

  function loadCms() {
    var cfg = window.NSI_CONFIG || {};
    var base = String(cfg.apiBase || "").replace(/\/+$/, "");
    if (!base) return;
    fetch(base + "/public/website/content")
      .then(function (res) {
        return res.ok ? res.json() : null;
      })
      .then(function (data) {
        if (data && data.content) applyAll(data.content);
      })
      .catch(function () {});
  }

  function scheduleCmsLoad() {
    if (typeof requestIdleCallback === "function") {
      requestIdleCallback(loadCms, { timeout: 2500 });
    } else {
      setTimeout(loadCms, 400);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", scheduleCmsLoad);
  } else {
    scheduleCmsLoad();
  }
})();
