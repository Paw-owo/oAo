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

      // 我做一个可折叠分组，点击标题展开/收起内容
      collapsible(title, opts, buildFn) {
        opts = opts || {};
        const Icon = global.Phone.IconLibrary;
        const expanded = !!opts.expanded;
        const chevron = U.el("span", {
          class: "ch-chevron" + (expanded ? " open" : ""),
          html: Icon.get("chevron-down", { size: 18 }),
        });
        const header = U.el("div", { class: "collapsible-header" }, [
          U.el("span", { class: "ch-icon", html: opts.icon ? Icon.get(opts.icon, { size: 16 }) : "" }),
          U.el("span", { class: "ch-title", text: title }),
          chevron,
        ]);
        const bodyEl = U.el("div", {
          class: "collapsible-body",
          style: { display: expanded ? "block" : "none" },
        });
        const wrap = U.el("div", { class: "collapsible" }, [header, bodyEl]);
        // 我让 buildFn 拿到子 tools，子 tools 会把外层 tools 追加到 content 的节点搬到 body 里
        if (typeof buildFn === "function") {
          const subTools = _scopedTools(content, bodyEl, tools);
          try { buildFn(subTools); } catch (e) { console.warn("[AppSettings] collapsible build 报错", e); }
        }
        function setExpanded(v) {
          bodyEl.style.display = v ? "block" : "none";
          chevron.classList.toggle("open", v);
        }
        header.addEventListener("click", () => {
          const isOpen = bodyEl.style.display !== "none";
          setExpanded(!isOpen);
        });
        content.appendChild(wrap);
        return {
          el: wrap,
          expand() { setExpanded(true); },
          collapse() { setExpanded(false); },
          toggle() { setExpanded(bodyEl.style.display === "none"); },
        };
      },

      // 我做一个手风琴，多组互斥展开，同一时间只能开一个
      accordion(sections) {
        const container = U.el("div", {});
        const items = [];
        (sections || []).forEach((sec) => {
          const c = tools.collapsible(sec.title, { icon: sec.icon, expanded: sec.expanded }, sec.build);
          items.push(c);
          container.appendChild(c.el);
        });
        // 我给每个 header 加监听：展开当前节时收起其他节
        items.forEach((c, i) => {
          const header = c.el.querySelector(".collapsible-header");
          if (!header) return;
          header.addEventListener("click", () => {
            items.forEach((other, j) => {
              if (i !== j) other.collapse();
            });
          });
        });
        content.appendChild(container);
        return container;
      },

      // 我做一个数据操作快捷组：导出 + 清空（危险），二合一放在一个 group 里
      dataActions(opts2) {
        const Icon = global.Phone.IconLibrary;
        const exportLabel = (opts2 && opts2.exportLabel) || "导出数据";
        const clearLabel = (opts2 && opts2.clearLabel) || "清空数据";
        // 导出行
        const exportRow = _row(U, "download", exportLabel, null, async () => {
          if (opts2 && typeof opts2.export === "function") {
            try { await opts2.export(); } catch (e) { console.warn("[AppSettings] dataActions export 报错", e); }
          }
        });
        // 清空行（危险色）
        const clearRow = U.el("div", { class: "settings-row", style: { cursor: "pointer" } });
        clearRow.appendChild(U.el("div", {
          class: "sr-icon",
          html: Icon.get("trash", { size: 18 }),
          style: { background: "rgba(232, 130, 107, 0.16)", color: "var(--color-danger)" },
        }));
        clearRow.appendChild(U.el("div", { class: "sr-main" }, [
          U.el("div", { class: "sr-title", text: clearLabel, style: { color: "var(--color-danger)" } }),
        ]));
        clearRow.appendChild(U.el("div", { class: "sr-right" }, [
          U.el("span", { class: "chevron", html: Icon.get("chevron-right", { size: 18 }) }),
        ]));
        clearRow.addEventListener("click", async () => {
          if (!opts2 || !opts2.clear || typeof opts2.clear.fn !== "function") return;
          const msg = opts2.clear.msg || "确认清空？此操作不可恢复。";
          const ok = await global.Phone.Modal.confirm({ message: msg, danger: true });
          if (!ok) return;
          try { await opts2.clear.fn(); } catch (e) { console.warn("[AppSettings] dataActions clear 报错", e); }
          global.Phone.Notify.push({ appId: "settings", title: "已清空" });
        });
        const g = U.el("div", { class: "settings-group" }, [exportRow, clearRow]);
        content.appendChild(g);
        return g;
      },

      // 我做一个关于提示卡，带 info 图标的可爱色提示
      aboutHint(text) {
        const Icon = global.Phone.IconLibrary;
        const node = U.el("div", { class: "about-hint" }, [
          U.el("span", { class: "ah-icon", html: Icon.get("info", { size: 16 }) }),
          U.el("span", { class: "ah-text", text: text }),
        ]);
        content.appendChild(node);
        return node;
      },
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

  // 我做一个子 tools：调用外层 tools 的方法后，把追加到 content 的节点搬到 target 里
  // 这样 collapsible 的 buildFn 就能往 body 里构建内容了，支持嵌套
  function _scopedTools(content, target, outerTools) {
    const sub = {};
    for (const k in outerTools) {
      if (typeof outerTools[k] !== "function") continue;
      sub[k] = function () {
        const args = Array.prototype.slice.call(arguments);
        const before = content.children.length;
        const result = outerTools[k].apply(outerTools, args);
        // 外层 tools 方法都会把最终节点追加到 content，我把它搬到 target
        if (content.children.length > before) {
          target.appendChild(content.children[before]);
        }
        return result;
      };
    }
    return sub;
  }

  // ---------- 暴露 ----------
  global.Phone = global.Phone || {};
  global.Phone.AppSettings = { open, mount };
})(window);
