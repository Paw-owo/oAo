/* ============================================================
   worldbook.js — 世界书 APP
   条目 CRUD / 分类 / 搜索 / 导入导出
   聊天时检测关键词自动插入 prompt
   挂在 window.Phone.Worldbook
   ============================================================ */
(function (global) {
  "use strict";

  global.Phone = global.Phone || {};
  global.Phone.AppRegistry.register({
    id: "worldbook",
    name: "世界书",
    icon: "app-worldbook",
    entry: () => open(),
    events: ["worldbook_updated"],
    settings: [],
    order: 40,
  });

  function open() { global.Phone.Router.push("worldbook", mount, {}); }

  async function mount(container) {
    const U = global.Phone.Utils;
    const Storage = global.Phone.Storage;

    const page = U.el("div", { class: "page" });
    const nav = _nav("世界书");
    const addBtn = U.el("button", { class: "icon-btn" });
    addBtn.innerHTML = global.Phone.IconLibrary.get("plus", { size: 22 });
    addBtn.addEventListener("click", () => global.Phone.Router.push("wb-edit", editMount, { id: null }));
    nav.querySelector(".nav-right").appendChild(addBtn);
    page.appendChild(nav);

    const content = U.el("div", { class: "scroll page-content" });

    // 我加一条提示告诉用户世界书会自动生效
    const hint = U.el("div", { class: "about-hint", style: { margin: "0 16px 12px" } }, [
      U.el("div", { class: "ah-icon", html: global.Phone.IconLibrary.get("info", { size: 16 }) }),
      U.el("div", { class: "ah-text", text: "世界书保存后会自动应用到聊天中，我（AI）会知道这些背景设定。" }),
    ]);
    content.appendChild(hint);

    const list = U.el("div", {});
    content.appendChild(list);
    page.appendChild(content);
    container.appendChild(page);

    async function refresh() {
      U.empty(list);
      const wbs = await Storage.getAll("worldbooks");
      if (wbs.length === 0) {
        list.appendChild(_empty("还没有世界书", "世界书能让 AI 知道更多背景设定"));
        return;
      }
      wbs.forEach((wb) => {
        list.appendChild(_wbCard(wb, refresh));
      });
    }
    refresh();
  }

  function _wbCard(wb, refresh) {
    const U = global.Phone.Utils;
    const card = U.el("div", { class: "card", style: { marginBottom: "12px" } });
    card.appendChild(U.el("div", { class: "row between", style: { marginBottom: "8px" } }, [
      U.el("div", { class: "li-title", text: wb.name, style: { fontSize: "var(--font-md)", fontWeight: "600" } }),
      U.el("div", { class: "chip chip-soft", text: (wb.entries || []).length + " 条" }),
    ]));
    (wb.entries || []).forEach((e) => {
      card.appendChild(U.el("div", { class: "wb-entry" }, [
        U.el("div", { class: "we-top" }, [
          U.el("div", { class: "we-kw" }, (e.keywords || []).map((k) => U.el("div", { class: "chip", text: k }))),
          U.el("div", { class: "chip chip-soft", text: "P" + (e.priority || 0) }),
        ]),
        U.el("div", { class: "we-content", text: e.content }),
      ]));
    });
    const actions = U.el("div", { class: "row gap-8", style: { marginTop: "8px" } });
    const editBtn = U.el("button", { class: "btn btn-ghost btn-sm", text: "编辑" });
    editBtn.addEventListener("click", () => global.Phone.Router.push("wb-edit", editMount, { id: wb.id }));
    const delBtn = U.el("button", { class: "btn btn-text btn-sm", text: "删除" });
    delBtn.addEventListener("click", async () => {
      const ok = await global.Phone.Modal.confirm({
        title: "删除世界书", message: "删除「" + wb.name + "」吗？", danger: true, okText: "删除",
      });
      if (!ok) return;
      await global.Phone.Storage.del("worldbooks", wb.id);
      global.Phone.Notify.push({ appId: "worldbook", title: "已删除" });
      refresh();
    });
    actions.appendChild(editBtn);
    actions.appendChild(delBtn);
    card.appendChild(actions);
    return card;
  }

  async function editMount(container, params) {
    const U = global.Phone.Utils;
    const Storage = global.Phone.Storage;
    const isEdit = !!params.id;
    let wb = isEdit ? await Storage.get("worldbooks", params.id) : null;

    const page = U.el("div", { class: "page" });
    page.appendChild(_nav(isEdit ? "编辑世界书" : "新建世界书"));

    const form = U.el("div", { class: "scroll page-content" });
    const nameInput = U.el("input", { class: "input", placeholder: "世界书名字", value: wb ? (wb.name || "") : "" });
    form.appendChild(U.el("div", { class: "form-group" }, [U.el("div", { class: "form-label", text: "名字" }), nameInput]));

    let entries = wb ? (wb.entries || []).map((e) => Object.assign({}, e)) : [];
    const entriesWrap = U.el("div", {});
    function _renderEntries() {
      U.empty(entriesWrap);
      entries.forEach((e, idx) => {
        const item = U.el("div", { class: "wb-entry" }, [
          U.el("div", { class: "row gap-8", style: { marginBottom: "6px" } }, [
            U.el("input", { class: "input", placeholder: "关键词，逗号分隔", value: (e.keywords || []).join(","), style: { flex: "1" } }),
            U.el("button", { class: "icon-btn", html: global.Phone.IconLibrary.get("trash", { size: 18 }), onclick: () => { entries.splice(idx, 1); _renderEntries(); } })
          ]),
          U.el("textarea", { class: "textarea", placeholder: "触发时插入的内容", html: U.escapeHtml(e.content || "") }),
          U.el("div", { class: "row gap-8", style: { marginTop: "6px" } }, [
            U.el("input", { class: "input", type: "number", placeholder: "优先级", value: String(e.priority || 0), style: { width: "80px" } }),
          ]),
        ]);
        // 绑定输入
        const inputs = item.querySelectorAll("input,textarea");
        inputs[0].addEventListener("input", (ev) => { e.keywords = ev.target.value.split(/[,，]/).map((s) => s.trim()).filter(Boolean); });
        inputs[1] && (item.querySelector("textarea").addEventListener("input", (ev) => { e.content = ev.target.value; }));
        inputs[2].addEventListener("input", (ev) => { e.priority = parseInt(ev.target.value) || 0; });
        entriesWrap.appendChild(item);
      });
    }
    _renderEntries();
    form.appendChild(U.el("div", { class: "form-label", text: "条目" }));
    form.appendChild(entriesWrap);
    const addEntryBtn = U.el("button", { class: "btn btn-ghost btn-sm btn-block", text: "+ 添加条目", style: { marginTop: "8px" } });
    addEntryBtn.addEventListener("click", () => {
      entries.push({ id: U.uid("entry"), keywords: [], content: "", priority: 5, enabled: true });
      _renderEntries();
    });
    form.appendChild(addEntryBtn);

    const saveBtn = U.el("button", { class: "btn btn-block", text: "保存", style: { marginTop: "20px" } });
    saveBtn.addEventListener("click", async () => {
      const name = nameInput.value.trim();
      if (!name) { global.Phone.Notify.push({ appId: "worldbook", title: "名字不能为空" }); return; }
      const now = Date.now();
      const data = {
        id: wb ? wb.id : U.uid("wb"),
        name: name,
        entries: entries,
        createdAt: wb ? wb.createdAt : now,
        updatedAt: now,
      };
      await Storage.put("worldbooks", data);
      global.Phone.EventCenter.emit(global.Phone.EventCenter.TYPES.WORLDBOOK_UPDATED, {
        sourceApp: "worldbook", data: data, summary: "更新了世界书：" + name
      });
      global.Phone.Notify.push({ appId: "worldbook", title: "已保存，我会在聊天中应用这些设定" });
      global.Phone.Router.back();
    });
    form.appendChild(saveBtn);
    page.appendChild(form);
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

  function _empty(title, sub) {
    const U = global.Phone.Utils;
    return U.el("div", { class: "empty-state" }, [
      U.el("div", { class: "es-icon", html: global.Phone.IconLibrary.get("app-worldbook", { size: 32 }) }),
      U.el("div", { class: "es-title", text: title }),
      U.el("div", { class: "es-sub", text: sub })
    ]);
  }

  // ---------- 暴露 ----------
  global.Phone.Worldbook = { open, mount, editMount };
})(window);
