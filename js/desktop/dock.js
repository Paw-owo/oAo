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
        box.appendChild(U.el("div", { class: "ai-badge", text: cnt > 99 ? "99+" : String(cnt) }));
      } else {
        box.appendChild(U.el("div", { class: "ai-badge hidden" }));
      }
      item.appendChild(box);
      item.addEventListener("click", () => {
        if (_editing) return;
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
        const badge = node.querySelector(".ai-badge");
        if (!badge) return;
        const cnt = map[id] || 0;
        if (cnt > 0) {
          badge.textContent = cnt > 99 ? "99+" : String(cnt);
          badge.classList.remove("hidden");
        } else {
          badge.textContent = "";
          badge.classList.add("hidden");
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
