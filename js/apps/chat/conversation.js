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

    let mode = conversation.mode || (await State.get("bubbleStyle")) === "dialog" ? "dialog" : "bubble";

    // 容器
    const page = U.el("div", { class: "conv-page" });

    // 导航栏
    const nav = U.el("div", { class: "navbar conv-nav" });
    const backBtn = U.el("button", { class: "icon-btn", html: global.Phone.IconLibrary.get("chevron-left", { size: 22 }) });
    backBtn.addEventListener("click", () => global.Phone.Router.back());
    const titleWrap = U.el("div", { class: "nav-title" }, [
      U.el("div", { class: "conv-title", text: character.name || "AI" }),
      U.el("div", { class: "conv-subtitle", text: "在线" }),
    ]);
    const menuBtn = U.el("button", { class: "icon-btn", html: global.Phone.IconLibrary.get("more-vertical", { size: 22 }) });
    menuBtn.addEventListener("click", () => _showMenu(conversation, character, () => _refresh(page)));
    const modeBtn = U.el("button", { class: "icon-btn", html: global.Phone.IconLibrary.get(mode === "bubble" ? "list" : "app-chat", { size: 20 }) });
    modeBtn.addEventListener("click", async () => {
      mode = mode === "bubble" ? "dialog" : "bubble";
      conversation.mode = mode;
      await Storage.put("conversations", conversation);
      modeBtn.innerHTML = global.Phone.IconLibrary.get(mode === "bubble" ? "list" : "app-chat", { size: 20 });
      _rerenderMessages();
    });
    nav.appendChild(backBtn);
    nav.appendChild(titleWrap);
    nav.appendChild(modeBtn);
    nav.appendChild(menuBtn);
    page.appendChild(nav);

    // 消息列表
    const listWrap = U.el("div", { class: "conv-list scroll" });
    const list = U.el("div", { class: "conv-list-inner" });
    listWrap.appendChild(list);
    page.appendChild(listWrap);

    // 滚动到底部按钮
    const toBottomBtn = U.el("button", { class: "conv-to-bottom hidden", html: global.Phone.IconLibrary.get("chevron-down", { size: 22 }) });
    page.appendChild(toBottomBtn);

    let isNearBottom = true;
    listWrap.addEventListener("scroll", () => {
      const near = listWrap.scrollHeight - listWrap.scrollTop - listWrap.clientHeight < 80;
      isNearBottom = near;
      toBottomBtn.classList.toggle("hidden", near);
    });
    toBottomBtn.addEventListener("click", () => {
      listWrap.scrollTo({ top: listWrap.scrollHeight, behavior: "smooth" });
    });

    container.appendChild(page);

    // 渲染消息
    function _rerenderMessages() {
      U.empty(list);
      let lastDateStr = "";
      conversation.messages.forEach((m) => {
        const dateStr = new Date(m.createdAt || Date.now()).toDateString();
        if (dateStr !== lastDateStr) {
          list.appendChild(global.Phone.MessageRenderer.renderTimeDivider(m.createdAt || Date.now()));
          lastDateStr = dateStr;
        }
        const node = global.Phone.MessageRenderer.render(m, {
          mode: mode, character: character, onAction: (action, msg) => _handleAction(action, msg)
        });
        list.appendChild(node);
      });
      _scrollToBottom(false);
    }
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
      onDraft: async (text) => {
        conversation.draft = text;
        await Storage.put("conversations", conversation);
      },
      onTyping: () => {}, // 可扩展为通知对方
      quote: null,
      onCancelQuote: () => { currentQuote = null; },
      onSend: (msg) => _onSend(msg),
    });
    page.appendChild(inputBar.el);

    // ---------- 发送 ----------
    let sending = false;
    let abortCtrl = null;
    async function _onSend(msg) {
      if (sending) return;
      if (msg.type === "text" && !msg.content.trim()) return;

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
      conversation.messages.push(userMsg);
      conversation.updatedAt = Date.now();
      currentQuote = null;
      inputBar.setQuote(null);
      await Storage.put("conversations", conversation);

      // 立即渲染
      list.appendChild(global.Phone.MessageRenderer.render(userMsg, {
        mode: mode, character: character, onAction: (a, m) => _handleAction(a, m)
      }));
      _scrollToBottom(true);

      // 2. AI 占位消息（pending）
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
        mode: mode, character: character, onAction: () => {}
      });
      list.appendChild(aiNode);
      _scrollToBottom(true);

      // 3. 调用 AI 流式回复
      abortCtrl = new AbortController();
      try {
        const fullText = await global.Phone.ChatAI.reply({
          characterId: characterId,
          conversationId: conversationId,
          messages: conversation.messages.filter((m) => !m.pending).slice(-20),
          signal: abortCtrl.signal,
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

        // 触发发送事件
        global.Phone.EventCenter.emit(global.Phone.EventCenter.TYPES.MESSAGE_SENT, {
          sourceApp: "chat",
          data: { conversationId: conversationId, content: userMsg.content },
          summary: "用户发了一条消息",
        });
      } catch (e) {
        aiMsg.pending = false;
        aiMsg.content = global.Phone.AIClient.friendlyError(e);
        aiMsg.status = "failed";
        _updateNode(aiNode, aiMsg);
        sending = false;
      }
    }

    function _updateNode(node, msg) {
      const newNode = global.Phone.MessageRenderer.render(msg, {
        mode: mode, character: character, onAction: (a, m) => _handleAction(a, m)
      });
      node.replaceWith(newNode);
    }

    // ---------- 消息操作 ----------
    async function _handleAction(action, msg) {
      const idx = conversation.messages.findIndex((m) => m.id === msg.id);
      if (idx < 0) return;

      if (action === "delete") {
        conversation.messages.splice(idx, 1);
        await Storage.put("conversations", conversation);
        _rerenderMessages();
      } else if (action === "recall") {
        conversation.messages.splice(idx, 1);
        await Storage.put("conversations", conversation);
        _rerenderMessages();
        global.Phone.Notify.push({ appId: "chat", title: "已撤回一条消息" });
      } else if (action === "quote") {
        currentQuote = { author: msg.role === "user" ? "我" : character.name, content: msg.content };
        inputBar.setQuote(currentQuote);
        inputBar.focus();
      } else if (action === "forward") {
        // 转发到朋友圈
        if (confirm("分享这条消息到朋友圈？")) {
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
      }
    }

    // ---------- 菜单 ----------
    function _showMenu(conv, char, refresh) {
      const U = global.Phone.Utils;
      const mask = U.el("div", { class: "sheet-mask" });
      const sheet = U.el("div", { class: "sheet" });
      sheet.appendChild(U.el("div", { class: "sheet-handle" }));
      const items = [
        { icon: "user", label: "对方资料", fn: () => _showCharProfile(char) },
        { icon: "bell-off", label: conv.muted ? "取消免打扰" : "免打扰", fn: async () => {
          conv.muted = !conv.muted; await Storage.put("conversations", conv); refresh();
        }},
        { icon: "pin", label: conv.pinned ? "取消置顶" : "置顶", fn: async () => {
          conv.pinned = !conv.pinned; await Storage.put("conversations", conv); refresh();
        }},
        { icon: "image", label: "聊天背景", fn: () => _pickBackground(conv, refresh) },
        { icon: "download", label: "导出聊天记录", fn: () => _exportChat(conv, char) },
        { icon: "trash", label: "清空聊天记录", danger: true, fn: async () => {
          if (!confirm("确定清空聊天记录吗？不可恢复哦")) return;
          conv.messages = []; await Storage.put("conversations", conv); refresh();
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
