/* ============================================================
   memo.js — 备忘录 APP
   CRUD / 完成 / 置顶 / 提醒 / 搜索 / 事件联动
   挂在 window.Phone.Memo

   main.js 启动时会调 Phone.Memo.checkReminders() 检查过期提醒
   ============================================================ */
(function (global) {
  "use strict";

  global.Phone = global.Phone || {};
  global.Phone.AppRegistry.register({
    id: "memo",
    name: "备忘录",
    icon: "app-memo",
    entry: () => open(),
    events: ["memo_created", "memo_reminded"],
    settings: [],
    order: 81,
  });

  function open() { global.Phone.Router.push("memo", mount, {}); }

  async function mount(container) {
    const U = global.Phone.Utils;
    const Storage = global.Phone.Storage;

    const page = U.el("div", { class: "page" });
    page.appendChild(_nav(U, "备忘录", () => _edit(U, null, () => _remount(container))));

    const content = U.el("div", { class: "scroll page-content", style: { padding: "16px" } });

    // 搜索
    const search = U.el("input", { class: "input", placeholder: "搜索备忘...", style: { marginBottom: "12px" } });
    content.appendChild(search);

    // 筛选
    const filterSeg = U.el("div", { class: "segment", style: { display: "flex", marginBottom: "12px" } });
    const filters = [
      { v: "all", l: "全部" },
      { v: "pending", l: "待办" },
      { v: "done", l: "已完成" },
    ];
    let curFilter = "all";
    const listWrap = U.el("div", {});

    async function _load() {
      let memos = await Storage.getAll("memos");
      const kw = search.value.trim().toLowerCase();
      if (kw) {
        memos = memos.filter((m) =>
          (m.title || "").toLowerCase().includes(kw) ||
          (m.content || "").toLowerCase().includes(kw)
        );
      }
      if (curFilter === "pending") memos = memos.filter((m) => !m.completed);
      if (curFilter === "done") memos = memos.filter((m) => m.completed);
      // 排序：置顶 > 未完成 > 已完成，同级按提醒时间升序，无提醒按更新时间降序
      memos.sort((a, b) => {
        if (!!b.pinned - !!a.pinned !== 0) return (!!b.pinned ? 1 : 0) - (!!a.pinned ? 1 : 0);
        if (!!a.completed - !!b.completed !== 0) return (!!a.completed ? 1 : 0) - (!!b.completed ? 1 : 0);
        const at = a.remindAt || 0, bt = b.remindAt || 0;
        if (at && bt) return at - bt;
        if (at) return -1;
        if (bt) return 1;
        return (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0);
      });
      U.empty(listWrap);
      if (memos.length === 0) {
        listWrap.appendChild(_empty(U, kw ? "没找到相关备忘" : "还没有备忘", kw ? "换个关键词试试" : "点右上角写一条吧~"));
        return;
      }
      memos.forEach((m) => {
        listWrap.appendChild(_memoCard(U, m, () => _load(), () => _edit(U, m, () => _load())));
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

    search.addEventListener("input", global.Phone.Utils.debounce(_load, 200));
    content.appendChild(listWrap);
    _load();

    page.appendChild(content);
    container.appendChild(page);
  }

  // ---------- 备忘卡 ----------
  function _memoCard(U, m, onReload, onEdit) {
    const card = U.el("div", { class: "memo-item" + (m.completed ? " completed" : "") + (m.pinned ? " pinned" : "") });
    if (m.remindAt && !m.completed && m.remindAt < Date.now()) {
      card.classList.add("overdue");
    }
    card.appendChild(U.el("div", { class: "mi-top" }, [
      U.el("div", { class: "row gap-4", style: { alignItems: "center" } }, [
        (() => {
          const cb = U.el("button", { class: "icon-btn" });
          cb.innerHTML = global.Phone.IconLibrary.get(m.completed ? "check" : "circle", { size: 18 });
          cb.addEventListener("click", async () => {
            m.completed = !m.completed;
            m.completedAt = m.completed ? Date.now() : null;
            m.updatedAt = Date.now();
            await global.Phone.Storage.put("memos", m);
            onReload();
          });
          return cb;
        })(),
        U.el("div", { class: "mi-title" + (m.completed ? " done" : ""), text: m.title || "（无标题）" }),
      ]),
      U.el("div", { class: "row gap-4" }, [
        (() => {
          const b = U.el("button", { class: "icon-btn" });
          b.innerHTML = global.Phone.IconLibrary.get(m.pinned ? "pin-fill" : "pin", { size: 16 });
          b.addEventListener("click", async () => {
            m.pinned = !m.pinned;
            m.updatedAt = Date.now();
            await global.Phone.Storage.put("memos", m);
            onReload();
          });
          return b;
        })(),
        (() => {
          const b = U.el("button", { class: "icon-btn" });
          b.innerHTML = global.Phone.IconLibrary.get("edit", { size: 16 });
          b.addEventListener("click", onEdit);
          return b;
        })(),
        (() => {
          const b = U.el("button", { class: "icon-btn" });
          b.innerHTML = global.Phone.IconLibrary.get("trash", { size: 16 });
          b.addEventListener("click", async () => {
            const ok = await global.Phone.Modal.confirm({ title: "删除备忘", message: "删除「" + (m.title || "无标题") + "」？", danger: true });
            if (!ok) return;
            await global.Phone.Storage.del("memos", m.id);
            onReload();
          });
          return b;
        })(),
      ]),
    ]));

    if (m.content) {
      card.appendChild(U.el("div", { class: "mi-content", text: m.content }));
    }
    if (m.remindAt) {
      const overdue = !m.completed && m.remindAt < Date.now();
      card.appendChild(U.el("div", { class: "mi-remind" + (overdue ? " overdue" : ""), text: (overdue ? "已过期 " : "提醒 ") + global.Phone.Utils.fmtDateTime(m.remindAt) }));
    }
    return card;
  }

  // ---------- 编辑 ----------
  function _edit(U, memo, onDone) {
    const isEdit = !!memo;
    const mask = U.el("div", { class: "modal-mask" });
    const modal = U.el("div", { class: "modal" });
    modal.appendChild(U.el("div", { class: "modal-title", text: isEdit ? "编辑备忘" : "新建备忘" }));

    const titleInput = U.el("input", { class: "input", placeholder: "标题", style: { marginTop: "8px" } });
    if (memo) titleInput.value = memo.title || "";
    modal.appendChild(titleInput);

    const contentInput = U.el("textarea", { class: "textarea", placeholder: "内容...", style: { marginTop: "8px", minHeight: "100px" } });
    if (memo) contentInput.value = memo.content || "";
    modal.appendChild(contentInput);

    const catInput = U.el("input", { class: "input", placeholder: "分类（可选）", style: { marginTop: "8px" } });
    if (memo) catInput.value = memo.category || "";
    modal.appendChild(catInput);

    // 提醒时间
    const remindWrap = U.el("div", { class: "row gap-8", style: { marginTop: "8px", alignItems: "center" } });
    const remindInput = U.el("input", { class: "input", type: "datetime-local", style: { flex: "1" } });
    if (memo && memo.remindAt) {
      const d = new Date(memo.remindAt);
      const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
      remindInput.value = local;
    }
    remindWrap.appendChild(U.el("div", { class: "muted", text: "提醒", style: { fontSize: "var(--font-xs)" } }));
    remindWrap.appendChild(remindInput);
    modal.appendChild(remindWrap);

    modal.appendChild(U.el("div", { class: "modal-actions" }, [
      U.el("button", { class: "btn btn-ghost", text: "取消", onclick: () => mask.remove() }),
      U.el("button", { class: "btn", text: "保存", onclick: async () => {
        const title = titleInput.value.trim();
        const content = contentInput.value.trim();
        if (!title && !content) {
          global.Phone.Notify.push({ appId: "memo", title: "写点啥再保存吧" });
          return;
        }
        const remindAt = remindInput.value ? new Date(remindInput.value).getTime() : null;
        const Storage = global.Phone.Storage;
        if (memo) {
          memo.title = title;
          memo.content = content;
          memo.category = catInput.value.trim();
          memo.remindAt = remindAt;
          memo.updatedAt = Date.now();
          await Storage.put("memos", memo);
        } else {
          const m = {
            id: U.uid("memo"), title, content,
            category: catInput.value.trim(),
            completed: false, completedAt: null,
            pinned: false, remindAt,
            createdAt: Date.now(), updatedAt: Date.now(),
          };
          await Storage.put("memos", m);
          global.Phone.EventCenter.emit(global.Phone.EventCenter.TYPES.MEMO_CREATED, {
            sourceApp: "memo", data: m,
            summary: "新建备忘：" + (title || content.slice(0, 20)),
          });
        }
        global.Phone.Notify.push({ appId: "memo", title: isEdit ? "已更新" : "记下啦" });
        mask.remove(); onDone();
      }}),
    ]));
    mask.appendChild(modal);
    mask.addEventListener("click", (e) => { if (e.target === mask) mask.remove(); });
    document.body.appendChild(mask);
  }

  // ---------- 检查过期提醒（main.js 启动时调用） ----------
  async function checkReminders() {
    const Storage = global.Phone.Storage;
    if (!Storage) return;
    const memos = await Storage.getAll("memos");
    const now = Date.now();
    const due = memos.filter((m) =>
      m.remindAt && !m.completed && m.remindAt < now &&
      // 避免重复提醒：5 分钟内已提醒过的不重复
      (!m.lastRemindedAt || (now - m.lastRemindedAt) > 5 * 60 * 1000)
    );
    for (const m of due) {
      global.Phone.Notify.push({
        appId: "memo",
        title: "备忘提醒：" + (m.title || "（无标题）"),
        body: m.content ? m.content.slice(0, 50) : "",
      });
      global.Phone.EventCenter.emit(global.Phone.EventCenter.TYPES.MEMO_REMINDED, {
        sourceApp: "memo", data: m,
        summary: "备忘到期：" + (m.title || "无标题"),
      });
      m.lastRemindedAt = now;
      await Storage.put("memos", m);
    }
  }

  // ---------- 工具函数 ----------
  function _nav(U, title, onAdd) {
    const nav = U.el("div", { class: "navbar" });
    const navLeft = U.el("div", { class: "nav-left" });
    const back = U.el("button", { class: "icon-btn" });
    back.innerHTML = global.Phone.IconLibrary.get("chevron-left", { size: 22 });
    back.addEventListener("click", () => global.Phone.Router.back());
    navLeft.appendChild(back);
    nav.appendChild(navLeft);
    nav.appendChild(U.el("div", { class: "nav-title", text: title }));
    const navRight = U.el("div", { class: "nav-right" });
    const addBtn = U.el("button", { class: "icon-btn" });
    addBtn.innerHTML = global.Phone.IconLibrary.get("plus", { size: 22 });
    addBtn.addEventListener("click", onAdd);
    navRight.appendChild(addBtn);
    nav.appendChild(navRight);
    return nav;
  }

  function _empty(U, title, sub) {
    return U.el("div", { class: "empty-state" }, [
      U.el("div", { class: "es-icon", html: global.Phone.IconLibrary.get("app-memo", { size: 32 }) }),
      U.el("div", { class: "es-title", text: title }),
      U.el("div", { class: "es-sub", text: sub }),
    ]);
  }

  function _remount(container) {
    while (container.firstChild) container.removeChild(container.firstChild);
    mount(container);
  }

  // ---------- 暴露 ----------
  global.Phone.Memo = { open, mount, checkReminders };
})(window);
