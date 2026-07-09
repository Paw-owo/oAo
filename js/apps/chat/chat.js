/* ============================================================
   chat.js — 消息列表 + chat APP 注册
   - 头像 48px / 名字 600 / 预览 / 时间 / 未读角标
   - 置顶（背景 + 左侧 2px 竖线，加 .pinned）
   - 长按 300ms → 底部 sheet（置顶 / 已读未读 / 删除撤销 3s）
   - 搜索：全屏搜索模式，角色名 + 消息全文，按会话分组，关键词高亮
   - 草稿前缀 / 思考中预览 / 空状态插画
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
    const clearBtn = U.el("button", { class: "cs-clear hidden", html: global.Phone.IconLibrary.get("close", { size: 16 }) });
    searchBar.appendChild(clearBtn);
    page.appendChild(searchBar);

    // 列表
    const listWrap = U.el("div", { class: "scroll chat-list-wrap" });
    const list = U.el("div", { class: "chat-list" });
    listWrap.appendChild(list);
    page.appendChild(listWrap);

    container.appendChild(page);

    let keyword = "";
    let searchMode = false;

    async function refresh() {
      U.empty(list);
      let convs = await Storage.getAll("conversations");
      // 排除 hidden
      convs = convs.filter((c) => !c.hidden);

      // 搜索模式：按角色名 + 消息内容全文检索，按会话分组
      if (searchMode && keyword) {
        await _renderSearchResults(list, convs, keyword);
        return;
      }

      // 列表模式：按置顶 + updatedAt 排序
      convs.sort((a, b) => {
        if (!!b.pinned - !!a.pinned) return !!b.pinned - !!a.pinned ? 1 : -1;
        return (b.updatedAt || 0) - (a.updatedAt || 0);
      });

      if (convs.length === 0) {
        list.appendChild(_emptyState());
        return;
      }

      // 找角色信息
      const chars = await Storage.getAll("characters");

      convs.forEach((c) => {
        const char = chars.find((ch) => ch.id === c.characterId) || { name: "AI" };
        const lastMsg = c.messages && c.messages.length ? c.messages[c.messages.length - 1] : null;
        const unread = c.unread || 0;
        list.appendChild(_renderItem(c, char, lastMsg, unread, refresh, page));
      });
    }

    // 点击搜索栏 → 进入全屏搜索模式
    searchInput.addEventListener("focus", () => {
      searchMode = true;
      page.classList.add("search-active");
    });
    function exitSearch() {
      searchMode = false;
      keyword = "";
      searchInput.value = "";
      clearBtn.classList.add("hidden");
      page.classList.remove("search-active");
      refresh();
    }
    searchInput.addEventListener("input", U.debounce(() => {
      keyword = searchInput.value.trim();
      clearBtn.classList.toggle("hidden", !keyword);
      refresh();
    }, 200));
    clearBtn.addEventListener("click", () => {
      exitSearch();
      searchInput.focus();
    });

    refresh();

    // 监听新消息事件（自动刷新；搜索模式下不打断搜索）
    const unsub = global.Phone.EventCenter.on(global.Phone.EventCenter.TYPES.MESSAGE_RECEIVED, () => {
      if (!searchMode) refresh();
    });
    const unsubSent = global.Phone.EventCenter.on(global.Phone.EventCenter.TYPES.MESSAGE_SENT, () => {
      if (!searchMode) refresh();
    });
    global.Phone.Router.onLeave(() => { unsub(); unsubSent(); });
  }

  // ---------- 会话时间戳格式（覆盖 utils.relTime 的跨年输出） ----------
  // 今天 HH:mm / 昨天 HH:mm / 周X HH:mm / 更早 M月D日 / 跨年 YYYY年M月D日
  function _fmtConvTime(ts) {
    const U = global.Phone.Utils;
    const now = new Date();
    const d = new Date(ts);
    const day = 24 * 3600 * 1000;
    if (now.toDateString() === d.toDateString()) return U.fmtHM(ts);
    if (new Date(now.getTime() - day).toDateString() === d.toDateString()) return "昨天 " + U.fmtHM(ts);
    if (now.getFullYear() === d.getFullYear() && (now.getTime() - ts) < day * 7) {
      return U.WEEK_CN[d.getDay()] + " " + U.fmtHM(ts);
    }
    if (now.getFullYear() === d.getFullYear()) return (d.getMonth() + 1) + "月" + d.getDate() + "日";
    return d.getFullYear() + "年" + (d.getMonth() + 1) + "月" + d.getDate() + "日";
  }

  // ---------- 渲染单条会话 ----------
  function _renderItem(conv, char, lastMsg, unread, refresh, page) {
    const U = global.Phone.Utils;
    const item = U.el("div", { class: "chat-list-item" + (conv.pinned ? " pinned" : "") });

    // 主内容
    const main = U.el("div", { class: "cli-main" });
    const avatar = U.el("div", { class: "li-avatar" });
    if (char.avatar) avatar.innerHTML = '<img src="' + char.avatar + '" alt=""/>';
    else avatar.textContent = (char.name || "AI").slice(0, 1);
    main.appendChild(avatar);

    const info = U.el("div", { class: "li-main" });
    info.appendChild(U.el("div", { class: "cli-top" }, [
      U.el("div", { class: "li-title", html: U.escapeHtml(char.name || "AI") + (conv.pinned ? ' <span class="pin-icon">' + global.Phone.IconLibrary.get("pin", { size: 12 }) + '</span>' : "") }),
      U.el("div", { class: "li-right", text: lastMsg ? _fmtConvTime(lastMsg.createdAt || conv.updatedAt || Date.now()) : "" })
    ]));

    // 预览：思考中 > 草稿 > 最后消息 > 默认
    const subWrap = U.el("div", { class: "cli-sub" });
    const previewNode = U.el("div", { class: "li-sub" });
    if (lastMsg && lastMsg.role === "assistant" && (lastMsg.pending || lastMsg.thinking)) {
      previewNode.appendChild(U.el("span", { class: "thinking-preview", text: "[思考中…]" }));
    } else if (conv.draft) {
      previewNode.appendChild(U.el("span", { class: "draft-prefix", text: "[草稿]" }));
      previewNode.appendChild(document.createTextNode(U.truncate(conv.draft, 30)));
    } else if (lastMsg) {
      const subText = lastMsg.type === "image" ? "[图片]" : lastMsg.type === "voice" ? "[语音]" : U.truncate(lastMsg.content || "", 30);
      previewNode.textContent = subText;
    } else {
      previewNode.textContent = "开始聊天吧～";
    }
    subWrap.appendChild(previewNode);
    if (unread > 0) {
      subWrap.appendChild(U.el("div", { class: "cli-badge", text: unread > 99 ? "99+" : String(unread) }));
    }
    info.appendChild(subWrap);
    main.appendChild(info);
    item.appendChild(main);

    // 点击进入对话
    let longPressFired = false;
    main.addEventListener("click", () => {
      if (longPressFired) { longPressFired = false; return; }
      global.Phone.Router.push("conversation", global.Phone.Conversation.mount, {
        conversationId: conv.id,
        characterId: conv.characterId,
      });
    });

    // 长按 300ms → 底部 sheet
    let pressTimer = null;
    let startX = 0, startY = 0;
    const startPress = (x, y) => {
      startX = x; startY = y;
      longPressFired = false;
      pressTimer = setTimeout(() => {
        longPressFired = true;
        if (navigator.vibrate) try { navigator.vibrate(8); } catch {}
        _showConvSheet(conv, char, unread, refresh, page);
      }, 300);
    };
    const cancelPress = (x, y) => {
      if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
      // 移动超过 10px 视为滚动，取消
      if (x != null && (Math.abs(x - startX) > 10 || Math.abs(y - startY) > 10)) {
        longPressFired = false;
      }
    };
    main.addEventListener("touchstart", (e) => {
      const t = e.touches[0];
      startPress(t.clientX, t.clientY);
    }, { passive: true });
    main.addEventListener("touchmove", (e) => {
      const t = e.touches[0];
      cancelPress(t.clientX, t.clientY);
    }, { passive: true });
    main.addEventListener("touchend", () => cancelPress());
    main.addEventListener("mousedown", (e) => startPress(e.clientX, e.clientY));
    main.addEventListener("mouseup", () => cancelPress());
    main.addEventListener("mouseleave", () => cancelPress());
    main.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      _showConvSheet(conv, char, unread, refresh, page);
    });

    return item;
  }

  // ---------- 长按底部 sheet（置顶 / 已读未读 / 删除撤销） ----------
  function _showConvSheet(conv, char, unread, refresh, page) {
    const U = global.Phone.Utils;
    if (document.querySelector(".sheet-mask")) return;

    const actions = [
      {
        icon: "pin", label: conv.pinned ? "取消置顶" : "置顶",
        fn: async () => {
          conv.pinned = !conv.pinned;
          await global.Phone.Storage.put("conversations", conv);
          refresh();
        },
      },
      {
        icon: unread > 0 ? "bell-off" : "bell", label: unread > 0 ? "标为已读" : "标为未读",
        fn: async () => {
          conv.unread = unread > 0 ? 0 : 1;
          await global.Phone.Storage.put("conversations", conv);
          // 同步 Notify 角标重算
          try { if (global.Phone.Notify && global.Phone.Notify.refreshBadges) global.Phone.Notify.refreshBadges(); } catch {}
          refresh();
        },
      },
      {
        icon: "trash", label: "删除", danger: true,
        fn: () => _deleteConv(conv, refresh),
      },
    ];

    const mask = U.el("div", { class: "sheet-mask" });
    const sheet = U.el("div", { class: "sheet" });
    sheet.appendChild(U.el("div", { class: "sheet-handle" }));
    // 会话标题
    const head = U.el("div", { class: "sheet-title", text: char.name || "AI" });
    sheet.appendChild(head);
    actions.forEach((a) => {
      const itemEl = U.el("div", { class: "sheet-item" + (a.danger ? " danger" : "") });
      itemEl.innerHTML = global.Phone.IconLibrary.get(a.icon, { size: 20 });
      itemEl.appendChild(document.createTextNode(a.label));
      itemEl.addEventListener("click", () => {
        mask.remove();
        try { a.fn(); } catch (e) { console.warn("[Chat] 操作失败", e); }
      });
      sheet.appendChild(itemEl);
    });
    const cancel = U.el("div", { class: "sheet-cancel", text: "取消" });
    cancel.addEventListener("click", () => mask.remove());
    sheet.appendChild(cancel);
    mask.appendChild(sheet);
    mask.addEventListener("click", (e) => { if (e.target === mask) mask.remove(); });
    document.body.appendChild(mask);
  }

  // ---------- 删除：Toast 撤销 3s ----------
  function _deleteConv(conv, refresh) {
    // 先临时隐藏，3s 内可撤销
    const snapshot = Object.assign({}, conv);
    conv.hidden = true;
    global.Phone.Storage.put("conversations", conv).then(() => refresh());

    _showUndoToast("已删除", 3, async () => {
      // 撤销：恢复
      conv.hidden = false;
      await global.Phone.Storage.put("conversations", conv);
      refresh();
    }, async () => {
      // 倒计时结束：真删除
      try {
        await global.Phone.Storage.del("conversations", conv.id);
        const msgs = await global.Phone.Storage.getByIndex("messages", "conversationId", conv.id);
        for (const m of msgs) await global.Phone.Storage.del("messages", m.id);
      } catch (e) { console.warn("[Chat] 删除会话失败", e); }
      refresh();
    });
    // snapshot 留作日后扩展（如回收站），当前不使用
    void snapshot;
  }

  // ---------- 撤销 Toast（带 3s 倒计时） ----------
  function _showUndoToast(message, seconds, onUndo, onTimeout) {
    const U = global.Phone.Utils;
    let host = document.querySelector(".chat-undo-host");
    if (!host) {
      host = U.el("div", { class: "chat-undo-host" });
      document.body.appendChild(host);
    }
    let remaining = seconds;
    const item = U.el("div", { class: "chat-undo-toast anim-slide-up" });
    const txt = U.el("span", { class: "cut-text", text: message + "（" + remaining + "s）" });
    const undo = U.el("button", { class: "cut-undo", text: "撤销" });
    item.appendChild(txt);
    item.appendChild(undo);
    host.appendChild(item);

    let done = false;
    const timer = setInterval(() => {
      if (done) return;
      remaining--;
      if (remaining <= 0) {
        done = true;
        clearInterval(timer);
        item.classList.add("cut-leave");
        setTimeout(() => item.remove(), 300);
        try { onTimeout && onTimeout(); } catch (e) { console.warn(e); }
      } else {
        txt.textContent = message + "（" + remaining + "s）";
      }
    }, 1000);
    undo.addEventListener("click", () => {
      if (done) return;
      done = true;
      clearInterval(timer);
      item.remove();
      try { onUndo && onUndo(); } catch (e) { console.warn(e); }
    });
  }

  // ---------- 搜索结果渲染（按会话分组） ----------
  async function _renderSearchResults(list, convs, keyword) {
    const U = global.Phone.Utils;
    const Storage = global.Phone.Storage;
    const chars = await Storage.getAll("characters");
    const k = keyword.toLowerCase();

    const results = [];
    for (const c of convs) {
      const char = chars.find((ch) => ch.id === c.characterId) || { name: "AI" };
      const charNameMatch = (char.name || "").toLowerCase().includes(k);
      const msgs = (c.messages || []);
      const matches = msgs.filter((m) => (m.content || "").toLowerCase().includes(k));
      if (!charNameMatch && matches.length === 0) continue;
      // 命中消息按时间倒序，最多展示用；角色名命中但无消息命中时取最近 3 条作预览
      const showMatches = matches.length ? matches.slice().reverse() : msgs.slice(-3).reverse();
      results.push({ conv: c, char: char, matches: showMatches, total: matches.length });
    }

    if (results.length === 0) {
      list.appendChild(_noResultState());
      return;
    }

    results.forEach(({ conv, char, matches, total }) => {
      const group = U.el("div", { class: "search-result-group" });
      // 组头：头像 + 名字 + 命中数
      const head = U.el("div", { class: "srg-head" });
      const av = U.el("div", { class: "li-avatar srg-avatar" });
      if (char.avatar) av.innerHTML = '<img src="' + char.avatar + '" alt=""/>';
      else av.textContent = (char.name || "AI").slice(0, 1);
      head.appendChild(av);
      head.appendChild(U.el("div", { class: "srg-name", html: _highlight(char.name || "AI", keyword) }));
      if (total > 0) head.appendChild(U.el("div", { class: "srg-count", text: total + " 条" }));
      group.appendChild(head);

      const msgList = U.el("div", { class: "srg-messages" });
      const shown = matches.slice(0, 3);
      const rest = matches.slice(3);
      shown.forEach((m) => msgList.appendChild(_renderSearchHit(m, keyword, conv, char)));
      group.appendChild(msgList);

      if (rest.length) {
        const more = U.el("div", { class: "srg-more", text: "查看更多（" + rest.length + " 条）" });
        more.addEventListener("click", () => {
          rest.forEach((m) => msgList.appendChild(_renderSearchHit(m, keyword, conv, char)));
          more.remove();
        });
        group.appendChild(more);
      }
      list.appendChild(group);
    });
  }

  // ---------- 单条搜索命中 ----------
  function _renderSearchHit(msg, keyword, conv, char) {
    const U = global.Phone.Utils;
    const item = U.el("div", { class: "srg-item" });
    const body = U.el("div", { class: "srg-item-body" });
    body.appendChild(U.el("div", { class: "srg-item-text", html: _highlight(msg.content || "", keyword) }));
    body.appendChild(U.el("div", { class: "srg-item-time", text: _fmtConvTime(msg.createdAt || Date.now()) }));
    item.appendChild(body);
    item.addEventListener("click", () => {
      // 跳转到对应消息
      try { global.Phone.State.set("chat.jumpToMsg", msg.id); } catch (e) { global.Phone.State.setMem("chat.jumpToMsg", msg.id); }
      global.Phone.Router.push("conversation", global.Phone.Conversation.mount, {
        conversationId: conv.id,
        characterId: conv.characterId,
      });
    });
    return item;
  }

  // ---------- 关键词高亮 ----------
  function _escapeReg(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
  function _highlight(text, keyword) {
    const U = global.Phone.Utils;
    const safe = U.escapeHtml(text || "");
    if (!keyword) return safe;
    const kw = U.escapeHtml(keyword);
    try {
      const re = new RegExp("(" + _escapeReg(kw) + ")", "gi");
      return safe.replace(re, '<span class="search-hit">$1</span>');
    } catch (e) {
      return safe;
    }
  }

  // ---------- 空状态（无会话） ----------
  function _emptyState() {
    const U = global.Phone.Utils;
    return U.el("div", { class: "chat-empty-state" }, [
      U.el("div", { class: "chat-empty-illust", html: _bubbleIllust() }),
      U.el("div", { class: "es-title", text: "还没有对话" }),
      U.el("div", { class: "es-sub", text: "点击右上角开始吧" }),
    ]);
  }

  // ---------- 搜索无结果 ----------
  function _noResultState() {
    const U = global.Phone.Utils;
    return U.el("div", { class: "chat-empty-state" }, [
      U.el("div", { class: "chat-empty-illust", html: _searchEmptyIllust() }),
      U.el("div", { class: "es-title", text: "没有找到相关消息" }),
      U.el("div", { class: "es-sub", text: "换个关键词试试" }),
    ]);
  }

  // 线条风聊天气泡插画（空状态）
  function _bubbleIllust() {
    return '<svg viewBox="0 0 96 96" width="96" height="96" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">' +
      '<path d="M16 30a10 10 0 0 1 10-10h44a10 10 0 0 1 10 10v22a10 10 0 0 1-10 10H38l-14 12v-12h-2a6 6 0 0 1-6-6V30z"/>' +
      '<path d="M34 41h28M34 50h20"/>' +
      '<circle cx="78" cy="22" r="3" fill="currentColor" stroke="none"/>' +
      '</svg>';
  }
  // 线条风搜索插画（无结果）
  function _searchEmptyIllust() {
    return '<svg viewBox="0 0 96 96" width="96" height="96" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">' +
      '<circle cx="42" cy="42" r="20"/>' +
      '<path d="M57 57l16 16"/>' +
      '<path d="M34 42h16M42 34v16"/>' +
      '</svg>';
  }

  // ---------- 新建聊天 ----------
  // 单聊：点角色即开聊
  // 群聊：点"创建群聊"→ 多选角色（至少2个）+ 群名输入 → 创建 isGroup 会话
  async function _newChat(page) {
    const U = global.Phone.Utils;
    const Storage = global.Phone.Storage;
    const chars = await Storage.getAll("characters");

    const mask = U.el("div", { class: "modal-mask" });
    const modal = U.el("div", { class: "modal" });
    mask.appendChild(modal);
    mask.addEventListener("click", (e) => { if (e.target === mask) mask.remove(); });

    function renderSingle() {
      U.empty(modal);
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
        U.el("button", {
          class: "btn btn-ghost",
          html: global.Phone.IconLibrary.get("users", { size: 18 }) + " 创建群聊",
          onclick: () => renderGroup(),
        }),
        U.el("button", { class: "btn btn-block", text: "取消", onclick: () => mask.remove() }),
      ]));
    }

    // 群聊创建：多选角色 + 群名输入
    function renderGroup() {
      U.empty(modal);
      modal.appendChild(U.el("div", { class: "modal-title", text: "创建群聊" }));
      if (chars.length < 2) {
        modal.appendChild(U.el("div", { class: "modal-body", text: "至少需要 2 个角色才能建群，先去创建几个吧～" }));
        modal.appendChild(U.el("div", { class: "modal-actions" }, [
          U.el("button", { class: "btn btn-ghost", text: "返回", onclick: () => renderSingle() }),
        ]));
        return;
      }

      const selected = {}; // charId -> true
      // 群名输入框
      const nameInputWrap = U.el("div", { class: "new-chat-name-wrap", style: { marginBottom: "12px" } });
      nameInputWrap.appendChild(U.el("div", { text: "群名称（可选）", style: { fontSize: "var(--font-sm)", color: "var(--text-secondary)", marginBottom: "4px" } }));
      const nameInput = U.el("input", {
        class: "phone-modal-input",
        placeholder: "留空则用成员名拼接",
        style: { width: "100%", padding: "10px 12px", borderRadius: "var(--radius-md)", border: "1px solid var(--border-soft)", boxSizing: "border-box" },
      });
      nameInputWrap.appendChild(nameInput);
      modal.appendChild(nameInputWrap);

      // 提示 + 已选计数
      const hint = U.el("div", { class: "new-chat-hint", text: "选择群成员（至少 2 个，已选 0）", style: { fontSize: "var(--font-xs)", color: "var(--text-secondary)", marginBottom: "8px" } });
      modal.appendChild(hint);

      const list = U.el("div", { class: "new-chat-list" });
      function _defaultTitle() {
        const names = chars.filter((c) => selected[c.id]).map((c) => c.name || "AI");
        if (names.length === 0) return "";
        if (names.length <= 3) return names.join("、");
        return names.slice(0, 3).join("、") + "等";
      }
      function _refreshHint() {
        const n = Object.keys(selected).length;
        hint.textContent = "选择群成员（至少 2 个，已选 " + n + "）";
        // 群名为空时实时跟随默认标题
        if (!nameInput.value.trim() || nameInput.dataset.auto === "1") {
          nameInput.value = _defaultTitle();
          nameInput.dataset.auto = "1";
        }
      }
      chars.forEach((c) => {
        const item = U.el("div", { class: "list-item group-pick-item", style: { display: "flex", alignItems: "center", gap: "10px", padding: "10px 8px", cursor: "pointer", borderRadius: "var(--radius-md)" } });
        const av = U.el("div", { class: "li-avatar", style: { width: "36px", height: "36px" } });
        if (c.avatar) av.innerHTML = '<img src="' + c.avatar + '"/>';
        else av.textContent = (c.name || "AI").slice(0, 1);
        item.appendChild(av);
        item.appendChild(U.el("div", { class: "li-main", style: { flex: "1" } }, [
          U.el("div", { class: "li-title", text: c.name }),
          U.el("div", { class: "li-sub", text: c.description || "", style: { fontSize: "var(--font-xs)", color: "var(--text-secondary)" } }),
        ]));
        // 勾选标记
        const check = U.el("div", { class: "group-pick-check", html: "", style: { width: "22px", height: "22px", borderRadius: "var(--radius-full)", border: "2px solid var(--border-soft)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-on-primary)", flexShrink: "0", transition: "background var(--dur-fast) var(--ease-soft), border-color var(--dur-fast) var(--ease-soft)" } });
        item.appendChild(check);
        function _syncCheck() {
          if (selected[c.id]) {
            check.style.background = "var(--color-primary)";
            check.style.borderColor = "var(--color-primary)";
            check.innerHTML = global.Phone.IconLibrary.get("check", { size: 14 });
          } else {
            check.style.background = "transparent";
            check.style.borderColor = "var(--border-soft)";
            check.innerHTML = "";
          }
        }
        item.addEventListener("click", () => {
          if (selected[c.id]) delete selected[c.id];
          else selected[c.id] = true;
          // 用户手动编辑过群名则不再自动跟随
          nameInput.dataset.auto = "0";
          nameInput.addEventListener("input", function onIn() { nameInput.dataset.auto = "0"; nameInput.removeEventListener("input", onIn); });
          _syncCheck();
          _refreshHint();
        });
        list.appendChild(item);
      });
      modal.appendChild(list);

      modal.appendChild(U.el("div", { class: "modal-actions" }, [
        U.el("button", { class: "btn btn-ghost", text: "返回", onclick: () => renderSingle() }),
        U.el("button", {
          class: "btn btn-block", text: "创建群聊",
          onclick: async () => {
            const memberIds = Object.keys(selected);
            if (memberIds.length < 2) {
              global.Phone.Notify.push({ appId: "chat", title: "至少选择 2 个成员" });
              return;
            }
            const title = (nameInput.value || "").trim() || _defaultTitle();
            const convId = U.uid("conv");
            const conv = {
              id: convId,
              isGroup: true,
              memberIds: memberIds,
              title: title,
              characterId: memberIds[0], // 群聊也留一个 characterId 兜底（列表页/搜索用）
              messages: [],
              createdAt: Date.now(),
              updatedAt: Date.now(),
              mode: "bubble",
              draft: "",
              pinned: false,
              muted: false,
              contextStartIdx: 0,
            };
            await Storage.put("conversations", conv);
            mask.remove();
            global.Phone.Router.push("conversation", global.Phone.Conversation.mount, {
              conversationId: convId,
            });
          },
        }),
      ]));
    }

    renderSingle();
    document.body.appendChild(mask);
  }

  // ---------- 暴露 ----------
  global.Phone.Chat = { open, mount, _fmtConvTime };
})(window);
