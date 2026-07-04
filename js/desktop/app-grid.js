/* ============================================================
   app-grid.js — APP 图标网格
   4 列布局，从 AppRegistry 动态渲染
   支持长按编辑（拖拽排序 / 删除 / 隐藏）
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
    const grid = U.el("div", { class: "app-grid" });
    grid.style.setProperty("--cols", cols);
    wrap.appendChild(grid);

    // 获取 APP 列表（按 appOrder 或默认顺序）
    const allApps = global.Phone.AppRegistry.list();
    const orderList = (appOrder && appOrder.length) ? appOrder : global.Phone.AppRegistry.DEFAULT_APP_ORDER;
    const sorted = orderList
      .map((id) => allApps.find((a) => a.id === id))
      .filter(Boolean)
      .concat(allApps.filter((a) => !orderList.includes(a.id)));

    const badges = await global.Phone.Notify.getBadges();

    sorted.forEach((spec) => {
      const isHidden = hidden.includes(spec.id);
      const icon = _makeIcon(spec, isHidden, badges[spec.id] || 0);
      grid.appendChild(icon);
    });

    container.appendChild(wrap);

    // 订阅角标更新
    const unsub = global.Phone.Notify.onBadgeUpdate((map) => {
      grid.querySelectorAll(".app-icon").forEach((node) => {
        const id = node.dataset.id;
        const badge = node.querySelector(".ai-badge");
        const cnt = map[id] || 0;
        if (badge) {
          if (cnt > 0) { badge.textContent = cnt > 99 ? "99+" : String(cnt); }
          else { badge.textContent = ""; badge.classList.add("hidden"); }
        }
      });
    });
    _destroyers.push(unsub);

    // 长按进入编辑模式
    let pressTimer = null;
    wrap.addEventListener("touchstart", (e) => {
      const target = e.target.closest(".app-icon");
      if (!target) return;
      pressTimer = setTimeout(() => _enterEdit(wrap), 600);
    });
    wrap.addEventListener("touchend", () => clearTimeout(pressTimer));
    wrap.addEventListener("touchmove", () => clearTimeout(pressTimer));
    wrap.addEventListener("mousedown", (e) => {
      const target = e.target.closest(".app-icon");
      if (!target) return;
      pressTimer = setTimeout(() => _enterEdit(wrap), 700);
    });
    wrap.addEventListener("mouseup", () => clearTimeout(pressTimer));
    wrap.addEventListener("mouseleave", () => clearTimeout(pressTimer));

    return {
      el: wrap,
      destroy: () => {
        _destroyers.forEach((fn) => { try { fn(); } catch {} });
        _destroyers = [];
        if (wrap.parentNode) wrap.parentNode.removeChild(wrap);
      },
      enterEdit: () => _enterEdit(wrap),
      exitEdit: () => _exitEdit(wrap),
    };
  }

  function _makeIcon(spec, isHidden, badgeCount) {
    const U = global.Phone.Utils;
    const icon = U.el("div", { class: "app-icon" + (isHidden ? " hidden" : ""), dataset: { id: spec.id } });

    const box = U.el("div", { class: "ai-box" }, {
      html: global.Phone.IconLibrary.get(spec.icon || "app-memo", { size: 32 })
    });
    if (badgeCount > 0) {
      const badge = U.el("div", { class: "ai-badge", text: badgeCount > 99 ? "99+" : String(badgeCount) });
      box.appendChild(badge);
    } else {
      box.appendChild(U.el("div", { class: "ai-badge hidden" }));
    }
    icon.appendChild(box);

    const name = U.el("div", { class: "ai-name", text: spec.name });
    icon.appendChild(name);

    icon.addEventListener("click", (e) => {
      if (_editing) {
        // 编辑模式下点击 = 隐藏切换
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

  function _enterEdit(wrap) {
    if (_editing) return;
    _editing = true;
    wrap.querySelectorAll(".app-icon").forEach((n) => n.classList.add("editing"));
    const banner = global.Phone.Utils.el("div", { class: "desktop-edit-banner anim-slide-up", text: "点图标可以隐藏，长按拖动排序，点完成退出" });
    wrap.appendChild(banner);

    const doneBtn = global.Phone.Utils.el("button", { class: "btn btn-ghost btn-sm desktop-edit-done", text: "完成" });
    doneBtn.style.cssText = "position:absolute;top:12px;right:16px;z-index:6;";
    doneBtn.addEventListener("click", () => _exitEdit(wrap));
    wrap.appendChild(doneBtn);
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
  global.Phone.AppGrid = { mount };
})(window);
