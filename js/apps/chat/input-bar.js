/* ============================================================
   input-bar.js — 输入工具栏
   文字输入 / 表情 / 图片 / 语音
   草稿自动保存 / 防抖提交
   挂在 window.Phone.InputBar
   ============================================================ */
(function (global) {
  "use strict";

  // 颜文字表情（用文字符号组合，避开 emoji）
  const EMOJIS = [
    "(｡•ᴗ•｡)", "(◕ᴗ◕✿)", "(≧▽≦)", "(´｡• ᵕ •｡`)", "(⸝⸝ᵕᴗᵕ⸝⸝)",
    "(˘ω˘)", "(｡◕‿◕｡)", "(◍•ᴗ•◍)", "(✿◡‿◡)", "(´･ᴗ･`)",
    "(⌒‿⌒)", "(´꒳`)", "(੭ˊ꒳ˋ)੭", "٩(ˊᗜˋ*)و", "ʕ•ﻌ•ʔ",
    "(◍˃ ᗜ ˂◍)", "(っ˘̩╭╮˘̩)っ", "(；´∀｀)", "(´∩｡• ᵕ •｡∩`)", "(✧ω✧)",
    "(*≧ω≦*)", "(´｡• ω •｡`)", "(〃＾▽＾〃)", "(o^▽^o)", "(✯◡✯)",
    "(⸝⸝⸝°_°⸝⸝⸝)", "(°▽°)", "(￣ω￣;)", "Σ(°△°|||)", "(ーー;)",
    "(=^•ω•^=)", "ฅ^•ﻌ•^ฅ", "₍ᐢ.ˬ.ᐢ₎", "(⚆ᴗ⚆)", "ʕᴥʔ",
  ];

  /**
   * 我（输入栏）渲染到容器
   * @param {object} opts {
   *   initialDraft, onSend(text|{type,content}), onTyping, quote,
   *   onCancelQuote, onFile, onClearContext, onGitHub, onSlash,
   *   characterId, conversationId,
   *   members (群聊成员数组，单聊传 null/空数组则不触发 @ 浮层),
   *   onMention(characterId) 可选，@ 选中成员时的回调
   * }
   */
  function mount(opts) {
    opts = opts || {};
    const U = global.Phone.Utils;
    const groupMembers = Array.isArray(opts.members) ? opts.members.filter((m) => m && m.id) : [];

    const bar = U.el("div", { class: "input-bar" });

    // 引用回复区
    if (opts.quote) {
      bar.appendChild(_renderQuote(opts.quote, opts.onCancelQuote));
    }

    const main = U.el("div", { class: "ib-main" });

    // 左侧 + 号：弹出工具箱小抽屉
    const plusBtn = U.el("button", { class: "ib-btn ib-plus", type: "button", html: global.Phone.IconLibrary.get("plus", { size: 22 }) });
    main.appendChild(plusBtn);

    // 左侧按钮：表情
    const emojiBtn = U.el("button", { class: "ib-btn", html: global.Phone.IconLibrary.get("smile", { size: 22 }) });
    main.appendChild(emojiBtn);

    // 中间输入框
    const inputWrap = U.el("div", { class: "ib-input-wrap" });
    const input = U.el("textarea", {
      class: "ib-input",
      placeholder: "说点什么吧～",
      rows: 1
    });
    if (opts.initialDraft) input.value = opts.initialDraft;
    inputWrap.appendChild(input);
    main.appendChild(inputWrap);

    // ---------- @ 提及浮层（仅群聊，规范第 9 节） ----------
    // 群聊时从输入框上方弹出成员选择，点击插入 @角色名
    let mentionLayer = null;
    function _ensureMentionLayer() {
      if (mentionLayer) return mentionLayer;
      mentionLayer = U.el("div", { class: "ib-mention-layer" });
      inputWrap.appendChild(mentionLayer);
      return mentionLayer;
    }
    function _closeMentionLayer() {
      if (mentionLayer) mentionLayer.classList.remove("open");
    }
    function _openMentionLayer(filterText) {
      if (groupMembers.length === 0) return; // 单聊不触发
      const layer = _ensureMentionLayer();
      U.empty(layer);
      const k = (filterText || "").toLowerCase();
      const filtered = groupMembers.filter((m) => {
        if (!k) return true;
        return (m.name || "AI").toLowerCase().includes(k);
      });
      if (filtered.length === 0) {
        _closeMentionLayer();
        return;
      }
      filtered.forEach((m) => {
        const item = U.el("div", { class: "ib-mention-item" });
        const av = U.el("div", { class: "ib-mention-avatar" });
        if (m.avatar) av.innerHTML = '<img src="' + m.avatar + '" alt=""/>';
        else av.textContent = (m.name || "AI").slice(0, 1);
        item.appendChild(av);
        item.appendChild(U.el("span", { class: "ib-mention-name", text: m.name || "AI" }));
        item.addEventListener("click", () => {
          _insertMention(m);
          _closeMentionLayer();
        });
        layer.appendChild(item);
      });
      requestAnimationFrame(() => layer.classList.add("open"));
    }
    // 插入 @角色名：把光标前最近的 @ 及其后的过滤文字替换成 @角色名
    function _insertMention(member) {
      const name = member.name || "AI";
      const before = input.value.slice(0, input.selectionStart);
      const after = input.value.slice(input.selectionEnd);
      // 找到最后一个 @
      const atIdx = before.lastIndexOf("@");
      if (atIdx < 0) return;
      const insert = "@" + name + " ";
      const newVal = before.slice(0, atIdx) + insert + after;
      input.value = newVal;
      const cursorPos = atIdx + insert.length;
      input.setSelectionRange(cursorPos, cursorPos);
      _autoResize();
      _updateSendBtn();
      input.focus();
      if (typeof opts.onMention === "function") {
        try { opts.onMention(member.id); } catch (_) {}
      }
    }
    // 检测光标前是否有未闭合的 @ 触发条件
    function _detectMention() {
      if (groupMembers.length === 0) { _closeMentionLayer(); return; }
      const pos = input.selectionStart;
      const before = input.value.slice(0, pos);
      // 找最后一个 @
      const atIdx = before.lastIndexOf("@");
      if (atIdx < 0) { _closeMentionLayer(); return; }
      // @ 必须在行首或前面是空白（避免匹配邮箱里的 @）
      const charBefore = atIdx > 0 ? before.charAt(atIdx - 1) : "";
      if (charBefore && !/\s/.test(charBefore)) { _closeMentionLayer(); return; }
      // @ 后到光标之间的文字（作为过滤词，且不能含空格/换行）
      const filterText = before.slice(atIdx + 1);
      if (/[\s\n]/.test(filterText)) { _closeMentionLayer(); return; }
      _openMentionLayer(filterText);
    }

    // 右侧：图片 / 语音 / 发送
    const imgBtn = U.el("button", { class: "ib-btn", html: global.Phone.IconLibrary.get("image", { size: 22 }) });
    const voiceBtn = U.el("button", { class: "ib-btn", html: global.Phone.IconLibrary.get("mic", { size: 22 }) });
    const sendBtn = U.el("button", { class: "ib-btn ib-send" + (input.value.trim() ? "" : " disabled"), html: global.Phone.IconLibrary.get("send", { size: 22 }) });
    main.appendChild(imgBtn);
    main.appendChild(voiceBtn);
    main.appendChild(sendBtn);

    bar.appendChild(main);

    // 工具箱小抽屉（+ 号触发，向上弹出，贴近输入栏上方）
    let toolbox = null;
    function _updatePlusIcon() {
      const open = toolbox && toolbox.isOpen();
      plusBtn.innerHTML = global.Phone.IconLibrary.get(open ? "close" : "plus", { size: 22 });
      plusBtn.classList.toggle("active", !!open);
    }
    if (global.Phone.Toolbox) {
      toolbox = global.Phone.Toolbox.mount({
        onEmoji: function () { emojiBtn.click(); },
        onImage: function () { imgBtn.click(); },
        onVoice: function () { voiceBtn.click(); },
        onFile: opts.onFile,
        onClearContext: opts.onClearContext,
        onSlash: opts.onSlash || function (cmd) { setText(cmd); },
        onGitHub: opts.onGitHub || function (action) { setText(action.cmd); },
        characterId: opts.characterId,
        conversationId: opts.conversationId,
      });
      bar.insertBefore(toolbox.el, main);
      plusBtn.addEventListener("click", function () {
        toolbox.toggle();
        _updatePlusIcon();
      });
    }

    // 表情面板
    let emojiPanel = null;
    emojiBtn.addEventListener("click", () => {
      if (emojiPanel && emojiPanel.classList.contains("open")) {
        emojiPanel.classList.remove("open");
        return;
      }
      if (!emojiPanel) {
        emojiPanel = U.el("div", { class: "ib-emoji-panel" });
        EMOJIS.forEach((e) => {
          const item = U.el("button", { class: "ib-emoji-item", text: e });
          item.addEventListener("click", () => {
            input.value += e;
            _autoResize();
            _updateSendBtn();
            input.focus();
          });
          emojiPanel.appendChild(item);
        });
        bar.insertBefore(emojiPanel, main);
      }
      requestAnimationFrame(() => emojiPanel.classList.add("open"));
    });

    // 图片选择
    const fileInput = U.el("input", { type: "file", accept: "image/*", style: "display:none" });
    bar.appendChild(fileInput);
    imgBtn.addEventListener("click", () => fileInput.click());
    fileInput.addEventListener("change", async () => {
      const f = fileInput.files[0];
      if (!f) return;
      const base64 = await U.fileToBase64(f);
      opts.onSend && opts.onSend({ type: "image", content: base64 });
      fileInput.value = "";
    });

    // 语音按钮（模拟）
    let recording = false;
    let recStart = 0;
    voiceBtn.addEventListener("click", () => {
      if (!recording) {
        recording = true;
        recStart = Date.now();
        voiceBtn.classList.add("recording");
        voiceBtn.innerHTML = global.Phone.IconLibrary.get("pause", { size: 22 });
        global.Phone.Notify.push({ appId: "chat", title: "开始录音（模拟）" });
      } else {
        recording = false;
        const dur = Math.max(1, Math.round((Date.now() - recStart) / 1000));
        voiceBtn.classList.remove("recording");
        voiceBtn.innerHTML = global.Phone.IconLibrary.get("mic", { size: 22 });
        opts.onSend && opts.onSend({ type: "voice", content: "[语音]", duration: dur });
      }
    });

    // 输入：自动高度 + 防抖保存草稿 + 打字状态
    let typingTimer = null;
    let lastTyping = 0;
    function _autoResize() {
      input.style.height = "auto";
      input.style.height = Math.min(input.scrollHeight, 96) + "px";
    }
    function _updateSendBtn() {
      sendBtn.classList.toggle("disabled", !input.value.trim());
    }
    function _saveDraft() {
      if (opts.onDraft) opts.onDraft(input.value);
    }
    input.addEventListener("input", () => {
      _autoResize();
      _updateSendBtn();
      // 打字状态（每 2 秒触发一次）
      const now = Date.now();
      if (now - lastTyping > 2000) {
        lastTyping = now;
        opts.onTyping && opts.onTyping();
      }
      clearTimeout(typingTimer);
      typingTimer = setTimeout(_saveDraft, 500);
      // 群聊 @ 检测
      _detectMention();
    });
    input.addEventListener("keydown", (e) => {
      // @ 浮层开启时，Escape 关闭；Enter 不立即发送（让用户先选）
      if (mentionLayer && mentionLayer.classList.contains("open")) {
        if (e.key === "Escape") {
          e.preventDefault();
          _closeMentionLayer();
          return;
        }
      }
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        _send();
      }
    });
    // 光标移动也要重新检测（keyup 拿到最新 selectionStart）
    input.addEventListener("keyup", (e) => {
      if (e.key === "ArrowLeft" || e.key === "ArrowRight" || e.key === "Home" || e.key === "End") {
        _detectMention();
      }
    });
    // 输入框聚焦时自动收起工具箱
    input.addEventListener("focus", () => {
      if (toolbox && toolbox.isOpen()) {
        toolbox.close();
        _updatePlusIcon();
      }
    });
    // 点击输入框外部关闭 @ 浮层（点击浮层本身不关，由 item click 处理）
    function _docClickHandler(e) {
      if (!mentionLayer || !mentionLayer.classList.contains("open")) return;
      if (inputWrap.contains(e.target)) return;
      _closeMentionLayer();
    }
    document.addEventListener("click", _docClickHandler);

    function _send() {
      const text = input.value.trim();
      if (!text) return;
      opts.onSend && opts.onSend({ type: "text", content: text });
      input.value = "";
      _autoResize();
      _updateSendBtn();
      _saveDraft();
      if (emojiPanel) emojiPanel.classList.remove("open");
      _closeMentionLayer();
    }
    sendBtn.addEventListener("click", _send);

    // Slash 指令 / GitHub 操作填入输入框：替换已有 /xxx 前缀，否则追加
    function setText(t) {
      const cur = input.value;
      if (/^\/\S*/.test(cur)) {
        input.value = t + " " + cur.replace(/^\/\S*\s*/, "");
      } else {
        input.value = cur ? (t + " " + cur) : t;
      }
      input.value = input.value.replace(/\s+$/, "");
      _autoResize();
      _updateSendBtn();
      input.focus();
    }

    _autoResize();
    _updateSendBtn();

    return {
      el: bar,
      focus: () => input.focus(),
      setText: (t) => setText(t),
      // 编辑消息回填：直接覆盖输入框内容（与 setText 的"追加/替换 /xxx 前缀"语义不同）
      setDraft: (text) => {
        input.value = text || "";
        _autoResize();
        _updateSendBtn();
        _saveDraft();
        input.focus();
      },
      setQuote: (q) => {
        const old = bar.querySelector(".ib-quote");
        if (old) old.remove();
        if (q) bar.insertBefore(_renderQuote(q, opts.onCancelQuote), main);
      },
      // 群聊成员变更时（加/删成员）动态更新 @ 浮层候选
      updateMembers: (members) => {
        groupMembers.length = 0;
        if (Array.isArray(members)) {
          members.forEach((m) => { if (m && m.id) groupMembers.push(m); });
        }
        if (groupMembers.length === 0) _closeMentionLayer();
      },
      destroy: () => {
        clearTimeout(typingTimer);
        document.removeEventListener("click", _docClickHandler);
        if (toolbox && toolbox.destroy) toolbox.destroy();
        if (bar.parentNode) bar.parentNode.removeChild(bar);
      }
    };
  }

  function _renderQuote(quote, onCancel) {
    const U = global.Phone.Utils;
    const q = U.el("div", { class: "ib-quote" }, [
      U.el("div", { class: "ibq-text", text: (quote.author || "引用") + "：" + quote.content }),
      U.el("button", { class: "ibq-cancel", html: global.Phone.IconLibrary.get("close", { size: 16 }) })
    ]);
    q.querySelector(".ibq-cancel").addEventListener("click", () => {
      q.remove();
      onCancel && onCancel();
    });
    return q;
  }

  // ---------- 暴露 ----------
  global.Phone = global.Phone || {};
  global.Phone.InputBar = { mount, EMOJIS };
})(window);
