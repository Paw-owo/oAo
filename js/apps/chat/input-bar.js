/* ============================================================
   input-bar.js — 输入工具栏
   文字输入 / 表情 / 附件 / 图片 / 语音 / 斜杠命令
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

  // 斜杠命令清单
  const COMMANDS = [
    { key: "/clear",     desc: "清空当前会话" },
    { key: "/export",    desc: "导出本次对话" },
    { key: "/regenerate",desc: "重新生成上一条" },
    { key: "/mode",      desc: "切换气泡 / 对话模式" },
    { key: "/help",      desc: "看看我都能做什么" },
  ];

  /**
   * 我（输入栏）渲染到容器
   * @param {object} opts {
   *   initialDraft, onSend(text|{type,content}), onTyping, quote,
   *   onCancelQuote, onDraft, onCommand
   * }
   */
  function mount(opts) {
    opts = opts || {};
    const U = global.Phone.Utils;

    const bar = U.el("div", { class: "input-bar" });

    // 引用回复区
    if (opts.quote) {
      bar.appendChild(_renderQuote(opts.quote, opts.onCancelQuote));
    }

    const main = U.el("div", { class: "ib-main" });

    // 左侧按钮：附件（在表情按钮左边）
    const attachBtn = U.el("button", {
      class: "ib-btn",
      html: global.Phone.IconLibrary.get("plus", { size: 22 }),
      title: "附件"
    });
    main.appendChild(attachBtn);

    // 表情按钮
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

    // 右侧：图片 / 语音 / 发送
    const imgBtn = U.el("button", { class: "ib-btn", html: global.Phone.IconLibrary.get("image", { size: 22 }) });
    const voiceBtn = U.el("button", { class: "ib-btn", html: global.Phone.IconLibrary.get("mic", { size: 22 }) });
    const sendBtn = U.el("button", { class: "ib-btn ib-send" + (input.value.trim() ? "" : " disabled"), html: global.Phone.IconLibrary.get("send", { size: 22 }) });
    main.appendChild(imgBtn);
    main.appendChild(voiceBtn);
    main.appendChild(sendBtn);

    bar.appendChild(main);

    // 表情面板
    let emojiPanel = null;
    emojiBtn.addEventListener("click", () => {
      _closeCmdPanel();
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

    // ---------- 附件菜单（图片 / 文件） ----------
    // 两个隐藏 file input：一个只选图片，一个任意文件
    const imgInput = U.el("input", { type: "file", accept: "image/*", style: "display:none" });
    const fileInput = U.el("input", { type: "file", style: "display:none" });
    bar.appendChild(imgInput);
    bar.appendChild(fileInput);

    attachBtn.addEventListener("click", () => {
      _closeEmojiPanel();
      _closeCmdPanel();
      global.Phone.Modal.actionSheet({
        title: "选择附件类型",
        items: [
          { label: "图片", icon: "image", fn: () => imgInput.click() },
          { label: "文件", icon: "app-memo", fn: () => fileInput.click() },
        ],
        cancelText: "取消",
      });
    });
    imgInput.addEventListener("change", async () => {
      const f = imgInput.files[0];
      if (!f) return;
      const base64 = await U.fileToBase64(f);
      opts.onSend && opts.onSend({ type: "image", content: base64, name: f.name, mime: f.type, size: f.size });
      imgInput.value = "";
    });
    fileInput.addEventListener("change", async () => {
      const f = fileInput.files[0];
      if (!f) return;
      const base64 = await U.fileToBase64(f);
      opts.onSend && opts.onSend({
        type: "file",
        content: base64,
        name: f.name,
        mime: f.type,
        size: f.size,
      });
      fileInput.value = "";
    });

    // 图片按钮（保持原行为：直接打开图片选择）
    imgBtn.addEventListener("click", () => {
      _closeEmojiPanel();
      _closeCmdPanel();
      imgInput.click();
    });

    // 语音按钮（模拟）
    let recording = false;
    let recStart = 0;
    voiceBtn.addEventListener("click", () => {
      _closeEmojiPanel();
      _closeCmdPanel();
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

    // ---------- 斜杠命令浮层 ----------
    let cmdPanel = null;
    let cmdHoverIdx = -1;

    function _openCmdPanel(query) {
      if (!cmdPanel) {
        cmdPanel = U.el("div", { class: "ib-cmd-panel" });
        bar.insertBefore(cmdPanel, main);
      }
      U.empty(cmdPanel);
      const q = (query || "").toLowerCase();
      const list = COMMANDS.filter((c) => !q || c.key.toLowerCase().indexOf(q) >= 0);
      if (list.length === 0) {
        _closeCmdPanel();
        return;
      }
      cmdHoverIdx = list.length ? 0 : -1;
      list.forEach((c, idx) => {
        const item = U.el("div", { class: "ib-cmd-item" + (idx === 0 ? " hover" : "") }, [
          U.el("span", { class: "ibc-key", text: c.key }),
          U.el("span", { class: "ibc-desc", text: c.desc }),
        ]);
        item.addEventListener("click", () => {
          _runCommand(c.key);
        });
        item.addEventListener("mouseenter", () => {
          cmdPanel.querySelectorAll(".ib-cmd-item").forEach((n) => n.classList.remove("hover"));
          item.classList.add("hover");
          cmdHoverIdx = idx;
        });
        cmdPanel.appendChild(item);
      });
      cmdPanel.style.display = "block";
    }
    function _closeCmdPanel() {
      if (cmdPanel) cmdPanel.style.display = "none";
      cmdHoverIdx = -1;
    }
    function _moveCmdHover(delta) {
      if (!cmdPanel || cmdPanel.style.display === "none") return false;
      const items = cmdPanel.querySelectorAll(".ib-cmd-item");
      if (items.length === 0) return false;
      cmdHoverIdx = (cmdHoverIdx + delta + items.length) % items.length;
      items.forEach((n, i) => n.classList.toggle("hover", i === cmdHoverIdx));
      items[cmdHoverIdx].scrollIntoView({ block: "nearest" });
      return true;
    }
    function _runCommand(key) {
      const cmd = key.replace(/^\//, "");
      input.value = "";
      _autoResize();
      _updateSendBtn();
      _closeCmdPanel();
      if (opts.onCommand) opts.onCommand(cmd);
    }
    function _runHoveredCommand() {
      if (!cmdPanel || cmdPanel.style.display === "none") return false;
      const items = cmdPanel.querySelectorAll(".ib-cmd-item");
      if (cmdHoverIdx < 0 || cmdHoverIdx >= items.length) return false;
      const keyEl = items[cmdHoverIdx].querySelector(".ibc-key");
      if (!keyEl) return false;
      _runCommand(keyEl.textContent);
      return true;
    }
    function _closeEmojiPanel() {
      if (emojiPanel) emojiPanel.classList.remove("open");
    }

    // 输入：自动高度 + 防抖保存草稿 + 打字状态 + 斜杠命令浮层
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
      // 斜杠命令浮层：以 / 开头时显示
      const v = input.value;
      if (v.charAt(0) === "/") {
        const spaceIdx = v.indexOf(" ");
        const query = spaceIdx === -1 ? v.slice(1) : "";
        _closeEmojiPanel();
        _openCmdPanel(query);
      } else {
        _closeCmdPanel();
      }
      // 打字状态（每 2 秒触发一次）
      const now = Date.now();
      if (now - lastTyping > 2000) {
        lastTyping = now;
        opts.onTyping && opts.onTyping();
      }
      clearTimeout(typingTimer);
      typingTimer = setTimeout(_saveDraft, 500);
    });
    input.addEventListener("keydown", (e) => {
      // 斜杠命令键盘导航：上下选 / 回车执行 / Esc 关闭
      if (cmdPanel && cmdPanel.style.display !== "none") {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          _moveCmdHover(1);
          return;
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          _moveCmdHover(-1);
          return;
        }
        if (e.key === "Enter" && !e.shiftKey) {
          // 命令浮层打开时，回车执行当前 hover 命令，不再当作普通发送
          e.preventDefault();
          _runHoveredCommand();
          return;
        }
        if (e.key === "Escape") {
          e.preventDefault();
          _closeCmdPanel();
          return;
        }
      }
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        _send();
      }
    });

    function _send() {
      const text = input.value.trim();
      if (!text) return;
      // 如果是 / 开头但浮层已关（例如直接输入完整命令回车），按斜杠命令处理
      if (text.charAt(0) === "/") {
        const spaceIdx = text.indexOf(" ");
        const key = spaceIdx === -1 ? text : text.slice(0, spaceIdx);
        const matched = COMMANDS.find((c) => c.key === key);
        if (matched) {
          _runCommand(key);
          return;
        }
        // 没匹配上的 /xxx 也清掉，不当作普通消息发出
        global.Phone.Notify.push({ appId: "chat", title: "不认识的命令：" + key });
        input.value = "";
        _autoResize();
        _updateSendBtn();
        _closeCmdPanel();
        return;
      }
      opts.onSend && opts.onSend({ type: "text", content: text });
      input.value = "";
      _autoResize();
      _updateSendBtn();
      _saveDraft();
      _closeEmojiPanel();
      _closeCmdPanel();
    }
    sendBtn.addEventListener("click", _send);

    _autoResize();
    _updateSendBtn();

    // 切换 onCommand 回调（mount 返回对象上挂一个 setOnCommand）
    let onCommandFn = opts.onCommand || null;

    return {
      el: bar,
      focus: () => input.focus(),
      setQuote: (q) => {
        const old = bar.querySelector(".ib-quote");
        if (old) old.remove();
        if (q) bar.insertBefore(_renderQuote(q, opts.onCancelQuote), main);
      },
      setOnCommand: (fn) => { onCommandFn = fn; opts.onCommand = fn; },
      get onCommand() { return onCommandFn; },
      set onCommand(fn) { onCommandFn = fn; opts.onCommand = fn; },
      destroy: () => {
        clearTimeout(typingTimer);
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
  global.Phone.InputBar = { mount, EMOJIS, COMMANDS };
})(window);
