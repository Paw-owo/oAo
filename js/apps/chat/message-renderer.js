/* ============================================================
   message-renderer.js — 消息渲染器
   把消息对象渲染成 DOM（气泡 / 对话两种模式）
   长按操作：复制 / 引用回复 / 转发 / 撤回 / 删除 / 收藏
   挂在 window.Phone.MessageRenderer
   ============================================================ */
(function (global) {
  "use strict";

  // 我记住当前正在朗读的消息，方便朗读按钮切换图标
  let _speakingMsgId = null;
  let _speakingBtn = null;

  // 我切换某条消息的朗读 / 停止朗读
  function _toggleSpeak(msg, btn) {
    const TTS = global.Phone.TTS;
    if (!TTS) return;
    try {
      if (_speakingMsgId === msg.id && TTS.isSpeaking()) {
        // 我停止朗读这条消息
        TTS.cancel();
        _resetSpeakBtn();
      } else {
        // 我先停掉别的，再朗读这条
        TTS.cancel();
        _speakingMsgId = msg.id;
        _speakingBtn = btn;
        btn.innerHTML = global.Phone.IconLibrary.get("volume-mute", { size: 14 });
        btn.classList.add("speaking");
        TTS.speak(msg.content || "", {
          onEnd: () => { _resetSpeakBtn(); },
        });
      }
    } catch (e) {
      console.warn("[MessageRenderer] TTS 朗读失败", e);
      _resetSpeakBtn();
    }
  }

  // 我把朗读按钮恢复成默认（小喇叭）状态
  function _resetSpeakBtn() {
    _speakingMsgId = null;
    if (_speakingBtn) {
      _speakingBtn.innerHTML = global.Phone.IconLibrary.get("volume", { size: 14 });
      _speakingBtn.classList.remove("speaking");
      _speakingBtn = null;
    }
  }

  /**
   * 我（渲染器）渲染单条消息
   * @param {object} msg { id, role, content, type, createdAt, status, quote }
   * @param {object} ctx { mode: 'bubble'|'dialog', character, onAction }
   */
  function render(msg, ctx) {
    ctx = ctx || {};
    const U = global.Phone.Utils;
    const isMe = msg.role === "user";
    const mode = ctx.mode || "bubble";

    const wrap = U.el("div", {
      class: "msg " + (mode === "bubble" ? "msg-bubble" : "msg-dialog")
        + (isMe ? " msg-me" : " msg-them")
        + (msg.pending ? " msg-pending" : ""),
      dataset: { id: msg.id, role: msg.role }
    });

    // 时间分组提示由上层处理，这里只渲染单条

    // 头像（仅气泡模式）
    if (mode === "bubble") {
      const avatar = U.el("div", { class: "msg-avatar" });
      if (isMe) {
        avatar.textContent = "我";
        avatar.style.background = "var(--grad-accent)";
        avatar.style.color = "#FFF";
      } else if (ctx.character) {
        if (ctx.character.avatar) {
          avatar.innerHTML = '<img src="' + ctx.character.avatar + '" alt=""/>';
        } else {
          avatar.textContent = (ctx.character.name || "AI").slice(0, 1);
          avatar.style.background = "var(--grad-primary)";
        }
      }
      wrap.appendChild(avatar);
    }

    // 主体
    const body = U.el("div", { class: "msg-body" });

    // 引用（如果有）
    if (msg.quote) {
      const quote = U.el("div", { class: "msg-quote" }, [
        U.el("span", { text: msg.quote.author || "引用" }),
        U.el("div", { class: "mq-text", text: msg.quote.content })
      ]);
      body.appendChild(quote);
    }

    // 内容气泡
    const bubble = U.el("div", { class: "msg-bubble-text" });
    if (msg.type === "image") {
      bubble.appendChild(U.el("img", { class: "msg-image", src: msg.content, alt: "图片" }));
    } else if (msg.type === "voice") {
      bubble.appendChild(_renderVoice(msg));
    } else {
      bubble.innerHTML = _formatText(msg.content || "");
    }
    if (msg.pending && msg.content === "") {
      bubble.appendChild(U.el("div", { class: "msg-typing-dots" }, [
        U.el("span"), U.el("span"), U.el("span")
      ]));
    }
    body.appendChild(bubble);

    // 状态 / 时间
    const meta = U.el("div", { class: "msg-meta" });
    if (isMe && msg.status === "sending") {
      meta.appendChild(U.el("span", { class: "msg-status", text: "发送中" }));
    } else if (isMe && msg.status === "failed") {
      meta.appendChild(U.el("span", { class: "msg-status msg-status-fail", text: "发送失败" }));
    }
    meta.appendChild(U.el("span", { class: "msg-time", text: U.fmtHM(msg.createdAt || Date.now()) }));

    // 我给 AI 的文本消息加一个朗读按钮（点击念出来，再点停止）
    if (!isMe && msg.type === "text" && !msg.pending && msg.content) {
      const isSpeaking = _speakingMsgId === msg.id;
      const speakBtn = U.el("button", {
        class: "msg-speak-btn" + (isSpeaking ? " speaking" : ""),
        style: {
          background: "none",
          border: "none",
          padding: "0 0 0 4px",
          cursor: "pointer",
          opacity: isSpeaking ? "1" : "0.55",
          display: "inline-flex",
          verticalAlign: "middle",
          color: "var(--text-secondary, #999)",
          lineHeight: "0",
        },
        html: global.Phone.IconLibrary.get(isSpeaking ? "volume-mute" : "volume", { size: 14 }),
      });
      speakBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        _toggleSpeak(msg, speakBtn);
      });
      meta.appendChild(speakBtn);
    }

    body.appendChild(meta);

    wrap.appendChild(body);

    // 长按操作
    let pressTimer = null;
    const startPress = (e) => {
      pressTimer = setTimeout(() => {
        _showActionSheet(msg, ctx);
      }, 500);
    };
    const cancelPress = () => clearTimeout(pressTimer);
    wrap.addEventListener("touchstart", startPress);
    wrap.addEventListener("touchend", cancelPress);
    wrap.addEventListener("touchmove", cancelPress);
    wrap.addEventListener("mousedown", startPress);
    wrap.addEventListener("mouseup", cancelPress);
    wrap.addEventListener("mouseleave", cancelPress);
    wrap.addEventListener("contextmenu", (e) => { e.preventDefault(); _showActionSheet(msg, ctx); });

    return wrap;
  }

  function _formatText(text) {
    return global.Phone.Utils.escapeHtml(text).replace(/\n/g, "<br>");
  }

  function _renderVoice(msg) {
    const U = global.Phone.Utils;
    const wrap = U.el("div", { class: "msg-voice" });
    wrap.appendChild(U.el("span", { class: "mv-icon", html: global.Phone.IconLibrary.get("mic", { size: 18 }) }));
    wrap.appendChild(U.el("span", { class: "mv-dur", text: (msg.duration || 3) + "''" }));
    wrap.addEventListener("click", () => {
      // 模拟播放（实际无音频文件）
      wrap.classList.add("playing");
      setTimeout(() => wrap.classList.remove("playing"), (msg.duration || 3) * 1000);
    });
    return wrap;
  }

  // 长按操作面板
  function _showActionSheet(msg, ctx) {
    const U = global.Phone.Utils;
    if (document.querySelector(".sheet-mask")) return;

    const isMe = msg.role === "user";
    const actions = [];

    actions.push({ icon: "copy", label: "复制", fn: () => {
      _copyText(msg.content);
      global.Phone.Notify.push({ appId: "chat", title: "已复制到剪贴板" });
    }});
    actions.push({ icon: "quote", label: "引用回复", fn: () => {
      if (ctx.onAction) ctx.onAction("quote", msg);
    }});
    actions.push({ icon: "forward", label: "转发", fn: () => {
      if (ctx.onAction) ctx.onAction("forward", msg);
    }});
    if (isMe && !msg.pending) {
      actions.push({ icon: "refresh", label: "撤回", fn: () => {
        if (ctx.onAction) ctx.onAction("recall", msg);
      }});
    }
    actions.push({ icon: "archive", label: "收藏", fn: () => {
      if (ctx.onAction) ctx.onAction("favorite", msg);
      global.Phone.Notify.push({ appId: "chat", title: "已收藏" });
    }});
    actions.push({ icon: "trash", label: "删除", danger: true, fn: () => {
      if (ctx.onAction) ctx.onAction("delete", msg);
    }});

    const mask = U.el("div", { class: "sheet-mask" });
    const sheet = U.el("div", { class: "sheet" });
    sheet.appendChild(U.el("div", { class: "sheet-handle" }));
    actions.forEach((a) => {
      const item = U.el("div", { class: "sheet-item" + (a.danger ? " danger" : "") });
      item.innerHTML = global.Phone.IconLibrary.get(a.icon, { size: 20 });
      item.appendChild(document.createTextNode(a.label));
      item.addEventListener("click", () => {
        try { a.fn(); } catch (e) { console.warn(e); }
        mask.remove();
      });
      sheet.appendChild(item);
    });
    const cancel = U.el("div", { class: "sheet-cancel", text: "取消" });
    cancel.addEventListener("click", () => mask.remove());
    sheet.appendChild(cancel);
    mask.appendChild(sheet);
    mask.addEventListener("click", (e) => { if (e.target === mask) mask.remove(); });
    document.body.appendChild(mask);
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

  // 渲染时间分组标签
  function renderTimeDivider(ts) {
    const U = global.Phone.Utils;
    return U.el("div", { class: "msg-time-divider" }, [
      U.el("span", { text: _timeLabel(ts) })
    ]);
  }

  function _timeLabel(ts) {
    const now = new Date();
    const d = new Date(ts);
    const isToday = now.toDateString() === d.toDateString();
    const yesterday = new Date(now.getTime() - 86400000).toDateString() === d.toDateString();
    if (isToday) return U.fmtHM(ts);
    if (yesterday) return "昨天 " + U.fmtHM(ts);
    if (now.getFullYear() === d.getFullYear()) return (d.getMonth() + 1) + "月" + d.getDate() + "日";
    return U.fmtDate(ts);
  }

  // ---------- 暴露 ----------
  global.Phone = global.Phone || {};
  global.Phone.MessageRenderer = {
    render: render,
    renderTimeDivider: renderTimeDivider,
  };
})(window);
