/* ============================================================
   memory.js — 记忆系统 APP
   按角色隔离查看 / 编辑 / 删除 / 筛选 / 导出 / 清空
   挂在 window.Phone.Memory
   ============================================================ */
(function (global) {
  "use strict";

  global.Phone = global.Phone || {};
  global.Phone.AppRegistry.register({
    id: "memory",
    name: "记忆",
    icon: "app-memory",
    entry: () => open(),
    events: ["memory_added", "memory_deleted"],
    settings: [],
    order: 50,
  });

  function open() { global.Phone.Router.push("memory", mount, {}); }

  async function mount(container) {
    const U = global.Phone.Utils;
    const Storage = global.Phone.Storage;
    const State = global.Phone.State;

    const currentId = await State.get("currentCharacterId");
    const chars = await Storage.getAll("characters");
    const current = chars.find((c) => c.id === currentId) || chars[0];

    const page = U.el("div", { class: "page" });
    const nav = _nav("记忆系统");
    // 角色切换
    const switchBtn = U.el("button", { class: "icon-btn" });
    switchBtn.innerHTML = global.Phone.IconLibrary.get("switch", { size: 20 });
    switchBtn.addEventListener("click", () => _switchChar(chars, current, () => _remount(container)));
    nav.querySelector(".nav-right").appendChild(switchBtn);
    const clearBtn = U.el("button", { class: "icon-btn" });
    clearBtn.innerHTML = global.Phone.IconLibrary.get("trash", { size: 20 });
    clearBtn.addEventListener("click", async () => {
      if (!current) return;
      const ok = await global.Phone.Modal.confirm({
        title: "清空记忆", message: "清空「" + current.name + "」的所有记忆吗？", danger: true, okText: "清空",
      });
      if (!ok) return;
      const mems = await Storage.getByIndex("memories", "characterId", current.id);
      for (const m of mems) await Storage.del("memories", m.id);
      global.Phone.Notify.push({ appId: "memory", title: "已清空记忆" });
      _remount(container);
    });
    nav.querySelector(".nav-right").appendChild(clearBtn);
    page.appendChild(nav);

    const content = U.el("div", { class: "scroll page-content" });

    if (!current) {
      content.appendChild(_empty("还没有角色", "先去创建一个角色吧"));
      page.appendChild(content);
      container.appendChild(page);
      return;
    }

    // 当前角色提示
    content.appendChild(U.el("div", { class: "card-soft", style: { marginBottom: "12px" } }, [
      U.el("div", { class: "row gap-8" }, [
        U.el("div", { class: "avatar avatar-sm", text: (current.name || "?").slice(0, 1) }),
        U.el("div", {}, [
          U.el("div", { text: current.name, style: { fontWeight: "500" } }),
          U.el("div", { class: "muted", text: "记忆严格按角色隔离，A 不知道 B", style: { fontSize: "var(--font-xs)" } }),
        ])
      ])
    ]));

    // 筛选
    const filterSeg = U.el("div", { class: "segment", style: { display: "flex", marginBottom: "12px", flexWrap: "wrap" } });
    const types = [
      { v: "all", l: "全部" },
      { v: "conversation", l: "对话" },
      { v: "event", l: "事件" },
      { v: "preference", l: "喜好" },
      { v: "fact", l: "事实" },
    ];
    let curType = "all";
    const listWrap = U.el("div", {});
    async function _load() {
      let mems = await Storage.getByIndex("memories", "characterId", current.id);
      if (curType !== "all") mems = mems.filter((m) => m.type === curType);
      mems.sort((a, b) => b.createdAt - a.createdAt);
      U.empty(listWrap);
      if (mems.length === 0) {
        listWrap.appendChild(_empty("还没有记忆", "和 AI 聊天时重要的事会自动记下"));
        return;
      }
      const typeIcon = { conversation: "app-chat", event: "bell", preference: "heart", fact: "info" };
      mems.forEach((m) => {
        const item = U.el("div", { class: "mem-item" }, [
          U.el("div", { class: "mi-icon", html: global.Phone.IconLibrary.get(typeIcon[m.type] || "app-memory", { size: 16 }) }),
          U.el("div", { class: "mi-main" }, [
            U.el("div", { class: "mi-content", text: m.content }),
            U.el("div", { class: "mi-meta" }, [
              U.el("span", { text: U.relTime(m.createdAt) }),
              U.el("span", { text: "· " + (m.type || "对话") }),
              m.importance ? U.el("span", { text: "· 重要度 " + m.importance }) : null,
            ]),
          ]),
          U.el("div", { class: "row gap-4" }, [
            (() => {
              const b = U.el("button", { class: "icon-btn" });
              b.innerHTML = global.Phone.IconLibrary.get("edit", { size: 16 });
              b.addEventListener("click", () => _edit(m, () => _load()));
              return b;
            })(),
            (() => {
              const b = U.el("button", { class: "icon-btn" });
              b.innerHTML = global.Phone.IconLibrary.get("trash", { size: 16 });
              b.addEventListener("click", async () => {
                const ok = await global.Phone.Modal.confirm({
                  title: "删除记忆", message: "删除这条记忆？", danger: true, okText: "删除",
                });
                if (!ok) return;
                await Storage.del("memories", m.id);
                _load();
              });
              return b;
            })(),
          ])
        ]);
        listWrap.appendChild(item);
      });
    }
    types.forEach((t) => {
      const node = U.el("div", { class: "segment-item" + (curType === t.v ? " active" : ""), text: t.l });
      node.addEventListener("click", () => {
        curType = t.v;
        filterSeg.querySelectorAll(".segment-item").forEach((n) => n.classList.remove("active"));
        node.classList.add("active");
        _load();
      });
      filterSeg.appendChild(node);
    });
    content.appendChild(filterSeg);
    content.appendChild(listWrap);
    _load();

    // 导出按钮
    const exportBtn = U.el("button", { class: "btn btn-ghost btn-sm btn-block", text: "导出当前角色记忆", style: { marginTop: "16px" } });
    exportBtn.addEventListener("click", async () => {
      const mems = await Storage.getByIndex("memories", "characterId", current.id);
      const data = { character: current.name, exportedAt: Date.now(), memories: mems };
      U.download(current.name + "_记忆.json", JSON.stringify(data, null, 2), "application/json");
    });
    content.appendChild(exportBtn);

    page.appendChild(content);
    container.appendChild(page);
  }

  function _edit(mem, onDone) {
    const U = global.Phone.Utils;
    const mask = U.el("div", { class: "modal-mask" });
    const modal = U.el("div", { class: "modal" });
    modal.appendChild(U.el("div", { class: "modal-title", text: "编辑记忆" }));
    const ta = U.el("textarea", { class: "textarea", html: U.escapeHtml(mem.content || ""), style: { marginTop: "8px" } });
    modal.appendChild(ta);
    const imp = U.el("input", { class: "input", type: "number", min: "1", max: "10", value: String(mem.importance || 5), style: { marginTop: "8px" } });
    modal.appendChild(imp);
    modal.appendChild(U.el("div", { class: "form-hint", text: "重要度 1-10" }));
    modal.appendChild(U.el("div", { class: "modal-actions" }, [
      U.el("button", { class: "btn btn-ghost", text: "取消", onclick: () => mask.remove() }),
      U.el("button", { class: "btn", text: "保存", onclick: async () => {
        mem.content = ta.value.trim();
        mem.importance = parseInt(imp.value) || 5;
        await global.Phone.Storage.put("memories", mem);
        mask.remove(); onDone();
      }})
    ]));
    mask.appendChild(modal);
    mask.addEventListener("click", (e) => { if (e.target === mask) mask.remove(); });
    document.body.appendChild(mask);
  }

  function _switchChar(chars, current, onDone) {
    const U = global.Phone.Utils;
    const mask = U.el("div", { class: "modal-mask" });
    const modal = U.el("div", { class: "modal" });
    modal.appendChild(U.el("div", { class: "modal-title", text: "切换角色" }));
    const list = U.el("div", { class: "new-chat-list", style: { maxHeight: "40vh", overflowY: "auto" } });
    chars.forEach((c) => {
      const item = U.el("div", { class: "list-item" + (c.id === current.id ? " active" : "") }, [
        U.el("div", { class: "li-avatar", text: (c.name || "?").slice(0, 1) }),
        U.el("div", { class: "li-main" }, [U.el("div", { class: "li-title", text: c.name })]),
      ]);
      item.addEventListener("click", async () => {
        await global.Phone.State.set("currentCharacterId", c.id);
        mask.remove(); onDone();
      });
      list.appendChild(item);
    });
    modal.appendChild(list);
    modal.appendChild(U.el("div", { class: "modal-actions" }, [U.el("button", { class: "btn btn-ghost", text: "取消", onclick: () => mask.remove() })]));
    mask.appendChild(modal);
    mask.addEventListener("click", (e) => { if (e.target === mask) mask.remove(); });
    document.body.appendChild(mask);
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

  function _empty(title, sub) {
    const U = global.Phone.Utils;
    return U.el("div", { class: "empty-state" }, [
      U.el("div", { class: "es-icon", html: global.Phone.IconLibrary.get("app-memory", { size: 32 }) }),
      U.el("div", { class: "es-title", text: title }),
      U.el("div", { class: "es-sub", text: sub })
    ]);
  }

  function _remount(container) {
    while (container.firstChild) container.removeChild(container.firstChild);
    mount(container);
  }

  // ---------- 暴露 ----------
  global.Phone.Memory = { open, mount };
})(window);
