/* ============================================================
   app-settings.js — 共享的 APP 设置面板
   每个 APP 都可以有自己的设置页，我提供统一外壳 + 通用控件

   使用方式：
     Phone.AppSettings.open({
       appId: "wallet",
       title: "钱包设置",
       build: (content, tools) => {
         tools.section("通用");
         tools.toggle("隐藏余额", state, "walletHideBalance", (v) => State.set("walletHideBalance", v));
         tools.segment("货币符号", ["¥","$","€"], "walletCurrency", (v) => State.set("walletCurrency", v));
         tools.input("低余额提醒阈值", "walletLowThreshold", { type: "number" });
         tools.action("清空交易记录", () => _clearTxs());
       }
     });

   挂在 window.Phone.AppSettings
   ============================================================ */
(function (global) {
  "use strict";

  /**
   * 我打开一个 APP 的设置面板
   * @param {object} opts {
   *   appId: string,         // 用于打 data-app 标记
   *   title: string,         // 标题
   *   build: (content, tools) => void   // 构建内容
   * }
   */
  function open(opts) {
    opts = opts || {};
    global.Phone.Router.push("app-settings-" + (opts.appId || "common"), (container) => mount(container, opts), {});
  }

  function mount(container, opts) {
    const U = global.Phone.Utils;
    const State = global.Phone.State;

    const page = U.el("div", { class: "page settings-page" });
    if (opts.appId) page.setAttribute("data-app", opts.appId);
    page.appendChild(_nav(opts.title || "设置"));

    const content = U.el("div", { class: "scroll page-content no-pad" });

    // 工具集（提供给 build 函数）
    const tools = {
      section(title) {
        content.appendChild(U.el("div", { class: "settings-section-title", text: title }));
      },
      group(items) {
        const g = U.el("div", { class: "settings-group" });
        (items || []).forEach((it) => g.appendChild(it));
        content.appendChild(g);
        return g;
      },
      row(icon, title, sub, onClick) {
        return _row(U, icon, title, sub, onClick);
      },
      toggle(title, sub, key, onChange) {
        const cur = State.get(key);
        const node = _toggleRow(U, title, sub, cur, async (v) => {
          await State.set(key, v);
          if (onChange) onChange(v);
        });
        content.appendChild(node.el);
        return node;
      },
      segment(title, items, key, onChange, opts2) {
        const cur = State.get(key);
        content.appendChild(U.el("div", { class: "settings-section-title", text: title }));
        const seg = U.el("div", { class: "segment", style: { display: "flex", flexWrap: "wrap" } });
        items.forEach((it) => {
          const val = typeof it === "string" ? it : it.val;
          const label = typeof it === "string" ? it : it.label;
          const node = U.el("div", { class: "segment-item" + (cur === val ? " active" : ""), text: label });
          node.addEventListener("click", async () => {
            seg.querySelectorAll(".segment-item").forEach((n) => n.classList.remove("active"));
            node.classList.add("active");
            await State.set(key, val);
            if (onChange) onChange(val);
          });
          seg.appendChild(node);
        });
        if (opts2 && opts2.hint) {
          const wrap = U.el("div", { class: "settings-group", style: { padding: "12px 16px" } }, [seg]);
          content.appendChild(wrap);
        } else {
          const wrap = U.el("div", { class: "settings-group", style: { padding: "12px 16px" } }, [seg]);
          content.appendChild(wrap);
        }
        return seg;
      },
      input(label, key, attrs) {
        const cur = State.get(key) || "";
        const group = U.el("div", { class: "settings-group", style: { padding: "16px" } });
        group.appendChild(U.el("div", { class: "form-label", text: label }));
        const inp = U.el("input", Object.assign({ class: "input", value: cur }, attrs || {}));
        const saveBtn = U.el("button", { class: "btn btn-ghost btn-sm", text: "保存", style: { marginTop: "8px" } });
        saveBtn.addEventListener("click", async () => {
          await State.set(key, inp.value.trim());
          global.Phone.Notify.push({ appId: "settings", title: "已保存" });
        });
        group.appendChild(inp);
        group.appendChild(saveBtn);
        content.appendChild(group);
      },
      textarea(label, key, placeholder) {
        const cur = State.get(key) || "";
        const group = U.el("div", { class: "settings-group", style: { padding: "16px" } });
        group.appendChild(U.el("div", { class: "form-label", text: label }));
        const ta = U.el("textarea", { class: "textarea", placeholder: placeholder || "", html: U.escapeHtml(cur) });
        const saveBtn = U.el("button", { class: "btn btn-ghost btn-sm", text: "保存", style: { marginTop: "8px" } });
        saveBtn.addEventListener("click", async () => {
          await State.set(key, ta.value.trim());
          global.Phone.Notify.push({ appId: "settings", title: "已保存" });
        });
        group.appendChild(ta);
        group.appendChild(saveBtn);
        content.appendChild(group);
      },
      action(label, onClick, opts2) {
        const danger = opts2 && opts2.danger;
        const row = U.el("div", { class: "list-item" + (danger ? " danger" : ""), style: { cursor: "pointer" } }, [
          U.el("div", { class: "li-main" }, [U.el("div", { class: "li-title", text: label, style: danger ? { color: "var(--color-danger)" } : {} })]),
        ]);
        row.addEventListener("click", onClick);
        const g = U.el("div", { class: "settings-group" }, [row]);
        content.appendChild(g);
      },
      hint(text) {
        content.appendChild(U.el("div", { class: "form-hint", text: text, style: { padding: "0 16px 8px" } }));
      },
      card(node) {
        const g = U.el("div", { class: "settings-group", style: { padding: "16px" } }, [node]);
        content.appendChild(g);
      },
      // 自定义节点直接追加
      raw(node) { content.appendChild(node); },
    };

    if (typeof opts.build === "function") {
      try { opts.build(content, tools); } catch (e) { console.warn("[AppSettings] build 报错", e); }
    }

    page.appendChild(content);
    container.appendChild(page);
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

  function _row(U, icon, title, sub, onClick) {
    const row = U.el("div", { class: "settings-row" });
    row.appendChild(U.el("div", { class: "sr-icon", html: global.Phone.IconLibrary.get(icon, { size: 18 }) }));
    row.appendChild(U.el("div", { class: "sr-main" }, [
      U.el("div", { class: "sr-title", text: title }),
      sub ? U.el("div", { class: "sr-sub", text: sub }) : null,
    ].filter(Boolean)));
    row.appendChild(U.el("div", { class: "sr-right" }, [U.el("span", { class: "chevron", html: global.Phone.IconLibrary.get("chevron-right", { size: 18 }) })]));
    if (onClick) row.addEventListener("click", onClick);
    return row;
  }

  function _toggleRow(U, title, sub, current, onToggle) {
    const row = U.el("div", { class: "list-item" });
    row.appendChild(U.el("div", { class: "li-main" }, [
      U.el("div", { class: "li-title", text: title }),
      sub ? U.el("div", { class: "li-sub", text: sub }) : null,
    ].filter(Boolean)));
    const sw = U.el("div", { class: "switch" + (current ? " on" : "") });
    sw.addEventListener("click", async () => {
      const v = !sw.classList.contains("on");
      sw.classList.toggle("on", v);
      try { await onToggle(v); } catch (e) { console.warn("[AppSettings] toggle 报错", e); }
    });
    row.appendChild(sw);
    return { el: row, getSwitch: () => sw };
  }

  // ---------- 暴露 ----------
  global.Phone = global.Phone || {};
  global.Phone.AppSettings = { open, mount };
})(window);
