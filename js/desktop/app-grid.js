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

  /**
   * 我（APP 网格）渲染到容器
   * @param {HTMLElement} container
   */
  async function mount(container) {
    const U = global.Phone.Utils;
    const State = global.Phone.State;

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
    pages.forEach((pageApps, pageIdx) => {
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
          // 有数量才显示，没有 badge 元素就创建
          if (!badge) {
            badge = U.el("div", { class: "ai-badge" });
            if (box) box.appendChild(badge);
          }
          badge.textContent = cnt > 99 ? "99+" : String(cnt);
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
    let pressTarget = null;
    function clearPress() { pressTimer = null; pressTarget = null; }
    wrap.addEventListener("touchstart", (e) => {
      const target = e.target.closest(".app-icon");
      if (!target) return;
      pressTarget = target;
      pressTimer = setTimeout(() => _enterEdit(wrap, pager, dots), 600);
    });
    wrap.addEventListener("touchend", clearPress);
    wrap.addEventListener("touchmove", clearPress);
    wrap.addEventListener("mousedown", (e) => {
      const target = e.target.closest(".app-icon");
      if (!target) return;
      pressTarget = target;
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
      const badge = U.el("div", { class: "ai-badge", text: badgeCount > 99 ? "99+" : String(badgeCount) });
      box.appendChild(badge);
    }
    icon.appendChild(box);

    const name = U.el("div", { class: "ai-name", text: spec.name });
    icon.appendChild(name);

    icon.addEventListener("click", (e) => {
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
    wrap.querySelectorAll(".app-icon").forEach((n) => n.classList.add("editing"));
    const banner = global.Phone.Utils.el("div", { class: "desktop-edit-banner anim-slide-up", text: "长按图标拖动排序，点图标隐藏，点完成退出" });
    wrap.appendChild(banner);

    const doneBtn = global.Phone.Utils.el("button", { class: "btn btn-ghost btn-sm desktop-edit-done", text: "完成" });
    doneBtn.style.cssText = "position:absolute;top:12px;right:16px;z-index:6;";
    doneBtn.addEventListener("click", () => _exitEdit(wrap));
    wrap.appendChild(doneBtn);

    _enableDragSort(wrap, pager, dots);
  }

  // 拖拽排序：编辑模式下，长按图标可拖动到任意位置（跨页也可）
  function _enableDragSort(wrap, pager, dots) {
    const U = global.Phone.Utils;
    let dragTimer = null;
    let draggedIcon = null;
    let placeholder = null;

    function onStart(target, clientX, clientY) {
      if (!target || !target.classList.contains("app-icon")) return;
      dragTimer = setTimeout(() => {
        draggedIcon = target;
        const rect = target.getBoundingClientRect();
        placeholder = U.el("div", { class: "app-icon drag-placeholder" });
        placeholder.style.width = rect.width + "px";
        placeholder.style.height = rect.height + "px";
        target.classList.add("dragging");
        target.style.position = "fixed";
        target.style.zIndex = "1000";
        target.style.left = rect.left + "px";
        target.style.top = rect.top + "px";
        target.style.width = rect.width + "px";
        target.style.height = rect.height + "px";
        target.style.pointerEvents = "none";
      }, 300);
    }

    function onMove(clientX, clientY) {
      if (dragTimer && !draggedIcon) {
        // 还没开始拖，先不处理
      }
      if (!draggedIcon) return;
      draggedIcon.style.left = (clientX - draggedIcon.offsetWidth / 2) + "px";
      draggedIcon.style.top = (clientY - draggedIcon.offsetHeight / 2) + "px";

      // 找到最近的图标作为插入点
      const allIcons = Array.from(wrap.querySelectorAll(".app-icon:not(.dragging):not(.drag-placeholder)"));
      let nearest = null;
      let minDist = Infinity;
      allIcons.forEach((icon) => {
        const r = icon.getBoundingClientRect();
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        const d = Math.hypot(clientX - cx, clientY - cy);
        if (d < minDist) { minDist = d; nearest = icon; }
      });
      if (nearest && placeholder) {
        const r = nearest.getBoundingClientRect();
        const insertBefore = (clientX < r.left + r.width / 2);
        if (insertBefore && placeholder.nextElementSibling !== nearest) {
          nearest.parentNode.insertBefore(placeholder, nearest);
        } else if (!insertBefore && placeholder.previousElementSibling !== nearest) {
          nearest.parentNode.insertBefore(placeholder, nearest.nextSibling);
        }
      }
    }

    function onEnd() {
      if (dragTimer) { clearTimeout(dragTimer); dragTimer = null; }
      if (!draggedIcon) return;
      // 把拖动的图标放到 placeholder 位置
      if (placeholder && placeholder.parentNode) {
        placeholder.parentNode.insertBefore(draggedIcon, placeholder);
        placeholder.remove();
      }
      draggedIcon.classList.remove("dragging");
      draggedIcon.style.cssText = "";
      _saveOrder(wrap);
      draggedIcon = null;
      placeholder = null;
    }

    wrap.addEventListener("touchstart", (e) => {
      if (!_editing) return;
      const t = e.target.closest(".app-icon");
      if (t) onStart(t, e.touches[0].clientX, e.touches[0].clientY);
    }, { passive: true });
    wrap.addEventListener("touchmove", (e) => {
      if (!_editing || !draggedIcon) return;
      e.preventDefault();
      onMove(e.touches[0].clientX, e.touches[0].clientY);
    }, { passive: false });
    wrap.addEventListener("touchend", onEnd);

    // 鼠标拖拽：mousedown 在 wrap 上触发，mousemove/mouseup 绑到 document
    // 否则图标变 position:fixed 后鼠标移出 wrap 就收不到事件
    wrap.addEventListener("mousedown", (e) => {
      if (!_editing) return;
      const t = e.target.closest(".app-icon");
      if (t) onStart(t, e.clientX, e.clientY);
    });
    const _onMousemove = (e) => {
      if (!_editing || !draggedIcon) return;
      onMove(e.clientX, e.clientY);
    };
    const _onMouseup = () => onEnd();
    document.addEventListener("mousemove", _onMousemove);
    document.addEventListener("mouseup", _onMouseup);
    // 退出编辑模式时清理 document 监听器
    _destroyers.push(() => {
      document.removeEventListener("mousemove", _onMousemove);
      document.removeEventListener("mouseup", _onMouseup);
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
    wrap.querySelectorAll(".app-icon").forEach((n) => n.classList.remove("editing"));
    const banner = wrap.querySelector(".desktop-edit-banner");
    if (banner) banner.remove();
    const doneBtn = wrap.querySelector(".desktop-edit-done");
    if (doneBtn) doneBtn.remove();
  }

  // ---------- 暴露 ----------
  global.Phone = global.Phone || {};
  global.Phone.AppGrid = { mount, isEditing: () => _editing };
})(window);
