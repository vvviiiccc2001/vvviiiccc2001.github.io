/* ═════════════════════════════════════════════════════════════
   main.js — 四个小功能，全部无依赖：
   1. 视频自动接入：检查 assets/videos/ 里有没有对应文件，
      有 → 显示播放器；没有 → 显示占位提示（写清文件名）。
      => 放视频只需按 assets/videos/README.md 命名扔进文件夹，
         刷新即可，无需改代码。单视频卡和双视频卡都支持。
   2. email 防爬虫：地址由 data-u / data-d 两段拼出，页面源码里
      不出现完整的 @ 邮箱字符串。
   3. 页脚年份自动更新。
   4. 图片灯箱：点击卡片里的图放大查看，支持拖动平移、
      滚轮缩放、双指捏合、双击复位、ESC / 点遮罩关闭。
══════════════════════════════════════════════════════════════ */
(function () {
  "use strict";

  /* ── 0. 深浅色主题：按钮切换 + localStorage 记忆（默认浅色）── */
  (function () {
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
  })();

  /* ── 1. 视频自动接入（每个 video 独立检测）────────
     只有明确收到 404 才判定「文件未放」并显示占位提示；
     网络探测失败（如 file:// 直开页面）时保留播放器原样，
     避免误杀可正常播放的视频。 */
  document.querySelectorAll("video[src]").forEach(function (video) {
    var cell = video.closest(".media-cell") || video.parentElement;
    var hint = cell.querySelector(".media-hint");
    if (!hint) return;

    fetch(video.getAttribute("src"), { method: "HEAD" }).then(function (res) {
      if (res.ok || res.status !== 404) return; // 200 或非 404 → 保留播放器
      video.pause();
      video.removeAttribute("src"); // 明确 404 → 显示占位提示
      hint.hidden = false;
    }).catch(function () {
      /* 探测失败不处理，保留播放器 */
    });
  });

  /* ── 2. email 防爬虫拼接 ────────────────────────── */
  document.querySelectorAll(".email").forEach(function (el) {
    var u = el.dataset.u || "";
    var d = el.dataset.d || "";
    var addr = u + "@" + d;
    el.textContent = u + " [at] " + d;   // 页面可见形式
    el.href = "mailto:" + addr;          // 点击才拼出真实地址
    el.title = "点击发送邮件";
  });

  /* ── 2b. 视频禁下载：隐藏下载按钮、禁画中画、禁右键菜单 ──
     （无法防止抓包下载，但挡住浏览器提供的所有常规入口） */
  document.querySelectorAll("video").forEach(function (v) {
    v.setAttribute("controlslist", "nodownload");
    v.disablePictureInPicture = true;
    v.addEventListener("contextmenu", function (e) { e.preventDefault(); });
  });

  /* ── 2c. 工序阶段追踪（打螺丝视频）：实时高亮当前阶段 ──
     数据来自 .phase-tracker 的 data-phases JSON；
     阶段条每段宽度按时长比例，播放中高亮 + 显示描述 */
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
    tr.append(bar, nowEl, descEl);

    function fmt(s) {
      s = Math.max(0, Math.floor(s));
      return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
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

  /* ── 3. 页脚年份与更新时间（自动）────────────── */
  var now = new Date();
  document.querySelectorAll("[data-year]").forEach(function (el) {
    el.textContent = String(now.getFullYear());
  });
  document.querySelectorAll("[data-updated]").forEach(function (el) {
    el.textContent = now.getFullYear() + "." + String(now.getMonth() + 1).padStart(2, "0");
  });

  /* ── 3b. 视窗内播放：滚出视口的循环视频自动暂停，滚回继续 ──
     手机端健壮性处理：
     · ended 手动循环兜底（部分 WebKit 的 loop 属性不可靠）
     · iOS 低电量模式下 autoplay 会被拒 → 首次触摸/点击后统一重试播放可见视频 */
  (function () {
    var loops = Array.prototype.slice.call(document.querySelectorAll("video[autoplay]"));

    /* loop 属性兜底：ended 时手动回起点续播 */
    loops.forEach(function (v) {
      v.addEventListener("ended", function () {
        try { v.currentTime = 0; } catch (e) {}
        var p = v.play();
        if (p && p.catch) p.catch(function () {});
      });
    });

    if (!("IntersectionObserver" in window) || !loops.length) return;

    /* 手机端限制同时播放数量：多个视频同时硬解是发热情主因。
       窄屏或触摸设备最多同时播 2 个（按可见比例挑），桌面不限。 */
    var MAX_PLAYING =
      (matchMedia("(max-width:640px)").matches || matchMedia("(pointer:coarse)").matches)
        ? 2 : Infinity;

    var ratios = new Map();   // video -> intersectionRatio
    function schedule() {
      var visible = loops
        .filter(function (v) { return (ratios.get(v) || 0) > 0.25; })
        .sort(function (a, b) { return (ratios.get(b) || 0) - (ratios.get(a) || 0); });
      visible.forEach(function (v, i) {
        if (i < MAX_PLAYING) {
          var p = v.play();
          if (p && p.catch) p.catch(function () {});
        } else {
          v.pause();   // 超出配额：停在当前帧，省解码
        }
      });
      loops.forEach(function (v) {
        if ((ratios.get(v) || 0) <= 0.25) v.pause();
      });
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        ratios.set(en.target, en.isIntersecting ? en.intersectionRatio : 0);
      });
      schedule();
    }, { threshold: [0, 0.25, 0.5] });
    loops.forEach(function (v) { io.observe(v); });

    /* 启动期复查：浏览器 autoplay 是渐进启动的，IO 初次回调可能跑在
       视频真正开播之前（pause 无效果），前 3 秒多复查几轮兜住配额 */
    var sweeps = 0;
    var bootTimer = setInterval(function () {
      schedule();
      if (++sweeps >= 8) clearInterval(bootTimer);
    }, 400);

    /* 首次用户交互后重试播放当前可见的循环视频
       （解决 iOS 低电量模式 autoplay 被拒导致"卡在第一帧"；
       交互解锁 = 全屏视频，不受移动端配额限制） */
    var unlocked = false;
    function retryVisible() {
      if (unlocked) return;
      unlocked = true;
      loops.forEach(function (v) {
        var r = v.getBoundingClientRect();
        if (r.bottom > 0 && r.top < innerHeight) {
          var p = v.play();
          if (p && p.catch) p.catch(function () {});
        }
      });
      ["touchend", "pointerdown", "click"].forEach(function (ev) {
        document.removeEventListener(ev, retryVisible);
      });
    }
    ["touchend", "pointerdown", "click"].forEach(function (ev) {
      document.addEventListener(ev, retryVisible, { once: false, passive: true });
    });
  })();

  /* ── 4. 图片灯箱（点击放大 · 拖动 · 缩放）────────── */
  (function () {
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

    /* 所有卡片里的整幅图都可以点开（外参标定图、VLN 架构图等） */
    document.querySelectorAll(".figure-strip img, .figure-media img").forEach(function (el) {
      el.style.cursor = "zoom-in";
      el.addEventListener("click", function () { open(el.src); });
    });

    lb.addEventListener("click", function (e) { if (e.target === lb) close(); });
    lb.querySelector(".lb-close").addEventListener("click", close);
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") close(); });

    /* 拖动平移（Pointer Events，鼠标/触摸通用） */
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

    /* 滚轮缩放 */
    lb.addEventListener("wheel", function (e) {
      e.preventDefault();
      scale = clamp(scale * (e.deltaY < 0 ? 1.15 : 1 / 1.15));
      apply();
    }, { passive: false });

    /* 双指捏合缩放（移动端） */
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

    /* 双击复位 */
    img.addEventListener("dblclick", reset);
  })();
})();
