/* ═════════════════════════════════════════════════════════════
   main.js — 无依赖功能集（纯 ES5 + 分块隔离）
   任一功能块在老内核上报错，都不会影响其他功能渲染。
   1. 工序阶段追踪（打螺丝视频，最先执行）
   2. 深浅色主题（默认浅色，localStorage 记忆）
   3. 视频自动接入（文件缺失显示占位）
   4. email 防爬虫
   5. 视频禁下载
   6. 页脚年份/更新时间
   7. 视窗播放调度 + 手动模式 + 看门狗
   8. 图片灯箱（放大/拖动/缩放）
══════════════════════════════════════════════════════════════ */
(function () {
  "use strict";

  /* 兼容旧 iOS Safari：NodeList.forEach polyfill（缺失时全站功能块会连坐报错） */
  if (window.NodeList && !NodeList.prototype.forEach) {
    NodeList.prototype.forEach = Array.prototype.forEach;
  }

  var __diag = [];
  function safe(name, fn) {
    try { fn(); __diag.push("✓ " + name); } catch (e) {
      __diag.push("✗ " + name + " :: " + (e && e.message));
      try { console.warn("[main] " + name + " 块失败:", e); } catch (e2) {}
    }
  }
  function pad2(n) { return ("0" + n).slice(-2); }
  function tryPlay(v) {
    try { var p = v.play(); if (p && p.catch) p.catch(function () {}); } catch (e) {}
  }

  /* ── 1. 工序阶段追踪（最重要的展示功能，最先跑）────────── */
  safe("phase-tracker", function () {
    document.querySelectorAll(".phase-tracker").forEach(function (tr) {
      var phases;
      try { phases = JSON.parse(tr.dataset.phases || "[]"); } catch (e) { return; }
      var container = tr.closest(".card-media") || tr.parentElement;
      var video = container.querySelector("video");
      if (!video || !phases.length) return;

      var bar = document.createElement("ul");
      bar.className = "phase-bar";
      var items = phases.map(function (p) {
        var li = document.createElement("li");
        li.style.flexGrow = String(Math.max(0.5, p.e > 90 ? 12 : p.e - p.s));
        li.title = p.t;
        bar.appendChild(li);
        return li;
      });
      var nowEl = document.createElement("p");
      nowEl.className = "phase-now";
      var descEl = document.createElement("p");
      descEl.className = "phase-desc";
      tr.appendChild(bar);
      tr.appendChild(nowEl);
      tr.appendChild(descEl);

      function fmt(s) {
        s = Math.max(0, Math.floor(s));
        return Math.floor(s / 60) + ":" + pad2(s % 60);
      }
      function update() {
        var t = video.currentTime;
        var cur = null;
        phases.forEach(function (p, i) {
          var past = p.e <= t;
          var now = p.s <= t && t < p.e;
          items[i].classList.toggle("past", past && !now);
          items[i].classList.toggle("now", now);
          if (now) cur = p;
        });
        if (cur) {
          nowEl.innerHTML = "<b>" + cur.t + "</b>&ensp;" + fmt(t) + " / " + fmt(video.duration || 0);
          descEl.textContent = cur.d;
        } else {
          nowEl.innerHTML = "<b>—</b>&ensp;" + fmt(t) + " / " + fmt(video.duration || 0);
          descEl.textContent = "";
        }
      }
      video.addEventListener("timeupdate", update);
      video.addEventListener("seeked", update);
      update();
    });
  });

  /* ── 2. 深浅色主题 ────────────────────────────────────── */
  safe("theme", function () {
    var root = document.documentElement;
    var btn = document.getElementById("themeToggle");
    try {
      if (localStorage.getItem("theme") === "dark") root.classList.add("dark");
    } catch (e) {}
    if (!btn) return;
    btn.addEventListener("click", function () {
      var dark = root.classList.toggle("dark");
      try { localStorage.setItem("theme", dark ? "dark" : "light"); } catch (e) {}
    });
  });

  /* ── 3. 视频自动接入（只有明确 404 才判缺失）──────────── */
  safe("video-slot", function () {
    document.querySelectorAll("video[src]").forEach(function (video) {
      var cell = video.closest(".media-cell") || video.parentElement;
      var hint = cell.querySelector(".media-hint");
      if (!hint) return;
      fetch(video.getAttribute("src"), { method: "HEAD" }).then(function (res) {
        if (res.ok || res.status !== 404) return;
        video.pause();
        video.removeAttribute("src");
        hint.hidden = false;
      }).catch(function () {});
    });
  });

  /* ── 4. email 防爬虫 ──────────────────────────────────── */
  safe("email", function () {
    document.querySelectorAll(".email").forEach(function (el) {
      var u = el.dataset.u || "";
      var d = el.dataset.d || "";
      el.textContent = u + " [at] " + d;
      el.href = "mailto:" + u + "@" + d;
      el.title = "点击发送邮件";
    });
  });

  /* ── 5. 视频禁下载 ────────────────────────────────────── */
  safe("no-download", function () {
    document.querySelectorAll("video").forEach(function (v) {
      v.setAttribute("controlslist", "nodownload");
      v.disablePictureInPicture = true;
      v.addEventListener("contextmenu", function (e) { e.preventDefault(); });
    });
  });

  /* ── 6. 页脚年份与更新时间 ────────────────────────────── */
  safe("footer-time", function () {
    var now = new Date();
    document.querySelectorAll("[data-year]").forEach(function (el) {
      el.textContent = String(now.getFullYear());
    });
    document.querySelectorAll("[data-updated]").forEach(function (el) {
      el.textContent = now.getFullYear() + "." + pad2(now.getMonth() + 1);
    });
  });

  /* ── 7. 视窗播放调度 + 手动模式 + 看门狗 ──────────────── */
  safe("playback", function () {
    var loops = Array.prototype.slice.call(document.querySelectorAll("video[autoplay]"));

    /* 手动模式：用户点过的视频完全交给用户控制 */
    var isTouch = matchMedia("(pointer:coarse)").matches || ("ontouchstart" in window);
    document.querySelectorAll("video").forEach(function (v) {
      v.addEventListener("click", function () {
        v.setAttribute("data-user", "1");
        if (!isTouch) return;
        try {
          if (v.webkitEnterFullscreen) v.webkitEnterFullscreen();
          else if (v.requestFullscreen) v.requestFullscreen();
        } catch (e) {}
      });
    });
    var isManual = function (v) { return v.hasAttribute && v.hasAttribute("data-user"); };

    /* loop 兜底 */
    loops.forEach(function (v) {
      v.addEventListener("ended", function () {
        if (isManual(v)) return;
        try { v.currentTime = 0; } catch (e) {}
        tryPlay(v);
      });
    });

    if (!("IntersectionObserver" in window) || !loops.length) return;

    var MAX_PLAYING =
      (matchMedia("(max-width:640px)").matches || matchMedia("(pointer:coarse)").matches)
        ? 3 : Infinity;

    var ratios = new Map();
    function schedule() {
      var visible = loops
        .filter(function (v) { return !isManual(v) && (ratios.get(v) || 0) > 0.25; })
        .sort(function (a, b) { return (ratios.get(b) || 0) - (ratios.get(a) || 0); });
      visible.forEach(function (v, i) {
        if (i < MAX_PLAYING) tryPlay(v);
        else v.pause();
      });
      loops.forEach(function (v) {
        if ((ratios.get(v) || 0) <= 0.25 && !isManual(v)) v.pause();
      });
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        ratios.set(en.target, en.isIntersecting ? en.intersectionRatio : 0);
      });
      schedule();
    }, { threshold: [0, 0.25, 0.5] });
    loops.forEach(function (v) { io.observe(v); });

    /* 启动期复查（autoplay 渐进启动的竞态） */
    var sweeps = 0;
    var bootTimer = setInterval(function () {
      schedule();
      if (++sweeps >= 8) clearInterval(bootTimer);
    }, 400);

    /* 播放看门狗 */
    var lastActive = Date.now();
    ["pointerdown", "touchstart", "scroll", "keydown"].forEach(function (ev) {
      document.addEventListener(ev, function () { lastActive = Date.now(); }, { passive: true });
    });
    setInterval(function () {
      if (Date.now() - lastActive > 15000) return;
      loops.forEach(function (v) {
        if (isManual(v) || !v.paused) return;
        var r = v.getBoundingClientRect();
        if (r.bottom > innerHeight * 0.3 && r.top < innerHeight * 0.7) tryPlay(v);
      });
    }, 1000);

    /* 首次交互重试（iOS 低电量模式） */
    var unlocked = false;
    function retryVisible() {
      if (unlocked) return;
      unlocked = true;
      loops.forEach(function (v) {
        var r = v.getBoundingClientRect();
        if (r.bottom > 0 && r.top < innerHeight) tryPlay(v);
      });
      ["touchend", "pointerdown", "click"].forEach(function (ev) {
        document.removeEventListener(ev, retryVisible);
      });
    }
    ["touchend", "pointerdown", "click"].forEach(function (ev) {
      document.addEventListener(ev, retryVisible, { passive: true });
    });
  });

  /* ── 8. 图片灯箱 ──────────────────────────────────────── */
  safe("lightbox", function () {
    var lb = document.createElement("div");
    lb.className = "lightbox";
    lb.innerHTML =
      '<span class="lb-close" title="关闭 (Esc)">×</span>' +
      '<img alt="放大查看">' +
      '<span class="lb-tip">拖动平移 · 滚轮/双指缩放 · 双击复位 · Esc 关闭</span>';
    document.body.appendChild(lb);
    var img = lb.querySelector("img");
    var scale = 1, tx = 0, ty = 0;
    var dragging = false, sx = 0, sy = 0, stx = 0, sty = 0;
    var pinchD = 0;

    function clamp(v) { return Math.min(8, Math.max(0.3, v)); }
    function apply() {
      img.style.transform = "translate(" + tx + "px," + ty + "px) scale(" + scale + ")";
    }
    function reset() { scale = 1; tx = 0; ty = 0; apply(); }
    function open(src) {
      img.src = src; reset();
      lb.classList.add("on");
      document.body.style.overflow = "hidden";
    }
    function close() {
      lb.classList.remove("on");
      document.body.style.overflow = "";
    }

    document.querySelectorAll(".figure-strip img, .figure-media img").forEach(function (el) {
      el.style.cursor = "zoom-in";
      el.addEventListener("click", function () { open(el.src); });
    });

    lb.addEventListener("click", function (e) { if (e.target === lb) close(); });
    lb.querySelector(".lb-close").addEventListener("click", close);
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") close(); });

    img.addEventListener("pointerdown", function (e) {
      dragging = true; sx = e.clientX; sy = e.clientY; stx = tx; sty = ty;
      try { img.setPointerCapture(e.pointerId); } catch (err) {}
      e.preventDefault();
    });
    img.addEventListener("pointermove", function (e) {
      if (!dragging) return;
      tx = stx + e.clientX - sx; ty = sty + e.clientY - sy; apply();
    });
    img.addEventListener("pointerup", function () { dragging = false; });
    img.addEventListener("pointercancel", function () { dragging = false; });

    lb.addEventListener("wheel", function (e) {
      e.preventDefault();
      scale = clamp(scale * (e.deltaY < 0 ? 1.15 : 1 / 1.15));
      apply();
    }, { passive: false });

    function dist(t) {
      var dx = t[0].clientX - t[1].clientX, dy = t[0].clientY - t[1].clientY;
      return Math.sqrt(dx * dx + dy * dy);
    }
    lb.addEventListener("touchstart", function (e) {
      if (e.touches.length === 2) { dragging = false; pinchD = dist(e.touches); }
    }, { passive: true });
    lb.addEventListener("touchmove", function (e) {
      if (e.touches.length === 2) {
        e.preventDefault();
        var d = dist(e.touches);
        if (pinchD > 0) { scale = clamp(scale * d / pinchD); apply(); }
        pinchD = d;
      }
    }, { passive: false });

    img.addEventListener("dblclick", reset);
  });

  /* ── 9. 诊断面板（?debug=1 时显示，帮助定位特定设备问题）── */
  safe("debug-panel", function () {
    if (!/[?&]debug=1/.test(location.search)) return;
    var tr = document.querySelector(".phase-tracker");
    var panel = document.createElement("pre");
    panel.style.cssText =
      "position:fixed;left:0;right:0;bottom:0;z-index:999;max-height:45vh;overflow:auto;" +
      "background:#000;color:#0f0;font:11px/1.6 monospace;padding:12px;white-space:pre-wrap;margin:0";
    var lines = __diag.slice();
    lines.push("── 环境 ──");
    lines.push("UA: " + navigator.userAgent);
    lines.push("viewport: " + innerWidth + "x" + innerHeight);
    lines.push("── 追踪条 ──");
    lines.push("found: " + !!tr + " | children: " + (tr ? tr.children.length : "-"));
    lines.push("nowText: " + (tr && tr.querySelector(".phase-now") ? tr.querySelector(".phase-now").textContent : "(无)"));
    lines.push("videoPaused: " + (function(){ var v=document.querySelector("video"); return v?v.paused:"-"; })());
    if (tr) {
      var r = tr.getBoundingClientRect();
      var cs = getComputedStyle(tr);
      var bar = tr.querySelector(".phase-bar");
      var br = bar ? bar.getBoundingClientRect() : null;
      lines.push("rect: " + Math.round(r.width) + "x" + Math.round(r.height) + " @top " + Math.round(r.top) + " (scrollY " + Math.round(scrollY) + ")");
      lines.push("css: display=" + cs.display + " vis=" + cs.visibility + " bg=" + cs.backgroundColor + " color=" + cs.color);
      lines.push("bar: " + (br ? Math.round(br.width) + "x" + Math.round(br.height) + " lis=" + bar.children.length : "none"));
      var media = tr.closest(".card-media");
      var mr = media ? media.getBoundingClientRect() : null;
      var vid = media ? media.querySelector("video") : null;
      lines.push("media: " + (mr ? Math.round(mr.width) + "x" + Math.round(mr.height) : "-") + " | video: " + (vid ? Math.round(vid.getBoundingClientRect().height) + "px" : "-"));
    }
    panel.textContent = lines.join("\n");
    document.body.appendChild(panel);
  });
})();
