/* ============================================================
   conversation.js — 聊天界面
   流式输出 / 消息时间分组 / 模式切换 / 草稿 / 滚动到底部
   挂在 window.Phone.Conversation
   ============================================================ */
(function (global) {
  "use strict";

  const VIRTUAL_THRESHOLD = 100; // 超过此条数启用简化渲染（首版用 buffer 而非完全虚拟滚动）

  /**
   * 我（聊天界面）作为 Router 页面挂载
   * @param {HTMLElement} container
   * @param {object} params { conversationId, characterId }
   */
  async function mount(container, params) {
    const U = global.Phone.Utils;
    const Storage = global.Phone.Storage;
    const State = global.Phone.State;

    const conversationId = params.conversationId;
    let conversation = await Storage.get("conversations", conversationId);
    if (!conversation) {
      // 新建会话
      conversation = {
        id: conversationId,
        characterId: params.characterId,
        messages: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
        mode: "bubble",
        draft: "",
        pinned: false,
        muted: false,
      };
      await Storage.put("conversations", conversation);
    }

    const characterId = conversation.characterId || params.characterId;
    const character = (await Storage.getAll("characters")).find((c) => c.id === characterId) || { name: "AI" };

    // 我读取本聊天的 per-conv 设置（缺省时回退到全局默认值）
    let mode = conversation.mode || (await State.get("bubbleStyle")) === "dialog" ? "dialog" : "bubble";
    const showAvatar = conversation.showAvatar !== false;   // 默认显示头像
    const enterToSend = conversation.enterToSend !== false;  // 默认回车发送
    const showThinking = conversation.showThinking === true; // 默认不展示思维链
    const fontSize = conversation.fontSize || "base";

    // 容器
    const page = U.el("div", { class: "conv-page" });

    // 导航栏
    const nav = U.el("div", { class: "navbar conv-nav" });
    const backBtn = U.el("button", { class: "icon-btn", html: global.Phone.IconLibrary.get("chevron-left", { size: 22 }) });
    backBtn.addEventListener("click", () => global.Phone.Router.back());
    // 中间区域：角色头像(32x32 圆) + 名字 + 在线状态，点击进聊天设置
    const navAvatar = U.el("div", { class: "conv-nav-avatar" });
    if (character.avatar) {
      navAvatar.innerHTML = '<img src="' + character.avatar + '" alt=""/>';
    } else {
      navAvatar.textContent = (character.name || "AI").slice(0, 1);
    }
    const titleWrap = U.el("div", { class: "nav-title conv-nav-tappable" }, [
      navAvatar,
      U.el("div", { class: "conv-nav-titles" }, [
        U.el("div", { class: "conv-title", text: character.name || "AI" }),
        U.el("div", { class: "conv-subtitle", text: "在线" }),
      ]),
    ]);
    titleWrap.addEventListener("click", () => {
      // 点导航栏中间区域进入聊天设置页
      global.Phone.Router.push("chat-settings", global.Phone.ChatSettings.mount, {
        conversationId: conversationId,
        characterId: characterId,
      });
    });
    const menuBtn = U.el("button", { class: "icon-btn", html: global.Phone.IconLibrary.get("more-vertical", { size: 22 }) });
    menuBtn.addEventListener("click", () => _showMenu(conversation, character, () => _refresh(page)));
    const modeBtn = U.el("button", { class: "icon-btn", html: global.Phone.IconLibrary.get(mode === "bubble" ? "list" : "app-chat", { size: 20 }) });
    modeBtn.addEventListener("click", () => _toggleMode());
    nav.appendChild(backBtn);
    nav.appendChild(titleWrap);
    nav.appendChild(modeBtn);
    nav.appendChild(menuBtn);
    page.appendChild(nav);

    // 消息列表
    const listWrap = U.el("div", { class: "conv-list scroll" + (showAvatar ? "" : " hide-avatar") + (" fs-" + fontSize) });
    const list = U.el("div", { class: "conv-list-inner" });
    listWrap.appendChild(list);
    page.appendChild(listWrap);

    // 滚动到底部按钮（带"新消息"文字）
    const toBottomBtn = U.el("button", { class: "conv-to-bottom hidden" });
    toBottomBtn.innerHTML = global.Phone.IconLibrary.get("chevron-down", { size: 16 }) + '<span class="ctb-text">新消息</span>';
    page.appendChild(toBottomBtn);

    // 顶部加载更早消息的 loading（三个小圆点跳动）
    const topLoader = U.el("div", { class: "conv-load-top hidden" }, [
      U.el("span", { class: "clt-dot" }),
      U.el("span", { class: "clt-dot" }),
      U.el("span", { class: "clt-dot" }),
      U.el("span", { text: "加载更早消息..." }),
    ]);
    listWrap.insertBefore(topLoader, list);

    let isNearBottom = true;
    let loadingMore = false;
    listWrap.addEventListener("scroll", () => {
      const near = listWrap.scrollHeight - listWrap.scrollTop - listWrap.clientHeight < 80;
      isNearBottom = near;
      toBottomBtn.classList.toggle("hidden", near);
      // 滚动到顶部加载更早消息
      if (listWrap.scrollTop < 40 && _hasMore() && !loadingMore) {
        _loadMore();
      }
    });
    toBottomBtn.addEventListener("click", () => {
      listWrap.scrollTo({ top: listWrap.scrollHeight, behavior: "smooth" });
    });

    container.appendChild(page);

    // 渲染消息（分页 + 虚拟 buffer：超过 VIRTUAL_THRESHOLD 条只渲染最近 renderLimit 条）
    const PAGE_SIZE = 20;
    let renderLimit = 30; // 默认渲染最近 30 条

    function _visibleMessages() {
      const total = conversation.messages.length;
      if (total <= renderLimit) return conversation.messages.slice();
      return conversation.messages.slice(total - renderLimit);
    }
    function _hasMore() {
      return conversation.messages.length > renderLimit;
    }

    // 时间标签阈值：第一条显示 / 跨天显示 / 超过 5 分钟显示
    function _shouldShowTimeDivider(lastTs, ts) {
      if (!lastTs) return true;
      const lastD = new Date(lastTs);
      const curD = new Date(ts);
      if (lastD.toDateString() !== curD.toDateString()) return true;
      return (ts - lastTs) >= 5 * 60 * 1000;
    }

    function _renderMsgs(preserveScroll) {
      const prevScrollHeight = listWrap.scrollHeight;
      const prevScrollTop = listWrap.scrollTop;
      U.empty(list);
      // 虚拟滚动提示：还有更早消息未渲染时顶部显示提示
      if (_hasMore()) {
        list.appendChild(U.el("div", { class: "conv-load-top" }, [
          U.el("span", { text: "还有 " + (conversation.messages.length - renderLimit) + " 条更早消息，上滑加载" }),
        ]));
      }
      let lastTs = 0;
      let lastRole = null;
      _visibleMessages().forEach((m) => {
        const ts = m.createdAt || Date.now();
        if (_shouldShowTimeDivider(lastTs, ts)) {
          list.appendChild(global.Phone.MessageRenderer.renderTimeDivider(ts));
        }
        const node = global.Phone.MessageRenderer.render(m, {
          mode: mode, character: character, showAvatar: showAvatar, showThinking: showThinking,
          onAction: (action, msg) => _handleAction(action, msg)
        });
        // 同人且 5 分钟内：加 msg-same-author 类（CSS 控制 4px 紧凑间距）
        if (lastRole === m.role && lastTs > 0 && (ts - lastTs) < 5 * 60 * 1000) {
          node.classList.add("msg-same-author");
        }
        list.appendChild(node);
        lastTs = ts;
        lastRole = m.role;
      });
      if (preserveScroll) {
        // 加载更早消息后保持视觉位置（补偿新增的高度）
        requestAnimationFrame(() => {
          listWrap.scrollTop = prevScrollTop + (listWrap.scrollHeight - prevScrollHeight);
        });
      } else {
        _scrollToBottom(false);
      }
    }

    // 滚动到顶部时加载更早一页（PAGE_SIZE 条）
    async function _loadMore() {
      loadingMore = true;
      topLoader.classList.remove("hidden");
      // 数据已在内存中，给个短延迟让 loading 可见
      await new Promise((r) => setTimeout(r, 300));
      renderLimit += PAGE_SIZE;
      _renderMsgs(true);
      topLoader.classList.add("hidden");
      loadingMore = false;
    }

    function _rerenderMessages() { _renderMsgs(false); }
    _rerenderMessages();

    function _scrollToBottom(smooth) {
      requestAnimationFrame(() => {
        listWrap.scrollTo({ top: listWrap.scrollHeight, behavior: smooth ? "smooth" : "auto" });
      });
    }

    // 输入栏
    let currentQuote = null;
    const inputBar = global.Phone.InputBar.mount({
      initialDraft: conversation.draft || "",
      enterToSend: enterToSend,
      conversationId: conversationId,
      characterId: characterId,
      character: character,
      onDraft: async (text) => {
        conversation.draft = text;
        await Storage.put("conversations", conversation);
      },
      onTyping: () => {}, // 可扩展为通知对方
      quote: null,
      onCancelQuote: () => { currentQuote = null; },
      onSend: (msg) => _onSend(msg),
      onCommand: (cmd) => _handleCommand(cmd),
    });
    page.appendChild(inputBar.el);

    // ---------- 发送 ----------
    let sending = false;
    let abortCtrl = null;
    async function _onSend(msg) {
      if (sending) return false;
      if (msg.type === "text" && !msg.content.trim()) return false;

      // 转账 / 礼物：先真实扣钱，失败则中止发送（不入栈不渲染）
      if (msg.type === "transfer") {
        const Wallet = global.Phone.Wallet;
        if (!Wallet || !Wallet.userToAi) {
          global.Phone.Notify.push({ appId: "chat", title: "钱包还没准备好呀" });
          return false;
        }
        const amount = parseInt(msg.amount, 10);
        if (isNaN(amount) || amount <= 0) {
          global.Phone.Notify.push({ appId: "chat", title: "金额不对呀" });
          return false;
        }
        const res = await Wallet.userToAi(amount, "转账给 " + (character.name || "AI"), "transfer");
        if (!res.ok) {
          global.Phone.Notify.push({ appId: "chat", title: res.error || "转账失败啦" });
          return false;
        }
      } else if (msg.type === "gift") {
        const Shop = global.Phone.Shop;
        if (!Shop || !Shop.purchase) {
          global.Phone.Notify.push({ appId: "chat", title: "商店还没准备好呀" });
          return false;
        }
        const res = await Shop.purchase(msg.itemId || msg.name, 1);
        if (!res.ok) {
          global.Phone.Notify.push({ appId: "chat", title: res.error || "购买失败啦" });
          return false;
        }
      }

      // 1. 用户消息入栈
      const userMsg = {
        id: U.uid("msg"),
        role: "user",
        type: msg.type,
        content: msg.content,
        createdAt: Date.now(),
        status: "sent",
        quote: currentQuote ? { author: character.name, content: currentQuote.content } : null,
      };
      // 文件 / 图片附件带上的元数据
      if (msg.type === "file" || msg.type === "image") {
        if (msg.name) userMsg.name = msg.name;
        if (msg.mime) userMsg.mime = msg.mime;
        if (msg.size != null) userMsg.size = msg.size;
      }
      // 转账 / 礼物的扩展字段
      if (msg.type === "transfer") {
        userMsg.amount = msg.amount;
        userMsg.content = String(msg.amount);
      } else if (msg.type === "gift") {
        userMsg.name = msg.name;
        userMsg.icon = msg.icon || "gift";
        userMsg.content = msg.name;
      } else if (msg.type === "dice") {
        // renderer 用 msg.point；规范字段 value 也保留
        userMsg.point = msg.point != null ? msg.point : (msg.value != null ? msg.value : 1);
        userMsg.value = msg.value != null ? msg.value : userMsg.point;
        userMsg.content = String(userMsg.point);
      } else if (msg.type === "rps") {
        // renderer 用 msg.userHand / msg.aiHand / msg.result；规范字段 userChoice 也保留
        userMsg.userHand = msg.userHand || msg.userChoice || "rock";
        userMsg.userChoice = msg.userChoice || userMsg.userHand;
        userMsg.aiHand = msg.aiHand || global.Phone.Utils.pick(["rock", "paper", "scissors"]);
        // 兜底计算结果（input-bar 通常已带上 result）
        if (msg.result) {
          userMsg.result = msg.result;
        } else {
          const u = userMsg.userHand, a = userMsg.aiHand;
          userMsg.result = (u === a) ? "draw"
            : ((u === "rock" && a === "scissors") || (u === "scissors" && a === "paper") || (u === "paper" && a === "rock") ? "win" : "lose");
        }
        userMsg.content = userMsg.userHand;
      } else if (msg.type === "card") {
        userMsg.character = msg.character || character;
        userMsg.content = (msg.character && msg.character.name) || character.name || "角色名片";
      }
      // sticker / location / image / file / text 直接用 msg.content，无需额外字段
      conversation.messages.push(userMsg);
      conversation.updatedAt = Date.now();
      currentQuote = null;
      inputBar.setQuote(null);
      await Storage.put("conversations", conversation);

      // 立即渲染
      list.appendChild(global.Phone.MessageRenderer.render(userMsg, {
        mode: mode, character: character, showAvatar: showAvatar, showThinking: showThinking,
        onAction: (a, m) => _handleAction(a, m)
      }));
      _scrollToBottom(true);

      // 2. AI 占位消息（pending）+ 流式回复（文本 / 转账 / 礼物都触发 AI 回复，让 TA 回应一下）
      if (msg.type === "text" || msg.type === "transfer" || msg.type === "gift") {
        await _streamAiReply();
      }

      // 触发发送事件
      global.Phone.EventCenter.emit(global.Phone.EventCenter.TYPES.MESSAGE_SENT, {
        sourceApp: "chat",
        data: { conversationId: conversationId, content: userMsg.content },
        summary: "用户发了一条消息",
      });
      return true;
    }

    // 我（AI）流式回复一条消息：建占位 → 调 ChatAI.reply → 更新节点
    async function _streamAiReply() {
      sending = true;
      const aiMsg = {
        id: U.uid("msg"),
        role: "assistant",
        type: "text",
        content: "",
        createdAt: Date.now(),
        pending: true,
      };
      conversation.messages.push(aiMsg);
      const aiNode = global.Phone.MessageRenderer.render(aiMsg, {
        mode: mode, character: character, showAvatar: showAvatar, showThinking: showThinking,
        onAction: (a, m) => _handleAction(a, m)
      });
      list.appendChild(aiNode);
      _scrollToBottom(true);

      abortCtrl = new AbortController();
      try {
        const fullText = await global.Phone.ChatAI.reply({
          characterId: characterId,
          conversationId: conversationId,
          conversation: conversation,
          messages: conversation.messages.filter((m) => !m.pending).slice(-20),
          signal: abortCtrl.signal,
          onThinking: showThinking ? (text) => {
            _updateNode(aiNode, aiMsg, { thinking: text });
          } : function () {},
          onDelta: (delta, full) => {
            aiMsg.content = full;
            aiMsg.pending = false;
            _updateNode(aiNode, aiMsg);
            if (isNearBottom) _scrollToBottom(false);
          },
          onDone: async (full) => {
            aiMsg.content = full;
            aiMsg.pending = false;
            aiMsg.status = "sent";
            conversation.updatedAt = Date.now();
            await Storage.put("conversations", conversation);
            _updateNode(aiNode, aiMsg);

            // 触发事件
            global.Phone.EventCenter.emit(global.Phone.EventCenter.TYPES.MESSAGE_RECEIVED, {
              sourceApp: "chat",
              data: { conversationId: conversationId, characterId: characterId, content: full },
              summary: character.name + " 回复了消息",
            });
            sending = false;
          },
          onError: (err) => {
            aiMsg.pending = false;
            aiMsg.content = global.Phone.AIClient.friendlyError(err);
            aiMsg.status = "failed";
            _updateNode(aiNode, aiMsg);
            sending = false;
          },
        });
      } catch (e) {
        aiMsg.pending = false;
        aiMsg.content = global.Phone.AIClient.friendlyError(e);
        aiMsg.status = "failed";
        _updateNode(aiNode, aiMsg);
        sending = false;
      }
    }

    // 重新生成指定的 AI 消息（不传 msg 则重新生成最后一条 AI 消息）
    async function _regenerate(targetMsg) {
      if (sending) {
        global.Phone.Notify.push({ appId: "chat", title: "我还在想上一句呢，等一下哦" });
        return;
      }
      // 找到要重新生成的 AI 消息
      let idx = -1;
      if (targetMsg && targetMsg.id) {
        idx = conversation.messages.findIndex((m) => m.id === targetMsg.id && m.role === "assistant");
      }
      if (idx < 0) {
        // 退而求其次：找最后一条 AI 消息
        for (let i = conversation.messages.length - 1; i >= 0; i--) {
          if (conversation.messages[i].role === "assistant") { idx = i; break; }
        }
      }
      if (idx < 0) {
        global.Phone.Notify.push({ appId: "chat", title: "暂时没有可以重新生成的回复哦" });
        return;
      }
      // 删掉这条 AI 消息（保留它前面的用户消息作为 prompt）
      conversation.messages.splice(idx, 1);
      conversation.updatedAt = Date.now();
      await Storage.put("conversations", conversation);
      _rerenderMessages();
      // 重新生成
      await _streamAiReply();
    }

    function _updateNode(node, msg, extra) {
      extra = extra || {};
      if (extra.thinking != null) msg.thinking = extra.thinking;
      const newNode = global.Phone.MessageRenderer.render(msg, {
        mode: mode, character: character, showAvatar: showAvatar, showThinking: showThinking,
        onAction: (a, m) => _handleAction(a, m)
      });
      node.replaceWith(newNode);
    }

    // ---------- 消息操作 ----------
    async function _handleAction(action, msg) {
      const idx = conversation.messages.findIndex((m) => m.id === msg.id);
      // regenerate / resend / viewCard 不强依赖 idx（消息可能已被处理过）
      if (action !== "regenerate" && action !== "resend" && action !== "viewCard" && idx < 0) return;

      if (action === "delete") {
        conversation.messages.splice(idx, 1);
        await Storage.put("conversations", conversation);
        _rerenderMessages();
      } else if (action === "recall") {
        // 撤回：仅自己 2 分钟内的消息可撤回
        if (msg.role !== "user") {
          global.Phone.Notify.push({ appId: "chat", title: "只能撤回自己的消息哦" });
          return;
        }
        if (Date.now() - (msg.createdAt || 0) > 120000) {
          global.Phone.Notify.push({ appId: "chat", title: "超过 2 分钟的消息不能撤回啦" });
          return;
        }
        // 把消息原地替换成系统消息（保留位置和 id）
        conversation.messages[idx] = {
          id: msg.id, role: "system", type: "system",
          content: "我撤回了一条消息", createdAt: msg.createdAt || Date.now(),
        };
        await Storage.put("conversations", conversation);
        _rerenderMessages();
        global.Phone.Notify.push({ appId: "chat", title: "已撤回一条消息" });
      } else if (action === "quote") {
        currentQuote = { author: msg.role === "user" ? "我" : character.name, content: msg.content };
        inputBar.setQuote(currentQuote);
        inputBar.focus();
      } else if (action === "forward") {
        // 转发到朋友圈
        const ok = await global.Phone.Modal.confirm({
          title: "分享到朋友圈", message: "分享这条消息到朋友圈？", okText: "分享",
        });
        if (ok) {
          global.Phone.EventCenter.emit("forward_to_moments", {
            sourceApp: "chat",
            data: { content: msg.content },
            summary: "用户转发了一条消息到朋友圈",
          });
          global.Phone.Notify.push({ appId: "chat", title: "已转发到朋友圈" });
        }
      } else if (action === "favorite") {
        const favorites = (await Storage.getSetting("chatFavorites")) || [];
        favorites.push({ id: U.uid("fav"), content: msg.content, from: character.name, createdAt: Date.now() });
        await Storage.setSetting("chatFavorites", favorites);
      } else if (action === "regenerate") {
        await _regenerate(msg);
      } else if (action === "resend") {
        // 失败重发：AI 消息失败时删掉重新生成
        if (msg.role === "assistant" && msg.status === "failed") {
          if (idx >= 0) {
            conversation.messages.splice(idx, 1);
            await Storage.put("conversations", conversation);
          }
          _rerenderMessages();
          await _streamAiReply();
        } else {
          global.Phone.Notify.push({ appId: "chat", title: "这条消息暂时不能重发哦" });
        }
      } else if (action === "viewCard") {
        // 查看角色名片详情
        _showCharProfile(msg.character || character);
      }
    }

    // ---------- 斜杠命令 ----------
    async function _handleCommand(cmd) {
      if (cmd === "clear") {
        const ok = await global.Phone.Modal.confirm({
          title: "清空会话", message: "确定清空当前会话的所有消息吗？不可恢复哦", danger: true, okText: "清空",
        });
        if (!ok) return;
        conversation.messages = [];
        conversation.updatedAt = Date.now();
        await Storage.put("conversations", conversation);
        _rerenderMessages();
        global.Phone.Notify.push({ appId: "chat", title: "已清空当前会话" });
      } else if (cmd === "export") {
        _exportChat(conversation, character);
        global.Phone.Notify.push({ appId: "chat", title: "已导出聊天记录" });
      } else if (cmd === "regenerate") {
        await _regenerate(null);
      } else if (cmd === "mode") {
        _toggleMode();
      } else if (cmd === "help") {
        _showHelp();
      } else {
        global.Phone.Notify.push({ appId: "chat", title: "不认识的命令：" + cmd });
      }
    }

    // 切换气泡 / 对话模式
    async function _toggleMode() {
      mode = mode === "bubble" ? "dialog" : "bubble";
      conversation.mode = mode;
      await Storage.put("conversations", conversation);
      modeBtn.innerHTML = global.Phone.IconLibrary.get(mode === "bubble" ? "list" : "app-chat", { size: 20 });
      _rerenderMessages();
      global.Phone.Notify.push({
        appId: "chat",
        title: mode === "bubble" ? "已切换到气泡模式" : "已切换到对话模式"
      });
    }

    // 显示帮助说明（可爱文案，AI 第一人称）
    function _showHelp() {
      global.Phone.Modal.alert({
        title: "我能听懂的命令",
        icon: "info",
        message: [
          "/clear  清空当前会话",
          "/export  导出本次对话",
          "/regenerate  让我重新说一遍上一句",
          "/mode  切换气泡 / 对话模式",
          "/help  看看这条说明",
        ].join("\n"),
        okText: "知道啦",
      });
    }

    // ---------- 菜单 ----------
    function _showMenu(conv, char, refresh) {
      const U = global.Phone.Utils;
      const mask = U.el("div", { class: "sheet-mask" });
      const sheet = U.el("div", { class: "sheet" });
      sheet.appendChild(U.el("div", { class: "sheet-handle" }));
      const items = [
        { icon: "user", label: "对方资料", fn: () => _showCharProfile(char) },
        { icon: "app-settings", label: "聊天设置", fn: () => {
          global.Phone.Router.push("chat-settings", global.Phone.ChatSettings.mount, {
            conversationId: conv.id,
            characterId: conv.characterId,
          });
        }},
        { icon: "switch", label: "转账给 TA", fn: () => _sendTransfer(char) },
        { icon: "gift", label: "送礼物给 TA", fn: () => _sendGift(char) },
        { icon: "bell-off", label: conv.muted ? "取消免打扰" : "免打扰", fn: async () => {
          conv.muted = !conv.muted; await Storage.put("conversations", conv); refresh();
        }},
        { icon: "pin", label: conv.pinned ? "取消置顶" : "置顶", fn: async () => {
          conv.pinned = !conv.pinned; await Storage.put("conversations", conv); refresh();
        }},
        { icon: "image", label: "聊天背景", fn: () => _pickBackground(conv, refresh) },
        { icon: "download", label: "导出聊天记录", fn: () => _exportChat(conv, char) },
        { icon: "trash", label: "清空聊天记录", danger: true, fn: async () => {
          const ok = await global.Phone.Modal.confirm({
            title: "清空记录", message: "确定清空聊天记录吗？不可恢复哦", danger: true, okText: "清空",
          });
          if (!ok) return;
          conv.messages = []; await Storage.put("conversations", conv); refresh();
        }},
        { icon: "app-settings", label: "AI 接口切换", fn: () => {
          // 在聊天内弹出接口切换小弹窗，不再跳转设置页
          if (global.Phone.ApiSwitcher && global.Phone.ApiSwitcher.show) {
            global.Phone.ApiSwitcher.show({
              conversationId: conv.id,
              characterId: conv.characterId,
            });
          } else {
            // 兜底：模块没加载时再回退到设置页
            if (global.Phone.AIConfig && global.Phone.AIConfig.mount) {
              global.Phone.Router.push("ai-config", global.Phone.AIConfig.mount, {});
            } else {
              global.Phone.Notify.push({ appId: "chat", title: "AI 接口切换暂不可用" });
            }
          }
        }},
        { icon: "trash", label: "删除聊天", danger: true, fn: async () => {
          const ok = await global.Phone.Modal.confirm({
            title: "删除聊天", message: "确定删除这个聊天吗？所有消息都会消失，不可恢复哦", danger: true, okText: "删除",
          });
          if (!ok) return;
          await Storage.del("conversations", conv.id);
          global.Phone.Notify.push({ appId: "chat", title: "已删除聊天" });
          global.Phone.Router.back();
        }},
      ];
      items.forEach((it) => {
        const node = U.el("div", { class: "sheet-item" + (it.danger ? " danger" : "") });
        node.innerHTML = global.Phone.IconLibrary.get(it.icon, { size: 20 });
        node.appendChild(document.createTextNode(it.label));
        node.addEventListener("click", () => { try { it.fn(); } catch (e) { console.warn(e); } mask.remove(); });
        sheet.appendChild(node);
      });
      const cancel = U.el("div", { class: "sheet-cancel", text: "取消" });
      cancel.addEventListener("click", () => mask.remove());
      sheet.appendChild(cancel);
      mask.appendChild(sheet);
      mask.addEventListener("click", (e) => { if (e.target === mask) mask.remove(); });
      document.body.appendChild(mask);
    }

    function _showCharProfile(char) {
      const U = global.Phone.Utils;
      const mask = U.el("div", { class: "modal-mask" });
      const modal = U.el("div", { class: "modal" });
      modal.appendChild(U.el("div", { class: "modal-title", text: char.name || "AI" }));
      const body = U.el("div", { class: "modal-body" }, [
        U.el("div", { class: "char-profile", style: { textAlign: "left" } }, [
          char.description ? U.el("div", { class: "cp-row", text: "简介：" + char.description }) : null,
          char.personality ? U.el("div", { class: "cp-row", text: "性格：" + char.personality }) : null,
          char.speakingStyle ? U.el("div", { class: "cp-row", text: "说话方式：" + char.speakingStyle }) : null,
        ])
      ]);
      modal.appendChild(body);
      modal.appendChild(U.el("div", { class: "modal-actions" }, [
        U.el("button", { class: "btn btn-block", text: "好的", onclick: () => mask.remove() })
      ]));
      mask.appendChild(modal);
      mask.addEventListener("click", (e) => { if (e.target === mask) mask.remove(); });
      document.body.appendChild(mask);
    }

    // ---------- 转账给 TA（真实扣钱：_onSend 内调 Wallet.userToAi） ----------
    async function _sendTransfer(char) {
      const Wallet = global.Phone.Wallet;
      if (!Wallet || !Wallet.userToAi) {
        global.Phone.Notify.push({ appId: "chat", title: "钱包还没准备好呀" });
        return;
      }
      // 先查余额，给用户参考
      const balance = await Wallet.getBalance("user");
      const amountStr = await global.Phone.Modal.prompt({
        title: "转账给 " + (char.name || "TA"),
        message: "当前余额：" + balance + " 元",
        placeholder: "输入转账金额",
        inputType: "number",
        okText: "转账",
        cancelText: "再想想",
      });
      if (amountStr == null) return;
      const amount = parseInt(amountStr, 10);
      if (isNaN(amount) || amount <= 0) {
        global.Phone.Notify.push({ appId: "chat", title: "请输入正整数金额呀" });
        return;
      }
      // 委托给 _onSend：内部会调 Wallet.userToAi 真实扣钱，成功才入栈
      const ok = await _onSend({ type: "transfer", amount: amount, content: String(amount) });
      if (ok) {
        global.Phone.Notify.push({ appId: "chat", title: "已转账 " + amount + " 元给 " + (char.name || "TA") });
      }
    }

    // ---------- 送礼物给 TA（真实扣钱写库存：_onSend 内调 Shop.purchase） ----------
    async function _sendGift(char) {
      const Shop = global.Phone.Shop;
      if (!Shop || !Shop.listItems || !Shop.purchase) {
        global.Phone.Notify.push({ appId: "chat", title: "商店还没准备好呀" });
        return;
      }
      // 拉取商品列表（商店为空时回退到内置模板）
      const items = await Shop.listItems();
      let pool = items && items.length ? items : (Shop.TEMPLATES || []);
      if (!pool.length) {
        global.Phone.Notify.push({ appId: "chat", title: "商店里还没有商品呀" });
        return;
      }
      // 用 actionSheet 让用户选礼物
      const sheetItems = pool.slice(0, 24).map((it) => ({
        label: it.name + "  " + (it.price || 0) + " 元",
        icon: it.icon || "gift",
      }));
      const idx = await global.Phone.Modal.actionSheet({
        title: "选个礼物送给 " + (char.name || "TA"),
        items: sheetItems,
        cancelText: "再想想",
      });
      if (idx < 0 || idx >= pool.length) return;
      const gift = pool[idx];
      // 委托给 _onSend：内部会调 Shop.purchase 真实扣钱写库存，成功才入栈
      const ok = await _onSend({
        type: "gift",
        itemId: gift.id,
        name: gift.name,
        icon: gift.icon || "gift",
        content: gift.name,
      });
      if (ok) {
        global.Phone.Notify.push({ appId: "chat", title: "已送出 " + gift.name + " 给 " + (char.name || "TA") });
      }
    }

    async function _pickBackground(conv, refresh) {
      const U = global.Phone.Utils;
      const inp = U.el("input", { type: "file", accept: "image/*", style: "display:none" });
      document.body.appendChild(inp);
      inp.addEventListener("change", async () => {
        const f = inp.files[0]; if (!f) return;
        const base64 = await U.fileToBase64(f);
        conv.background = base64;
        await Storage.put("conversations", conv);
        _applyBackground();
        inp.remove();
        refresh();
      });
      inp.click();
    }
    function _applyBackground() {
      if (conversation.background) {
        listWrap.style.background = "url('" + conversation.background + "') center/cover no-repeat";
      }
    }
    _applyBackground();

    function _exportChat(conv, char) {
      const lines = conv.messages.map((m) => {
        const who = m.role === "user" ? "我" : (char.name || "AI");
        return "[" + U.fmtDateTime(m.createdAt || Date.now()) + "] " + who + "：" + m.content;
      });
      const text = "和 " + (char.name || "AI") + " 的聊天记录\n\n" + lines.join("\n");
      global.Phone.Utils.download("聊天记录_" + (char.name || "AI") + ".txt", text, "text/plain;charset=utf-8");
    }

    function _refresh(page) {
      // 简单刷新（重渲染当前页）
      _rerenderMessages();
    }

    // 标记已读
    global.Phone.Notify.markAppRead("chat");

    // 卸载钩子
    global.Phone.Router.onLeave(() => {
      if (abortCtrl) try { abortCtrl.abort(); } catch {}
      inputBar.destroy();
    });
  }

  // ---------- 暴露 ----------
  global.Phone = global.Phone || {};
  global.Phone.Conversation = { mount };
})(window);
