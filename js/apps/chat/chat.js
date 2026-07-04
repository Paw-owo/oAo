/* ============================================================
   chat.js — 消息列表 + chat APP 注册
   - 头像/名字/最后消息/时间/未读主色小圆点
   - 置顶 / 左滑操作（已读未读 / 不显示 / 删除）
   - 长按 actionSheet（置顶 / 已读未读 / 免打扰 / 删除）
   - 搜索覆盖层 + 关键词高亮
   - 下拉刷新（小圆点跳动）
   - 新建聊天底部面板
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

  // ---------- 我自动朗读 AI 的回复 ----------
  // AI 回复完成后 conversation.js 的 onDone 会发 MESSAGE_RECEIVED 事件，
  // 我在这里监听，如果开启了 ttsAutoPlay 且 TTS 可用就自动念出来
  try {
    global.Phone.EventCenter.on(global.Phone.EventCenter.TYPES.MESSAGE_RECEIVED, (payload) => {
      // 我只处理聊天消息
      if (!payload || payload.sourceApp !== "chat") return;
      const text = payload.data && payload.data.content;
      if (!text) return;
      // 我检查是否需要自动朗读
      try {
        if (global.Phone.State.get("ttsAutoPlay") && global.Phone.TTS && global.Phone.TTS.isEnabled()) {
          global.Phone.TTS.speak(text);
        }
      } catch (e) { console.warn("[Chat] TTS 朗读失败", e); }
    });
  } catch (e) { console.warn("[Chat] TTS 自动朗读监听注册失败", e); }

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
    const Icon = global.Phone.IconLibrary;

    const page = U.el("div", { class: "page chat-list-page", "data-app": "chat" });

    // ===== 导航栏（毛玻璃 + 渐变分割线）=====
    const nav = U.el("div", { class: "navbar chat-navbar" });
    const navLeft = U.el("div", { class: "nav-left" });
    const searchBtn = U.el("button", {
      class: "icon-btn",
      html: Icon.get("search", { size: 22 }),
      "aria-label": "搜索聊天",
    });
    navLeft.appendChild(searchBtn);
    const navTitle = U.el("div", { class: "nav-title", text: "消息" });
    const navRight = U.el("div", { class: "nav-right" });
    const newBtn = U.el("button", {
      class: "icon-btn",
      html: Icon.get("plus", { size: 22 }),
      "aria-label": "新建聊天",
    });
    newBtn.addEventListener("click", () => _newChat());
    navRight.appendChild(newBtn);
    nav.appendChild(navLeft);
    nav.appendChild(navTitle);
    nav.appendChild(navRight);
    page.appendChild(nav);

    // ===== 搜索覆盖层（点击搜索按钮后覆盖导航栏）=====
    const searchOverlay = U.el("div", { class: "chat-search-overlay" });
    const searchBack = U.el("button", {
      class: "icon-btn",
      html: Icon.get("chevron-left", { size: 22 }),
      "aria-label": "退出搜索",
    });
    const searchInputWrap = U.el("div", { class: "cso-input-wrap" });
    const searchInput = U.el("input", {
      class: "cso-input",
      type: "search",
      placeholder: "搜索聊天记录",
      "aria-label": "搜索关键词",
    });
    const searchClear = U.el("button", {
      class: "cso-clear hidden",
      html: Icon.get("close", { size: 14 }),
      "aria-label": "清空",
    });
    searchInputWrap.appendChild(searchInput);
    searchInputWrap.appendChild(searchClear);
    searchOverlay.appendChild(searchBack);
    searchOverlay.appendChild(searchInputWrap);
    page.appendChild(searchOverlay);

    // ===== 列表容器 + 下拉刷新指示器 =====
    const listWrap = U.el("div", { class: "scroll chat-list-wrap" });
    const pullIndicator = U.el("div", { class: "pull-refresh-indicator" }, [
      U.el("div", { class: "pri-dots", html: "<span></span><span></span><span></span>" }),
      U.el("div", { class: "pri-text", text: "下拉刷新" }),
    ]);
    const list = U.el("div", { class: "chat-list" });
    listWrap.appendChild(pullIndicator);
    listWrap.appendChild(list);
    page.appendChild(listWrap);

    container.appendChild(page);

    let keyword = "";

    async function refresh() {
      U.empty(list);
      let convs = await Storage.getAll("conversations");
      convs = convs.filter((c) => !c.hidden);

      let chars = await Storage.getAll("characters");

      // 搜索：角色名字 + 聊天内容
      if (keyword) {
        const k = keyword.toLowerCase();
        const charIdSet = new Set(
          chars.filter((c) => (c.name || "").toLowerCase().includes(k)).map((c) => c.id)
        );
        convs = convs.filter((c) => {
          if (charIdSet.has(c.characterId)) return true;
          if (c.messages && c.messages.some((m) => (m.content || "").toLowerCase().includes(k))) return true;
          return false;
        });
      }

      // 排序：置顶在前，再按 updatedAt 倒序
      convs.sort((a, b) => {
        const pa = a.pinned ? 1 : 0, pb = b.pinned ? 1 : 0;
        if (pb !== pa) return pb - pa;
        return (b.updatedAt || 0) - (a.updatedAt || 0);
      });

      if (convs.length === 0) {
        list.appendChild(_renderEmpty(keyword));
        return;
      }

      convs.forEach((c) => {
        const char = chars.find((ch) => ch.id === c.characterId) || { name: "AI" };
        const lastMsg = c.messages && c.messages.length ? c.messages[c.messages.length - 1] : null;
        const unread = c.unread || 0;
        list.appendChild(_renderItem(c, char, lastMsg, unread, keyword, refresh));
      });
    }

    // ===== 搜索交互（navbar 用 visibility 隐藏保留布局空间，避免列表上移）=====
    function openSearch() {
      nav.style.visibility = "hidden";
      searchOverlay.classList.add("open");
      setTimeout(() => searchInput.focus(), 60);
    }
    function closeSearch() {
      searchOverlay.classList.remove("open");
      nav.style.visibility = "";
      searchInput.value = "";
      searchClear.classList.add("hidden");
      if (keyword) { keyword = ""; refresh(); }
    }
    searchBtn.addEventListener("click", openSearch);
    searchBack.addEventListener("click", closeSearch);
    searchInput.addEventListener("input", U.debounce(() => {
      keyword = searchInput.value.trim();
      searchClear.classList.toggle("hidden", !keyword);
      refresh();
    }, 200));
    searchClear.addEventListener("click", () => {
      searchInput.value = "";
      keyword = "";
      searchClear.classList.add("hidden");
      refresh();
      searchInput.focus();
    });
    // 点击搜索结果空白处退出搜索
    listWrap.addEventListener("click", (e) => {
      if (!keyword) return;
      if (e.target.closest(".chat-list-item")) return;
      if (e.target.closest(".empty-state")) closeSearch();
    });

    // ===== 下拉刷新 =====
    _bindPullRefresh(listWrap, pullIndicator, refresh);

    refresh();

    // 监听新消息事件（自动刷新）
    const unsub = global.Phone.EventCenter.on(global.Phone.EventCenter.TYPES.MESSAGE_RECEIVED, () => refresh());
    const unsubSent = global.Phone.EventCenter.on(global.Phone.EventCenter.TYPES.MESSAGE_SENT, () => refresh());
    global.Phone.Router.onLeave(() => { unsub(); unsubSent(); });
  }

  // ---------- 时间格式（今天 HH:MM / 昨天 / 周X / 月/日）----------
  function _timeFormat(ts) {
    if (!ts) return "";
    const U = global.Phone.Utils;
    const now = Date.now();
    const day = 24 * 3600 * 1000;
    const dNow = new Date(now);
    const dTs = new Date(ts);
    if (dNow.toDateString() === dTs.toDateString()) return U.fmtHM(ts);
    if (new Date(now - day).toDateString() === dTs.toDateString()) return "昨天";
    if (now - ts < day * 7) return U.WEEK_CN[dTs.getDay()];
    return (dTs.getMonth() + 1) + "/" + dTs.getDate();
  }

  // ---------- 关键词高亮（转义后包 <mark>）----------
  function _highlight(text, keyword) {
    const U = global.Phone.Utils;
    const safeText = text == null ? "" : String(text);
    if (!keyword) return U.escapeHtml(safeText);
    const lower = safeText.toLowerCase();
    const k = keyword.toLowerCase();
    let out = "";
    let i = 0;
    while (i < safeText.length) {
      const idx = lower.indexOf(k, i);
      if (idx === -1) {
        out += U.escapeHtml(safeText.slice(i));
        break;
      }
      out += U.escapeHtml(safeText.slice(i, idx));
      out += "<mark>" + U.escapeHtml(safeText.slice(idx, idx + keyword.length)) + "</mark>";
      i = idx + keyword.length;
    }
    return out;
  }

  // ---------- 空状态 ----------
  function _renderEmpty(keyword) {
    const U = global.Phone.Utils;
    const Icon = global.Phone.IconLibrary;
    if (keyword) {
      return U.el("div", { class: "empty-state" }, [
        U.el("div", { class: "es-icon", html: Icon.get("search", { size: 64 }) }),
        U.el("div", { class: "es-title", text: "没找到呢，换个词试试？" }),
      ]);
    }
    return U.el("div", { class: "empty-state" }, [
      U.el("div", { class: "es-icon", html: Icon.get("app-chat", { size: 64 }) }),
      U.el("div", { class: "es-title", text: "还没有聊天呢，点右上角开始聊天吧～" }),
    ]);
  }

  // ---------- 渲染单条 ----------
  function _renderItem(conv, char, lastMsg, unread, keyword, refresh) {
    const U = global.Phone.Utils;
    const Icon = global.Phone.IconLibrary;
    const item = U.el("div", { class: "chat-list-item" + (conv.pinned ? " pinned" : "") });

    // 左滑操作层（保留骨架）
    const actions = U.el("div", { class: "cli-actions" });
    const actRead = U.el("button", { class: "cli-act", text: unread ? "已读" : "未读" });
    const actHide = U.el("button", { class: "cli-act", text: "不显示" });
    const actDel = U.el("button", { class: "cli-act danger", text: "删除" });
    actions.appendChild(actRead);
    actions.appendChild(actHide);
    actions.appendChild(actDel);

    // 主内容
    const main = U.el("div", { class: "cli-main" });

    // 置顶标签（左上角）
    if (conv.pinned) {
      main.appendChild(U.el("div", { class: "pinned-tag", text: "置顶" }));
    }

    // 头像 + 未读主色小圆点（不显示数字）
    const avatarWrap = U.el("div", { class: "li-avatar-wrap" });
    const avatar = U.el("div", { class: "li-avatar" });
    if (char.avatar) avatar.innerHTML = '<img src="' + char.avatar + '" alt=""/>';
    else avatar.textContent = (char.name || "AI").slice(0, 1);
    avatarWrap.appendChild(avatar);
    if (unread > 0) avatarWrap.appendChild(U.el("div", { class: "cli-dot" }));
    main.appendChild(avatarWrap);

    // 信息区
    const info = U.el("div", { class: "li-main" });
    const liRight = U.el("div", { class: "li-right" }, [
      U.el("div", { class: "li-time", text: lastMsg ? _timeFormat(lastMsg.createdAt) : "" }),
      conv.muted ? U.el("div", { class: "cli-mute", html: Icon.get("moon", { size: 12 }) }) : null,
    ]);
    info.appendChild(U.el("div", { class: "cli-top" }, [
      U.el("div", { class: "li-title", html: _highlight(char.name || "AI", keyword) }),
      liRight,
    ]));
    const subText = lastMsg
      ? (lastMsg.type === "image" ? "[图片]" : lastMsg.type === "voice" ? "[语音]" : (lastMsg.content || ""))
      : "开始聊天吧～";
    info.appendChild(U.el("div", { class: "cli-sub" }, [
      U.el("div", { class: "li-sub", html: _highlight(subText, keyword) }),
    ]));
    main.appendChild(info);
    item.appendChild(main);
    item.appendChild(actions);

    // 点击进入对话
    let startX = 0, currentX = 0, dragging = false, opened = false;
    let longPressTimer = null, longPressFired = false, moved = false;

    main.addEventListener("click", () => {
      if (opened) { _close(); return; }
      if (longPressFired) { longPressFired = false; return; }
      global.Phone.Router.push("conversation", global.Phone.Conversation.mount, {
        conversationId: conv.id,
        characterId: conv.characterId,
      });
    });

    // touchstart：同时承担左滑起点 + 长按计时
    main.addEventListener("touchstart", (e) => {
      startX = e.touches[0].clientX;
      currentX = startX;
      dragging = true;
      moved = false;
      longPressFired = false;
      main.style.transition = "none";
      actions.style.transition = "none";
      longPressTimer = setTimeout(() => {
        if (!moved && dragging) {
          longPressFired = true;
          U.vibrate(15);
          _showItemActions(conv, char, refresh);
        }
      }, 500);
    });
    main.addEventListener("touchmove", (e) => {
      if (!dragging) return;
      currentX = e.touches[0].clientX;
      let dx = currentX - startX;
      if (Math.abs(dx) > 8) {
        moved = true;
        if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
      }
      if (!opened && dx > 0) dx = 0;
      const offset = opened ? dx - 180 : dx;
      main.style.transform = "translateX(" + Math.max(-180, offset) + "px)";
      actions.style.opacity = Math.min(1, Math.abs(offset) / 180);
    });
    main.addEventListener("touchend", () => {
      if (!dragging) return;
      dragging = false;
      if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
      if (longPressFired) { _close(); return; }
      main.style.transition = "transform var(--dur-base) var(--ease-soft)";
      actions.style.transition = "opacity var(--dur-base) var(--ease-soft)";
      const dx = currentX - startX;
      if (!opened && dx < -60) { _open(); }
      else if (opened && dx > 60) { _close(); }
      else { opened ? _open() : _close(); }
    });
    main.addEventListener("touchcancel", () => {
      dragging = false;
      if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
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

    // 左滑快捷操作按钮
    actRead.addEventListener("click", async (e) => {
      e.stopPropagation();
      conv.unread = conv.unread ? 0 : 1;
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
      try {
        const msgs = await global.Phone.Storage.getByIndex("messages", "conversationId", conv.id);
        for (const m of msgs) await global.Phone.Storage.del("messages", m.id);
      } catch {}
      refresh();
    });

    return item;
  }

  // ---------- 长按操作面板（用 Modal.actionSheet）----------
  function _showItemActions(conv, char, refresh) {
    const Storage = global.Phone.Storage;
    global.Phone.Modal.actionSheet({
      title: char.name || "聊天",
      items: [
        { icon: "pin", label: conv.pinned ? "取消置顶" : "置顶", fn: async () => {
          conv.pinned = !conv.pinned;
          await Storage.put("conversations", conv);
          refresh();
        }},
        { icon: conv.unread ? "check" : "dot", label: conv.unread ? "标记已读" : "标记未读", fn: async () => {
          conv.unread = conv.unread ? 0 : 1;
          await Storage.put("conversations", conv);
          refresh();
        }},
        { icon: conv.muted ? "bell" : "moon", label: conv.muted ? "取消免打扰" : "免打扰", fn: async () => {
          conv.muted = !conv.muted;
          await Storage.put("conversations", conv);
          refresh();
        }},
        { icon: "trash", label: "删除聊天", danger: true, fn: async () => {
          const ok = await global.Phone.Modal.confirm({
            title: "删除聊天", message: "删除这条聊天记录吗？不可恢复哦", danger: true, okText: "删除",
          });
          if (!ok) return;
          await Storage.del("conversations", conv.id);
          try {
            const msgs = await Storage.getByIndex("messages", "conversationId", conv.id);
            for (const m of msgs) await Storage.del("messages", m.id);
          } catch {}
          refresh();
        }},
      ],
      cancelText: "取消",
    });
  }

  // ---------- 下拉刷新（touch + transform，小圆点跳动 loading）----------
  function _bindPullRefresh(listWrap, indicator, refresh) {
    const TEXT = indicator.querySelector(".pri-text");
    const THRESHOLD = 56;
    let startY = 0, currentY = 0, pulling = false;

    listWrap.addEventListener("touchstart", (e) => {
      if (listWrap.scrollTop > 0) { pulling = false; return; }
      startY = e.touches[0].clientY;
      currentY = startY;
      pulling = true;
      indicator.classList.remove("loading");
      indicator.style.transition = "none";
    }, { passive: true });

    listWrap.addEventListener("touchmove", (e) => {
      if (!pulling) return;
      currentY = e.touches[0].clientY;
      const dy = currentY - startY;
      if (dy <= 0) {
        indicator.style.height = "0px";
        indicator.style.opacity = "0";
        if (TEXT) TEXT.textContent = "下拉刷新";
        return;
      }
      // 阻止顶部回弹
      if (listWrap.scrollTop <= 0) e.preventDefault();
      const h = Math.min(THRESHOLD * 1.6, dy * 0.5);
      indicator.style.height = h + "px";
      indicator.style.opacity = Math.min(1, h / THRESHOLD);
      if (TEXT) TEXT.textContent = h >= THRESHOLD ? "松手刷新" : "下拉刷新";
    }, { passive: false });

    async function endPull() {
      if (!pulling) return;
      pulling = false;
      const dy = currentY - startY;
      indicator.style.transition = "height var(--dur-fast) var(--ease-soft), opacity var(--dur-fast) var(--ease-soft)";
      if (dy >= THRESHOLD) {
        indicator.classList.add("loading");
        indicator.style.height = "44px";
        indicator.style.opacity = "1";
        if (TEXT) TEXT.textContent = "刷新中…";
        try { await refresh(); } catch (e) { console.warn("[Chat] 下拉刷新失败", e); }
        // 让 loading 多跳一会儿，体感更可爱
        await new Promise((r) => setTimeout(r, 500));
      }
      indicator.style.height = "0px";
      indicator.style.opacity = "0";
      indicator.classList.remove("loading");
      if (TEXT) TEXT.textContent = "下拉刷新";
    }
    listWrap.addEventListener("touchend", endPull);
    listWrap.addEventListener("touchcancel", endPull);
  }

  // ---------- 新建聊天（底部面板）----------
  async function _newChat() {
    const U = global.Phone.Utils;
    const Storage = global.Phone.Storage;
    const Icon = global.Phone.IconLibrary;
    const chars = await Storage.getAll("characters");

    const mask = U.el("div", { class: "cute-sheet-mask new-chat-sheet-mask" });
    const sheet = U.el("div", { class: "cute-sheet new-chat-sheet", role: "dialog" });
    sheet.appendChild(U.el("div", { class: "sheet-handle" }));
    sheet.appendChild(U.el("div", { class: "cute-sheet-title", text: "选择聊天对象" }));

    if (chars.length === 0) {
      sheet.appendChild(U.el("div", { class: "new-chat-empty", text: "还没有角色，先去创建一个吧～" }));
    } else {
      const list = U.el("div", { class: "new-chat-list" });
      chars.forEach((c) => {
        const av = U.el("div", { class: "li-avatar" });
        if (c.avatar) av.innerHTML = '<img src="' + c.avatar + '" alt=""/>';
        else av.textContent = (c.name || "AI").slice(0, 1);
        const item = U.el("div", { class: "cute-sheet-item new-chat-item" }, [
          av,
          U.el("div", { class: "new-chat-info" }, [
            U.el("div", { class: "nc-name", text: c.name }),
            U.el("div", { class: "nc-desc", text: c.description || "点开开始聊天" }),
          ]),
        ]);
        item.addEventListener("click", async () => {
          // 已有该角色的非隐藏聊天直接打开，没有则创建
          const convs = await Storage.getAll("conversations");
          let conv = convs.find((cv) => cv.characterId === c.id && !cv.hidden);
          if (!conv) {
            const convId = U.uid("conv");
            conv = {
              id: convId,
              characterId: c.id,
              messages: [],
              createdAt: Date.now(),
              updatedAt: Date.now(),
              mode: "bubble",
              draft: "",
              pinned: false,
              muted: false,
            };
            await Storage.put("conversations", conv);
          }
          await Storage.setSetting("currentCharacterId", c.id);
          mask.remove();
          global.Phone.Router.push("conversation", global.Phone.Conversation.mount, {
            conversationId: conv.id, characterId: c.id,
          });
        });
        list.appendChild(item);
      });
      sheet.appendChild(list);
    }

    const cancel = U.el("div", { class: "cute-sheet-cancel", text: "取消" });
    cancel.addEventListener("click", () => mask.remove());
    sheet.appendChild(cancel);

    mask.appendChild(sheet);
    mask.addEventListener("click", (e) => { if (e.target === mask) mask.remove(); });
    document.body.appendChild(mask);
  }

  // ---------- 暴露 ----------
  global.Phone.Chat = { open, mount };
})(window);
