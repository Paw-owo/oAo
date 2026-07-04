/* ============================================================
   notifications.js — 通知设置
   总开关 / 分 APP / 免打扰时段 / 角标
   挂在 window.Phone.Notifications
   ============================================================ */
(function (global) {
  "use strict";

  async function mount(container) {
    const U = global.Phone.Utils;
    const State = global.Phone.State;

    const [enabled, dndEnabled, dndStart, dndEnd, badgeEnabled, perApp] = await Promise.all([
      State.get("notifyEnabled"), State.get("dndEnabled"),
      State.get("dndStart"), State.get("dndEnd"),
      State.get("badgeEnabled"), State.get("notifyPerApp") || {},
    ]);

    const page = U.el("div", { class: "page settings-page" });
    page.appendChild(_nav("通知"));

    const content = U.el("div", { class: "scroll page-content" });

    content.appendChild(U.el("div", { class: "settings-section-title", text: "总开关" }));
    content.appendChild(_switchRow("通知总开关", "允许 APP 发送站内通知", enabled, async (v) => {
      await State.set("notifyEnabled", v);
    }, "bell"));

    content.appendChild(_switchRow("桌面角标", "在 APP 图标上显示未读数", badgeEnabled, async (v) => {
      await State.set("badgeEnabled", v);
      global.Phone.Notify.refreshBadges();
    }, "dot"));

    // 免打扰
    content.appendChild(U.el("div", { class: "settings-section-title", text: "免打扰时段" }));
    content.appendChild(_switchRow("开启免打扰", "在指定时段不弹通知", dndEnabled, async (v) => {
      await State.set("dndEnabled", v);
    }, "moon"));
    const dndRow = U.el("div", { class: "settings-group" });
    dndRow.style.padding = "12px 16px";
    dndRow.style.background = "var(--bg-surface)";
    dndRow.style.margin = "0 16px";
    dndRow.style.borderRadius = "var(--radius-lg)";
    dndRow.appendChild(U.el("div", { class: "row", style: { gap: "12px", alignItems: "center" } }, [
      U.el("span", { text: "从", style: { color: "var(--text-secondary)", fontSize: "var(--font-sm)" } }),
      (() => {
        const inp = U.el("input", { type: "time", class: "input", value: dndStart || "23:00", style: { width: "auto" } });
        inp.addEventListener("change", () => State.set("dndStart", inp.value));
        return inp;
      })(),
      U.el("span", { text: "到", style: { color: "var(--text-secondary)", fontSize: "var(--font-sm)" } }),
      (() => {
        const inp = U.el("input", { type: "time", class: "input", value: dndEnd || "07:00", style: { width: "auto" } });
        inp.addEventListener("change", () => State.set("dndEnd", inp.value));
        return inp;
      })(),
    ]));
    content.appendChild(dndRow);

    // 分 APP 通知
    content.appendChild(U.el("div", { class: "settings-section-title", text: "分 APP 通知" }));
    const group = U.el("div", { class: "settings-group" });
    const allApps = global.Phone.AppRegistry.list();
    allApps.forEach((a) => {
      const on = perApp[a.id] !== false;
      const row = U.el("div", { class: "settings-row" });
      row.appendChild(U.el("div", { class: "sr-icon", html: global.Phone.IconLibrary.get(a.icon, { size: 16 }) }));
      row.appendChild(U.el("div", { class: "sr-main" }, [U.el("div", { class: "sr-title", text: a.name })]));
      const sw = U.el("div", { class: "switch" + (on ? " on" : "") });
      sw.addEventListener("click", async () => {
        const newVal = !(perApp[a.id] !== false);
        perApp[a.id] = newVal;
        await State.set("notifyPerApp", perApp);
        sw.classList.toggle("on", newVal);
      });
      row.appendChild(sw);
      group.appendChild(row);
    });
    content.appendChild(group);

    page.appendChild(content);
    container.appendChild(page);
  }

  function _switchRow(title, sub, value, onToggle, icon) {
    const U = global.Phone.Utils;
    const row = U.el("div", { class: "list-item" });
    if (icon) {
      row.appendChild(U.el("div", { class: "li-avatar", style: { background: "var(--color-primary-ultralight)", color: "var(--color-primary-deep)" }, html: global.Phone.IconLibrary.get(icon, { size: 18 }) }));
    }
    row.appendChild(U.el("div", { class: "li-main" }, [
      U.el("div", { class: "li-title", text: title }),
      sub ? U.el("div", { class: "li-sub", text: sub }) : null,
    ]));
    const sw = U.el("div", { class: "switch" + (value ? " on" : "") });
    let cur = value;
    sw.addEventListener("click", async () => {
      cur = !cur;
      sw.classList.toggle("on", cur);
      await onToggle(cur);
    });
    row.appendChild(sw);
    return row;
  }

  function _nav(title) {
    const U = global.Phone.Utils;
    const nav = U.el("div", { class: "navbar" });
    const navLeft = U.el("div", { class: "nav-left" });
    const back = U.el("button", { class: "icon-btn" });
    back.innerHTML = global.Phone.IconLibrary.get("chevron-left", { size: 22 });
    back.addEventListener("click", () => global.Phone.Router.back());
    navLeft.appendChild(back);
    nav.appendChild(navLeft);
    nav.appendChild(U.el("div", { class: "nav-title", text: title }));
    nav.appendChild(U.el("div", { class: "nav-right" }));
    return nav;
  }

  // ---------- 暴露 ----------
  global.Phone = global.Phone || {};
  global.Phone.Notifications = { mount };
})(window);
