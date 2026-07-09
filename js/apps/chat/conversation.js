/* ============================================================
   conversation.js — 聊天界面
   规范第 3/4/6/10/11 节实现：
     · 导航栏（返回键/头像名称/记忆图标/三点菜单）
     · 双模式（气泡/对话）+ 200ms crossfade
     · 长按转发流程（会话列表选择 + 确认 + Toast）
     · AI 特有功能（token 用量/上下文可视化/编辑截断重生成/版本历史）
     · 聊天设置抽屉（13 项）
     · 搜索跳转定位 / 清空上下文 / 文件上传 / 分页 / 停止 FAB / 回到底部 / 新消息角标
     · GitHub 关联仓库配置
   挂在 window.Phone.Conversation
   ============================================================ */
(function (global) {
  "use strict";

  const PAGE_SIZE = 50; // 分页：超过此条数只渲染最近 50 条

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
        contextStartIdx: 0,
        title: "",
      };
      await Storage.put("conversations", conversation);
    }

    const characterId = conversation.characterId || params.characterId;
    const character = (await Storage.getAll("characters")).find((c) => c.id === characterId) || { name: "AI" };

    // ---------- 群聊：加载成员 ----------
    // 群聊会话有 isGroup/memberIds/title 字段；单聊无这些字段，走原逻辑
    const isGroup = !!conversation.isGroup;
    let groupMembers = []; // [{id, name, avatar, systemPrompt, description, ...}]
    async function _refreshGroupMembers() {
      if (!isGroup) return;
      const allChars = await Storage.getAll("characters");
      const ids = Array.isArray(conversation.memberIds) ? conversation.memberIds : [];
      groupMembers = ids.map((id) => allChars.find((c) => c.id === id)).filter((c) => !!c);
    }
    await _refreshGroupMembers();
    // 群成员名字数组，用于 @ 高亮匹配
    function _mentionNames() {
      return groupMembers.map((m) => m.name).filter((n) => !!n);
    }
    // 按 senderId 查群成员（渲染时用）
    function _memberById(id) {
      if (!id) return null;
      return groupMembers.find((m) => m.id === id) || null;
    }

    // ---------- 会话级设置 ----------
    // 键名约定：chat.<key>_<conversationId>
    let convSettings = await _loadConvSettings(conversationId);

    // 上下文起点（清空上下文后，AI 只看该索引及之后的消息）
    let contextStartIdx = conversation.contextStartIdx || 0;

    // 模式（存 conversation.mode，设置抽屉可改）
    let mode = conversation.mode || (await State.get("chatDefaultMode")) || "bubble";

    // 编辑截断重生成挂起态
    let pendingEdit = null; // { msgId }

    // 订阅清理集合
    const unsubs = [];

    // ---------- 容器 ----------
    const page = U.el("div", { class: "conv-page" });

    // ---------- 导航栏（第 3 节） ----------
    const nav = U.el("div", { class: "navbar conv-nav" });

    // 返回键 44×44（class nav-back，CSS 处理尺寸；内联兜底保证点击域）
    const backBtn = U.el("button", {
      class: "icon-btn nav-back",
      html: global.Phone.IconLibrary.get("chevron-left", { size: 22 }),
      style: { minWidth: "44px", minHeight: "44px", display: "flex", alignItems: "center", justifyContent: "center" },
    });
    backBtn.addEventListener("click", () => global.Phone.Router.back());

    // 头像 + 名称（点击 → 群聊 _showMemberPanel / 单聊 _showCharProfile）
    const titleWrap = U.el("div", { class: "nav-title conv-nav-title", style: { cursor: "pointer" } });
    const navAvatarWrap = U.el("div", { class: isGroup ? "conv-nav-avatars" : "conv-nav-avatar" });
    const navTitleText = U.el("div", {}, []);
    function _renderNavTitle() {
      // 头像区
      U.empty(navAvatarWrap);
      if (isGroup) {
        _fillNavAvatars(navAvatarWrap, groupMembers);
      } else {
        _fillNavAvatar(navAvatarWrap, character);
      }
      // 标题区
      U.empty(navTitleText);
      if (isGroup) {
        const memberCount = groupMembers.length;
        navTitleText.appendChild(U.el("div", { class: "conv-title", style: { display: "inline-flex", alignItems: "center", gap: "6px" } }, [
          U.el("span", { text: conversation.title || _defaultGroupTitle() }),
          U.el("span", { class: "conv-nav-count", text: (memberCount + 1) + "人" }),
        ]));
        navTitleText.appendChild(U.el("div", { class: "conv-subtitle", text: "群聊" }));
      } else {
        navTitleText.appendChild(U.el("div", { class: "conv-title", text: conversation.title || character.name || "AI" }));
        navTitleText.appendChild(U.el("div", { class: "conv-subtitle", text: "在线" }));
      }
    }
    _renderNavTitle();
    titleWrap.appendChild(navAvatarWrap);
    titleWrap.appendChild(navTitleText);
    titleWrap.addEventListener("click", () => {
      if (isGroup) _showMemberPanel();
      else _showCharProfile(character);
    });

    // 记忆图标按钮（跳转记忆 APP；不存在则提示开发中）
    const memoryBtn = U.el("button", {
      class: "icon-btn nav-memory",
      html: global.Phone.IconLibrary.get("app-memory", { size: 22 }),
      title: "记忆",
      style: { minWidth: "44px", minHeight: "44px", display: "flex", alignItems: "center", justifyContent: "center" },
    });
    memoryBtn.addEventListener("click", () => {
      try {
        if (global.Phone.Memory && typeof global.Phone.Memory.open === "function") {
          global.Phone.Memory.open();
        } else if (global.Phone.Router && typeof global.Phone.Router.push === "function" && global.Phone.Memory && typeof global.Phone.Memory.mount === "function") {
          global.Phone.Router.push("memory", global.Phone.Memory.mount, {});
        } else {
          global.Phone.Notify.push({ appId: "chat", title: "记忆APP开发中" });
        }
      } catch (e) {
        global.Phone.Notify.push({ appId: "chat", title: "记忆APP开发中" });
      }
    });

    // 三点菜单 → 聊天设置抽屉（第 11 节）
    const menuBtn = U.el("button", {
      class: "icon-btn nav-menu",
      html: global.Phone.IconLibrary.get("more-vertical", { size: 22 }),
      style: { minWidth: "44px", minHeight: "44px", display: "flex", alignItems: "center", justifyContent: "center" },
    });
    menuBtn.addEventListener("click", () => _showMenu());

    nav.appendChild(backBtn);
    nav.appendChild(titleWrap);
    const navRight = U.el("div", { class: "nav-right", style: { display: "flex", alignItems: "center", gap: "2px" } });
    navRight.appendChild(memoryBtn);
    navRight.appendChild(menuBtn);
    nav.appendChild(navRight);
    page.appendChild(nav);

    // ---------- 消息列表 ----------
    const listWrap = U.el("div", { class: "conv-list scroll" });
    const list = U.el("div", { class: "conv-list-inner" });
    listWrap.appendChild(list);
    page.appendChild(listWrap);

    // ---------- 回到底部胶囊（带文字） ----------
    const toBottomBtn = U.el("button", {
      class: "conv-to-bottom",
      style: {
        position: "absolute", bottom: "96px", right: "16px", display: "inline-flex", alignItems: "center",
        gap: "4px", padding: "8px 14px", borderRadius: "var(--radius-full)",
        background: "var(--bg-surface)", boxShadow: "var(--shadow-card)",
        border: "1px solid var(--border-soft)", color: "var(--color-primary)",
        fontSize: "var(--font-sm)", fontWeight: 500, zIndex: 5,
      },
    });
    toBottomBtn.innerHTML = global.Phone.IconLibrary.get("chevron-down", { size: 16 }) + "<span>回到底部</span>";
    toBottomBtn.style.display = "none";
    toBottomBtn.addEventListener("click", () => listWrap.scrollTo({ top: listWrap.scrollHeight, behavior: "smooth" }));
    page.appendChild(toBottomBtn);

    // ---------- 新消息角标 ----------
    let newMsgCount = 0;
    const newBadge = U.el("button", {
      class: "conv-new-badge",
      style: {
        position: "absolute", bottom: "150px", right: "16px", display: "none", alignItems: "center",
        gap: "4px", padding: "6px 12px", borderRadius: "var(--radius-full)",
        background: "var(--color-primary)", color: "var(--text-on-primary)",
        fontSize: "var(--font-xs)", fontWeight: 600, boxShadow: "var(--shadow-card)",
        zIndex: 5, border: "none",
      },
    });
    newBadge.innerHTML = global.Phone.IconLibrary.get("chevron-down", { size: 14 }) + "<span>0 条新消息</span>";
    newBadge.addEventListener("click", () => {
      newMsgCount = 0;
      newBadge.style.display = "none";
      listWrap.scrollTo({ top: listWrap.scrollHeight, behavior: "smooth" });
    });
    page.appendChild(newBadge);

    // ---------- 停止生成 FAB（右下角圆形，流式时显示） ----------
    const stopFab = U.el("button", {
      class: "conv-stop-fab",
      title: "停止生成",
      style: {
        position: "absolute", bottom: "150px", right: "16px", width: "52px", height: "52px",
        borderRadius: "var(--radius-full)", background: "var(--color-primary)",
        color: "var(--text-on-primary)", display: "none", alignItems: "center", justifyContent: "center",
        boxShadow: "var(--shadow-card)", zIndex: 6, border: "none",
      },
    });
    stopFab.innerHTML = global.Phone.IconLibrary.get("pause", { size: 20 });
    stopFab.addEventListener("click", () => { try { if (abortCtrl) abortCtrl.abort(); } catch {} });
    page.appendChild(stopFab);

    // ---------- 滚动状态 ----------
    let isNearBottom = true;
    listWrap.addEventListener("scroll", () => {
      const near = listWrap.scrollHeight - listWrap.scrollTop - listWrap.clientHeight < 80;
      isNearBottom = near;
      toBottomBtn.style.display = near ? "none" : "inline-flex";
      if (near) {
        newMsgCount = 0;
        newBadge.style.display = "none";
      }
    });

    container.appendChild(page);

    // 进入对话自动清除未读（微信对齐）
    if (conversation.unread) {
      conversation.unread = 0;
      Storage.put("conversations", conversation);
      try { if (global.Phone.Notify && global.Phone.Notify.refreshBadges) global.Phone.Notify.refreshBadges(); } catch {}
    }

    // ---------- 渲染辅助 ----------
    let renderLimit = PAGE_SIZE; // 当前渲染条数上限

    function _buildCtx(msg) {
      const idx = conversation.messages.indexOf(msg);
      const effective = conversation.messages.slice(contextStartIdx).filter((m) => !m.pending);
      const ctxCount = convSettings.ctx || 16;
      const inContextIds = new Set(effective.slice(-ctxCount).map((m) => m.id));
      const inContext = idx >= contextStartIdx && inContextIds.has(msg.id);
      const effThinking = convSettings.thinking === null ? !!State.get("showThinking") : !!convSettings.thinking;
      const ctx = {
        mode: mode,
        character: character,
        conversationId: conversationId,
        characterId: characterId,
        ctxViz: !!convSettings.ctxViz,
        inContext: inContext,
        contextStartIdx: contextStartIdx,
        ctxCount: ctxCount,
        tokenShow: !!convSettings.tokenShow,
        thinking: effThinking,
        onAction: (a, m, extra) => _handleAction(a, m, extra),
      };
      // 群聊增强：isGroup / members / sender（按 msg.senderId 查）/ mentionNames
      if (isGroup) {
        ctx.isGroup = true;
        ctx.members = groupMembers;
        ctx.sender = _memberById(msg.senderId);
        ctx.mentionNames = _mentionNames();
      }
      return ctx;
    }

    // 取消息的"当前视图"（版本历史：显示 versionIdx 对应版本的内容）
    function _viewMsg(msg) {
      if (msg.versions && msg.versions.length) {
        const v = msg.versions[msg.versionIdx || 0] || msg.versions[0];
        return Object.assign({}, msg, { content: v.content, thinking: v.thinking, tokens: v.tokens });
      }
      return msg;
    }

    // 渲染单条消息块（含 token/版本/上下文水印等附加元素）
    function _renderMsgBlock(msg) {
      const ctx = _buildCtx(msg);
      const view = _viewMsg(msg);
      const node = global.Phone.MessageRenderer.render(view, ctx);
      // 上下文可视化：in-context 加 2px 竖线（内联兜底，MessageRenderer 也可自行渲染）
      if (ctx.ctxViz && ctx.inContext && msg.role === "assistant") {
        try { node.style.boxShadow = "inset 2px 0 0 var(--color-primary)"; } catch {}
      }
      const block = U.el("div", { class: "msg-block", dataset: { msgId: msg.id } });
      block.appendChild(node);

      // 超出上下文：浮水印（不影响阅读）
      if (ctx.ctxViz && !ctx.inContext) {
        block.appendChild(U.el("div", {
          class: "ctx-watermark",
          text: "上下文之外",
          style: {
            fontSize: "10px", color: "var(--text-placeholder)", opacity: 0.6,
            paddingLeft: "8px", marginTop: "2px",
          },
        }));
      }

      // Token 用量（AI 消息 + tokenShow 开 + 有 tokens 数据）
      if (ctx.tokenShow && msg.role === "assistant" && view.tokens) {
        block.appendChild(U.el("div", {
          class: "msg-tokens",
          text: "in: " + (view.tokens.in || 0) + " · out: " + (view.tokens.out || 0) + " tokens",
          style: {
            fontSize: "10px", color: "var(--text-placeholder)", opacity: 0.7,
            paddingLeft: "8px", marginTop: "2px",
          },
        }));
      }

      // 版本历史指示点 <2/3>（AI 消息 + 多版本）
      if (msg.role === "assistant" && msg.versions && msg.versions.length > 1) {
        block.appendChild(_renderVersionSwitcher(msg));
      }
      return block;
    }

    function _renderVersionSwitcher(msg) {
      const total = msg.versions.length;
      const cur = (msg.versionIdx || 0) + 1;
      const wrap = U.el("div", {
        class: "msg-versions",
        style: {
          display: "inline-flex", alignItems: "center", gap: "8px", padding: "2px 8px",
          fontSize: "11px", color: "var(--text-secondary)", marginTop: "2px",
        },
      });
      const prev = U.el("button", {
        class: "mv-prev", html: global.Phone.IconLibrary.get("chevron-left", { size: 12 }),
        style: { border: "none", background: "transparent", color: "var(--text-secondary)", display: "inline-flex", cursor: "pointer", padding: "2px" },
      });
      const label = U.el("span", { class: "mv-label", text: cur + " / " + total });
      const next = U.el("button", {
        class: "mv-next", html: global.Phone.IconLibrary.get("chevron-right", { size: 12 }),
        style: { border: "none", background: "transparent", color: "var(--text-secondary)", display: "inline-flex", cursor: "pointer", padding: "2px" },
      });
      prev.addEventListener("click", () => _switchVersion(msg.id, -1));
      next.addEventListener("click", () => _switchVersion(msg.id, 1));
      wrap.appendChild(prev);
      wrap.appendChild(label);
      wrap.appendChild(next);
      return wrap;
    }

    function _rerenderMessages() {
      U.empty(list);
      let lastTime = 0;
      const total = conversation.messages.length;
      const showAll = renderLimit >= total;
      const startIdx = showAll ? 0 : total - renderLimit;

      // 顶部"查看更多"按钮（分页简化版）
      if (!showAll && total > PAGE_SIZE) {
        const more = U.el("button", {
          class: "conv-load-more",
          text: "查看更多消息（共 " + total + " 条）",
          style: {
            display: "block", margin: "0 auto 12px", padding: "8px 16px",
            borderRadius: "var(--radius-full)", background: "var(--bg-surface)",
            border: "1px solid var(--border-soft)", color: "var(--color-primary)",
            fontSize: "var(--font-sm)", cursor: "pointer",
          },
        });
        more.addEventListener("click", () => { renderLimit = total; _rerenderMessages(); });
        list.appendChild(more);
      }

      for (let i = startIdx; i < total; i++) {
        const m = conversation.messages[i];
        const msgTime = m.createdAt || Date.now();
        // 超过5分钟插入居中浮动时间戳（规范第4节）
        if (lastTime && msgTime - lastTime > 5 * 60 * 1000) {
          list.appendChild(global.Phone.MessageRenderer.renderTimeDivider(msgTime));
        } else if (!lastTime) {
          list.appendChild(global.Phone.MessageRenderer.renderTimeDivider(msgTime));
        }
        lastTime = msgTime;
        list.appendChild(_renderMsgBlock(m));
      }
      _scrollToBottom(false);
    }

    function _appendMsgBlock(msg) {
      list.appendChild(_renderMsgBlock(msg));
    }

    // 流式期间快速更新单条气泡节点（不重建附加元素）
    function _updateMsgNode(msg) {
      const oldNode = list.querySelector('[data-id="' + msg.id + '"]');
      if (!oldNode) return;
      const ctx = _buildCtx(msg);
      const view = _viewMsg(msg);
      const newNode = global.Phone.MessageRenderer.render(view, ctx);
      oldNode.replaceWith(newNode);
    }

    // 完整刷新某条消息块（含 token/版本/水印等）
    function _refreshMsgBlock(msgId) {
      const oldBlock = list.querySelector('.msg-block[data-msg-id="' + msgId + '"]');
      const msg = conversation.messages.find((m) => m.id === msgId);
      if (!msg) return;
      const newBlock = _renderMsgBlock(msg);
      if (oldBlock) oldBlock.replaceWith(newBlock);
    }

    function _scrollToBottom(smooth) {
      requestAnimationFrame(() => {
        listWrap.scrollTo({ top: listWrap.scrollHeight, behavior: smooth ? "smooth" : "auto" });
      });
    }

    _rerenderMessages();

    // ---------- 搜索跳转定位 ----------
    try {
      const jump = State.get("chat.jumpToMsg");
      if (jump && jump.conversationId === conversationId && jump.msgId) {
        setTimeout(() => {
          const node = list.querySelector('[data-id="' + jump.msgId + '"]');
          if (node) {
            try { node.scrollIntoView({ behavior: "smooth", block: "center" }); } catch {}
            node.classList.add("msg-highlight");
            try { node.style.transition = "background 1500ms ease-out"; node.style.background = "var(--color-primary-ultralight)"; } catch {}
            setTimeout(() => {
              try { node.style.background = ""; } catch {}
              node.classList.remove("msg-highlight");
            }, 1500);
          }
          State.setMem("chat.jumpToMsg", null);
        }, 200);
      }
    } catch {}

    // ---------- 输入栏 ----------
    let currentQuote = null;
    const inputBar = global.Phone.InputBar.mount({
      initialDraft: conversation.draft || "",
      conversationId: conversationId,
      characterId: characterId,
      // 群聊传成员数组，单聊传 null（input-bar 内部判定空数组则不触发 @ 浮层）
      members: isGroup ? groupMembers : null,
      // @ 选中成员时无需特别处理，mentions 从用户消息 content 里解析
      onMention: function () {},
      onDraft: async (text) => {
        conversation.draft = text;
        await Storage.put("conversations", conversation);
      },
      onTyping: () => {},
      quote: null,
      onCancelQuote: () => { currentQuote = null; },
      onSend: (msg) => _onSend(msg),
      onFile: (file) => _onFile(file),
      onClearContext: () => _clearContext(),
      onGitHub: () => _showGitHubConfig(),
    });
    page.appendChild(inputBar.el);

    // ---------- 文件上传：读 dataURL → 发送 ----------
    function _onFile(file) {
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async () => {
        await _onSend({
          type: "file",
          content: file.name,
          dataURL: reader.result,
          fileName: file.name,
          fileSize: file.size,
          mime: file.type,
        });
      };
      reader.onerror = () => global.Phone.Notify.push({ appId: "chat", title: "文件读取失败" });
      reader.readAsDataURL(file);
    }

    // ---------- 清空上下文 ----------
    async function _clearContext() {
      const ok = await global.Phone.Modal.confirm({
        title: "清空上下文", message: "清空后我将从这里重新开始理解对话，历史消息不会被删除。", okText: "清空",
      });
      if (!ok) return;
      contextStartIdx = conversation.messages.length;
      conversation.contextStartIdx = contextStartIdx;
      await Storage.put("conversations", conversation);
      global.Phone.Notify.push({ appId: "chat", title: "已清空，思考重置" });
      _rerenderMessages();
    }

    // ---------- Slash 指令预处理 ----------
    // 返回 null = 已拦截（不发给 AI）；返回 string = 替换内容后继续发给 AI
    // 支持：/clear /retry /export /github pr|merge|push /temp <n> /model <name>
    function _preprocessSlash(text) {
      if (!text) return text;
      const raw = String(text).trim();
      if (raw.charAt(0) !== "/") return text;
      // 按空白拆分，第一段是指令名（小写匹配）
      const parts = raw.split(/\s+/);
      const cmd = parts[0].toLowerCase();

      if (cmd === "/clear") {
        _clearContext();
        return null;
      }
      if (cmd === "/retry") {
        // 找最后一条 AI 文本消息，重新生成
        const lastAi = _lastAiTextMsg();
        if (lastAi) {
          _regenerate(lastAi);
        } else {
          global.Phone.Notify.push({ appId: "chat", title: "没有可重新生成的回复" });
        }
        return null;
      }
      if (cmd === "/export") {
        _exportMarkdown();
        return null;
      }
      if (cmd === "/temp") {
        const val = parts[1];
        if (val != null && isFinite(parseFloat(val)) && parseFloat(val) >= 0 && parseFloat(val) <= 2) {
          const v = parseFloat(val);
          _saveConvSetting("temp", v).then(function () {
            global.Phone.Notify.push({ appId: "chat", title: "温度已设为 " + v.toFixed(1) });
          });
        } else {
          // 没带值：提示当前温度
          const cur = (typeof convSettings.temp === "number") ? convSettings.temp : 0.7;
          global.Phone.Notify.push({ appId: "chat", title: "用法：/temp 0.7（当前 " + Number(cur).toFixed(1) + "）" });
        }
        return null;
      }
      if (cmd === "/model") {
        const name = parts[1];
        if (name) {
          _saveConvSetting("model", name).then(function () {
            global.Phone.Notify.push({ appId: "chat", title: "模型已切换为 " + name });
          });
        } else {
          const cur = convSettings.model || (global.Phone.State.get("aiModel") || "默认");
          global.Phone.Notify.push({ appId: "chat", title: "用法：/model <模型名>（当前 " + cur + "）" });
        }
        return null;
      }
      if (cmd === "/github") {
        // /github pr|merge|push —— 透传给 AI，AI 会调对应 github_* 工具
        // 不拦截，原样发给 AI（保留用户可能追加的参数，如 PR 号）
        return text;
      }
      // 其他未知 /xxx 指令：原样透传给 AI（可能是自定义指令）
      return text;
    }

    // 找最后一条 AI 文本消息（github 卡片/图片/语音不算）
    function _lastAiTextMsg() {
      for (let i = conversation.messages.length - 1; i >= 0; i--) {
        const m = conversation.messages[i];
        if (m.role === "assistant" && (!m.type || m.type === "text")) return m;
      }
      return null;
    }

    // ---------- 发送 ----------
    let sending = false;
    let abortCtrl = null;

    async function _onSend(msg) {
      if (sending) return;
      if (msg.type === "text" && !(msg.content || "").trim()) return;

      // Slash 指令预处理：返回 null 表示已拦截（不发给 AI），返回字符串则替换内容后继续
      if (msg.type === "text" && (msg.content || "").trim().charAt(0) === "/") {
        const processed = _preprocessSlash(msg.content);
        if (processed === null) return;
        if (typeof processed === "string") msg.content = processed;
      }

      // 编辑截断重生成：发送时弹确认
      if (pendingEdit) {
        const editMsgId = pendingEdit.msgId;
        pendingEdit = null;
        const ok = await global.Phone.Modal.confirm({
          title: "重新生成",
          message: "从此处重新生成，此后消息将删除，确认？",
          danger: true,
          okText: "确认",
        });
        if (!ok) return;
        await _truncateAndRegenerate(editMsgId, msg.content);
        return;
      }

      // 1. 用户消息入栈
      const userMsg = {
        id: U.uid("msg"),
        role: "user",
        type: msg.type,
        content: msg.content,
        dataURL: msg.dataURL || null,
        fileName: msg.fileName || null,
        fileSize: msg.fileSize || null,
        mime: msg.mime || null,
        images: msg.images || null,  // 多图合并卡片（微信对齐）
        createdAt: Date.now(),
        status: "sent",
        quote: currentQuote ? { author: character.name, content: currentQuote.content } : null,
        // 群聊：解析 @角色名 得到 mentions（被点名的成员名数组）；单聊无此字段
        mentions: isGroup ? _parseMentions(msg.content) : null,
      };
      conversation.messages.push(userMsg);
      conversation.updatedAt = Date.now();
      currentQuote = null;
      try { inputBar.setQuote(null); } catch {}
      await Storage.put("conversations", conversation);

      _appendMsgBlock(userMsg);
      _scrollToBottom(true);

      // 2. AI 占位消息（单聊） / 群聊顺序回复
      sending = true;
      stopFab.style.display = "flex";
      if (isGroup) {
        // 群聊：按 @ 决定谁回复（有 @ 只有被@者回复；无 @ 全员顺序回复）
        await _streamGroupAI(userMsg);
      } else {
        const aiMsg = {
          id: U.uid("msg"),
          role: "assistant",
          type: "text",
          content: "",
          createdAt: Date.now(),
          pending: true,
        };
        conversation.messages.push(aiMsg);
        _appendMsgBlock(aiMsg);
        _scrollToBottom(true);

        // 3. 流式回复
        await _streamAI(aiMsg);
      }

      // 触发发送事件
      try {
        global.Phone.EventCenter.emit(global.Phone.EventCenter.TYPES.MESSAGE_SENT, {
          sourceApp: "chat",
          data: { conversationId: conversationId, content: userMsg.content },
          summary: "用户发了一条消息",
        });
      } catch {}
    }

    // 群聊 @ 解析：从文本里找出被 @ 的成员名（精确匹配，@ 必须在行首或前面是空白）
    function _parseMentions(text) {
      if (!text) return [];
      const names = _mentionNames();
      if (!names.length) return [];
      const found = [];
      const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      // 按名字长度降序匹配，避免短名误吞长名
      const sorted = names.slice().sort((a, b) => b.length - a.length);
      sorted.forEach((n) => {
        const re = new RegExp("(?:^|\\s)@" + esc(n) + "(?![\\w])");
        if (re.test(text)) found.push(n);
      });
      return found;
    }

    // ---------- 群聊顺序回复（规范第 9 节） ----------
    // 有 @ ：只有被 @ 的成员回复
    // 无 @ ：所有成员顺序回复（一个回复完下个才看到上下文）
    async function _streamGroupAI(userMsg) {
      sending = true;
      stopFab.style.display = "flex";
      abortCtrl = new AbortController();

      const mentioned = Array.isArray(userMsg.mentions) ? userMsg.mentions : [];
      let repliers;
      if (mentioned.length > 0) {
        // 有 @：被点名的成员回复（按 mention 顺序去重）
        const seen = {};
        repliers = [];
        mentioned.forEach((nm) => {
          const m = groupMembers.find((x) => x.name === nm);
          if (m && !seen[m.id]) { seen[m.id] = 1; repliers.push(m); }
        });
      } else {
        // 无 @：所有成员顺序回复
        repliers = groupMembers.slice();
      }
      if (repliers.length === 0) {
        stopFab.style.display = "none";
        sending = false;
        return;
      }

      // 顺序执行：每个成员独立调 ChatAI.replyGroup，回复完才进入下一个
      for (const member of repliers) {
        if (abortCtrl.signal.aborted) break;
        await _streamOneGroupReply(member);
      }
      stopFab.style.display = "none";
      sending = false;
    }

    // 群聊里单个成员的一次回复流式
    async function _streamOneGroupReply(member) {
      const aiMsg = {
        id: U.uid("msg"),
        role: "assistant",
        type: "text",
        content: "",
        createdAt: Date.now(),
        pending: true,
        senderId: member.id, // 群聊 AI 消息挂发送者 ID，渲染按此取头像/名称/色调
      };
      conversation.messages.push(aiMsg);
      _appendMsgBlock(aiMsg);
      _scrollToBottom(true);

      let rafPending = false;
      function scheduleUpdate() {
        if (rafPending) return;
        rafPending = true;
        requestAnimationFrame(() => { rafPending = false; _updateMsgNode(aiMsg); });
      }
      // 上下文构建：清空点之后 + 非 pending + 取最近 ctx 条（含本次 aiMsg 之前的历史）
      const ctxMessages = conversation.messages
        .slice(contextStartIdx)
        .filter((m) => !m.pending)
        .slice(-(convSettings.ctx || 16));

      try {
        await global.Phone.ChatAI.replyGroup({
          characterId: member.id,
          conversationId: conversationId,
          messages: ctxMessages,
          members: groupMembers,
          signal: abortCtrl.signal,
          // GitHub 工具结果联动：群聊卡片标注是哪个成员的操作
          onToolResult: (toolName, args, result) => {
            _pushGithubCard(toolName, args, result, member.id);
          },
          // GitHub 写操作二次确认：返回 false 则取消执行
          onWriteTool: async (toolName, args) => {
            return await _confirmGithubWrite(toolName, args);
          },
          onThinking: (t) => {
            aiMsg.thinking = t;
            scheduleUpdate();
          },
          onDelta: (delta, full) => {
            aiMsg.content = full;
            aiMsg.pending = false;
            _updateMsgNode(aiMsg);
            if (isNearBottom) {
              _scrollToBottom(false);
            } else {
              newMsgCount++;
              newBadge.style.display = "inline-flex";
              newBadge.innerHTML = global.Phone.IconLibrary.get("chevron-down", { size: 14 }) + "<span>" + newMsgCount + " 条新消息</span>";
            }
          },
          // onDone 兼容 (meta) 与旧 (text, usage) 两种签名
          onDone: async (a, b) => {
            let full, tokens;
            if (a && typeof a === "object" && a.text != null) {
              full = a.text;
              tokens = a.tokens || null;
            } else {
              full = typeof a === "string" ? a : "";
              tokens = (b && b.tokens) ? b.tokens : null;
            }
            aiMsg.content = full;
            aiMsg.pending = false;
            aiMsg.status = "sent";
            if (tokens) aiMsg.tokens = tokens;
            conversation.updatedAt = Date.now();
            await Storage.put("conversations", conversation);
            _refreshMsgBlock(aiMsg.id);
            try {
              global.Phone.EventCenter.emit(global.Phone.EventCenter.TYPES.MESSAGE_RECEIVED, {
                sourceApp: "chat",
                data: { conversationId: conversationId, characterId: member.id, content: full },
                summary: (member.name || "AI") + " 在群里回复了消息",
              });
            } catch {}
            // 会话级 TTS 自动朗读
            if (convSettings.tts && global.Phone.TTS && typeof global.Phone.TTS.speak === "function") {
              try {
                const TTS = global.Phone.TTS;
                const text = global.Phone.MessageRenderer.plainText
                  ? global.Phone.MessageRenderer.plainText(full)
                  : full;
                const opts = {};
                if (convSettings.ttsVoice) opts.voice = convSettings.ttsVoice;
                TTS.speak(text, opts);
              } catch {}
            }
          },
          onError: (err) => {
            aiMsg.pending = false;
            aiMsg.content = global.Phone.AIClient.friendlyError(err);
            aiMsg.status = "failed";
            _refreshMsgBlock(aiMsg.id);
          },
        });
      } catch (e) {
        aiMsg.pending = false;
        aiMsg.content = global.Phone.AIClient.friendlyError(e);
        aiMsg.status = "failed";
        _refreshMsgBlock(aiMsg.id);
      }
    }

    // 编辑截断重生成：删除该 msgId 之后所有消息，contextStartIdx 收敛，以新内容重发
    async function _truncateAndRegenerate(editMsgId, newContent) {
      const idx = conversation.messages.findIndex((m) => m.id === editMsgId);
      if (idx < 0) return;
      conversation.messages[idx].content = newContent;
      conversation.messages[idx].edited = true;
      conversation.messages = conversation.messages.slice(0, idx + 1);
      if (contextStartIdx > conversation.messages.length) contextStartIdx = conversation.messages.length;
      conversation.contextStartIdx = contextStartIdx;
      await Storage.put("conversations", conversation);
      _rerenderMessages();

      sending = true;
      stopFab.style.display = "flex";
      const aiMsg = {
        id: U.uid("msg"), role: "assistant", type: "text",
        content: "", createdAt: Date.now(), pending: true,
      };
      conversation.messages.push(aiMsg);
      _appendMsgBlock(aiMsg);
      _scrollToBottom(true);
      await _streamAI(aiMsg);
    }

    // ---------- GitHub 工具结果联动 ----------
    // 工具执行完回调：把 github_* 工具结果转成 msg.type="github" 卡片消息，紧跟在当前 AI 文本消息之后
    // senderId: 群聊传成员 id（卡片标注是谁的操作），单聊传 null
    function _pushGithubCard(toolName, args, result, senderId) {
      if (!toolName || !/^github_/.test(toolName)) return;
      let payload = result;
      // 用户取消的写操作：result 形如 {ok:false, cancelled:true, error:...}，没有 kind，落成 ghError 卡片
      if (result && result.cancelled) {
        payload = { kind: "ghError", error: "用户取消了此操作：" + _ghWriteLabel(toolName, args) };
      }
      const cardMsg = {
        id: U.uid("msg"),
        role: "assistant",
        type: "github",
        payload: payload,
        // content 给 AI 上下文用（卡片渲染时只看 payload 不看 content；但下一轮上下文需要 content 非空，避免裸 assistant 消息报错）
        content: _ghCardContent(toolName, args, result),
        createdAt: Date.now(),
        status: "sent",
      };
      if (senderId) cardMsg.senderId = senderId;
      conversation.messages.push(cardMsg);
      conversation.updatedAt = Date.now();
      // 异步存盘（不阻塞流式）
      Storage.put("conversations", conversation).catch(function () {});
      _appendMsgBlock(cardMsg);
      _scrollToBottom(true);
    }

    // 写操作中文名映射（二次确认弹窗 + 取消卡片复用）
    function _ghWriteLabel(toolName, args) {
      args = args || {};
      const map = {
        github_merge_pr: "合并 PR #" + (args.number || "?"),
        github_close_pr: "关闭 PR #" + (args.number || "?"),
        github_create_pr: "创建 PR：" + (args.title || ""),
        github_create_branch: "创建分支：" + (args.branch || ""),
        github_update_file: "修改文件：" + (args.path || ""),
        github_create_issue: "创建 Issue：" + (args.title || ""),
        github_add_pr_comment: "评论 PR #" + (args.number || "?"),
      };
      return map[toolName] || toolName;
    }

    // 卡片消息的 content 简述（供 AI 下一轮上下文用，避免裸 assistant 消息）
    function _ghCardContent(toolName, args, result) {
      if (result && result.cancelled) return "（GitHub 操作已取消：" + _ghWriteLabel(toolName, args) + "）";
      if (!result) return "（GitHub 操作：" + toolName + "）";
      if (result.kind === "ghPR") {
        if (result.list) return "（GitHub：查看 PR 列表，共 " + (result.count != null ? result.count : result.list.length) + " 条）";
        return "（GitHub：PR #" + (result.number || "?") + " " + (result.title || "") + "）";
      }
      if (result.kind === "ghMerge") return "（GitHub：已合并 PR #" + (result.number || "?") + "）";
      if (result.kind === "ghFile") return "（GitHub：修改文件 " + (result.path || "") + "）";
      if (result.kind === "ghList") {
        const tMap = { branches: "分支", commits: "提交", issues: "Issues" };
        return "（GitHub：查看" + (tMap[result.type] || "列表") + "，共 " + (result.count || 0) + " 条）";
      }
      if (result.kind === "ghError") return "（GitHub 操作失败：" + (result.error || "") + "）";
      return "（GitHub 操作：" + toolName + "）";
    }

    // 写操作二次确认弹窗
    async function _confirmGithubWrite(toolName, args) {
      const desc = _ghWriteLabel(toolName, args);
      try {
        return await global.Phone.Modal.confirm({
          title: "GitHub 写操作确认",
          message: "AI 想要执行：" + desc + "\n\n确认执行此操作吗？",
          okText: "确认执行",
          danger: true,
        });
      } catch (_) {
        return false;
      }
    }

    // ---------- 流式请求 AI（_onSend / _regenerate / 编辑截断共用） ----------
    async function _streamAI(aiMsg) {
      sending = true;
      stopFab.style.display = "flex";
      abortCtrl = new AbortController();
      let rafPending = false;
      function scheduleUpdate() {
        if (rafPending) return;
        rafPending = true;
        requestAnimationFrame(() => { rafPending = false; _updateMsgNode(aiMsg); });
      }
      // 上下文构建：清空点之后 + 非 pending + 取最近 convSettings.ctx 条
      const ctxMessages = conversation.messages
        .slice(contextStartIdx)
        .filter((m) => !m.pending)
        .slice(-(convSettings.ctx || 16));

      try {
        await global.Phone.ChatAI.reply({
          characterId: characterId,
          conversationId: conversationId,
          messages: ctxMessages,
          signal: abortCtrl.signal,
          // GitHub 工具结果联动：每次 github_* 工具执行完，把结果转成卡片消息追加到会话
          // 单聊场景 senderId=null（卡片不标注发送者）
          onToolResult: (toolName, args, result) => {
            _pushGithubCard(toolName, args, result, null);
          },
          // GitHub 写操作二次确认：返回 false 则取消执行
          onWriteTool: async (toolName, args) => {
            return await _confirmGithubWrite(toolName, args);
          },
          onThinking: (t) => {
            aiMsg.thinking = t;
            _patchActiveVersion(aiMsg, { thinking: t });
            scheduleUpdate();
          },
          onDelta: (delta, full) => {
            aiMsg.content = full;
            aiMsg.pending = false;
            _patchActiveVersion(aiMsg, { content: full });
            _updateMsgNode(aiMsg);
            if (isNearBottom) {
              _scrollToBottom(false);
            } else {
              // 不在底部时累积新消息角标
              newMsgCount++;
              newBadge.style.display = "inline-flex";
              newBadge.innerHTML = global.Phone.IconLibrary.get("chevron-down", { size: 14 }) + "<span>" + newMsgCount + " 条新消息</span>";
            }
          },
          // onDone 签名约定：chat-ai.js 调用 onDone({ text, tokens }) 单参 meta 对象
          // 这里兼容两种调用方式：(meta) 或旧的 (fullText, usage)
          onDone: async (a, b) => {
            let full, tokens;
            if (a && typeof a === "object" && a.text != null) {
              full = a.text;
              tokens = a.tokens || null;
            } else {
              full = typeof a === "string" ? a : "";
              tokens = (b && b.tokens) ? b.tokens : null;
            }
            aiMsg.content = full;
            aiMsg.pending = false;
            aiMsg.status = "sent";
            // token 数据由 chat-ai.js 通过 meta.tokens 传回
            if (tokens) {
              aiMsg.tokens = tokens;
              _patchActiveVersion(aiMsg, { tokens: tokens });
            }
            conversation.updatedAt = Date.now();
            await Storage.put("conversations", conversation);
            _refreshMsgBlock(aiMsg.id);
            try {
              global.Phone.EventCenter.emit(global.Phone.EventCenter.TYPES.MESSAGE_RECEIVED, {
                sourceApp: "chat",
                data: { conversationId: conversationId, characterId: characterId, content: full },
                summary: character.name + " 回复了消息",
              });
            } catch {}
            // 会话级 TTS 自动朗读
            if (convSettings.tts && global.Phone.TTS && typeof global.Phone.TTS.speak === "function") {
              try {
                const TTS = global.Phone.TTS;
                const text = global.Phone.MessageRenderer.plainText
                  ? global.Phone.MessageRenderer.plainText(full)
                  : full;
                const opts = {};
                if (convSettings.ttsVoice) opts.voice = convSettings.ttsVoice;
                TTS.speak(text, opts);
              } catch {}
            }
            stopFab.style.display = "none";
            sending = false;
          },
          onError: (err) => {
            aiMsg.pending = false;
            aiMsg.content = global.Phone.AIClient.friendlyError(err);
            aiMsg.status = "failed";
            _patchActiveVersion(aiMsg, { content: aiMsg.content });
            _refreshMsgBlock(aiMsg.id);
            stopFab.style.display = "none";
            sending = false;
          },
        });
      } catch (e) {
        aiMsg.pending = false;
        aiMsg.content = global.Phone.AIClient.friendlyError(e);
        aiMsg.status = "failed";
        _patchActiveVersion(aiMsg, { content: aiMsg.content });
        _refreshMsgBlock(aiMsg.id);
        stopFab.style.display = "none";
        sending = false;
      }
    }

    // 把增量同步到当前激活版本（版本历史场景下保持 versions 数组一致）
    function _patchActiveVersion(aiMsg, patch) {
      if (!aiMsg.versions) return;
      const v = aiMsg.versions[aiMsg.versionIdx || 0];
      if (!v) return;
      Object.assign(v, patch);
    }

    // ---------- 重新生成（版本历史，不 splice 删除） ----------
    async function _regenerate(oldAiMsg) {
      if (sending) return;
      const idx = conversation.messages.findIndex((m) => m.id === oldAiMsg.id);
      if (idx < 0) return;

      // 首次重新生成：把当前内容存为第 1 个版本
      if (!oldAiMsg.versions) {
        oldAiMsg.versions = [{
          content: oldAiMsg.content,
          thinking: oldAiMsg.thinking,
          tokens: oldAiMsg.tokens,
          createdAt: oldAiMsg.createdAt,
        }];
        oldAiMsg.versionIdx = 0;
      }
      // 新版本占位
      const newVer = { content: "", thinking: "", tokens: null, createdAt: Date.now() };
      oldAiMsg.versions.push(newVer);
      oldAiMsg.versionIdx = oldAiMsg.versions.length - 1;
      oldAiMsg.content = "";
      oldAiMsg.thinking = "";
      oldAiMsg.tokens = null;
      oldAiMsg.pending = true;
      oldAiMsg.status = "sent";
      await Storage.put("conversations", conversation);
      _refreshMsgBlock(oldAiMsg.id);
      _scrollToBottom(true);
      // 群聊 AI 消息：按 senderId 用 replyGroup 重新生成；单聊用 _streamAI
      if (isGroup && oldAiMsg.senderId) {
        const member = _memberById(oldAiMsg.senderId) || { id: oldAiMsg.senderId, name: "AI" };
        await _streamGroupReplyInto(oldAiMsg, member);
      } else {
        await _streamAI(oldAiMsg);
      }
    }

    // 群聊重新生成：把流式结果写入已存在的 aiMsg（版本历史场景复用）
    async function _streamGroupReplyInto(aiMsg, member) {
      sending = true;
      stopFab.style.display = "flex";
      abortCtrl = new AbortController();
      let rafPending = false;
      function scheduleUpdate() {
        if (rafPending) return;
        rafPending = true;
        requestAnimationFrame(() => { rafPending = false; _updateMsgNode(aiMsg); });
      }
      const ctxMessages = conversation.messages
        .slice(contextStartIdx)
        .filter((m) => !m.pending)
        .slice(-(convSettings.ctx || 16));
      try {
        await global.Phone.ChatAI.replyGroup({
          characterId: member.id,
          conversationId: conversationId,
          messages: ctxMessages,
          members: groupMembers,
          signal: abortCtrl.signal,
          // GitHub 工具结果联动：群聊卡片标注是哪个成员的操作
          onToolResult: (toolName, args, result) => {
            _pushGithubCard(toolName, args, result, member.id);
          },
          // GitHub 写操作二次确认：返回 false 则取消执行
          onWriteTool: async (toolName, args) => {
            return await _confirmGithubWrite(toolName, args);
          },
          onThinking: (t) => { aiMsg.thinking = t; _patchActiveVersion(aiMsg, { thinking: t }); scheduleUpdate(); },
          onDelta: (delta, full) => {
            aiMsg.content = full;
            aiMsg.pending = false;
            _patchActiveVersion(aiMsg, { content: full });
            _updateMsgNode(aiMsg);
            if (isNearBottom) _scrollToBottom(false);
          },
          onDone: async (a, b) => {
            let full, tokens;
            if (a && typeof a === "object" && a.text != null) {
              full = a.text; tokens = a.tokens || null;
            } else {
              full = typeof a === "string" ? a : ""; tokens = (b && b.tokens) ? b.tokens : null;
            }
            aiMsg.content = full;
            aiMsg.pending = false;
            aiMsg.status = "sent";
            if (tokens) { aiMsg.tokens = tokens; _patchActiveVersion(aiMsg, { tokens: tokens }); }
            conversation.updatedAt = Date.now();
            await Storage.put("conversations", conversation);
            _refreshMsgBlock(aiMsg.id);
            stopFab.style.display = "none";
            sending = false;
          },
          onError: (err) => {
            aiMsg.pending = false;
            aiMsg.content = global.Phone.AIClient.friendlyError(err);
            aiMsg.status = "failed";
            _patchActiveVersion(aiMsg, { content: aiMsg.content });
            _refreshMsgBlock(aiMsg.id);
            stopFab.style.display = "none";
            sending = false;
          },
        });
      } catch (e) {
        aiMsg.pending = false;
        aiMsg.content = global.Phone.AIClient.friendlyError(e);
        aiMsg.status = "failed";
        _patchActiveVersion(aiMsg, { content: aiMsg.content });
        _refreshMsgBlock(aiMsg.id);
        stopFab.style.display = "none";
        sending = false;
      }
    }

    // 切换版本（不消耗 API）
    function _switchVersion(msgId, dir) {
      const msg = conversation.messages.find((m) => m.id === msgId);
      if (!msg || !msg.versions || msg.versions.length <= 1) return;
      let next = (msg.versionIdx || 0) + dir;
      if (next < 0) next = msg.versions.length - 1;
      if (next >= msg.versions.length) next = 0;
      msg.versionIdx = next;
      _refreshMsgBlock(msgId);
    }

    // ---------- 消息操作（_handleAction 全套） ----------
    // extra: GitHub 卡片按钮透传的 { kind, payload }，用于 github-* action
    async function _handleAction(action, msg, extra) {
      const idx = conversation.messages.findIndex((m) => m.id === msg.id);
      // GitHub 卡片 action 允许 msg 已不在列表里（卡片自身是消息，但 extra.payload 已带数据）
      if (idx < 0 && action !== "tts" && action !== "copy-md" && action !== "export-msg" && !/^github-/.test(action)) return;

      if (action === "delete") {
        const ok = await global.Phone.Modal.confirm({
          title: "删除消息", message: "删除这条消息吗？不可恢复哦", danger: true, okText: "删除",
        });
        if (!ok) return;
        conversation.messages.splice(idx, 1);
        await Storage.put("conversations", conversation);
        _rerenderMessages();
      } else if (action === "recall") {
        // 60s 门控：发送后 60 秒内可撤回
        if (Date.now() - (msg.createdAt || 0) > 60000) {
          global.Phone.Notify.push({ appId: "chat", title: "超过 60 秒，无法撤回" });
          return;
        }
        conversation.messages.splice(idx, 1);
        await Storage.put("conversations", conversation);
        _rerenderMessages();
        global.Phone.Notify.push({ appId: "chat", title: "已撤回一条消息" });
      } else if (action === "quote") {
        currentQuote = { author: msg.role === "user" ? "我" : character.name, content: msg.content };
        try { inputBar.setQuote(currentQuote); inputBar.focus(); } catch {}
      } else if (action === "forward") {
        _showForwardPicker(msg);
      } else if (action === "favorite") {
        try {
          const favorites = (await Storage.getSetting("chatFavorites")) || [];
          favorites.push({ id: U.uid("fav"), content: msg.content, from: character.name, createdAt: Date.now() });
          await Storage.setSetting("chatFavorites", favorites);
          global.Phone.Notify.push({ appId: "chat", title: "已收藏" });
        } catch {}
      } else if (action === "regenerate") {
        _regenerate(msg);
      } else if (action === "copy-md") {
        _copyText(msg.content || "");
        global.Phone.Notify.push({ appId: "chat", title: "已复制 Markdown" });
      } else if (action === "export-msg") {
        _exportSingleMsg(msg);
      } else if (action === "edit") {
        // 编辑：回填输入框 + pendingEdit；不支持 setDraft 时降级为 prompt
        if (typeof inputBar.setDraft === "function") {
          pendingEdit = { msgId: msg.id };
          inputBar.setDraft(msg.content || "");
          try { inputBar.focus(); } catch {}
          global.Phone.Notify.push({ appId: "chat", title: "编辑后发送将重新生成" });
        } else {
          const newText = await global.Phone.Modal.prompt({
            title: "编辑消息", defaultValue: msg.content || "", okText: "重新生成",
          });
          if (newText != null && newText.trim()) {
            await _truncateAndRegenerate(msg.id, newText);
          }
        }
      } else if (action === "resend") {
        // 原样重发
        await _onSend({ type: msg.type, content: msg.content });
      } else if (action === "tts") {
        try {
          const TTS = global.Phone.TTS;
          if (TTS && typeof TTS.speak === "function") {
            const text = global.Phone.MessageRenderer.plainText
              ? global.Phone.MessageRenderer.plainText(msg.content || "")
              : (msg.content || "");
            const opts = {};
            if (convSettings.ttsVoice) opts.voice = convSettings.ttsVoice;
            TTS.speak(text, opts);
          } else {
            global.Phone.Notify.push({ appId: "chat", title: "TTS 不可用" });
          }
        } catch {}
      } else if (action === "version-prev") {
        _switchVersion(msg.id, -1);
      } else if (action === "version-next") {
        _switchVersion(msg.id, 1);
      } else if (action === "switch-version") {
        // message-renderer 版本指示点直接切到指定版本（单一真实数据源：以 conversation 为准重渲染）
        if (extra && typeof extra.versionIdx === "number") {
          const m = conversation.messages.find((mm) => mm.id === msg.id);
          if (m && m.versions && extra.versionIdx >= 0 && extra.versionIdx < m.versions.length) {
            m.versionIdx = extra.versionIdx;
            _refreshMsgBlock(msg.id);
          }
        }
      } else if (/^github-/.test(action)) {
        _handleGithubAction(action, msg, extra || {});
      }
    }

    // ---------- GitHub 卡片按钮 action ----------
    // action: github-view / github-merge / github-close / github-view-commit / github-view-diff / github-revert
    // extra: { kind, payload } —— payload 是工具返回数据
    // 读类操作：有 html_url 就在应用内打开，否则发消息让 AI 拉详情
    // 写类操作：发一条用户消息给 AI，AI 调对应工具（会触发 onWriteTool 二次确认）
    function _handleGithubAction(action, msg, extra) {
      const p = (extra && extra.payload) || (msg && msg.payload) || {};
      const kind = (extra && extra.kind) || (p.kind || "").toLowerCase();

      // 读类：github-view / github-view-commit / github-view-diff
      if (action === "github-view" || action === "github-view-commit" || action === "github-view-diff") {
        // 列表项点击 / PR 详情 / Commit / Diff：优先用 html_url 在应用内打开
        const url = p.html_url || p.url || "";
        if (url) {
          try {
            if (global.Phone.MessageRenderer && typeof global.Phone.MessageRenderer.openLink === "function") {
              global.Phone.MessageRenderer.openLink(url, {});
            } else {
              global.open(url, "_blank");
            }
          } catch (_) {
            try { global.open(url, "_blank"); } catch (_) {}
          }
          return;
        }
        // 没有 html_url：发消息让 AI 拉详情
        if (action === "github-view" && kind === "pr") {
          _onSend({ type: "text", content: "请查看 PR #" + (p.number || "?") + " 的详情" });
        } else if (action === "github-view-commit") {
          const sha = p.sha || p.commit || "";
          _onSend({ type: "text", content: "请查看 commit " + (String(sha).slice(0, 7) || "") + " 的详情" });
        } else if (action === "github-view-diff") {
          _onSend({ type: "text", content: "请查看文件 " + (p.path || p.file || "") + " 的 diff" });
        }
        return;
      }

      // 写类：github-merge / github-close / github-revert
      // 发一条用户消息给 AI，AI 会调对应 github_* 工具（写操作会触发 onWriteTool 二次确认）
      if (action === "github-merge") {
        const num = p.number || (msg && msg.payload && msg.payload.number) || "?";
        const method = p.method || "merge";
        _onSend({ type: "text", content: "请合并 PR #" + num + "（合并方式：" + method + "）" });
      } else if (action === "github-close") {
        const num = p.number || (msg && msg.payload && msg.payload.number) || "?";
        _onSend({ type: "text", content: "请关闭 PR #" + num });
      } else if (action === "github-revert") {
        const sha = p.sha || p.commit || "";
        _onSend({ type: "text", content: "请撤销 commit " + (String(sha).slice(0, 7) || "") + "（" + (p.path || p.file || "") + "）" });
      }
    }

    function _copyText(text) {
      if (navigator.clipboard) {
        navigator.clipboard.writeText(text || "").catch(() => {});
      } else {
        const ta = document.createElement("textarea");
        ta.value = text || ""; document.body.appendChild(ta);
        ta.select(); try { document.execCommand("copy"); } catch {}
        ta.remove();
      }
    }

    function _exportSingleMsg(msg) {
      const who = msg.role === "user" ? "我" : (character.name || "AI");
      const text = "# " + who + " 的消息\n\n" + (msg.content || "");
      U.download((who + "_消息.md"), text, "text/markdown;charset=utf-8");
    }

    // ---------- 转发流程（第 6 节） ----------
    async function _showForwardPicker(msg) {
      const U = global.Phone.Utils;
      const allConvs = (await Storage.getAll("conversations")).filter((c) => c.id !== conversationId && !c.hidden);
      const chars = await Storage.getAll("characters");

      const mask = U.el("div", { class: "sheet-mask" });
      const sheet = U.el("div", { class: "sheet", style: { maxHeight: "70vh", display: "flex", flexDirection: "column" } });
      sheet.appendChild(U.el("div", { class: "sheet-handle" }));
      sheet.appendChild(U.el("div", {
        class: "sheet-title", text: "转发到",
        style: { fontSize: "var(--font-md)", fontWeight: 600, padding: "4px 4px 12px", textAlign: "center" },
      }));

      // 搜索框
      const search = U.el("input", {
        class: "forward-search",
        placeholder: "搜索会话",
        style: {
          width: "100%", padding: "10px 14px", borderRadius: "var(--radius-lg)",
          border: "1px solid var(--border-soft)", background: "var(--bg-surface-2)",
          fontSize: "var(--font-base)", marginBottom: "10px", boxSizing: "border-box",
        },
      });
      sheet.appendChild(search);

      const listEl = U.el("div", { class: "forward-list", style: { overflowY: "auto", flex: "1" } });
      sheet.appendChild(listEl);

      function renderList(kw) {
        U.empty(listEl);
        const k = (kw || "").toLowerCase();
        const filtered = allConvs.filter((c) => {
          if (!k) return true;
          const ch = chars.find((x) => x.id === c.characterId) || {};
          return (ch.name || "AI").toLowerCase().includes(k);
        });
        if (filtered.length === 0) {
          listEl.appendChild(U.el("div", {
            class: "empty-state", text: "没有可转发的会话",
            style: { textAlign: "center", color: "var(--text-secondary)", padding: "24px" },
          }));
          return;
        }
        filtered.forEach((c) => {
          const ch = chars.find((x) => x.id === c.characterId) || { name: "AI" };
          const item = U.el("div", { class: "sheet-item", style: { cursor: "pointer" } });
          const av = U.el("div", { class: "li-avatar", style: { width: "36px", height: "36px", borderRadius: "var(--radius-full)", background: "var(--grad-primary)", color: "var(--text-on-primary)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "var(--font-sm)", flexShrink: "0" } });
          av.textContent = (ch.name || "AI").slice(0, 1);
          item.appendChild(av);
          const info = U.el("div", { style: { flex: "1" } }, [
            U.el("div", { style: { fontWeight: 600, fontSize: "var(--font-base)" }, text: ch.name || "AI" }),
            U.el("div", { style: { fontSize: "var(--font-xs)", color: "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }, text: (c.messages && c.messages.length ? (c.messages[c.messages.length - 1].content || "").slice(0, 30) : "开始聊天吧～") }),
          ]);
          item.appendChild(info);
          item.addEventListener("click", () => { mask.remove(); _doForward(msg, c, ch); });
          listEl.appendChild(item);
        });
      }
      renderList("");
      search.addEventListener("input", U.debounce(() => renderList(search.value.trim()), 200));

      const cancel = U.el("div", { class: "sheet-cancel", text: "取消" });
      cancel.addEventListener("click", () => mask.remove());
      sheet.appendChild(cancel);
      mask.appendChild(sheet);
      mask.addEventListener("click", (e) => { if (e.target === mask) mask.remove(); });
      document.body.appendChild(mask);
      setTimeout(() => search.focus(), 100);
    }

    async function _doForward(msg, targetConv, targetChar) {
      const ok = await global.Phone.Modal.confirm({
        title: "转发", message: "转发给 " + (targetChar.name || "AI") + "？", okText: "转发",
      });
      if (!ok) return;
      const copy = {
        id: U.uid("msg"),
        role: msg.role,
        type: msg.type,
        content: msg.content,
        dataURL: msg.dataURL || null,
        fileName: msg.fileName || null,
        forwarded: true,
        createdAt: Date.now(),
        status: "sent",
      };
      targetConv.messages = targetConv.messages || [];
      targetConv.messages.push(copy);
      targetConv.updatedAt = Date.now();
      await Storage.put("conversations", targetConv);
      global.Phone.Notify.push({ appId: "chat", title: "已转发" });
    }

    // ---------- 角色资料（含"查看完整资料"跳转） ----------
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
          char.background ? U.el("div", { class: "cp-row", text: "背景：" + char.background }) : null,
        ])
      ]);
      modal.appendChild(body);
      modal.appendChild(U.el("div", { class: "modal-actions" }, [
        U.el("button", {
          class: "btn btn-ghost", text: "查看完整资料",
          onclick: () => {
            mask.remove();
            try {
              if (global.Phone.Characters && typeof global.Phone.Characters.open === "function") {
                global.Phone.Characters.open();
              }
            } catch {}
          },
        }),
        U.el("button", { class: "btn btn-block", text: "好的", onclick: () => mask.remove() }),
      ]));
      mask.appendChild(modal);
      mask.addEventListener("click", (e) => { if (e.target === mask) mask.remove(); });
      document.body.appendChild(mask);
    }

    function _fillNavAvatar(node, char) {
      if (char && char.avatar) {
        node.innerHTML = '<img src="' + char.avatar + '" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:var(--radius-full)"/>';
      } else {
        node.textContent = (char && char.name || "AI").slice(0, 1);
      }
    }

    // 群聊默认标题：成员名拼接（最多3个，多余的 +N）
    function _defaultGroupTitle() {
      const names = groupMembers.map((m) => m.name || "AI");
      if (names.length === 0) return "群聊";
      if (names.length <= 3) return names.join("、");
      return names.slice(0, 3).join("、") + "等";
    }

    // 群聊导航栏堆叠头像：最多3个，第4个起显示 +N
    function _fillNavAvatars(node, members) {
      const shown = members.slice(0, 3);
      const rest = members.length - shown.length;
      shown.forEach((m, i) => {
        const av = U.el("div", { class: "conv-nav-avatar-stack", style: { zIndex: String(10 - i) } });
        if (m.avatar) {
          av.innerHTML = '<img src="' + m.avatar + '" alt=""/>';
        } else {
          av.textContent = (m.name || "AI").slice(0, 1);
        }
        node.appendChild(av);
      });
      if (rest > 0) {
        node.appendChild(U.el("div", { class: "conv-nav-avatar-stack conv-nav-avatar-more", text: "+" + rest }));
      }
      if (members.length === 0) {
        node.appendChild(U.el("div", { class: "conv-nav-avatar-stack conv-nav-avatar-more", text: "?" }));
      }
    }

    // ---------- 群成员面板（规范第 9 节） ----------
    // 右侧滑出，宽度 65vw，spring 动画（translateX 100% → 0）
    // 左侧 35vw 遮罩，点击关闭；面板内含头像+名称+人设来源+移除按钮，底部"添加成员"
    function _showMemberPanel() {
      const U = global.Phone.Utils;
      // 遮罩（左侧 35vw 区可点击关闭）
      const mask = U.el("div", { class: "group-member-mask" });
      // 面板（右侧 65vw）
      const panel = U.el("div", { class: "group-member-panel" });

      // 头部
      const head = U.el("div", { class: "gmp-head" });
      head.appendChild(U.el("div", {
        class: "gmp-title", text: "群成员（" + (groupMembers.length + 1) + "人）",
      }));
      const closeBtn = U.el("button", { class: "gmp-close", html: global.Phone.IconLibrary.get("x", { size: 20 }) });
      head.appendChild(closeBtn);
      panel.appendChild(head);

      // 成员列表（含"我"作为群主，不可移除）
      const listEl = U.el("div", { class: "gmp-list" });
      function renderMembers() {
        U.empty(listEl);
        // 群主（用户自己）置顶，不可移除
        const meItem = U.el("div", { class: "gmp-item gmp-item-me" });
        const meAv = U.el("div", { class: "gmp-avatar" });
        meAv.textContent = "我";
        meItem.appendChild(meAv);
        const meInfo = U.el("div", { class: "gmp-info" }, [
          U.el("div", { class: "gmp-name", text: "我（群主）" }),
          U.el("div", { class: "gmp-source", text: "用户" }),
        ]);
        meItem.appendChild(meInfo);
        listEl.appendChild(meItem);

        groupMembers.forEach((m) => {
          const item = U.el("div", { class: "gmp-item" });
          const av = U.el("div", { class: "gmp-avatar" });
          if (m.avatar) av.innerHTML = '<img src="' + m.avatar + '" alt=""/>';
          else av.textContent = (m.name || "AI").slice(0, 1);
          item.appendChild(av);
          // 人设来源：优先 character.systemPrompt 标记，否则用 description/personality 作预览
          const sourceHint = m.systemPrompt ? "自定义人设" : (m.description || m.personality || "人设管理APP");
          const info = U.el("div", { class: "gmp-info" }, [
            U.el("div", { class: "gmp-name", text: m.name || "AI" }),
            U.el("div", { class: "gmp-source", text: sourceHint }),
          ]);
          item.appendChild(info);
          // 移除按钮
          const removeBtn = U.el("button", {
            class: "gmp-remove", html: global.Phone.IconLibrary.get("x", { size: 16 }),
            title: "移除成员",
          });
          removeBtn.addEventListener("click", async (e) => {
            e.stopPropagation();
            const ok = await global.Phone.Modal.confirm({
              title: "移除成员", message: "确定把「" + (m.name || "AI") + "」移出群聊吗？", danger: true, okText: "移除",
            });
            if (!ok) return;
            await _removeGroupMember(m.id);
          });
          item.appendChild(removeBtn);
          listEl.appendChild(item);
        });
      }
      renderMembers();
      panel.appendChild(listEl);

      // 底部：添加成员
      const footer = U.el("div", { class: "gmp-footer" });
      const addBtn = U.el("button", {
        class: "gmp-add-btn",
        html: global.Phone.IconLibrary.get("plus", { size: 18 }) + "<span>添加成员</span>",
      });
      addBtn.addEventListener("click", () => _showAddMemberPicker(mask, panel, renderMembers));
      footer.appendChild(addBtn);
      panel.appendChild(footer);

      mask.appendChild(panel);
      // 关闭逻辑
      function closePanel() {
        panel.classList.remove("open");
        mask.classList.remove("open");
        setTimeout(() => mask.remove(), 320);
      }
      closeBtn.addEventListener("click", closePanel);
      mask.addEventListener("click", (e) => { if (e.target === mask) closePanel(); });
      // 右滑手势关闭
      let startX = null;
      panel.addEventListener("touchstart", (e) => { startX = e.touches[0].clientX; }, { passive: true });
      panel.addEventListener("touchmove", (e) => {
        if (startX == null) return;
        const dx = e.touches[0].clientX - startX;
        if (dx > 60) { closePanel(); startX = null; }
      }, { passive: true });

      document.body.appendChild(mask);
      // spring 入场：下一帧加 open
      requestAnimationFrame(() => { mask.classList.add("open"); panel.classList.add("open"); });
    }

    // 从群聊移除一个成员：更新 memberIds / groupMembers / 导航栏，存盘
    async function _removeGroupMember(memberId) {
      const ids = Array.isArray(conversation.memberIds) ? conversation.memberIds : [];
      conversation.memberIds = ids.filter((id) => id !== memberId);
      await Storage.put("conversations", conversation);
      await _refreshGroupMembers();
      _renderNavTitle();
      global.Phone.Notify.push({ appId: "chat", title: "已移除成员" });
    }

    // 添加成员选择器：列出不在群里的所有角色，点击即加入
    function _showAddMemberPicker(mask, panel, renderMembers) {
      const U = global.Phone.Utils;
      const picker = U.el("div", { class: "modal-mask" });
      const modal = U.el("div", { class: "modal", style: { maxWidth: "340px" } });
      modal.appendChild(U.el("div", { class: "modal-title", text: "添加成员" }));
      const body = U.el("div", { class: "modal-body", style: { textAlign: "left", maxHeight: "50vh", overflowY: "auto" } });
      Storage.getAll("characters").then((chars) => {
        const inGroupIds = new Set((conversation.memberIds || []));
        const candidates = chars.filter((c) => !inGroupIds.has(c.id));
        if (candidates.length === 0) {
          body.appendChild(U.el("div", { text: "没有可添加的角色了", style: { color: "var(--text-secondary)", textAlign: "center", padding: "16px" } }));
          return;
        }
        candidates.forEach((c) => {
          const item = U.el("div", { class: "list-item", style: { display: "flex", alignItems: "center", gap: "10px", padding: "10px 4px", cursor: "pointer", borderBottom: "1px solid var(--border-soft)" } });
          const av = U.el("div", { class: "li-avatar", style: { width: "36px", height: "36px" } });
          if (c.avatar) av.innerHTML = '<img src="' + c.avatar + '"/>';
          else av.textContent = (c.name || "AI").slice(0, 1);
          item.appendChild(av);
          item.appendChild(U.el("div", { class: "li-main", style: { flex: "1" } }, [
            U.el("div", { class: "li-title", text: c.name || "AI" }),
            U.el("div", { class: "li-sub", text: c.description || "点击添加", style: { fontSize: "var(--font-xs)", color: "var(--text-secondary)" } }),
          ]));
          item.addEventListener("click", async () => {
            await _addGroupMember(c.id);
            picker.remove();
            renderMembers();
          });
          body.appendChild(item);
        });
      });
      modal.appendChild(body);
      modal.appendChild(U.el("div", { class: "modal-actions" }, [
        U.el("button", { class: "btn btn-ghost", text: "关闭", onclick: () => picker.remove() }),
      ]));
      picker.appendChild(modal);
      picker.addEventListener("click", (e) => { if (e.target === picker) picker.remove(); });
      document.body.appendChild(picker);
    }

    // 加入一个成员：更新 memberIds / groupMembers / 导航栏，存盘
    async function _addGroupMember(memberId) {
      const ids = Array.isArray(conversation.memberIds) ? conversation.memberIds : [];
      if (ids.indexOf(memberId) >= 0) return;
      ids.push(memberId);
      conversation.memberIds = ids;
      await Storage.put("conversations", conversation);
      await _refreshGroupMembers();
      _renderNavTitle();
      global.Phone.Notify.push({ appId: "chat", title: "已添加成员" });
    }

    // ---------- GitHub 关联仓库配置 ----------
    function _showGitHubConfig() {
      const U = global.Phone.Utils;
      const mask = U.el("div", { class: "modal-mask" });
      const modal = U.el("div", { class: "modal", style: { maxWidth: "360px" } });
      modal.appendChild(U.el("div", { class: "modal-title", text: "GitHub 关联仓库" }));
      const body = U.el("div", { class: "modal-body", style: { textAlign: "left" } });

      const repoIn = U.el("input", {
        class: "phone-modal-input", placeholder: "owner/repo", value: convSettings.githubRepo || "",
        style: { width: "100%", padding: "10px 12px", borderRadius: "var(--radius-md)", border: "1px solid var(--border-soft)", marginBottom: "10px", boxSizing: "border-box" },
      });
      const branchIn = U.el("input", {
        class: "phone-modal-input", placeholder: "分支（如 main）", value: convSettings.githubBranch || "",
        style: { width: "100%", padding: "10px 12px", borderRadius: "var(--radius-md)", border: "1px solid var(--border-soft)", marginBottom: "10px", boxSizing: "border-box" },
      });
      const patIn = U.el("input", {
        class: "phone-modal-input", type: "password", placeholder: "Personal Access Token（只存本地）",
        value: convSettings.githubPat || "",
        style: { width: "100%", padding: "10px 12px", borderRadius: "var(--radius-md)", border: "1px solid var(--border-soft)", marginBottom: "10px", boxSizing: "border-box" },
      });
      body.appendChild(U.el("div", { text: "仓库（owner/repo）", style: { fontSize: "var(--font-sm)", color: "var(--text-secondary)", marginBottom: "4px" } }));
      body.appendChild(repoIn);
      body.appendChild(U.el("div", { text: "默认分支", style: { fontSize: "var(--font-sm)", color: "var(--text-secondary)", marginBottom: "4px" } }));
      body.appendChild(branchIn);
      body.appendChild(U.el("div", { text: "PAT（仅本地存储，不上传）", style: { fontSize: "var(--font-sm)", color: "var(--text-secondary)", marginBottom: "4px" } }));
      body.appendChild(patIn);
      modal.appendChild(body);

      modal.appendChild(U.el("div", { class: "modal-actions" }, [
        U.el("button", { class: "btn btn-ghost", text: "取消", onclick: () => mask.remove() }),
        U.el("button", {
          class: "btn btn-block", text: "保存",
          onclick: async () => {
            convSettings.githubRepo = repoIn.value.trim();
            convSettings.githubBranch = branchIn.value.trim();
            // PAT 只存本地，绝不 console.log
            convSettings.githubPat = patIn.value;
            await _saveConvSetting("githubRepo", convSettings.githubRepo);
            await _saveConvSetting("githubBranch", convSettings.githubBranch);
            await _saveConvSetting("githubPat", convSettings.githubPat);
            mask.remove();
            global.Phone.Notify.push({ appId: "chat", title: "GitHub 配置已保存" });
          },
        }),
      ]));
      mask.appendChild(modal);
      mask.addEventListener("click", (e) => { if (e.target === mask) mask.remove(); });
      document.body.appendChild(mask);
    }

    // ---------- 聊天设置抽屉（第 11 节，13 项） ----------
    function _showMenu() {
      const U = global.Phone.Utils;
      const mask = U.el("div", { class: "sheet-mask" });
      const sheet = U.el("div", { class: "sheet", style: { maxHeight: "85vh", display: "flex", flexDirection: "column" } });
      sheet.appendChild(U.el("div", { class: "sheet-handle" }));
      sheet.appendChild(U.el("div", {
        class: "sheet-title", text: "聊天设置",
        style: { fontSize: "var(--font-md)", fontWeight: 600, padding: "4px 4px 12px", textAlign: "center" },
      }));

      const content = U.el("div", { class: "conv-settings-list", style: { overflowY: "auto", flex: "1", paddingBottom: "12px" } });

      // 1. 对话标题（可编辑）
      content.appendChild(_makeRow("对话标题", U.el("div", {
        class: "cs-val", text: conversation.title || character.name || "AI",
        style: { color: "var(--color-primary)", cursor: "pointer" },
        onclick: async () => {
          const v = await global.Phone.Modal.prompt({ title: "修改对话标题", defaultValue: conversation.title || character.name || "" });
          if (v != null) {
            conversation.title = v || (character.name || "AI");
            await Storage.put("conversations", conversation);
            navTitleText.querySelector(".conv-title").textContent = conversation.title;
            mask.remove();
            _showMenu();
          }
        },
      })));

      // 2. 当前 AI 名称 + 人设来源（只读，点击 _showCharProfile）
      //    群聊时改为"群成员"入口，点击打开成员面板
      if (isGroup) {
        content.appendChild(_makeRow("群成员", U.el("div", {
          class: "cs-val", text: (groupMembers.length + 1) + "人",
          style: { color: "var(--color-primary)", cursor: "pointer" },
          onclick: () => { mask.remove(); _showMemberPanel(); },
        })));
      } else {
        content.appendChild(_makeRow("当前 AI", U.el("div", {
          class: "cs-val", text: (character.name || "AI") + (character.personality ? " · " + character.personality.slice(0, 12) : ""),
          style: { color: "var(--color-primary)", cursor: "pointer" },
          onclick: () => { mask.remove(); _showCharProfile(character); },
        })));
      }

      // 3. 模型：下拉选择器
      content.appendChild(_makeRow("模型", _makeModelSelect()));

      // 4. TTS：开关 + 音色选择
      content.appendChild(_makeRow("TTS 朗读", _makeTTSRow()));

      // 5. 上下文窗口：分段 2/4/8/16/32
      content.appendChild(_makeRow("上下文窗口", _makeSegment([2, 4, 8, 16, 32].map((n) => ({ val: n, label: String(n) })), convSettings.ctx || 16, async (v) => {
        convSettings.ctx = v;
        await _saveConvSetting("ctx", v);
      })));

      // 6. 气泡/对话模式：分段控制器
      content.appendChild(_makeRow("显示模式", _makeSegment([
        { val: "bubble", label: "气泡" }, { val: "dialog", label: "对话" },
      ], mode, (v) => {
        mask.remove();
        _switchMode(v);
      })));

      // 7. 思维链：开关（null=跟随全局）
      content.appendChild(_makeRow("思维链" + (convSettings.thinking === null ? "（跟随全局）" : ""), _makeTriSwitch(
        convSettings.thinking === null ? "follow" : (convSettings.thinking ? "on" : "off"),
        async (s) => {
          convSettings.thinking = s === "follow" ? null : (s === "on");
          await _saveConvSetting("thinking", convSettings.thinking);
          mask.remove();
          _showMenu();
        }
      )));

      // 8. Token 用量显示：开关
      content.appendChild(_makeRow("Token 用量显示", _makeSwitch(!!convSettings.tokenShow, async (on) => {
        convSettings.tokenShow = on;
        await _saveConvSetting("tokenShow", on);
        _rerenderMessages();
      })));

      // 9. 上下文范围可视化：开关
      content.appendChild(_makeRow("上下文范围可视化", _makeSwitch(!!convSettings.ctxViz, async (on) => {
        convSettings.ctxViz = on;
        await _saveConvSetting("ctxViz", on);
        _rerenderMessages();
      })));

      // 10. GitHub 关联仓库
      content.appendChild(_makeRow("GitHub 关联仓库", U.el("div", {
        class: "cs-val", text: convSettings.githubRepo || "未配置",
        style: { color: "var(--color-primary)", cursor: "pointer" },
        onclick: () => { mask.remove(); _showGitHubConfig(); },
      })));

      // 11. 分隔线
      content.appendChild(U.el("div", { style: { height: "1px", background: "var(--border-soft)", margin: "8px 0" } }));

      // 12. 清空当前对话（二次确认）
      const clearItem = U.el("div", {
        class: "sheet-item danger", text: "清空当前对话",
        style: { color: "var(--color-danger)", justifyContent: "center" },
      });
      clearItem.addEventListener("click", async () => {
        const ok = await global.Phone.Modal.confirm({
          title: "清空当前对话", message: "将删除全部消息，不可恢复哦", danger: true, okText: "清空",
        });
        if (!ok) return;
        conversation.messages = [];
        contextStartIdx = 0;
        conversation.contextStartIdx = 0;
        await Storage.put("conversations", conversation);
        mask.remove();
        _rerenderMessages();
        global.Phone.Notify.push({ appId: "chat", title: "已清空当前对话" });
      });
      content.appendChild(clearItem);

      // 13. 导出整段对话（Markdown）
      const exportItem = U.el("div", {
        class: "sheet-item", text: "导出整段对话",
        style: { justifyContent: "center", color: "var(--color-primary)" },
      });
      exportItem.addEventListener("click", () => { _exportMarkdown(); mask.remove(); });
      content.appendChild(exportItem);

      sheet.appendChild(content);
      const cancel = U.el("div", { class: "sheet-cancel", text: "关闭" });
      cancel.addEventListener("click", () => mask.remove());
      sheet.appendChild(cancel);
      mask.appendChild(sheet);
      mask.addEventListener("click", (e) => { if (e.target === mask) mask.remove(); });
      document.body.appendChild(mask);
    }

    function _makeRow(label, control) {
      const U = global.Phone.Utils;
      return U.el("div", {
        class: "cs-row",
        style: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", padding: "12px 4px", borderBottom: "1px solid var(--border-soft)" },
      }, [
        U.el("div", { class: "cs-label", text: label, style: { fontSize: "var(--font-base)", color: "var(--text-primary)", flexShrink: "0" } }),
        U.el("div", { class: "cs-control", style: { flexShrink: "1", textAlign: "right" } }, [control]),
      ]);
    }

    function _makeSwitch(initial, onChange) {
      const U = global.Phone.Utils;
      let on = !!initial;
      const sw = U.el("div", {
        class: "switch" + (on ? " on" : ""),
        style: {
          width: "44px", height: "26px", borderRadius: "var(--radius-full)",
          background: on ? "var(--color-primary)" : "var(--bg-surface-2)",
          border: "1px solid var(--border-soft)", position: "relative", cursor: "pointer",
          transition: "background var(--dur-fast) var(--ease-soft)",
        },
      });
      const dot = U.el("div", {
        style: {
          position: "absolute", top: "2px", left: on ? "20px" : "2px", width: "20px", height: "20px",
          borderRadius: "var(--radius-full)", background: "var(--bg-surface)",
          boxShadow: "var(--shadow-soft)", transition: "left var(--dur-fast) var(--ease-soft)",
        },
      });
      sw.appendChild(dot);
      sw.addEventListener("click", () => {
        on = !on;
        sw.style.background = on ? "var(--color-primary)" : "var(--bg-surface-2)";
        dot.style.left = on ? "20px" : "2px";
        onChange(on);
      });
      return sw;
    }

    // 三态开关：follow / on / off
    function _makeTriSwitch(initial, onChange) {
      const U = global.Phone.Utils;
      const wrap = U.el("div", {
        class: "segment",
        style: { display: "inline-flex", borderRadius: "var(--radius-full)", overflow: "hidden", border: "1px solid var(--border-soft)" },
      });
      const opts = [
        { val: "follow", label: "跟随" },
        { val: "on", label: "开" },
        { val: "off", label: "关" },
      ];
      opts.forEach((o) => {
        const node = U.el("div", {
          class: "segment-item" + (initial === o.val ? " active" : ""),
          text: o.label,
          style: {
            padding: "4px 12px", fontSize: "var(--font-sm)", cursor: "pointer",
            background: initial === o.val ? "var(--color-primary)" : "transparent",
            color: initial === o.val ? "var(--text-on-primary)" : "var(--text-secondary)",
          },
        });
        node.addEventListener("click", () => {
          wrap.querySelectorAll(".segment-item").forEach((n) => {
            n.classList.remove("active");
            n.style.background = "transparent";
            n.style.color = "var(--text-secondary)";
          });
          node.classList.add("active");
          node.style.background = "var(--color-primary)";
          node.style.color = "var(--text-on-primary)";
          onChange(o.val);
        });
        wrap.appendChild(node);
      });
      return wrap;
    }

    function _makeSegment(items, current, onPick) {
      const U = global.Phone.Utils;
      const seg = U.el("div", {
        class: "segment",
        style: { display: "inline-flex", flexWrap: "wrap", borderRadius: "var(--radius-full)", overflow: "hidden", border: "1px solid var(--border-soft)" },
      });
      items.forEach((it) => {
        const node = U.el("div", {
          class: "segment-item" + (current === it.val ? " active" : ""),
          text: it.label,
          style: {
            padding: "4px 12px", fontSize: "var(--font-sm)", cursor: "pointer",
            background: current === it.val ? "var(--color-primary)" : "transparent",
            color: current === it.val ? "var(--text-on-primary)" : "var(--text-secondary)",
          },
        });
        node.addEventListener("click", () => {
          seg.querySelectorAll(".segment-item").forEach((n) => {
            n.classList.remove("active");
            n.style.background = "transparent";
            n.style.color = "var(--text-secondary)";
          });
          node.classList.add("active");
          node.style.background = "var(--color-primary)";
          node.style.color = "var(--text-on-primary)";
          onPick(it.val);
        });
        seg.appendChild(node);
      });
      return seg;
    }

    function _makeModelSelect() {
      const U = global.Phone.Utils;
      const cur = convSettings.model || (State.get("aiModel") || "");
      // ApiConfig 不存在，用 AIClient.POPULAR_MODELS + 当前模型去重
      let models = [];
      try {
        if (global.Phone.ApiConfig && typeof global.Phone.ApiConfig.getGroups === "function") {
          const groups = global.Phone.ApiConfig.getGroups() || [];
          groups.forEach((g) => {
            if (g && g.models) g.models.forEach((m) => models.push({ id: m.id || m, name: m.name || m.id || m }));
          });
        }
      } catch {}
      if (models.length === 0 && global.Phone.AIClient && global.Phone.AIClient.POPULAR_MODELS) {
        models = global.Phone.AIClient.POPULAR_MODELS.map((m) => ({ id: m.id, name: m.name || m.id }));
      }
      // 去重 + 加入当前模型
      const seen = {};
      const list = [];
      if (cur && !models.find((m) => m.id === cur)) list.push({ id: cur, name: cur + "（当前）" });
      models.forEach((m) => { if (!seen[m.id]) { seen[m.id] = 1; list.push(m); } });

      const sel = U.el("select", {
        class: "cs-select",
        style: { padding: "6px 10px", borderRadius: "var(--radius-md)", border: "1px solid var(--border-soft)", background: "var(--bg-surface)", fontSize: "var(--font-sm)", maxWidth: "160px" },
      });
      list.forEach((m) => {
        const opt = U.el("option", { value: m.id, text: m.name || m.id });
        if (m.id === cur) opt.setAttribute("selected", "selected");
        sel.appendChild(opt);
      });
      sel.addEventListener("change", async () => {
        convSettings.model = sel.value;
        await _saveConvSetting("model", sel.value);
      });
      return sel;
    }

    function _makeTTSRow() {
      const U = global.Phone.Utils;
      const wrap = U.el("div", { style: { display: "inline-flex", alignItems: "center", gap: "8px" } });
      wrap.appendChild(_makeSwitch(!!convSettings.tts, async (on) => {
        convSettings.tts = on;
        await _saveConvSetting("tts", on);
      }));
      // 音色选择（浏览器 SpeechSynthesis）
      const voiceSel = U.el("select", {
        class: "cs-voice-select",
        style: { padding: "6px 10px", borderRadius: "var(--radius-md)", border: "1px solid var(--border-soft)", background: "var(--bg-surface)", fontSize: "var(--font-xs)", maxWidth: "120px" },
      });
      voiceSel.appendChild(U.el("option", { value: "", text: "默认音色" }));
      try {
        if (typeof global.speechSynthesis !== "undefined" && global.speechSynthesis.getVoices) {
          const voices = global.speechSynthesis.getVoices() || [];
          voices.forEach((v) => {
            const opt = U.el("option", { value: v.name, text: (v.name || "") + (v.lang ? " (" + v.lang + ")" : "") });
            if (convSettings.ttsVoice === v.name) opt.setAttribute("selected", "selected");
            voiceSel.appendChild(opt);
          });
        }
      } catch {}
      voiceSel.addEventListener("change", async () => {
        convSettings.ttsVoice = voiceSel.value;
        await _saveConvSetting("ttsVoice", voiceSel.value);
      });
      wrap.appendChild(voiceSel);
      return wrap;
    }

    // ---------- 模式切换（第 4 节，200ms crossfade） ----------
    async function _switchMode(newMode) {
      if (newMode === mode) return;
      try {
        list.style.transition = "opacity 200ms ease-out";
        list.style.opacity = "0";
      } catch {}
      setTimeout(async () => {
        mode = newMode;
        conversation.mode = mode;
        await Storage.put("conversations", conversation);
        _rerenderMessages();
        try { list.style.opacity = "1"; } catch {}
        try {
          global.Phone.EventCenter.emit(global.Phone.EventCenter.TYPES.CHAT_MODE_CHANGED, {
            sourceApp: "chat", data: { conversationId: conversationId, mode: mode }, summary: "切换为" + (mode === "bubble" ? "气泡" : "对话") + "模式",
          });
        } catch {}
      }, 150);
    }

    // ---------- 导出 Markdown ----------
    function _exportMarkdown() {
      const title = conversation.title || (isGroup ? "群聊对话" : ("和 " + (character.name || "AI") + " 的对话"));
      const lines = ["# " + title, ""];
      conversation.messages.forEach((m) => {
        // 群聊 AI 消息按 senderId 取成员名，单聊用 character.name
        let who;
        if (m.role === "user") {
          who = "我";
        } else if (isGroup) {
          const sender = _memberById(m.senderId);
          who = (sender && sender.name) || "AI";
        } else {
          who = (character.name || "AI");
        }
        const time = U.fmtDateTime(m.createdAt || Date.now());
        lines.push("## " + who + " · " + time);
        lines.push("");
        if (m.type === "image" || (m.dataURL && m.type === "file" && /^data:image/.test(m.dataURL))) {
          lines.push("（图片消息）");
        } else if (m.type === "voice") {
          lines.push("（语音消息 " + (m.duration || 3) + " 秒）");
        } else if (m.type === "file") {
          lines.push("（文件：" + (m.fileName || "") + "）");
        } else {
          lines.push(m.content || "");
        }
        lines.push("");
      });
      const text = lines.join("\n");
      U.download(title + ".md", text, "text/markdown;charset=utf-8");
      global.Phone.Notify.push({ appId: "chat", title: "已导出 Markdown" });
    }

    // ---------- 会话级设置读写 ----------
    async function _loadConvSettings(convId) {
      const keys = ["ctx", "thinking", "tokenShow", "ctxViz", "tts", "ttsVoice", "model", "temp", "githubRepo", "githubBranch", "githubPat"];
      const out = {};
      for (const k of keys) {
        const v = await Storage.getSetting("chat." + k + "_" + convId);
        out[k] = v;
      }
      if (out.ctx == null) out.ctx = 16;
      if (out.thinking === undefined) out.thinking = null;
      if (out.tokenShow == null) out.tokenShow = false;
      if (out.ctxViz == null) out.ctxViz = false;
      if (out.tts == null) out.tts = false;
      if (out.ttsVoice == null) out.ttsVoice = "";
      if (out.model == null) out.model = "";
      if (out.temp == null) out.temp = null;
      if (out.githubRepo == null) out.githubRepo = "";
      if (out.githubBranch == null) out.githubBranch = "";
      if (out.githubPat == null) out.githubPat = "";
      return out;
    }

    async function _saveConvSetting(key, value) {
      convSettings[key] = value;
      await Storage.setSetting("chat." + key + "_" + conversationId, value);
    }

    // ---------- 全局思维链开关订阅（变更时重渲染） ----------
    try {
      const unsub = State.subscribe("showThinking", () => {
        if (convSettings.thinking === null) _rerenderMessages();
      });
      if (typeof unsub === "function") unsubs.push(unsub);
    } catch {}

    // ---------- 标记已读 ----------
    try { global.Phone.Notify.markAppRead("chat"); } catch {}

    // ---------- 卸载钩子：取消所有订阅 + abort + 销毁输入栏 ----------
    function destroy() {
      if (abortCtrl) try { abortCtrl.abort(); } catch {}
      unsubs.forEach((fn) => { try { fn(); } catch {} });
      unsubs.length = 0;
      try { inputBar.destroy(); } catch {}
    }
    global.Phone.Router.onLeave(destroy);

    return { destroy };
  }

  // ---------- 暴露 ----------
  global.Phone = global.Phone || {};
  global.Phone.Conversation = { mount };
})(window);
