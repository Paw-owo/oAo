/* ============================================================
   chat.js — 消息列表 + chat APP 注册
   - 头像/名字/最后消息/时间/未读红点
   - 置顶 / 左滑操作（已读未读 / 不显示 / 删除）
   - 搜索 / 新建聊天
   - 注册到 AppRegistry
   挂在 window.Phone.Chat
   ============================================================ */
(function (global) {
  "use strict";

  // ---------- 注册 APP ----------
  global.Phone = global.Phone || {};
  global.Phone.AppRegistry.register({
    id: "chat",
    name: "消息",
    icon: "app-chat",
    entry: () => open(),
    events: ["message_received", "message_sent", "chat_mode_changed"],
    settings: [
      { key: "bubbleStyle", label: "气泡样式", type: "segment", options: ["rounded", "square", "tail"] },
      { key: "chatBackground", label: "默认聊天背景", type: "image" },
    ],
    aiSpec: "js/apps/chat/chat-ai.js",
    order: 1,
  });

  // ---------- 打开 APP ----------
  function open() {
    const container = document.getElementById("app-root");
    if (!container) return;
    // 已有页面栈时不重复 push 根
    global.Phone.Router.push("chat-list", mount, {});
  }

  /**
   * 我（消息列表）的挂载函数
   */
  async function mount(container) {
    const U = global.Phone.Utils;
    const Storage = global.Phone.Storage;

    const page = U.el("div", { class: "page chat-list-page" });

    // 导航栏
    const nav = U.el("div", { class: "navbar" });
    const navLeft = U.el("div", { class: "nav-left" });
    const backBtn = U.el("button", { class: "icon-btn" });
    backBtn.innerHTML = global.Phone.IconLibrary.get("chevron-left", { size: 22 });
    backBtn.addEventListener("click", () => global.Phone.Router.back());
    navLeft.appendChild(backBtn);
    nav.appendChild(navLeft);
    nav.appendChild(U.el("div", { class: "nav-title", text: "消息" }));
    const navRight = U.el("div", { class: "nav-right" });
    const newBtn = U.el("button", { class: "icon-btn" });
    newBtn.innerHTML = global.Phone.IconLibrary.get("plus", { size: 22 });
    newBtn.addEventListener("click", () => _newChat(page));
    navRight.appendChild(newBtn);
    nav.appendChild(navRight);
    page.appendChild(nav);

    // 搜索栏
    const searchBar = U.el("div", { class: "chat-search" }, [
      U.el("span", { class: "cs-icon", html: global.Phone.IconLibrary.get("search", { size: 18 }) }),
    ]);
    const searchInput = U.el("input", { class: "cs-input", placeholder: "搜索聊天记录" });
    searchBar.appendChild(searchInput);
    page.appendChild(searchBar);

    // 列表
    const listWrap = U.el("div", { class: "scroll chat-list-wrap" });
    const list = U.el("div", { class: "chat-list" });
    listWrap.appendChild(list);
    page.appendChild(listWrap);

    container.appendChild(page);

    let keyword = "";
    async function refresh() {
      U.empty(list);
      let convs = await Storage.getAll("conversations");
      // 排除 hidden
      convs = convs.filter((c) => !c.hidden);
      // 搜索
      if (keyword) {
        const k = keyword.toLowerCase();
        convs = convs.filter((c) => {
          if (c.messages && c.messages.some((m) => (m.content || "").toLowerCase().includes(k))) return true;
          return false;
        });
      }
      // 排序：置顶在前，再按 updatedAt
      convs.sort((a, b) => {
        if (!!b.pinned - !!a.pinned) return !!b.pinned - !!a.pinned ? 1 : -1;
        return (b.updatedAt || 0) - (a.updatedAt || 0);
      });

      if (convs.length === 0) {
        list.appendChild(U.el("div", { class: "empty-state" }, [
          U.el("div", { class: "es-icon", html: global.Phone.IconLibrary.get("app-chat", { size: 32 }) }),
          U.el("div", { class: "es-title", text: keyword ? "没找到相关聊天" : "还没有聊天" }),
          U.el("div", { class: "es-sub", text: keyword ? "换个关键词试试" : "点右上角加号开始聊吧" })
        ]));
        return;
      }

      // 找角色信息
      const chars = await Storage.getAll("characters");
      const badges = await global.Phone.Notify.getBadges();

      convs.forEach((c) => {
        const char = chars.find((ch) => ch.id === c.characterId) || { name: "AI" };
        const lastMsg = c.messages && c.messages.length ? c.messages[c.messages.length - 1] : null;
        const unread = badges["chat:" + c.id] || 0;
        list.appendChild(_renderItem(c, char, lastMsg, unread, refresh));
      });
    }

    searchInput.addEventListener("input", U.debounce(() => {
      keyword = searchInput.value.trim();
      refresh();
    }, 200));

    refresh();

    // 监听新消息事件（自动刷新）
    const unsub = global.Phone.EventCenter.on(global.Phone.EventCenter.TYPES.MESSAGE_RECEIVED, () => refresh());
    const unsubSent = global.Phone.EventCenter.on(global.Phone.EventCenter.TYPES.MESSAGE_SENT, () => refresh());
    global.Phone.Router.onLeave(() => { unsub(); unsubSent(); });
  }

  // ---------- 渲染单条 ----------
  function _renderItem(conv, char, lastMsg, unread, refresh) {
    const U = global.Phone.Utils;
    const item = U.el("div", { class: "chat-list-item" + (conv.pinned ? " pinned" : "") });

    // 左滑操作层
    const actions = U.el("div", { class: "cli-actions" });
    const actRead = U.el("button", { class: "cli-act", text: unread ? "已读" : "未读" });
    const actHide = U.el("button", { class: "cli-act", text: "不显示" });
    const actDel = U.el("button", { class: "cli-act danger", text: "删除" });
    actions.appendChild(actRead);
    actions.appendChild(actHide);
    actions.appendChild(actDel);

    // 主内容
    const main = U.el("div", { class: "cli-main" });
    const avatar = U.el("div", { class: "li-avatar" });
    if (char.avatar) avatar.innerHTML = '<img src="' + char.avatar + '" alt=""/>';
    else avatar.textContent = (char.name || "AI").slice(0, 1);
    main.appendChild(avatar);

    const info = U.el("div", { class: "li-main" });
    info.appendChild(U.el("div", { class: "cli-top" }, [
      U.el("div", { class: "li-title", html: U.escapeHtml(char.name || "AI") + (conv.pinned ? ' <span class="pin-icon">' + global.Phone.IconLibrary.get("pin", { size: 12 }) + '</span>' : "") }),
      U.el("div", { class: "li-right", text: lastMsg ? U.relTime(lastMsg.createdAt) : "" })
    ]));
    const subText = lastMsg ? (lastMsg.type === "image" ? "[图片]" : lastMsg.type === "voice" ? "[语音]" : (lastMsg.content || "").slice(0, 30)) : "开始聊天吧～";
    info.appendChild(U.el("div", { class: "cli-sub" }, [
      U.el("div", { class: "li-sub", text: subText }),
      unread > 0 ? U.el("div", { class: "cli-badge", text: unread > 99 ? "99+" : String(unread) }) : null
    ]));
    main.appendChild(info);
    item.appendChild(main);
    item.appendChild(actions);

    // 点击进入对话
    let startX = 0, currentX = 0, dragging = false, opened = false;
    main.addEventListener("click", (e) => {
      if (opened) { _close(); return; }
      global.Phone.Router.push("conversation", global.Phone.Conversation.mount, {
        conversationId: conv.id,
        characterId: conv.characterId,
      });
    });

    // 左滑手势
    main.addEventListener("touchstart", (e) => {
      startX = e.touches[0].clientX;
      currentX = startX;
      dragging = true;
      main.style.transition = "none";
      actions.style.transition = "none";
    });
    main.addEventListener("touchmove", (e) => {
      if (!dragging) return;
      currentX = e.touches[0].clientX;
      let dx = currentX - startX;
      if (dx > 0 && opened) dx = dx; // 已打开时右滑关闭
      if (!opened && dx > 0) dx = 0;
      const offset = opened ? dx - 180 : dx;
      main.style.transform = "translateX(" + Math.max(-180, offset) + "px)";
      actions.style.opacity = Math.min(1, Math.abs(offset) / 180);
    });
    main.addEventListener("touchend", () => {
      if (!dragging) return;
      dragging = false;
      main.style.transition = "transform var(--dur-base) var(--ease-soft)";
      actions.style.transition = "opacity var(--dur-base) var(--ease-soft)";
      const dx = currentX - startX;
      if (!opened && dx < -60) { _open(); }
      else if (opened && dx > 60) { _close(); }
      else { opened ? _open() : _close(); }
    });

    function _open() {
      opened = true;
      main.style.transform = "translateX(-180px)";
      actions.style.opacity = "1";
    }
    function _close() {
      opened = false;
      main.style.transform = "translateX(0)";
      actions.style.opacity = "0";
    }

    // 操作按钮
    actRead.addEventListener("click", async (e) => {
      e.stopPropagation();
      // 标记已读/未读（用 conversation.read 标记）
      conv.unread = !conv.unread ? 1 : 0;
      await global.Phone.Storage.put("conversations", conv);
      _close();
      refresh();
    });
    actHide.addEventListener("click", async (e) => {
      e.stopPropagation();
      conv.hidden = true;
      await global.Phone.Storage.put("conversations", conv);
      refresh();
    });
    actDel.addEventListener("click", async (e) => {
      e.stopPropagation();
      const ok = await global.Phone.Modal.confirm({
        title: "删除聊天", message: "删除这条聊天记录吗？不可恢复哦", danger: true, okText: "删除",
      });
      if (!ok) return;
      await global.Phone.Storage.del("conversations", conv.id);
      // 删除关联消息
      try {
        const msgs = await global.Phone.Storage.getByIndex("messages", "conversationId", conv.id);
        for (const m of msgs) await global.Phone.Storage.del("messages", m.id);
      } catch {}
      refresh();
    });

    return item;
  }

  // ---------- 新建聊天 ----------
  async function _newChat(page) {
    const U = global.Phone.Utils;
    const Storage = global.Phone.Storage;
    const chars = await Storage.getAll("characters");

    const mask = U.el("div", { class: "modal-mask" });
    const modal = U.el("div", { class: "modal" });
    modal.appendChild(U.el("div", { class: "modal-title", text: "选择聊天对象" }));
    if (chars.length === 0) {
      modal.appendChild(U.el("div", { class: "modal-body", text: "还没有角色，先去创建一个吧～" }));
    } else {
      const list = U.el("div", { class: "new-chat-list" });
      chars.forEach((c) => {
        const item = U.el("div", { class: "list-item" }, [
          (() => {
            const av = U.el("div", { class: "li-avatar" });
            if (c.avatar) av.innerHTML = '<img src="' + c.avatar + '"/>';
            else av.textContent = (c.name || "AI").slice(0, 1);
            return av;
          })(),
          U.el("div", { class: "li-main" }, [
            U.el("div", { class: "li-title", text: c.name }),
            U.el("div", { class: "li-sub", text: c.description || "点开开始聊天" }),
          ])
        ]);
        item.addEventListener("click", async () => {
          const convId = U.uid("conv");
          // 设为当前角色
          await Storage.setSetting("currentCharacterId", c.id);
          mask.remove();
          global.Phone.Router.push("conversation", global.Phone.Conversation.mount, {
            conversationId: convId, characterId: c.id,
          });
        });
        list.appendChild(item);
      });
      modal.appendChild(list);
    }
    modal.appendChild(U.el("div", { class: "modal-actions" }, [
      U.el("button", { class: "btn btn-ghost", text: "取消", onclick: () => mask.remove() }),
    ]));
    mask.appendChild(modal);
    mask.addEventListener("click", (e) => { if (e.target === mask) mask.remove(); });
    document.body.appendChild(mask);
  }

  // ---------- 暴露 ----------
  global.Phone.Chat = { open, mount };
})(window);
