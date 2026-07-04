/* ============================================================
   widgets.js — 桌面小组件
   4 个：时间 / 天气 / 今日提示 / 黑胶唱片
   长按小组件进入编辑模式：拖动重排 / 删除 / 调整大小（S/M/L）
   顺序与大小持久化到 State（widgetOrder / widgetSizes / widgetHidden）
   挂在 window.Phone.Widgets
   ============================================================ */
(function (global) {
  "use strict";

  const TIPS = [
    "今天也要好好吃饭哦",
    "记得喝水，你是最棒的",
    "累了就抱抱小棉花",
    "天气冷了，多穿一件",
    "笑一个嘛，看镜头～",
    "今天有什么想分享的吗？",
    "我在这里陪你哦",
    "记得早点睡觉呀",
    "想吃甜的就吃吧，今天辛苦了",
    "抱抱你，没事的",
    "今天也要好好生活呀",
    "想我的时候就来找我",
    "不开心可以跟我说哦",
    "你笑起来真好看",
    "再坚持一下下就好啦",
  ];

  const WEATHER_TIPS = [
    { icon: "sun", desc: "晴朗", temp: 24 },
    { icon: "cloud", desc: "多云", temp: 21 },
    { icon: "rain", desc: "小雨", temp: 18 },
    { icon: "snow", desc: "小雪", temp: -2 },
  ];

  // 小组件默认顺序与 id
  const DEFAULT_ORDER = ["time", "weather", "tip", "vinyl"];
  // 大小档位 → grid span
  const SIZE_SPAN = {
    S: { col: 1, row: 1 },
    M: { col: 2, row: 1 },
    L: { col: 2, row: 2 },
  };

  let _editing = false;
  let _justDragged = false;

  /**
   * 我（小组件）渲染到容器
   * @param {HTMLElement} container
   */
  async function mount(container) {
    const U = global.Phone.Utils;
    const State = global.Phone.State;

    const [order, sizes, hidden] = await Promise.all([
      State.get("widgetOrder"),
      State.get("widgetSizes"),
      State.get("widgetHidden"),
    ]);
    const orderList = (order && order.length) ? order : DEFAULT_ORDER.slice();
    const sizeMap = sizes || {};
    const hiddenList = hidden || [];

    const wrap = U.el("div", { class: "widget-area" });

    // 渲染每个小组件
    orderList.forEach((id) => {
      if (hiddenList.includes(id)) return;
      const widget = _buildWidget(id);
      if (!widget) return;
      widget.el.dataset.id = id;
      _applySize(widget.el, sizeMap[id] || "S");
      wrap.appendChild(widget.el);
    });

    container.appendChild(wrap);

    // 订阅 widgetOrder / widgetSizes / widgetHidden 变化 → 重渲染
    // 编辑模式中由 _cycleSize / _hideWidget / _saveOrder 直接操作 DOM，跳过重渲染
    let unsub1, unsub2, unsub3;
    const rerender = async () => {
      if (_editing) return; // 编辑模式中不重渲染，避免破坏 UI 与重复挂载
      // 清理旧订阅与定时器，防止重复挂载
      if (unsub1) unsub1(); if (unsub2) unsub2(); if (unsub3) unsub3();
      wrap.querySelectorAll(".widget").forEach((w) => {
        if (w._cleanup) { try { w._cleanup(); } catch {} }
      });
      if (wrap.parentNode) wrap.parentNode.removeChild(wrap);
      await mount(container);
    };
    unsub1 = State.subscribe("widgetOrder", rerender);
    unsub2 = State.subscribe("widgetSizes", rerender);
    unsub3 = State.subscribe("widgetHidden", rerender);

    // 长按进入编辑模式
    let pressTimer = null;
    function clearPress() { pressTimer = null; }
    wrap.addEventListener("touchstart", (e) => {
      const t = e.target.closest(".widget");
      if (!t) return;
      const w = t;
      pressTimer = setTimeout(() => _enterEdit(wrap), 550);
    });
    wrap.addEventListener("touchend", clearPress);
    wrap.addEventListener("touchmove", clearPress);
    wrap.addEventListener("mousedown", (e) => {
      const t = e.target.closest(".widget");
      if (!t) return;
      pressTimer = setTimeout(() => _enterEdit(wrap), 650);
    });
    wrap.addEventListener("mouseup", clearPress);
    wrap.addEventListener("mouseleave", clearPress);

    return {
      el: wrap,
      destroy: () => {
        unsub1(); unsub2(); unsub3();
        // 清理各组件的定时器
        wrap.querySelectorAll(".widget").forEach((w) => {
          if (w._cleanup) { try { w._cleanup(); } catch {} }
        });
        if (wrap.parentNode) wrap.parentNode.removeChild(wrap);
      }
    };
  }

  function _buildWidget(id) {
    const U = global.Phone.Utils;
    if (id === "time") return _buildTime(U);
    if (id === "weather") return _buildWeather(U);
    if (id === "tip") return _buildTip(U);
    if (id === "vinyl") return _buildVinyl(U);
    return null;
  }

  function _buildTime(U) {
    const w = U.el("div", { class: "widget widget-time" });
    const timeMain = U.el("div", { class: "wt-main" });
    const timeDate = U.el("div", { class: "wt-date" });
    w.appendChild(timeMain);
    w.appendChild(timeDate);
    w.appendChild(U.el("div", {
      class: "wt-deco",
      html: global.Phone.IconLibrary.get("clock", { size: 36, strokeWidth: 1.2 })
    }));
    function tick() {
      const now = new Date();
      timeMain.textContent = U.pad2(now.getHours()) + ":" + U.pad2(now.getMinutes());
      timeDate.textContent = (now.getMonth() + 1) + "月" + now.getDate() + "日 " + U.WEEK_CN[now.getDay()];
    }
    tick();
    const timer = setInterval(tick, 30000);
    w._cleanup = () => clearInterval(timer);
    return { el: w };
  }

  function _buildWeather(U) {
    const w = U.el("div", { class: "widget widget-weather" });
    const weather = U.pick(WEATHER_TIPS);
    w.appendChild(U.el("div", { class: "ww-top" }, [
      U.el("div", { class: "ww-icon", html: global.Phone.IconLibrary.get(weather.icon, { size: 28 }) }),
      U.el("div", { class: "ww-temp", text: weather.temp + "°" }),
    ]));
    w.appendChild(U.el("div", {}, [
      U.el("div", { class: "ww-desc", text: weather.desc + " · 体感舒适" }),
      U.el("div", { class: "ww-city", text: "棉花糖小镇" }),
    ]));
    return { el: w };
  }

  function _buildTip(U) {
    const w = U.el("div", { class: "widget widget-tip" });
    const tipText = U.pick(TIPS);
    w.appendChild(U.el("div", { class: "wtip-icon", html: global.Phone.IconLibrary.get("sb-smile", { size: 20 }) }));
    const textEl = U.el("div", { class: "wtip-text", text: tipText });
    w.appendChild(textEl);
    const tipTimer = setInterval(() => {
      const newTip = U.pick(TIPS);
      if (textEl) {
        textEl.style.opacity = "0";
        setTimeout(() => { textEl.textContent = newTip; textEl.style.opacity = "1"; }, 200);
      }
    }, 5 * 60 * 1000);
    w._cleanup = () => clearInterval(tipTimer);
    return { el: w };
  }

  function _buildVinyl(U) {
    const w = U.el("div", { class: "widget widget-vinyl" });
    const disc = U.el("div", { class: "vinyl-disc" });
    let spinning = false;
    disc.addEventListener("click", (e) => {
      // 编辑模式下点唱片 = 调整大小，不触发旋转
      if (_editing) return;
      spinning = !spinning;
      disc.classList.toggle("spinning", spinning);
      if (spinning) {
        global.Phone.EventCenter.emit("widget_vinyl_clicked", {
          sourceApp: "desktop",
          summary: "用户点了桌面黑胶唱片",
          data: { spinning: true }
        });
      }
    });
    w.appendChild(disc);
    return { el: w };
  }

  function _applySize(el, size) {
    const span = SIZE_SPAN[size] || SIZE_SPAN.S;
    el.style.gridColumn = "span " + span.col;
    el.style.gridRow = "span " + span.row;
    el.dataset.size = size;
    el.classList.toggle("widget-large", size === "L");
  }

  // ---------- 编辑模式 ----------
  function _enterEdit(wrap) {
    if (_editing) return;
    _editing = true;
    const U = global.Phone.Utils;
    wrap.classList.add("widget-editing");
    wrap.querySelectorAll(".widget").forEach((w) => {
      w.classList.add("editing");
      // 删除角标
      if (!w.querySelector(".widget-del")) {
        const del = U.el("div", { class: "widget-del", html: global.Phone.IconLibrary.get("close", { size: 12 }) });
        del.addEventListener("click", (e) => {
          e.stopPropagation();
          _hideWidget(w.dataset.id);
        });
        w.appendChild(del);
      }
      // 调整大小手柄
      if (!w.querySelector(".widget-resize")) {
        const rs = U.el("div", { class: "widget-resize", text: _sizeLabel(w.dataset.size) });
        rs.addEventListener("click", (e) => {
          e.stopPropagation();
          _cycleSize(w.dataset.id, w.dataset.size);
        });
        w.appendChild(rs);
      }
    });

    const banner = U.el("div", { class: "desktop-edit-banner widget-edit-banner anim-slide-up", text: "拖动重排，点角标删除，点右下切换大小，完成退出" });
    wrap.appendChild(banner);

    const doneBtn = U.el("button", { class: "btn btn-ghost btn-sm desktop-edit-done", text: "完成" });
    doneBtn.style.cssText = "position:absolute;top:-44px;right:0;z-index:6;";
    doneBtn.addEventListener("click", (e) => { e.stopPropagation(); _exitEdit(wrap); });
    wrap.appendChild(doneBtn);

    // 空白处退出
    const onBlank = (e) => {
      if (e.target.closest(".widget") || e.target === doneBtn) return;
      _exitEdit(wrap);
    };
    wrap.addEventListener("click", onBlank);

    // 返回键优先退出编辑
    global.Phone.Router.setBackGuard(() => {
      if (_editing) { _exitEdit(wrap); return true; }
      return false;
    });

    _enableDrag(wrap);
  }

  function _sizeLabel(size) {
    if (size === "L") return "大";
    if (size === "M") return "中";
    return "小";
  }

  async function _cycleSize(id, cur) {
    const sizes = ["S", "M", "L"];
    const idx = sizes.indexOf(cur || "S");
    const next = sizes[(idx + 1) % sizes.length];
    const all = (await global.Phone.State.get("widgetSizes")) || {};
    all[id] = next;
    await global.Phone.State.set("widgetSizes", all);
    // 编辑模式中直接更新 DOM（rerender 会被 _editing 守卫跳过）
    if (_editing) {
      const w = document.querySelector('.widget[data-id="' + id + '"]');
      if (w) {
        _applySize(w, next);
        const rs = w.querySelector(".widget-resize");
        if (rs) rs.textContent = _sizeLabel(next);
      }
    }
  }

  async function _hideWidget(id) {
    const hidden = (await global.Phone.State.get("widgetHidden")) || [];
    if (!hidden.includes(id)) {
      hidden.push(id);
      await global.Phone.State.set("widgetHidden", hidden);
    }
    // 编辑模式中直接从 DOM 移除（rerender 会被 _editing 守卫跳过）
    if (_editing) {
      const w = document.querySelector('.widget[data-id="' + id + '"]');
      if (w && w.parentNode) w.parentNode.removeChild(w);
    }
  }

  function _enableDrag(wrap) {
    const U = global.Phone.Utils;
    let dragged = null;
    let placeholder = null;
    let startX = 0, startY = 0, started = false;
    let pointerType = null;

    function beginDrag(cx, cy) {
      const rect = dragged.getBoundingClientRect();
      placeholder = U.el("div", { class: "widget drag-widget-placeholder" });
      placeholder.style.width = rect.width + "px";
      placeholder.style.height = rect.height + "px";
      placeholder.style.gridColumn = dragged.style.gridColumn;
      placeholder.style.gridRow = dragged.style.gridRow;
      if (dragged.parentNode) dragged.parentNode.insertBefore(placeholder, dragged);
      dragged.classList.add("dragging");
      dragged.style.position = "fixed";
      dragged.style.zIndex = "1000";
      dragged.style.width = rect.width + "px";
      dragged.style.height = rect.height + "px";
      dragged.style.left = (cx - rect.width / 2) + "px";
      dragged.style.top = (cy - rect.height / 2) + "px";
      dragged.style.pointerEvents = "none";
      try { navigator.vibrate && navigator.vibrate(12); } catch {}
    }

    function findNearest(cx, cy) {
      const all = Array.from(wrap.querySelectorAll(".widget:not(.dragging):not(.drag-widget-placeholder)"));
      let nearest = null, min = Infinity;
      all.forEach((w) => {
        const r = w.getBoundingClientRect();
        const d = Math.hypot(cx - (r.left + r.width / 2), cy - (r.top + r.height / 2));
        if (d < min) { min = d; nearest = w; }
      });
      return nearest;
    }

    function updateDrag(cx, cy) {
      if (!dragged) return;
      dragged.style.left = (cx - dragged.offsetWidth / 2) + "px";
      dragged.style.top = (cy - dragged.offsetHeight / 2) + "px";
      const nearest = findNearest(cx, cy);
      if (nearest && placeholder) {
        const r = nearest.getBoundingClientRect();
        const insertBefore = (cx < r.left + r.width / 2) || (cy < r.top + r.height / 2);
        if (insertBefore && placeholder.nextElementSibling !== nearest) {
          nearest.parentNode.insertBefore(placeholder, nearest);
        } else if (!insertBefore && placeholder.previousElementSibling !== nearest) {
          nearest.parentNode.insertBefore(placeholder, nearest.nextSibling);
        }
      }
    }

    function endDrag() {
      if (!dragged) return;
      if (placeholder && placeholder.parentNode) {
        placeholder.parentNode.insertBefore(dragged, placeholder);
        placeholder.remove();
      }
      dragged.classList.remove("dragging");
      dragged.style.cssText = "";
      // 大小样式要重新应用（cssText 清空了）
      const size = dragged.dataset.size || "S";
      _applySize(dragged, size);
      // 重新挂回角标和手柄的样式不受影响
      placeholder = null;
      _saveOrder(wrap);
      _justDragged = true;
      setTimeout(() => { _justDragged = false; }, 60);
      dragged = null;
      started = false;
      pointerType = null;
    }

    function onDown(target, cx, cy, type) {
      if (!_editing) return;
      if (!target || !target.classList.contains("widget")) return;
      if (dragged) return;
      // 点在角标 / 手柄上不拖动
      if (target.closest(".widget-del") || target.closest(".widget-resize")) return;
      dragged = target;
      startX = cx; startY = cy;
      started = false;
      pointerType = type;
    }
    function onMove(cx, cy) {
      if (!dragged) return;
      if (!started) {
        if (Math.hypot(cx - startX, cy - startY) < 8) return;
        started = true;
        beginDrag(startX, startY);
      }
      if (started) updateDrag(cx, cy);
    }
    function onUp() {
      if (!dragged) return;
      if (!started) { dragged = null; pointerType = null; return; }
      endDrag();
    }

    wrap.addEventListener("touchstart", (e) => {
      if (!_editing) return;
      const t = e.target.closest(".widget");
      if (!t) return;
      onDown(t, e.touches[0].clientX, e.touches[0].clientY, "touch");
    }, { passive: true });
    wrap.addEventListener("touchmove", (e) => {
      if (!_editing || !dragged || !started) return;
      e.preventDefault();
      onMove(e.touches[0].clientX, e.touches[0].clientY);
    }, { passive: false });
    wrap.addEventListener("touchend", onUp);
    wrap.addEventListener("touchcancel", onUp);

    wrap.addEventListener("mousedown", (e) => {
      if (!_editing) return;
      const t = e.target.closest(".widget");
      if (!t) return;
      onDown(t, e.clientX, e.clientY, "mouse");
    });
    const _mm = (e) => { if (_editing && dragged) onMove(e.clientX, e.clientY); };
    const _mu = () => onUp();
    document.addEventListener("mousemove", _mm);
    document.addEventListener("mouseup", _mu);
    wrap._dragCleanup = () => {
      document.removeEventListener("mousemove", _mm);
      document.removeEventListener("mouseup", _mu);
    };
  }

  async function _saveOrder(wrap) {
    const order = Array.from(wrap.querySelectorAll(".widget:not(.drag-widget-placeholder)"))
      .map((w) => w.dataset.id)
      .filter(Boolean);
    await global.Phone.State.set("widgetOrder", order);
  }

  function _exitEdit(wrap) {
    if (!_editing) return;
    _editing = false;
    wrap.classList.remove("widget-editing");
    wrap.querySelectorAll(".widget").forEach((w) => {
      w.classList.remove("editing");
      const del = w.querySelector(".widget-del"); if (del) del.remove();
      const rs = w.querySelector(".widget-resize"); if (rs) rs.remove();
    });
    const banner = wrap.querySelector(".widget-edit-banner");
    if (banner) banner.remove();
    const doneBtn = wrap.querySelector(".desktop-edit-done");
    if (doneBtn) doneBtn.remove();
    if (wrap._dragCleanup) { try { wrap._dragCleanup(); } catch {} wrap._dragCleanup = null; }
    if (global.Phone.Router && global.Phone.Router.setBackGuard) {
      global.Phone.Router.setBackGuard(null);
    }
  }

  // ---------- 暴露 ----------
  global.Phone = global.Phone || {};
  global.Phone.Widgets = { mount, isEditing: () => _editing, TIPS, WEATHER_TIPS, DEFAULT_ORDER };
})(window);
