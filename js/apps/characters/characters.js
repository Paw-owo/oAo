/* ============================================================
   characters.js — 角色管理 APP
   创建 / 编辑 / 删除 / 切换当前角色
   每个角色有独立记忆空间（隔离）
   挂在 window.Phone.Characters
   ============================================================ */
(function (global) {
  "use strict";

  global.Phone = global.Phone || {};
  global.Phone.AppRegistry.register({
    id: "characters",
    name: "角色",
    icon: "app-characters",
    entry: () => open(),
    events: ["character_switched", "character_created", "character_updated", "character_deleted"],
    settings: [],
    order: 30,
  });

  function open() { global.Phone.Router.push("characters", mount, {}); }

  async function mount(container) {
    const U = global.Phone.Utils;
    const Storage = global.Phone.Storage;
    const State = global.Phone.State;

    const page = U.el("div", { class: "page" });
    const nav = _nav("角色管理");
    const newBtn = U.el("button", { class: "icon-btn" });
    newBtn.innerHTML = global.Phone.IconLibrary.get("plus", { size: 22 });
    newBtn.addEventListener("click", () => global.Phone.Router.push("char-edit", editMount, { id: null }));
    nav.querySelector(".nav-right").appendChild(newBtn);
    page.appendChild(nav);

    const content = U.el("div", { class: "scroll page-content" });
    const list = U.el("div", { class: "char-list" });
    content.appendChild(list);
    page.appendChild(content);
    container.appendChild(page);

    async function refresh() {
      U.empty(list);
      const chars = await Storage.getAll("characters");
      chars.sort((a, b) => a.createdAt - b.createdAt);
      const currentId = await State.get("currentCharacterId");
      if (chars.length === 0) {
        list.appendChild(_empty("还没有角色", "点右上角加号创建一个吧"));
        return;
      }
      chars.forEach((c) => {
        list.appendChild(_charCard(c, c.id === currentId, refresh));
      });
    }
    refresh();
  }

  function _charCard(c, isCurrent, refresh) {
    const U = global.Phone.Utils;
    const card = U.el("div", { class: "char-card" + (isCurrent ? " active" : "") });
    const av = U.el("div", { class: "cc-avatar" });
    if (c.avatar) av.innerHTML = '<img src="' + c.avatar + '"/>';
    else av.textContent = (c.name || "?").slice(0, 1);
    card.appendChild(av);
    const main = U.el("div", { class: "cc-main" }, [
      U.el("div", { class: "cc-name", text: c.name || "未命名" }),
      U.el("div", { class: "cc-desc", text: c.description || "还没有简介" }),
      U.el("div", { class: "cc-tags" }, [
        c.personality ? U.el("div", { class: "chip chip-soft", text: U.truncate(c.personality, 12) }) : null,
      ])
    ]);
    card.appendChild(main);
    if (isCurrent) card.appendChild(U.el("div", { class: "cc-current", text: "当前" }));

    card.addEventListener("click", () => _showActions(c, isCurrent, refresh));
    return card;
  }

  function _showActions(c, isCurrent, refresh) {
    const U = global.Phone.Utils;
    const mask = U.el("div", { class: "sheet-mask" });
    const sheet = U.el("div", { class: "sheet" });
    sheet.appendChild(U.el("div", { class: "sheet-handle" }));
    const actions = [
      { icon: "switch", label: isCurrent ? "已是当前角色" : "设为当前角色", disabled: isCurrent, fn: async () => {
        await global.Phone.State.set("currentCharacterId", c.id);
        global.Phone.EventCenter.emit(global.Phone.EventCenter.TYPES.CHARACTER_SWITCHED, {
          sourceApp: "characters", data: { characterId: c.id }, summary: "切换到角色：" + c.name
        });
        global.Phone.Notify.push({ appId: "characters", title: "已切换到 " + c.name });
        refresh();
      }},
      { icon: "edit", label: "编辑", fn: () => global.Phone.Router.push("char-edit", editMount, { id: c.id }) },
      { icon: "app-chat", label: "开始聊天", fn: () => {
        global.Phone.Router.push("conversation", global.Phone.Conversation.mount, {
          conversationId: global.Phone.Utils.uid("conv"), characterId: c.id
        });
      }},
      { icon: "app-memory", label: "查看记忆", fn: () => {
        if (global.Phone.Memory) {
          global.Phone.State.set("currentCharacterId", c.id);
          global.Phone.Memory.open();
        }
      }},
      { icon: "trash", label: "删除角色", danger: true, fn: async () => {
        const ok = await global.Phone.Modal.confirm({
          title: "删除角色", message: "删除「" + c.name + "」吗？\n该角色的所有记忆和聊天都会消失哦", danger: true, okText: "删除",
        });
        if (!ok) return;
        await global.Phone.Storage.del("characters", c.id);
        // 删除关联记忆和聊天
        try {
          const mems = await global.Phone.Storage.getByIndex("memories", "characterId", c.id);
          for (const m of mems) await global.Phone.Storage.del("memories", m.id);
          const convs = await global.Phone.Storage.getAll("conversations");
          for (const cv of convs) if (cv.characterId === c.id) await global.Phone.Storage.del("conversations", cv.id);
        } catch {}
        global.Phone.EventCenter.emit(global.Phone.EventCenter.TYPES.CHARACTER_DELETED, {
          sourceApp: "characters", data: { characterId: c.id }, summary: "删除了角色：" + c.name
        });
        global.Phone.Notify.push({ appId: "characters", title: "已删除角色" });
        refresh();
      }},
    ];
    actions.forEach((a) => {
      const node = U.el("div", { class: "sheet-item" + (a.danger ? " danger" : "") });
      node.innerHTML = global.Phone.IconLibrary.get(a.icon, { size: 20 });
      node.appendChild(document.createTextNode(a.label));
      if (a.disabled) { node.style.opacity = "0.4"; node.style.pointerEvents = "none"; }
      else node.addEventListener("click", () => { try { a.fn(); } catch (e) { console.warn(e); } mask.remove(); });
      sheet.appendChild(node);
    });
    const cancel = U.el("div", { class: "sheet-cancel", text: "取消" });
    cancel.addEventListener("click", () => mask.remove());
    sheet.appendChild(cancel);
    mask.appendChild(sheet);
    mask.addEventListener("click", (e) => { if (e.target === mask) mask.remove(); });
    document.body.appendChild(mask);
  }

  // ---------- 编辑/创建 ----------
  async function editMount(container, params) {
    const U = global.Phone.Utils;
    const Storage = global.Phone.Storage;
    const isEdit = !!params.id;
    let char = null;
    if (isEdit) char = await Storage.get("characters", params.id);

    const page = U.el("div", { class: "page" });
    const nav = _nav(isEdit ? "编辑角色" : "新建角色");
    page.appendChild(nav);

    const form = U.el("div", { class: "char-form scroll" });

    // 头像
    let avatar = char ? char.avatar : "";
    const ap = U.el("div", { class: "avatar-picker" });
    const circle = U.el("div", { class: "ap-circle" });
    function _renderAvatar() {
      if (avatar) circle.innerHTML = '<img src="' + avatar + '"/>';
      else { circle.innerHTML = ""; circle.textContent = "头"; }
    }
    _renderAvatar();
    circle.addEventListener("click", () => {
      const inp = U.el("input", { type: "file", accept: "image/*", style: "display:none" });
      document.body.appendChild(inp);
      inp.addEventListener("change", async () => {
        const f = inp.files[0]; if (!f) return;
        avatar = await U.fileToBase64(f);
        _renderAvatar();
        inp.remove();
      });
      inp.click();
    });
    ap.appendChild(circle);
    form.appendChild(ap);

    const nameInput = U.el("input", { class: "input", placeholder: "角色名字", value: char ? (char.name || "") : "" });
    const descInput = U.el("input", { class: "input", placeholder: "一句话简介", value: char ? (char.description || "") : "" });
    const personalityInput = U.el("textarea", { class: "textarea", placeholder: "性格：温柔软萌、偶尔傲娇…", html: char ? U.escapeHtml(char.personality || "") : "" });
    const speakingInput = U.el("textarea", { class: "textarea", placeholder: "说话方式：口语化、爱用语气词…", html: char ? U.escapeHtml(char.speakingStyle || "") : "" });
    const bgInput = U.el("textarea", { class: "textarea", placeholder: "背景故事", html: char ? U.escapeHtml(char.background || "") : "" });

    form.appendChild(U.el("div", { class: "form-group" }, [U.el("div", { class: "form-label", text: "名字" }), nameInput]));
    form.appendChild(U.el("div", { class: "form-group" }, [U.el("div", { class: "form-label", text: "简介" }), descInput]));
    form.appendChild(U.el("div", { class: "form-group" }, [U.el("div", { class: "form-label", text: "性格" }), personalityInput]));
    form.appendChild(U.el("div", { class: "form-group" }, [U.el("div", { class: "form-label", text: "说话方式" }), speakingInput]));
    form.appendChild(U.el("div", { class: "form-group" }, [U.el("div", { class: "form-label", text: "背景故事" }), bgInput]));

    // 世界书关联
    const wbs = await Storage.getAll("worldbooks");
    const linkedIds = char ? (char.worldbookIds || []) : [];
    form.appendChild(U.el("div", { class: "form-label", text: "关联世界书" }, []));
    const wbList = U.el("div", {});
    wbs.forEach((wb) => {
      const on = linkedIds.includes(wb.id);
      const item = U.el("div", { class: "list-item" }, [
        U.el("div", { class: "li-avatar", style: { background: "var(--color-primary-ultralight)", color: "var(--color-primary-deep)" }, html: global.Phone.IconLibrary.get("app-worldbook", { size: 18 }) }),
        U.el("div", { class: "li-main" }, [U.el("div", { class: "li-title", text: wb.name })]),
      ]);
      const sw = U.el("div", { class: "switch" + (on ? " on" : "") });
      sw.addEventListener("click", () => {
        sw.classList.toggle("on");
        if (sw.classList.contains("on")) {
          if (!linkedIds.includes(wb.id)) linkedIds.push(wb.id);
        } else {
          const i = linkedIds.indexOf(wb.id); if (i >= 0) linkedIds.splice(i, 1);
        }
      });
      item.appendChild(sw);
      wbList.appendChild(item);
    });
    if (wbs.length === 0) wbList.appendChild(_empty("还没有世界书", "去世界书 APP 创建"));
    form.appendChild(wbList);

    const saveBtn = U.el("button", { class: "btn btn-block", text: "保存", style: { marginTop: "20px" } });
    saveBtn.addEventListener("click", async () => {
      const name = nameInput.value.trim();
      if (!name) { global.Phone.Notify.push({ appId: "characters", title: "名字不能为空哦" }); return; }
      const now = Date.now();
      const data = {
        id: char ? char.id : U.uid("char"),
        name: name,
        avatar: avatar,
        description: descInput.value.trim(),
        personality: personalityInput.value.trim(),
        speakingStyle: speakingInput.value.trim(),
        background: bgInput.value.trim(),
        worldbookIds: linkedIds,
        memory: char ? char.memory : [],
        createdAt: char ? char.createdAt : now,
        updatedAt: now,
      };
      await Storage.put("characters", data);
      if (!char) {
        global.Phone.EventCenter.emit(global.Phone.EventCenter.TYPES.CHARACTER_CREATED, {
          sourceApp: "characters", data: data, summary: "创建了新角色：" + name
        });
      } else {
        global.Phone.EventCenter.emit("character_updated", {
          sourceApp: "characters", data: data, summary: "更新了角色：" + name
        });
      }
      global.Phone.Notify.push({ appId: "characters", title: "已保存「" + name + "」" });
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
      U.el("div", { class: "es-icon", html: global.Phone.IconLibrary.get("app-characters", { size: 32 }) }),
      U.el("div", { class: "es-title", text: title }),
      U.el("div", { class: "es-sub", text: sub })
    ]);
  }

  // ---------- 暴露 ----------
  global.Phone.Characters = { open, mount, editMount };
})(window);
