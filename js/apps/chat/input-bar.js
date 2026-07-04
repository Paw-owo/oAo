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
   *   onCancelQuote
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
    });
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        _send();
      }
    });

    function _send() {
      const text = input.value.trim();
      if (!text) return;
      opts.onSend && opts.onSend({ type: "text", content: text });
      input.value = "";
      _autoResize();
      _updateSendBtn();
      _saveDraft();
      if (emojiPanel) emojiPanel.classList.remove("open");
    }
    sendBtn.addEventListener("click", _send);

    _autoResize();
    _updateSendBtn();

    return {
      el: bar,
      focus: () => input.focus(),
      setQuote: (q) => {
        const old = bar.querySelector(".ib-quote");
        if (old) old.remove();
        if (q) bar.insertBefore(_renderQuote(q, opts.onCancelQuote), main);
      },
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
  global.Phone.InputBar = { mount, EMOJIS };
})(window);
