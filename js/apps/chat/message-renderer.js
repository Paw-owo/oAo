/* ============================================================
   message-renderer.js — 消息渲染器
   两种模式：
     · bubble  气泡模式（对齐微信：左右气泡 + 头像）
     · dialog  对话模式（对齐 Kelivo：块状流 + Markdown + 思维链）
   能力：
     · Markdown 渲染（marked + highlight.js + KaTeX）
     · 剥离 <think> 标签，生成思维链总结卡 + 步骤卡
     · 长按操作：复制 / 引用回复 / 转发 / 撤回 / 收藏 / 删除
     · TTS 朗读切换
   挂在 window.Phone.MessageRenderer
   ============================================================ */
(function (global) {
  "use strict";

  // 我记住当前正在朗读的消息，方便朗读按钮切换图标
  let _speakingMsgId = null;
  let _speakingBtn = null;

  // 思维链关键词映射：基于模型真实 thinking 内容生成步骤（不凭空编造）
  // 命中哪类，就生成对应步骤；最多保留 5 步，每类只出现一次
  const CHAIN_RULES = [
    { re: /记(忆|得)|之前|回忆|想起|往事/, title: "我先翻了翻之前的记忆", intro: "我在找之前有没有聊过这件事", app: "memory" },
    { re: /图片|照片|看图|图里|截图/, title: "我看了看你发来的图片", intro: "我在参考图片里能确认的内容", app: "sensory" },
    { re: /语音|录音|声音|听你/, title: "我听了一下这段语音", intro: "我在整理语音里大概表达了什么", app: "sensory" },
    { re: /通知|提醒|横幅/, title: "我顺手整理了一下通知", intro: "我在判断要不要提醒你", app: "notification" },
    { re: /纪念|生日|日子|节日|今天(是|有没有)/, title: "我去看了一眼纪念日", intro: "我在确认今天是不是特别的日子", app: "anniversary" },
    { re: /钱包|余额|消费|买东西|花了/, title: "我确认了一下钱包相关信息", intro: "我在看和钱有关的部分", app: "wallet" },
    { re: /朋友圈|动态|发了/, title: "我翻了翻朋友圈", intro: "我在看最近有没有相关动态", app: "moments" },
    { re: /记仇|生气|原谅|不开心|惹/, title: "我翻了翻记仇本", intro: "我在看之前有没有不开心的记录", app: "grudge" },
    { re: /世界书|世界设定|设定/, title: "我翻了翻世界书", intro: "我在补充世界设定上下文", app: "worldbook" },
    { re: /角色|人设|性格|说话方式/, title: "我看了看角色资料", intro: "我在确认当前角色的设定", app: "character" },
    { re: /设置|开关|配置|主题/, title: "我检查了一下设置", intro: "我在确认相关功能的状态", app: "settings" },
    { re: /搜索|查一下|查找|网上的/, title: "我搜了搜相关信息", intro: "我在找能帮到你的内容", app: "search" },
  ];

  // ---------- TTS 朗读 ----------
  function _toggleSpeak(msg, btn) {
    const TTS = global.Phone.TTS;
    if (!TTS) return;
    try {
      if (_speakingMsgId === msg.id && TTS.isSpeaking()) {
        TTS.cancel();
        _resetSpeakBtn();
      } else {
        TTS.cancel();
        _speakingMsgId = msg.id;
        _speakingBtn = btn;
        btn.innerHTML = global.Phone.IconLibrary.get("volume-mute", { size: 14 });
        btn.classList.add("speaking");
        // 朗读时用纯文本，不念 Markdown 符号
        TTS.speak(_plainText(msg.content || ""), {
          onEnd: () => { _resetSpeakBtn(); },
        });
      }
    } catch (e) {
      console.warn("[MessageRenderer] TTS 朗读失败", e);
      _resetSpeakBtn();
    }
  }

  function _resetSpeakBtn() {
    _speakingMsgId = null;
    if (_speakingBtn) {
      _speakingBtn.innerHTML = global.Phone.IconLibrary.get("volume", { size: 14 });
      _speakingBtn.classList.remove("speaking");
      _speakingBtn = null;
    }
  }

  // ---------- <think> 标签剥离 ----------
  // 兼容 <think>...</think> 和 <think >...</think >（aiThinkTag 默认带空格）
  // 返回 { clean: 去掉 think 后的正文, thinking: think 里的内容 }
  function _stripThink(content) {
    if (!content) return { clean: "", thinking: "" };
    let thinking = "";
    let clean = String(content).replace(/<think\s*>([\s\S]*?)<\/think\s*>/gi, (m, p1) => {
      thinking += p1;
      return "";
    });
    // 流式被打断时可能只有 <think> 无 </think>，把后续都归入 thinking
    const openIdx = clean.search(/<think\s*>/i);
    if (openIdx >= 0) {
      thinking += clean.slice(openIdx).replace(/<think\s*>/i, "");
      clean = clean.slice(0, openIdx);
    }
    return { clean: clean.trim(), thinking: thinking.trim() };
  }

  // ---------- Markdown 渲染 ----------
  function _renderMarkdown(text) {
    if (!text) return "";
    if (typeof global.marked !== "function" && typeof global.marked?.parse !== "function") {
      // 没加载到 marked，降级为转义 + 换行
      return global.Phone.Utils.escapeHtml(text).replace(/\n/g, "<br>");
    }
    try {
      const html = global.marked.parse(text, { breaks: true, gfm: true });
      return html;
    } catch (e) {
      return global.Phone.Utils.escapeHtml(text).replace(/\n/g, "<br>");
    }
  }

  // 对已插入 DOM 的容器做代码高亮 + 公式渲染
  // 流式进行中（streaming=true）跳过，避免性能抖动；完成后再做
  function _enhanceMarkdown(container, streaming) {
    if (!container) return;
    try {
      if (global.hljs && !streaming) {
        container.querySelectorAll("pre code").forEach((el) => {
          try { global.hljs.highlightElement(el); } catch (_) {}
        });
      }
    } catch (_) {}
    try {
      if (global.renderMathInElement && !streaming) {
        global.renderMathInElement(container, {
          delimiters: [
            { left: "$$", right: "$$", display: true },
            { left: "\\[", right: "\\]", display: true },
            { left: "\\(", right: "\\)", display: false },
            { left: "$", right: "$", display: false },
          ],
          ignoredTags: ["script", "noscript", "style", "textarea", "pre", "code"],
          throwOnError: false,
        });
      }
    } catch (_) {}
  }

  // 把 Markdown 内容拍平成纯文本（TTS 朗读用，不念符号）
  function _plainText(text) {
    if (!text) return "";
    return String(text)
      .replace(/<think\s*>[\s\S]*?<\/think\s*>/gi, "")
      .replace(/```[\s\S]*?```/g, (m) => m.replace(/```/g, "").replace(/^\w*\n/, ""))
      .replace(/`([^`]+)`/g, "$1")
      .replace(/\$\$?([\s\S]+?)\$\$?/g, "$1")
      .replace(/[*_#>|~\-]/g, "")
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  // ---------- 思维链生成 ----------
  // 基于 thinking 真实内容生成步骤，不编造。无命中时只给收尾一步。
  function _buildChain(thinking, status) {
    if (!thinking) return null;
    const steps = [];
    const usedApps = {};
    const text = thinking.slice(0, 2000); // 只看前 2000 字，够提取关键词
    CHAIN_RULES.forEach((rule) => {
      if (steps.length >= 5) return;
      if (usedApps[rule.app]) return;
      if (rule.re.test(text)) {
        steps.push({
          title: rule.title,
          intro: rule.intro,
          status: status || "done",
          app: rule.app,
        });
        usedApps[rule.app] = true;
      }
    });
    // 收尾步：组织回复
    steps.push({
      title: "我整理好回答发给你",
      intro: "我在把这些信息整理成能直接说给你的话",
      status: status || "done",
      app: "reply",
    });

    // 总结摘要：取 thinking 的第一句话，截断
    const firstLine = thinking.split(/\n|。|！|？|\.\s/)[0] || "";
    const summary = firstLine.length > 40 ? firstLine.slice(0, 40) + "…" : (firstLine || "我想了一下再回复你");

    return {
      show: true,
      summary: "我想了一下",
      intro: summary,
      status: status || "done",
      steps: steps,
    };
  }

  // 渲染思维链卡（总结卡 + 可展开步骤）
  function _renderChain(chain, msg) {
    const U = global.Phone.Utils;
    const wrap = U.el("div", { class: "chain", dataset: { id: msg.id } });

    // 总结卡
    const summary = U.el("div", { class: "chain-summary" });
    summary.appendChild(U.el("div", { class: "chain-summary-icon", html: global.Phone.IconLibrary.get("sb-paw", { size: 16 }) }));
    const summaryText = U.el("div", { class: "chain-summary-text" });
    summaryText.appendChild(U.el("div", { class: "chain-summary-title", text: chain.summary }));
    summaryText.appendChild(U.el("div", { class: "chain-summary-intro", text: chain.intro }));
    summary.appendChild(summaryText);

    const meta = U.el("div", { class: "chain-summary-meta" });
    meta.appendChild(U.el("span", { class: "chain-step-count", text: "用了 " + chain.steps.length + " 步" }));
    meta.appendChild(U.el("span", { class: "chain-status chain-status-" + chain.status, text: _statusLabel(chain.status) }));
    summary.appendChild(meta);
    summary.appendChild(U.el("div", { class: "chain-toggle", html: global.Phone.IconLibrary.get("chevron-down", { size: 16 }) }));
    wrap.appendChild(summary);

    // 步骤列表
    const stepsEl = U.el("div", { class: "chain-steps hidden" });
    chain.steps.forEach((s, i) => {
      const step = U.el("div", { class: "chain-step" });
      step.appendChild(U.el("div", { class: "chain-step-dot" }));
      const card = U.el("div", { class: "chain-step-card" });
      const head = U.el("div", { class: "chain-step-head" });
      head.appendChild(U.el("span", { class: "chain-step-title", text: s.title }));
      head.appendChild(U.el("span", { class: "chain-step-status chain-step-status-" + s.status, text: _statusLabel(s.status) }));
      card.appendChild(head);
      card.appendChild(U.el("div", { class: "chain-step-intro", text: s.intro }));
      step.appendChild(card);
      stepsEl.appendChild(step);
    });
    wrap.appendChild(stepsEl);

    // 展开收起
    summary.addEventListener("click", () => {
      const hidden = stepsEl.classList.toggle("hidden");
      summary.classList.toggle("expanded", !hidden);
      const tog = summary.querySelector(".chain-toggle");
      if (tog) tog.innerHTML = global.Phone.IconLibrary.get(hidden ? "chevron-down" : "chevron-up", { size: 16 });
    });

    return wrap;
  }

  function _statusLabel(s) {
    return ({ running: "进行中", done: "已完成", skipped: "已跳过", failed: "失败", closed: "已关闭" })[s] || "已完成";
  }

  // ---------- 渲染单条消息 ----------
  /**
   * @param {object} msg { id, role, content, type, createdAt, status, quote, thinking, pending }
   * @param {object} ctx { mode: 'bubble'|'dialog', character, onAction, streaming }
   */
  function render(msg, ctx) {
    ctx = ctx || {};
    const U = global.Phone.Utils;
    const isMe = msg.role === "user";
    const mode = ctx.mode || "bubble";
    const streaming = ctx.streaming || msg.pending;

    const wrap = U.el("div", {
      class: "msg " + (mode === "bubble" ? "msg-bubble" : "msg-dialog")
        + (isMe ? " msg-me" : " msg-them")
        + (msg.pending ? " msg-pending" : ""),
      dataset: { id: msg.id, role: msg.role }
    });

    // dialog 模式：顶部头像 + 名字 + 时间一行
    if (mode === "dialog") {
      const header = U.el("div", { class: "msg-dialog-head" });
      const avatar = _renderAvatar(isMe, ctx.character);
      header.appendChild(avatar);
      const headInfo = U.el("div", { class: "msg-dialog-headinfo" });
      headInfo.appendChild(U.el("span", { class: "msg-dialog-name", text: isMe ? "我" : ((ctx.character && ctx.character.name) || "AI") }));
      headInfo.appendChild(U.el("span", { class: "msg-dialog-time", text: U.fmtHM(msg.createdAt || Date.now()) }));
      header.appendChild(headInfo);
      wrap.appendChild(header);
    } else {
      // bubble 模式：左侧（AI）或右侧（我）头像
      wrap.appendChild(_renderAvatar(isMe, ctx.character));
    }

    // 主体
    const body = U.el("div", { class: "msg-body" });

    // 引用（如果有）
    if (msg.quote) {
      const quote = U.el("div", { class: "msg-quote" }, [
        U.el("span", { class: "mq-author", text: msg.quote.author || "引用" }),
        U.el("div", { class: "mq-text", text: msg.quote.content })
      ]);
      body.appendChild(quote);
    }

    // 思维链（仅 AI 消息，且有 thinking，且总开关开）
    if (!isMe) {
      const { clean, thinking: tagThink } = _stripThink(msg.content || "");
      const thinking = msg.thinking || tagThink;
      if (thinking && _chainEnabled()) {
        const chainStatus = msg.pending ? "running" : (msg.status === "failed" ? "failed" : "done");
        const chain = _buildChain(thinking, chainStatus);
        if (chain) body.appendChild(_renderChain(chain, msg));
      }
    }

    // 内容气泡
    const bubble = U.el("div", { class: "msg-bubble-text" });
    if (msg.type === "image") {
      bubble.appendChild(U.el("img", { class: "msg-image", src: msg.content, alt: "图片" }));
    } else if (msg.type === "voice") {
      bubble.appendChild(_renderVoice(msg));
    } else {
      // AI 消息剥离 <think> 后渲染；用户消息直接渲染
      let renderText = msg.content || "";
      if (!isMe) {
        renderText = _stripThink(renderText).clean;
      }
      if (streaming && renderText === "") {
        bubble.appendChild(U.el("div", { class: "msg-typing-dots" }, [
          U.el("span"), U.el("span"), U.el("span")
        ]));
      } else {
        bubble.innerHTML = _renderMarkdown(renderText);
        _enhanceMarkdown(bubble, streaming);
      }
    }
    body.appendChild(bubble);

    // 状态 / 时间 / 朗读
    const meta = U.el("div", { class: "msg-meta" });
    if (isMe && msg.status === "sending") {
      meta.appendChild(U.el("span", { class: "msg-status", text: "发送中" }));
    } else if (isMe && msg.status === "failed") {
      meta.appendChild(U.el("span", { class: "msg-status msg-status-fail", text: "发送失败" }));
    }
    // dialog 模式时间已在头部显示，气泡下不重复
    if (mode !== "dialog") {
      meta.appendChild(U.el("span", { class: "msg-time", text: U.fmtHM(msg.createdAt || Date.now()) }));
    }

    // AI 文本消息加朗读按钮
    if (!isMe && msg.type === "text" && !msg.pending && msg.content) {
      const isSpeaking = _speakingMsgId === msg.id;
      const speakBtn = U.el("button", {
        class: "msg-speak-btn" + (isSpeaking ? " speaking" : ""),
        html: global.Phone.IconLibrary.get(isSpeaking ? "volume-mute" : "volume", { size: 14 }),
        title: isSpeaking ? "停止朗读" : "朗读",
      });
      speakBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        _toggleSpeak(msg, speakBtn);
      });
      meta.appendChild(speakBtn);
    }
    if (meta.childNodes.length) body.appendChild(meta);

    wrap.appendChild(body);

    // 长按操作
    let pressTimer = null;
    const startPress = (e) => {
      pressTimer = setTimeout(() => { _showActionSheet(msg, ctx); }, 500);
    };
    const cancelPress = () => clearTimeout(pressTimer);
    wrap.addEventListener("touchstart", startPress, { passive: true });
    wrap.addEventListener("touchend", cancelPress);
    wrap.addEventListener("touchmove", cancelPress, { passive: true });
    wrap.addEventListener("mousedown", startPress);
    wrap.addEventListener("mouseup", cancelPress);
    wrap.addEventListener("mouseleave", cancelPress);
    wrap.addEventListener("contextmenu", (e) => { e.preventDefault(); _showActionSheet(msg, ctx); });

    return wrap;
  }

  function _renderAvatar(isMe, character) {
    const U = global.Phone.Utils;
    const avatar = U.el("div", { class: "msg-avatar" });
    if (isMe) {
      avatar.textContent = "我";
    } else if (character) {
      if (character.avatar) {
        avatar.innerHTML = '<img src="' + character.avatar + '" alt=""/>';
      } else {
        avatar.textContent = (character.name || "AI").slice(0, 1);
      }
    }
    return avatar;
  }

  // 思维链总开关：读全局设置 showThinking（归 settings-center 管，这里只读）
  function _chainEnabled() {
    try {
      const State = global.Phone.State;
      if (State && typeof State.get === "function") {
        return State.get("showThinking") === true;
      }
    } catch (_) {}
    return false;
  }

  function _renderVoice(msg) {
    const U = global.Phone.Utils;
    const wrap = U.el("div", { class: "msg-voice" });
    wrap.appendChild(U.el("span", { class: "mv-icon", html: global.Phone.IconLibrary.get("mic", { size: 18 }) }));
    wrap.appendChild(U.el("span", { class: "mv-dur", text: (msg.duration || 3) + "''" }));
    wrap.addEventListener("click", () => {
      wrap.classList.add("playing");
      setTimeout(() => wrap.classList.remove("playing"), (msg.duration || 3) * 1000);
    });
    return wrap;
  }

  // ---------- 长按操作面板 ----------
  function _showActionSheet(msg, ctx) {
    const U = global.Phone.Utils;
    if (document.querySelector(".sheet-mask")) return;

    const isMe = msg.role === "user";
    const actions = [];

    actions.push({ icon: "copy", label: "复制", fn: () => {
      _copyText(_plainText(msg.content));
      global.Phone.Notify.push({ appId: "chat", title: "已复制到剪贴板" });
    }});
    actions.push({ icon: "quote", label: "引用回复", fn: () => {
      if (ctx.onAction) ctx.onAction("quote", msg);
    }});
    if (!isMe && !msg.pending && msg.type === "text") {
      actions.push({ icon: "refresh", label: "重新生成", fn: () => {
        if (ctx.onAction) ctx.onAction("regenerate", msg);
      }});
    }
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
    const U = global.Phone.Utils;
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
    stripThink: _stripThink,       // 暴露给 conversation.js 流式时剥离用
    enhanceMarkdown: _enhanceMarkdown,
    plainText: _plainText,
  };
})(window);
