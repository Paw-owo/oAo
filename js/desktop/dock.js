/* ============================================================
   dock.js — 底部 Dock 栏
   4 个图标，毛玻璃背景，从设置 dockApps 读取
   挂在 window.Phone.Dock
   ============================================================ */
(function (global) {
  "use strict";

  let _unsub = null;

  /**
   * 我（Dock）渲染到容器
   * @param {HTMLElement} container
   */
  async function mount(container) {
    if (_unsub) { _unsub(); _unsub = null; }
    const U = global.Phone.Utils;
    const State = global.Phone.State;

    let dockIds = await State.get("dockApps");
    if (!dockIds || !dockIds.length) dockIds = ["chat", "settings", "characters", "worldbook"];

    const dock = U.el("div", { class: "dock" });
    const allApps = global.Phone.AppRegistry.list();
    const badges = await global.Phone.Notify.getBadges();

    // 渲染 dock 项，最多 4 个
    dockIds.slice(0, 4).forEach((id) => {
      const spec = allApps.find((a) => a.id === id);
      if (!spec) return;
      const item = U.el("div", { class: "dock-item", dataset: { id: id } });
      const box = U.el("div", {
        class: "di-box",
        html: global.Phone.IconLibrary.get(spec.icon || "app-memo", { size: 26 })
      });
      const cnt = badges[id] || 0;
      if (cnt > 0) {
        // 主色小圆点（8px，不显示数字）：空 div，由 CSS :empty 渲染
        box.appendChild(U.el("div", { class: "ai-badge" }));
      }
      item.appendChild(box);
      item.addEventListener("click", () => {
        if (global.Phone.AppGrid && global.Phone.AppGrid.isEditing && global.Phone.AppGrid.isEditing()) return;
        global.Phone.AppRegistry.open(id);
      });
      dock.appendChild(item);
    });

    // 不足 4 个补占位
    while (dock.children.length < 4) {
      const placeholder = U.el("div", { class: "dock-item dock-item-empty" });
      dock.appendChild(placeholder);
    }

    container.appendChild(dock);

    // 订阅角标更新
    _unsub = global.Phone.Notify.onBadgeUpdate((map) => {
      dock.querySelectorAll(".dock-item").forEach((node) => {
        const id = node.dataset.id;
        if (!id) return;
        const box = node.querySelector(".di-box");
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
          badge.remove();
        }
      });
    });

    return {
      el: dock,
      destroy: () => {
        if (_unsub) { _unsub(); _unsub = null; }
        if (dock.parentNode) dock.parentNode.removeChild(dock);
      },
      refresh: () => mount(container),
    };
  }

  // ---------- 暴露 ----------
  global.Phone = global.Phone || {};
  global.Phone.Dock = { mount };
})(window);
