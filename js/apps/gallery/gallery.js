/* ============================================================
   gallery.js — 记仇本 APP
   AI 不开心时自动写入 / 查看 / 编辑 / 原谅 / 按角色或状态筛选
   挂在 window.Phone.Gallery
   ============================================================ */
(function (global) {
  "use strict";

  global.Phone = global.Phone || {};
  global.Phone.AppRegistry.register({
    id: "gallery",
    name: "记仇本",
    icon: "app-gallery",
    entry: () => open(),
    events: ["grudge_created", "grudge_forgiven"],
    settings: [],
    order: 41,
  });

  function open() { global.Phone.Router.push("gallery", mount, {}); }

  async function mount(container) {
    const U = global.Phone.Utils;
    const Storage = global.Phone.Storage;
    const State = global.Phone.State;

    const currentId = await State.get("currentCharacterId");
    const chars = await Storage.getAll("characters");
    const current = chars.find((c) => c.id === currentId) || chars[0];

    const page = U.el("div", { class: "page" });
    const nav = _nav("记仇本");
    // 手动添加
    const addBtn = U.el("button", { class: "icon-btn" });
    addBtn.innerHTML = global.Phone.IconLibrary.get("plus", { size: 22 });
    addBtn.addEventListener("click", () => _edit(null, current, () => _remount(container)));
    nav.querySelector(".nav-right").appendChild(addBtn);
    // 角色切换
    const switchBtn = U.el("button", { class: "icon-btn" });
    switchBtn.innerHTML = global.Phone.IconLibrary.get("switch", { size: 20 });
    switchBtn.addEventListener("click", () => _switchChar(chars, current, () => _remount(container)));
    nav.querySelector(".nav-right").appendChild(switchBtn);
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
          U.el("div", { text: current.name + " 的记仇本", style: { fontWeight: "500" } }),
          U.el("div", { class: "muted", text: "我（AI）不开心时会自动记一笔，你道歉我会原谅", style: { fontSize: "var(--font-xs)" } }),
        ])
      ])
    ]));

    // 筛选 segment
    const filterSeg = U.el("div", { class: "segment", style: { display: "flex", marginBottom: "12px" } });
    const filters = [
      { v: "all", l: "全部" },
      { v: "unforgiven", l: "还没原谅" },
      { v: "forgiven", l: "已原谅" },
    ];
    let curFilter = "all";
    const listWrap = U.el("div", {});

    async function _load() {
      let grudges = await Storage.getByIndex("grudges", "characterId", current.id);
      if (curFilter === "unforgiven") grudges = grudges.filter((g) => !g.forgiven);
      if (curFilter === "forgiven") grudges = grudges.filter((g) => g.forgiven);
      grudges.sort((a, b) => b.createdAt - a.createdAt);
      U.empty(listWrap);
      if (grudges.length === 0) {
        listWrap.appendChild(_empty("没有记仇记录", curFilter === "unforgiven" ? "看来最近我心情不错~" : "我什么都忘了"));
        return;
      }
      grudges.forEach((g) => {
        const item = U.el("div", { class: "grudge-item" + (g.forgiven ? " forgiven" : "") }, [
          U.el("div", { class: "gi-top" }, [
            U.el("div", { class: "row gap-4", style: { alignItems: "center" } }, [
              U.el("div", {
                class: "badge-dot",
                text: g.forgiven ? "已原谅" : "记仇中",
                style: g.forgiven
                  ? { background: "var(--color-success)", color: "#fff", fontSize: "var(--font-xs)", padding: "2px 8px", borderRadius: "var(--radius-full)" }
                  : { background: "var(--color-danger)", color: "#fff", fontSize: "var(--font-xs)", padding: "2px 8px", borderRadius: "var(--radius-full)" }
              }),
            ]),
            U.el("div", { class: "muted", text: U.relTime(g.createdAt), style: { fontSize: "var(--font-xs)" } }),
          ]),
          U.el("div", { class: "gi-content", text: g.content }),
          g.reason ? U.el("div", { class: "gi-reason", text: "起因：" + g.reason }) : null,
          U.el("div", { class: "row gap-4", style: { marginTop: "8px", justifyContent: "flex-end" } }, [
            (() => {
              const b = U.el("button", { class: "btn btn-ghost btn-sm", text: g.forgiven ? "撤回原谅" : "原谅" });
              b.addEventListener("click", async () => {
                g.forgiven = !g.forgiven;
                g.forgivenAt = g.forgiven ? Date.now() : null;
                await Storage.put("grudges", g);
                if (g.forgiven) {
                  global.Phone.EventCenter.emit(global.Phone.EventCenter.TYPES.GRUDGE_FORGIVEN, {
                    sourceApp: "gallery", data: g, summary: "我原谅了一件事：" + g.content.slice(0, 20),
                  });
                }
                global.Phone.Notify.push({ appId: "gallery", title: g.forgiven ? "嘿嘿，原谅你啦~" : "我又记仇了" });
                _load();
              });
              return b;
            })(),
            (() => {
              const b = U.el("button", { class: "icon-btn" });
              b.innerHTML = global.Phone.IconLibrary.get("edit", { size: 16 });
              b.addEventListener("click", () => _edit(g, current, () => _load()));
              return b;
            })(),
            (() => {
              const b = U.el("button", { class: "icon-btn" });
              b.innerHTML = global.Phone.IconLibrary.get("trash", { size: 16 });
              b.addEventListener("click", async () => {
                const ok = await global.Phone.Modal.confirm({
                  title: "删除记仇", message: "把这条记仇删掉？", danger: true, okText: "删除",
                });
                if (!ok) return;
                await Storage.del("grudges", g.id);
                _load();
              });
              return b;
            })(),
          ])
        ]);
        listWrap.appendChild(item);
      });
    }
    filters.forEach((f) => {
      const node = U.el("div", { class: "segment-item" + (curFilter === f.v ? " active" : ""), text: f.l });
      node.addEventListener("click", () => {
        curFilter = f.v;
        filterSeg.querySelectorAll(".segment-item").forEach((n) => n.classList.remove("active"));
        node.classList.add("active");
        _load();
      });
      filterSeg.appendChild(node);
    });
    content.appendChild(filterSeg);
    content.appendChild(listWrap);
    _load();

    page.appendChild(content);
    container.appendChild(page);
  }

  function _edit(grudge, current, onDone) {
    const U = global.Phone.Utils;
    const isEdit = !!grudge;
    const mask = U.el("div", { class: "modal-mask" });
    const modal = U.el("div", { class: "modal" });
    modal.appendChild(U.el("div", { class: "modal-title", text: isEdit ? "编辑记仇" : "记一笔" }));

    const ta = U.el("textarea", { class: "textarea", placeholder: "我记下了什么...", style: { marginTop: "8px", minHeight: "80px" } });
    if (grudge) ta.value = grudge.content || "";
    modal.appendChild(ta);

    const reason = U.el("input", { class: "input", placeholder: "起因（可选）", style: { marginTop: "8px" } });
    if (grudge && grudge.reason) reason.value = grudge.reason;
    modal.appendChild(reason);

    modal.appendChild(U.el("div", { class: "modal-actions" }, [
      U.el("button", { class: "btn btn-ghost", text: "取消", onclick: () => mask.remove() }),
      U.el("button", { class: "btn", text: "保存", onclick: async () => {
        const content = ta.value.trim();
        if (!content) { global.Phone.Notify.push({ appId: "gallery", title: "得写点啥呀" }); return; }
        if (grudge) {
          grudge.content = content;
          grudge.reason = reason.value.trim();
          await global.Phone.Storage.put("grudges", grudge);
        } else {
          const g = {
            id: global.Phone.Utils.uid("grudge"),
            characterId: current ? current.id : null,
            content: content,
            reason: reason.value.trim(),
            forgiven: false,
            createdAt: Date.now(),
          };
          await global.Phone.Storage.put("grudges", g);
          global.Phone.EventCenter.emit(global.Phone.EventCenter.TYPES.GRUDGE_CREATED, {
            sourceApp: "gallery", data: g, summary: "我记了一笔：" + content.slice(0, 20),
          });
        }
        global.Phone.Notify.push({ appId: "gallery", title: "记下啦" });
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
      U.el("div", { class: "es-icon", html: global.Phone.IconLibrary.get("app-gallery", { size: 32 }) }),
      U.el("div", { class: "es-title", text: title }),
      U.el("div", { class: "es-sub", text: sub })
    ]);
  }

  function _remount(container) {
    while (container.firstChild) container.removeChild(container.firstChild);
    mount(container);
  }

  // ---------- 暴露 ----------
  global.Phone.Gallery = { open, mount };
})(window);
