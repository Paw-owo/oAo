/* ============================================================
   app-grid.js — APP 图标网格
   横向分页（每页 N 个，横滑切页，page-dots 联动）
   长按进入编辑模式（拖拽排序 / 隐藏）
   角标从 Notify 订阅
   挂在 window.Phone.AppGrid
   ============================================================ */
(function (global) {
  "use strict";

  let _destroyers = [];
  let _editing = false;
  let _justDragged = false;   // 拖拽刚结束，抑制随之而来的 click

  /**
   * 我（APP 网格）渲染到容器
   * @param {HTMLElement} container
   */
  async function mount(container) {
    const U = global.Phone.Utils;
    const State = global.Phone.State;

    // 网格重新挂载时重置编辑态——
    // 否则 hiddenApps/appOrder 变化触发 refreshGrid 后，
    // _editing 仍为 true 但编辑 UI 已随旧网格销毁，
    // 会导致点图标变成"隐藏"而不是"打开"。
    _editing = false;

    const [cols, hidden, appOrder] = await Promise.all([
      State.get("iconColumns") || 4,
      State.get("hiddenApps") || [],
      State.get("appOrder"),
    ]);

    const wrap = U.el("div", { class: "app-grid-wrap" });

    // 获取 APP 列表（按 appOrder 或默认顺序）
    const allApps = global.Phone.AppRegistry.list();
    const orderList = (appOrder && appOrder.length) ? appOrder : global.Phone.AppRegistry.DEFAULT_APP_ORDER;
    const sorted = orderList
      .map((id) => allApps.find((a) => a.id === id))
      .filter(Boolean)
      .concat(allApps.filter((a) => !orderList.includes(a.id)));

    const badges = await global.Phone.Notify.getBadges();

    // 每页行数：根据可用高度估算（每行约 92px）
    const rowsPerPage = 3;
    const perPage = cols * rowsPerPage;
    const visibleApps = sorted.filter((s) => !hidden.includes(s.id));
    const pages = [];
    for (let i = 0; i < visibleApps.length; i += perPage) {
      pages.push(visibleApps.slice(i, i + perPage));
    }
    if (pages.length === 0) pages.push([]);

    // 横向分页容器
    const pager = U.el("div", { class: "app-grid-pager" });
    pages.forEach((pageApps) => {
      const pageEl = U.el("div", { class: "app-grid-page" });
      const grid = U.el("div", { class: "app-grid" });
      grid.style.setProperty("--cols", cols);
      pageApps.forEach((spec) => {
        const icon = _makeIcon(spec, badges[spec.id] || 0);
        grid.appendChild(icon);
      });
      pageEl.appendChild(grid);
      pager.appendChild(pageEl);
    });
    wrap.appendChild(pager);

    // 页面指示器
    const dots = U.el("div", { class: "page-dots" });
    pages.forEach((_, idx) => {
      dots.appendChild(U.el("span", { class: idx === 0 ? "active" : "" }));
    });
    if (pages.length <= 1) dots.style.display = "none";
    wrap.appendChild(dots);

    container.appendChild(wrap);

    // 横滑分页 + 指示器联动
    let currentPage = 0;
    function updateDots() {
      const spans = dots.querySelectorAll("span");
      spans.forEach((s, i) => s.classList.toggle("active", i === currentPage));
    }
    pager.addEventListener("scroll", () => {
      const idx = Math.round(pager.scrollLeft / pager.offsetWidth);
      if (idx !== currentPage) { currentPage = idx; updateDots(); }
    });

    // 订阅角标更新
    const unsub = global.Phone.Notify.onBadgeUpdate((map) => {
      wrap.querySelectorAll(".app-icon").forEach((node) => {
        const id = node.dataset.id;
        const box = node.querySelector(".ai-box");
        const cnt = map[id] || 0;
        let badge = node.querySelector(".ai-badge");
        if (cnt > 0) {
          // 有未读才显示主色小圆点（8px，不显示数字）
          if (!badge) {
            badge = U.el("div", { class: "ai-badge" });
            if (box) box.appendChild(badge);
          }
          // 不设 textContent，:empty 时 CSS 自动渲染为 8px 圆点
          badge.classList.remove("hidden");
        } else if (badge) {
          // 数量归 0，直接移除 badge 元素（不留空红点）
          badge.remove();
        }
      });
    });
    _destroyers.push(unsub);

    // 长按进入编辑模式
    let pressTimer = null;
    function clearPress() {
      if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
    }
    wrap.addEventListener("touchstart", (e) => {
      const target = e.target.closest(".app-icon");
      if (!target) return;
      pressTimer = setTimeout(() => _enterEdit(wrap, pager, dots), 600);
    });
    wrap.addEventListener("touchend", clearPress);
    wrap.addEventListener("touchmove", clearPress);
    wrap.addEventListener("mousedown", (e) => {
      const target = e.target.closest(".app-icon");
      if (!target) return;
      pressTimer = setTimeout(() => _enterEdit(wrap, pager, dots), 700);
    });
    wrap.addEventListener("mouseup", clearPress);
    wrap.addEventListener("mouseleave", clearPress);

    return {
      el: wrap,
      destroy: () => {
        _destroyers.forEach((fn) => { try { fn(); } catch {} });
        _destroyers = [];
        if (wrap.parentNode) wrap.parentNode.removeChild(wrap);
      },
      enterEdit: () => _enterEdit(wrap, pager, dots),
      exitEdit: () => _exitEdit(wrap),
    };
  }

  function _makeIcon(spec, badgeCount) {
    const U = global.Phone.Utils;
    const icon = U.el("div", { class: "app-icon", dataset: { id: spec.id } });

    const box = U.el("div", {
      class: "ai-box",
      html: global.Phone.IconLibrary.get(spec.icon || "app-memo", { size: 32 })
    });
    if (badgeCount > 0) {
      // 主色小圆点（8px，不显示数字）：空 div，由 CSS :empty 渲染
      const badge = U.el("div", { class: "ai-badge" });
      box.appendChild(badge);
    }
    icon.appendChild(box);

    const name = U.el("div", { class: "ai-name", text: spec.name });
    icon.appendChild(name);

    icon.addEventListener("click", (e) => {
      // 拖拽刚结束，抑制这次 click（避免误触隐藏）
      if (_justDragged) { _justDragged = false; e.stopPropagation(); e.preventDefault(); return; }
      if (_editing) {
        e.stopPropagation();
        _toggleHide(spec.id);
        return;
      }
      global.Phone.AppRegistry.open(spec.id);
    });
    return icon;
  }

  async function _toggleHide(appId) {
    const hidden = (await global.Phone.State.get("hiddenApps")) || [];
    let next;
    if (hidden.includes(appId)) next = hidden.filter((x) => x !== appId);
    else next = hidden.concat(appId);
    await global.Phone.State.set("hiddenApps", next);
    const node = document.querySelector('.app-icon[data-id="' + appId + '"]');
    if (node) node.classList.toggle("hidden", next.includes(appId));
  }

  function _enterEdit(wrap, pager, dots) {
    if (_editing) return;
    _editing = true;
    wrap.classList.add("editing-mode");
    wrap.querySelectorAll(".app-icon").forEach((n) => n.classList.add("editing"));

    const banner = global.Phone.Utils.el("div", { class: "desktop-edit-banner anim-slide-up", text: "长按图标拖动排序，点图标隐藏，点完成或空白处退出" });
    wrap.appendChild(banner);

    const doneBtn = global.Phone.Utils.el("button", { class: "btn btn-ghost btn-sm desktop-edit-done", text: "完成" });
    doneBtn.style.cssText = "position:absolute;top:12px;right:16px;z-index:6;";
    doneBtn.addEventListener("click", (e) => { e.stopPropagation(); _exitEdit(wrap); });
    wrap.appendChild(doneBtn);

    // 空白处点击退出编辑（点 banner 自身也退出）
    const onBlankClick = (e) => {
      if (e.target.closest(".app-icon") || e.target === doneBtn) return;
      _exitEdit(wrap);
    };
    wrap.addEventListener("click", onBlankClick);
    _destroyers.push(() => wrap.removeEventListener("click", onBlankClick));

    // 返回键优先退出编辑模式（而非离开桌面）
    global.Phone.Router.setBackGuard(() => {
      if (_editing) { _exitEdit(wrap); return true; }
      return false;
    });

    _enableDragSort(wrap, pager, dots);
  }

  // 拖拽排序：编辑模式下，按住图标拖动到任意位置（跨页也可）
  // 用"移动阈值"判断开始拖拽，避免和点击（隐藏）混淆
  function _enableDragSort(wrap, pager, dots) {
    const U = global.Phone.Utils;
    let draggedIcon = null;
    let placeholder = null;
    let startX = 0, startY = 0;
    let started = false;
    let pointerType = null;     // 'mouse' | 'touch'
    let scrollTimer = null;     // 跨页自动滚动定时器

    function beginDrag(clientX, clientY) {
      const rect = draggedIcon.getBoundingClientRect();
      placeholder = U.el("div", { class: "app-icon drag-placeholder" });
      placeholder.style.width = rect.width + "px";
      placeholder.style.height = rect.height + "px";
      // placeholder 先占住原位
      if (draggedIcon.parentNode) draggedIcon.parentNode.insertBefore(placeholder, draggedIcon);
      draggedIcon.classList.add("dragging");
      draggedIcon.style.position = "fixed";
      draggedIcon.style.zIndex = "1000";
      draggedIcon.style.width = rect.width + "px";
      draggedIcon.style.height = rect.height + "px";
      draggedIcon.style.left = (clientX - rect.width / 2) + "px";
      draggedIcon.style.top = (clientY - rect.height / 2) + "px";
      draggedIcon.style.pointerEvents = "none";
      try { navigator.vibrate && navigator.vibrate(12); } catch {}
    }

    function findNearest(clientX, clientY) {
      const allIcons = Array.from(wrap.querySelectorAll(".app-icon:not(.dragging):not(.drag-placeholder):not(.hidden)"));
      let nearest = null;
      let minDist = Infinity;
      allIcons.forEach((icon) => {
        const r = icon.getBoundingClientRect();
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        const d = Math.hypot(clientX - cx, clientY - cy);
        if (d < minDist) { minDist = d; nearest = icon; }
      });
      return nearest;
    }

    function updateDrag(clientX, clientY) {
      if (!draggedIcon) return;
      draggedIcon.style.left = (clientX - draggedIcon.offsetWidth / 2) + "px";
      draggedIcon.style.top = (clientY - draggedIcon.offsetHeight / 2) + "px";

      // 边缘自动翻页
      const pr = pager.getBoundingClientRect();
      const edge = 44;
      let dir = 0;
      if (clientX < pr.left + edge) dir = -1;
      else if (clientX > pr.right - edge) dir = 1;
      if (dir !== 0) startAutoScroll(dir);
      else stopAutoScroll();

      // 找到最近图标作为插入点（支持跨页：placeholder 跟着最近图标走）
      const nearest = findNearest(clientX, clientY);
      if (nearest && placeholder) {
        const r = nearest.getBoundingClientRect();
        const insertBefore = (clientX < r.left + r.width / 2);
        if (nearest.parentNode !== placeholder.parentNode) {
          // 跨页：placeholder 搬到目标页的 grid
          nearest.parentNode.appendChild(placeholder);
        }
        if (insertBefore && placeholder.nextElementSibling !== nearest) {
          nearest.parentNode.insertBefore(placeholder, nearest);
        } else if (!insertBefore && placeholder.previousElementSibling !== nearest) {
          nearest.parentNode.insertBefore(placeholder, nearest.nextSibling);
        }
      }
    }

    function startAutoScroll(dir) {
      if (scrollTimer) return;
      const step = function () {
        pager.scrollBy({ left: dir * 12, behavior: "auto" });
      };
      scrollTimer = setInterval(step, 16);
    }
    function stopAutoScroll() {
      if (scrollTimer) { clearInterval(scrollTimer); scrollTimer = null; }
    }

    function endDrag() {
      stopAutoScroll();
      if (!draggedIcon) return;
      if (placeholder && placeholder.parentNode) {
        placeholder.parentNode.insertBefore(draggedIcon, placeholder);
        placeholder.remove();
      }
      draggedIcon.classList.remove("dragging");
      draggedIcon.style.cssText = "";
      placeholder = null;
      _saveOrder(wrap);
      // 抑制拖拽结束后的 click（避免误触发隐藏）
      _justDragged = true;
      setTimeout(() => { _justDragged = false; }, 60);
      draggedIcon = null;
      started = false;
      pointerType = null;
    }

    function onDown(target, clientX, clientY, type) {
      if (!_editing) return;
      if (!target || !target.classList.contains("app-icon")) return;
      if (draggedIcon) return;
      draggedIcon = target;
      startX = clientX; startY = clientY;
      started = false;
      pointerType = type;
    }
    function onMove(clientX, clientY) {
      if (!draggedIcon) return;
      if (!started) {
        const dx = clientX - startX, dy = clientY - startY;
        if (Math.hypot(dx, dy) < 8) return;
        started = true;
        beginDrag(startX, startY);
      }
      if (started) {
        if (pointerType === "touch") {
          // 阻止页面滚动，让图标跟手
        }
        updateDrag(clientX, clientY);
      }
    }
    function onUp() {
      if (!draggedIcon) return;
      if (!started) {
        // 没拖动 → 当作点击，由 click 处理
        draggedIcon = null;
        pointerType = null;
        return;
      }
      endDrag();
    }

    // touch
    wrap.addEventListener("touchstart", (e) => {
      if (!_editing) return;
      const t = e.target.closest(".app-icon");
      if (!t) return;
      onDown(t, e.touches[0].clientX, e.touches[0].clientY, "touch");
    }, { passive: true });
    wrap.addEventListener("touchmove", (e) => {
      if (!_editing || !draggedIcon || !started) return;
      e.preventDefault();
      onMove(e.touches[0].clientX, e.touches[0].clientY);
    }, { passive: false });
    wrap.addEventListener("touchend", onUp);
    wrap.addEventListener("touchcancel", onUp);

    // mouse
    wrap.addEventListener("mousedown", (e) => {
      if (!_editing) return;
      const t = e.target.closest(".app-icon");
      if (!t) return;
      onDown(t, e.clientX, e.clientY, "mouse");
    });
    const _onMousemove = (e) => {
      if (!_editing || !draggedIcon) return;
      onMove(e.clientX, e.clientY);
    };
    const _onMouseup = () => onUp();
    document.addEventListener("mousemove", _onMousemove);
    document.addEventListener("mouseup", _onMouseup);
    _destroyers.push(() => {
      document.removeEventListener("mousemove", _onMousemove);
      document.removeEventListener("mouseup", _onMouseup);
      stopAutoScroll();
    });
  }

  async function _saveOrder(wrap) {
    const order = Array.from(wrap.querySelectorAll(".app-icon:not(.drag-placeholder)"))
      .map((n) => n.dataset.id)
      .filter((v, i, arr) => v && arr.indexOf(v) === i); // 去重去空
    await global.Phone.State.set("appOrder", order);
  }

  async function _exitEdit(wrap) {
    if (!_editing) return;
    _editing = false;
    wrap.classList.remove("editing-mode");
    wrap.querySelectorAll(".app-icon").forEach((n) => n.classList.remove("editing"));
    const banner = wrap.querySelector(".desktop-edit-banner");
    if (banner) banner.remove();
    const doneBtn = wrap.querySelector(".desktop-edit-done");
    if (doneBtn) doneBtn.remove();
    // 清掉返回拦截器
    if (global.Phone.Router && global.Phone.Router.setBackGuard) {
      global.Phone.Router.setBackGuard(null);
    }
  }

  // ---------- 暴露 ----------
  global.Phone = global.Phone || {};
  global.Phone.AppGrid = { mount, isEditing: () => _editing };
})(window);
