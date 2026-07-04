/* ============================================================
   message-renderer.js — 消息渲染器
   把消息对象渲染成 DOM（气泡 / 对话两种模式）
   长按操作：复制 / 引用回复 / 转发 / 撤回 / 删除 / 收藏
   dialog 模式：轻量 Markdown 渲染 + 底部操作按钮
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
        btn.classList.add("active");
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
      _speakingBtn.classList.remove("active");
      _speakingBtn = null;
    }
  }

  /**
   * 我（渲染器）渲染单条消息
   * @param {object} msg { id, role, content, type, createdAt, status, quote, thinking }
   * @param {object} ctx { mode: 'bubble'|'dialog', character, onAction, showAvatar, showThinking }
   *   showAvatar: 默认 true；false 时不渲染 .msg-avatar
   *   showThinking: 默认 false；true 时若 msg.thinking 有内容则渲染思维链折叠区
   */
  function render(msg, ctx) {
    ctx = ctx || {};
    const U = global.Phone.Utils;
    const isMe = msg.role === "user";
    const mode = ctx.mode || "bubble";
    const showAvatar = ctx.showAvatar !== false;

    // 系统消息：居中胶囊，无头像无 meta
    if (msg.type === "system") {
      return U.el("div", {
        class: "msg msg-system",
        dataset: { id: msg.id, role: msg.role }
      }, [ U.el("span", { text: msg.content || "" }) ]);
    }

    const wrap = U.el("div", {
      class: "msg " + (mode === "bubble" ? "msg-bubble" : "msg-dialog")
        + (isMe ? " msg-me" : " msg-them")
        + (msg.pending ? " msg-pending" : "")
        + (msg.type ? " msg-type-" + msg.type : ""),
      dataset: { id: msg.id, role: msg.role }
    });

    // 时间分组提示由上层处理，这里只渲染单条

    // 头像（仅气泡模式且 showAvatar=true 时渲染；圆形 36x36）
    if (mode === "bubble" && showAvatar) {
      const avatar = U.el("div", { class: "msg-avatar" });
      if (isMe) {
        avatar.textContent = "我";
      } else if (ctx.character) {
        if (ctx.character.avatar) {
          avatar.innerHTML = '<img src="' + ctx.character.avatar + '" alt=""/>';
        } else {
          avatar.textContent = (ctx.character.name || "AI").slice(0, 1);
        }
      }
      wrap.appendChild(avatar);
    }

    // 主体
    const body = U.el("div", { class: "msg-body" });

    // dialog 模式：卡片头部（AI 头像+名字 / 用户"我"标识）
    if (mode === "dialog") {
      body.appendChild(_renderDialogHead(msg, ctx));
    }

    // 引用（如果有）
    if (msg.quote) {
      const quote = U.el("div", { class: "msg-quote" }, [
        U.el("span", { text: msg.quote.author || "引用" }),
        U.el("div", { class: "mq-text", text: msg.quote.content })
      ]);
      body.appendChild(quote);
    }

    // 思维链区域（AI 文本消息且开启 showThinking 时显示；优先用 per-conv 设置）
    if (!isMe && msg.thinking && ctx.showThinking) {
      body.appendChild(_renderThinking(msg.thinking, msg.thinkingStreaming));
      body.appendChild(U.el("div", { class: "msg-thinking-divider" }));
    }

    // 内容气泡
    const bubble = U.el("div", { class: "msg-bubble-text" });
    let renderedMd = false;
    if (msg.type === "image") {
      bubble.appendChild(U.el("img", { class: "msg-image", src: msg.content, alt: "图片" }));
    } else if (msg.type === "voice") {
      bubble.appendChild(_renderVoice(msg));
    } else if (msg.type === "file") {
      bubble.appendChild(_renderFile(msg));
    } else if (msg.type === "transfer") {
      bubble.classList.add("msg-bubble-card");
      bubble.style.padding = "0";
      bubble.style.background = "transparent";
      bubble.style.boxShadow = "none";
      bubble.appendChild(_renderTransfer(msg, ctx));
    } else if (msg.type === "gift") {
      bubble.classList.add("msg-bubble-card");
      bubble.style.padding = "0";
      bubble.style.background = "transparent";
      bubble.style.boxShadow = "none";
      bubble.appendChild(_renderGift(msg, ctx));
    } else if (msg.type === "location") {
      bubble.classList.add("msg-bubble-card");
      bubble.style.padding = "0";
      bubble.style.background = "transparent";
      bubble.style.boxShadow = "none";
      bubble.appendChild(_renderLocation(msg));
    } else if (msg.type === "card") {
      bubble.classList.add("msg-bubble-card");
      bubble.style.padding = "0";
      bubble.style.background = "transparent";
      bubble.style.boxShadow = "none";
      bubble.appendChild(_renderCharCard(msg, ctx));
    } else if (msg.type === "dice") {
      bubble.classList.add("msg-bubble-card");
      bubble.style.padding = "0";
      bubble.style.background = "transparent";
      bubble.style.boxShadow = "none";
      bubble.appendChild(_renderDice(msg));
    } else if (msg.type === "rps") {
      bubble.classList.add("msg-bubble-card");
      bubble.style.padding = "0";
      bubble.style.background = "transparent";
      bubble.style.boxShadow = "none";
      bubble.appendChild(_renderRps(msg));
    } else if (msg.type === "sticker") {
      bubble.appendChild(_renderSticker(msg));
    } else {
      // 文本消息：dialog 模式用完整 Markdown；bubble 模式只解析行内 md（粗体/斜体/行内代码）
      if (mode === "dialog") {
        bubble.innerHTML = _renderMarkdown(msg.content || "");
        renderedMd = true;
      } else {
        bubble.innerHTML = _renderInlineOnly(msg.content || "");
      }
    }
    if (msg.pending && (msg.content === "" || msg.content == null) && msg.type === "text") {
      bubble.appendChild(U.el("div", { class: "msg-typing-dots" }, [
        U.el("span"), U.el("span"), U.el("span")
      ]));
    }
    body.appendChild(bubble);

    // 给代码块的"复制"按钮挂监听（innerHTML 设置后才能查询）
    if (renderedMd) {
      bubble.querySelectorAll(".md-code-copy").forEach((btn) => {
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          const code = btn.getAttribute("data-code") || "";
          _copyText(code);
          global.Phone.Notify.push({ appId: "chat", title: "已复制" });
        });
      });
    }

    // 状态 / 时间
    const meta = U.el("div", { class: "msg-meta" });
    if (isMe && msg.status === "sending") {
      meta.appendChild(U.el("span", {
        class: "msg-status msg-status-sending",
        html: global.Phone.IconLibrary.get("refresh", { size: 12 }),
        title: "发送中"
      }));
    } else if (isMe && msg.status === "failed") {
      const failBtn = U.el("button", {
        class: "msg-status msg-status-fail",
        html: global.Phone.IconLibrary.get("warning", { size: 14 }),
        title: "发送失败，点击重发"
      });
      failBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (ctx.onAction) ctx.onAction("resend", msg);
      });
      meta.appendChild(failBtn);
    }
    meta.appendChild(U.el("span", { class: "msg-time", text: U.fmtHM(msg.createdAt || Date.now()) }));

    // 我给 AI 的文本消息加底部操作按钮
    // dialog 模式：复制 / 重新生成 / 朗读 / 收藏 / 引用回复（横排，14px 图标）
    // bubble 模式：只保留朗读按钮（长按出操作面板）
    if (!isMe && msg.type === "text" && !msg.pending && msg.content) {
      if (mode === "dialog") {
        const actions = U.el("div", { class: "msg-actions" });
        actions.appendChild(_actionBtn("copy", "复制", () => {
          _copyText(msg.content);
          global.Phone.Notify.push({ appId: "chat", title: "已复制到剪贴板" });
        }));
        actions.appendChild(_actionBtn("refresh", "重新生成", () => {
          if (ctx.onAction) ctx.onAction("regenerate", msg);
        }));
        // 朗读按钮：图标根据当前是否在朗读这条消息切换
        const isSpeaking = _speakingMsgId === msg.id;
        const speakBtn = _actionBtn(isSpeaking ? "volume-mute" : "volume", "朗读", () => {
          _toggleSpeak(msg, speakBtn);
        });
        if (isSpeaking) speakBtn.classList.add("active");
        actions.appendChild(speakBtn);
        actions.appendChild(_actionBtn("archive", "收藏", () => {
          if (ctx.onAction) ctx.onAction("favorite", msg);
          global.Phone.Notify.push({ appId: "chat", title: "已收藏" });
        }));
        actions.appendChild(_actionBtn("quote", "引用回复", () => {
          if (ctx.onAction) ctx.onAction("quote", msg);
        }));
        meta.appendChild(actions);
      } else {
        // bubble 模式：只保留朗读按钮（保持原行为）
        const isSpeaking = _speakingMsgId === msg.id;
        const speakBtn = U.el("button", {
          class: "msg-action-btn msg-speak-btn" + (isSpeaking ? " active" : ""),
          html: global.Phone.IconLibrary.get(isSpeaking ? "volume-mute" : "volume", { size: 14 }),
          title: "朗读"
        });
        speakBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          _toggleSpeak(msg, speakBtn);
        });
        meta.appendChild(speakBtn);
      }
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

  // 我造一个 14px 图标的小操作按钮
  function _actionBtn(icon, label, onclick) {
    const U = global.Phone.Utils;
    const btn = U.el("button", {
      class: "msg-action-btn",
      html: global.Phone.IconLibrary.get(icon, { size: 14 }),
      title: label
    });
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      try { onclick(); } catch (err) { console.warn("[MessageRenderer] action error", err); }
    });
    return btn;
  }

  // 我把纯文本转成 HTML（先 escapeHtml，再换行）—— 兜底，不再被新逻辑直接调用
  function _formatText(text) {
    return global.Phone.Utils.escapeHtml(text).replace(/\n/g, "<br>");
  }

  // bubble 模式专用：只解析行内 markdown（粗体 / 斜体 / 行内代码），其余按纯文本显示
  function _renderInlineOnly(text) {
    const U = global.Phone.Utils;
    let safe = U.escapeHtml(text);
    // 行内代码先占位
    const codes = [];
    safe = safe.replace(/`([^`\n]+)`/g, (m, c) => {
      const i = codes.length;
      codes.push(c);
      return "\u0000IC" + i + "\u0000";
    });
    safe = _inlineMd(safe);
    // 还原行内代码
    safe = safe.replace(/\u0000IC(\d+)\u0000/g, (m, i) =>
      '<code class="md-inline-code">' + codes[+i] + '</code>'
    );
    return safe.replace(/\n/g, "<br>");
  }

  /* ============================================================
     轻量 Markdown 解析器（不引入外部库）
     流程：先 escapeHtml（防 XSS）→ 提取代码块 → 行级块解析 → 行内 md → 还原占位
     暴露 _renderMarkdown（仅 dialog 模式使用）
     ============================================================ */
  function _renderMarkdown(text) {
    const U = global.Phone.Utils;
    const safe = U.escapeHtml(text || "");

    // 1. 切分代码块（多行）与普通文本段
    const segments = [];
    let lastEnd = 0;
    const codeRe = /```([a-zA-Z0-9_+-]*)\n?([\s\S]*?)```/g;
    let m;
    while ((m = codeRe.exec(safe)) !== null) {
      if (m.index > lastEnd) {
        segments.push({ type: "text", content: safe.slice(lastEnd, m.index) });
      }
      segments.push({
        type: "code",
        lang: (m[1] || "").trim(),
        content: m[2].replace(/\n$/, "")
      });
      lastEnd = m.index + m[0].length;
    }
    if (lastEnd < safe.length) {
      segments.push({ type: "text", content: safe.slice(lastEnd) });
    }
    if (segments.length === 0) {
      segments.push({ type: "text", content: safe });
    }

    // 2. 各段分别渲染
    let html = "";
    for (const seg of segments) {
      if (seg.type === "code") {
        html += _renderCodeBlock(seg.lang, seg.content);
      } else {
        html += _renderTextBlock(seg.content);
      }
    }
    return html;
  }

  // 代码块渲染（带语言标签 + 一键复制按钮）
  function _renderCodeBlock(lang, code) {
    const langLabel = lang || "code";
    // code 已经 escapeHtml 过了，直接放进 <code> 里
    // 给复制按钮塞一份原始内容（解码实体后存 data-code，避免再解码）
    const raw = code;
    return '<div class="md-code-block">'
      + '<div class="md-code-head">'
      + '<span class="md-code-lang">' + langLabel + '</span>'
      + '<button class="md-code-copy" data-code="' + _attr(raw) + '">复制</button>'
      + '</div>'
      + '<pre><code>' + code + '</code></pre>'
      + '</div>';
  }

  // 把字符串安全地塞进 HTML 属性（双引号包裹）
  // 输入已 escapeHtml，但 " 会被转成 &quot; —— 这里再保险一次
  function _attr(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  // 文本段：先保护行内代码 → 行级块解析 → 行内 md → 还原
  function _renderTextBlock(text) {
    const codes = [];
    let s = text.replace(/`([^`\n]+)`/g, (m, c) => {
      const i = codes.length;
      codes.push(c);
      return "\u0000IC" + i + "\u0000";
    });

    // 按"\n"分行做块级解析
    const lines = s.split("\n");
    const out = [];
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];

      // 空行
      if (/^\s*$/.test(line)) { i++; continue; }

      // 标题 # ## ### ...
      const h = line.match(/^(#{1,6})\s+(.*)$/);
      if (h) {
        const lvl = h[1].length;
        out.push("<h" + lvl + ">" + _inlineMd(h[2]) + "</h" + lvl + ">");
        i++; continue;
      }

      // 分割线 --- / *** / ___
      if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
        out.push("<hr/>");
        i++; continue;
      }

      // 引用块 > text（连续行合并）
      if (/^\s*&gt;\s?/.test(line)) {
        const buf = [];
        while (i < lines.length && /^\s*&gt;\s?/.test(lines[i])) {
          buf.push(lines[i].replace(/^\s*&gt;\s?/, ""));
          i++;
        }
        out.push("<blockquote>" + _inlineMd(buf.join("<br>")) + "</blockquote>");
        continue;
      }

      // 无序列表 - / * / +
      if (/^\s*[-*+]\s+/.test(line)) {
        const items = [];
        while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) {
          items.push("<li>" + _inlineMd(lines[i].replace(/^\s*[-*+]\s+/, "")) + "</li>");
          i++;
        }
        out.push("<ul>" + items.join("") + "</ul>");
        continue;
      }

      // 有序列表 1. 2. ...
      if (/^\s*\d+\.\s+/.test(line)) {
        const items = [];
        while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
          items.push("<li>" + _inlineMd(lines[i].replace(/^\s*\d+\.\s+/, "")) + "</li>");
          i++;
        }
        out.push("<ol>" + items.join("") + "</ol>");
        continue;
      }

      // 表格：当前行有 |，且下一行是分隔行 |---|---|
      if (/\|/.test(line) && i + 1 < lines.length
        && /^\s*\|?[\s:|-]+\|[\s:|-]+\|?\s*$/.test(lines[i + 1])
        && /\|/.test(lines[i + 1])) {
        const header = _splitTableRow(line);
        i += 2; // 跳过分隔行
        const rows = [];
        while (i < lines.length && /\|/.test(lines[i]) && !/^\s*$/.test(lines[i])
          && !_isBlockStart(lines[i])) {
          rows.push(_splitTableRow(lines[i]));
          i++;
        }
        let t = "<table><thead><tr>";
        header.forEach((c) => { t += "<th>" + _inlineMd(c) + "</th>"; });
        t += "</tr></thead><tbody>";
        rows.forEach((r) => {
          t += "<tr>";
          // 对齐到表头列数
          for (let k = 0; k < header.length; k++) {
            t += "<td>" + _inlineMd(r[k] == null ? "" : r[k]) + "</td>";
          }
          t += "</tr>";
        });
        t += "</tbody></table>";
        out.push(t);
        continue;
      }

      // 普通段落（合并连续非块起始行）
      const buf = [line];
      i++;
      while (i < lines.length && !/^\s*$/.test(lines[i]) && !_isBlockStart(lines[i])
        && !/\u0000IC\d+\u0000/.test(lines[i]) /* 不在段落中切到独立行内码占位行*/) {
        buf.push(lines[i]);
        i++;
      }
      const para = buf.join("<br>");
      out.push("<p>" + _inlineMd(para) + "</p>");
    }

    let html = out.join("\n");
    // 还原行内代码
    html = html.replace(/\u0000IC(\d+)\u0000/g, (m, idx) =>
      '<code class="md-inline-code">' + codes[+idx] + '</code>'
    );
    return html;
  }

  // 判断一行是不是块级元素的起始（用于段落合并的停止条件）
  function _isBlockStart(line) {
    return /^(#{1,6})\s+/.test(line)
      || /^\s*&gt;\s?/.test(line)
      || /^\s*[-*+]\s+/.test(line)
      || /^\s*\d+\.\s+/.test(line)
      || /^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line);
  }

  // 拆表格行：| a | b | → ['a','b']
  function _splitTableRow(line) {
    let s = line.trim();
    if (s.charAt(0) === "|") s = s.slice(1);
    if (s.charAt(s.length - 1) === "|") s = s.slice(0, -1);
    return s.split("|").map((c) => c.trim());
  }

  // 行内 markdown：图片 / 链接 / 粗体 / 斜体 / 删除线
  function _inlineMd(s) {
    // 图片 ![alt](url)
    s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (m, alt, url) => {
      const u = _safeUrl(url);
      if (!u) return alt;
      return '<img alt="' + alt + '" src="' + u + '" class="md-img"/>';
    });
    // 链接 [text](url)
    s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, txt, url) => {
      const u = _safeUrl(url);
      if (!u) return txt;
      return '<a href="' + u + '" target="_blank" rel="noopener noreferrer">' + txt + '</a>';
    });
    // 粗体 **text**
    s = s.replace(/\*\*([^\*]+)\*\*/g, "<strong>$1</strong>");
    // 斜体 *text*（避免匹配 ** 残留）
    s = s.replace(/(^|[^*])\*([^\*\n]+)\*(?!\*)/g, "$1<em>$2</em>");
    // 删除线 ~~text~~
    s = s.replace(/~~([^~\n]+)~~/g, "<del>$1</del>");
    return s;
  }

  // URL 安全性过滤：拦截 javascript:/vbscript:/data: 等危险协议
  function _safeUrl(url) {
    if (!url) return null;
    // url 已经 escapeHtml，& 变成 &amp; 等。先解码再判断协议
    const decoded = url
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">");
    if (/^\s*(javascript|vbscript|data|file):/i.test(decoded)) return null;
    return url;
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

  // 文件消息渲染：文件图标 + 名字 + 体积
  function _renderFile(msg) {
    const U = global.Phone.Utils;
    const name = msg.name || "文件";
    const mime = msg.mime || "";
    const sizeText = msg.size ? U.bytesToSize(msg.size) : "";
    const wrap = U.el("div", { class: "msg-file" }, [
      U.el("div", { class: "mf-icon", html: global.Phone.IconLibrary.get("app-memo", { size: 22 }) }),
      U.el("div", { class: "mf-info" }, [
        U.el("div", { class: "mf-name", text: name }),
        sizeText ? U.el("div", { class: "mf-meta", text: sizeText + (mime ? " · " + mime : "") }) : null,
      ])
    ]);
    // 如果有 base64 内容，点击下载
    if (msg.content) {
      wrap.addEventListener("click", () => {
        try {
          U.download(name, msg.content, mime || "application/octet-stream");
        } catch (e) { console.warn("[MessageRenderer] 文件下载失败", e); }
      });
    }
    return wrap;
  }

  // 长按操作面板
  function _showActionSheet(msg, ctx) {
    const U = global.Phone.Utils;
    if (document.querySelector(".sheet-mask")) return;

    const isMe = msg.role === "user";
    const actions = [];

    // 复制：仅对有文本内容的消息（text / 未指定类型）
    if (msg.type === "text" || !msg.type) {
      actions.push({ icon: "copy", label: "复制", fn: () => {
        _copyText(msg.content);
        global.Phone.Notify.push({ appId: "chat", title: "已复制到剪贴板" });
      }});
    }
    actions.push({ icon: "quote", label: "引用回复", fn: () => {
      if (ctx.onAction) ctx.onAction("quote", msg);
    }});
    actions.push({ icon: "forward", label: "转发到朋友圈", fn: () => {
      if (ctx.onAction) ctx.onAction("forward", msg);
    }});
    // 撤回：仅自己的消息，且 2 分钟内
    if (isMe && !msg.pending) {
      const age = Date.now() - (msg.createdAt || 0);
      if (age < 120000) {
        actions.push({ icon: "refresh", label: "撤回", fn: () => {
          if (ctx.onAction) ctx.onAction("recall", msg);
        }});
      }
    }
    actions.push({ icon: "archive", label: "收藏", fn: () => {
      if (ctx.onAction) ctx.onAction("favorite", msg);
      global.Phone.Notify.push({ appId: "chat", title: "已收藏" });
    }});
    // 删除：二次确认
    actions.push({ icon: "trash", label: "删除", danger: true, fn: () => {
      if (!ctx.onAction) return;
      global.Phone.Modal.confirm({
        title: "删除消息", message: "确定删除这条消息吗？", danger: true, okText: "删除",
      }).then((ok) => {
        if (ok) ctx.onAction("delete", msg);
      });
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

  // ============================================================
  // 思维链区域（AI 消息上方，可折叠）
  // thinking: 当前累计的思考文本
  // isStreaming: 是否仍在流式思考中（true 时默认展开）
  // ============================================================
  function _renderThinking(thinking, isStreaming) {
    const U = global.Phone.Utils;
    const wrap = U.el("div", { class: "msg-thinking" + (isStreaming ? " open streaming" : "") });
    const header = U.el("div", { class: "msg-thinking-header" }, [
      U.el("span", { class: "mth-label", text: isStreaming ? "我正在思考" : "我的思考过程" }),
      U.el("span", { class: "mth-chevron", html: global.Phone.IconLibrary.get("chevron-down", { size: 14 }) }),
    ]);
    const body = U.el("div", { class: "msg-thinking-body", text: thinking || "" });
    header.addEventListener("click", (e) => {
      e.stopPropagation();
      wrap.classList.toggle("open");
    });
    wrap.appendChild(header);
    wrap.appendChild(body);
    return wrap;
  }

  // ============================================================
  // dialog 模式卡片头部（AI：头像+名字；用户："我"标识）
  // ============================================================
  function _renderDialogHead(msg, ctx) {
    const U = global.Phone.Utils;
    const isMe = msg.role === "user";
    const head = U.el("div", { class: "msg-dialog-head" });
    if (isMe) {
      head.appendChild(U.el("span", { class: "msg-dialog-name", text: "我" }));
      return head;
    }
    const char = ctx.character || {};
    const avatar = U.el("div", { class: "msg-dialog-avatar" });
    if (char.avatar) {
      avatar.innerHTML = '<img src="' + char.avatar + '" alt=""/>';
    } else {
      avatar.textContent = (char.name || "AI").slice(0, 1);
    }
    head.appendChild(avatar);
    head.appendChild(U.el("span", { class: "msg-dialog-name", text: char.name || "AI" }));
    return head;
  }

  // 小尺寸角色头像（用于转账/名片卡片）
  function _charAvatar(character, className) {
    const U = global.Phone.Utils;
    const char = character || {};
    const node = U.el("div", { class: className });
    if (char.avatar) {
      node.innerHTML = '<img src="' + char.avatar + '" alt=""/>';
    } else {
      node.textContent = (char.name || "AI").slice(0, 1);
    }
    return node;
  }

  // ============================================================
  // 新增消息类型渲染
  // ============================================================

  // 转账消息：金额 + 角色头像 + 转账给{角色名}，点击查看详情（钱包）
  function _renderTransfer(msg, ctx) {
    const U = global.Phone.Utils;
    const amount = msg.amount != null ? msg.amount : (msg.content || 0);
    const charName = (ctx.character && ctx.character.name) || "AI";
    const isMe = msg.role === "user";
    const toLabel = isMe ? ("转账给" + charName) : "转账给你";
    const card = U.el("div", { class: "msg-transfer" }, [
      U.el("div", { class: "mt-row" }, [
        U.el("div", { class: "mt-amount", text: String(amount) }),
        U.el("div", { class: "mt-currency", text: "元" }),
      ]),
      U.el("div", { class: "mt-row" }, [
        _charAvatar(ctx.character, "mt-icon"),
        U.el("div", { class: "mt-to", text: toLabel }),
      ]),
      U.el("div", { class: "mt-tip", text: "点击查看详情" }),
    ]);
    card.addEventListener("click", () => {
      if (global.Phone.Wallet && global.Phone.Wallet.open) global.Phone.Wallet.open();
    });
    return card;
  }

  // 礼物消息：礼物图标 + 名称 + 送给{角色名}，点击查看详情（商店）
  function _renderGift(msg, ctx) {
    const U = global.Phone.Utils;
    const giftName = msg.name || msg.content || "礼物";
    const charName = (ctx.character && ctx.character.name) || "AI";
    const isMe = msg.role === "user";
    const toLabel = isMe ? ("送给" + charName) : "送给你";
    const iconKey = msg.icon || "gift";
    const card = U.el("div", { class: "msg-gift" }, [
      U.el("div", { class: "mg-icon", html: global.Phone.IconLibrary.get(iconKey, { size: 22 }) }),
      U.el("div", { class: "mg-info" }, [
        U.el("div", { class: "mg-name", text: giftName }),
        U.el("div", { class: "mg-to", text: toLabel }),
      ]),
    ]);
    card.addEventListener("click", () => {
      if (global.Phone.Shop && global.Phone.Shop.open) global.Phone.Shop.open();
    });
    return card;
  }

  // 位置消息：位置图标 + 文字（预设可爱位置）
  function _renderLocation(msg) {
    const U = global.Phone.Utils;
    const text = msg.content || "未知地点";
    return U.el("div", { class: "msg-location" }, [
      U.el("div", { class: "ml-icon", html: global.Phone.IconLibrary.get("pin", { size: 22 }) }),
      U.el("div", { class: "ml-text", text: text }),
    ]);
  }

  // 角色名片：头像 + 名字 + 简介，点击查看详情
  function _renderCharCard(msg, ctx) {
    const U = global.Phone.Utils;
    const char = msg.character || ctx.character || {};
    const name = char.name || "AI";
    const desc = char.description || "点击查看角色详情";
    const card = U.el("div", { class: "msg-card" }, [
      _charAvatar(char, "mc-avatar"),
      U.el("div", { class: "mc-info" }, [
        U.el("div", { class: "mc-name", text: name }),
        U.el("div", { class: "mc-desc", text: desc }),
      ]),
    ]);
    card.addEventListener("click", () => {
      if (ctx.onAction) ctx.onAction("viewCard", msg);
    });
    return card;
  }

  // 骰子消息：3D 感骰子 + 点数（1-6），CSS 旋转动画
  function _renderDice(msg) {
    const U = global.Phone.Utils;
    const point = msg.point != null ? msg.point : (msg.content || 1);
    const dots = ["", "\u00b7", "\u00b7\u00b7", "\u00b7\u00b7\u00b7", "\u00b7\u00b7\u00b7\u00b7", "\u00b7\u00b7\u00b7\u00b7\u00b7", "\u00b7\u00b7\u00b7\u00b7\u00b7\u00b7"];
    const face = dots[point] || String(point);
    return U.el("div", { class: "msg-dice" }, [
      U.el("div", { class: "md-cube", text: face }),
      U.el("div", { class: "md-text", text: "掷出 " + point + " 点" }),
    ]);
  }

  // 石头剪刀布消息：用户手势 + AI 手势 + 结果
  function _renderRps(msg) {
    const U = global.Phone.Utils;
    const userHand = msg.userHand || "rock";
    const aiHand = msg.aiHand || "scissors";
    const result = msg.result || _rpsResult(userHand, aiHand);
    const LABEL = { rock: "石头", paper: "布", scissors: "剪刀" };
    const resultText = result === "win" ? "你赢啦" : (result === "lose" ? "我赢啦" : "平局");
    const resultCls = result === "win" ? "win" : (result === "lose" ? "lose" : "");
    return U.el("div", { class: "msg-rps" }, [
      U.el("div", { class: "mr-hand user", text: LABEL[userHand] || userHand }),
      U.el("div", { class: "mr-vs", text: "对" }),
      U.el("div", { class: "mr-hand ai", text: LABEL[aiHand] || aiHand }),
      U.el("div", { class: "mr-result " + resultCls, text: resultText }),
    ]);
  }

  function _rpsResult(user, ai) {
    if (user === ai) return "draw";
    if ((user === "rock" && ai === "scissors") ||
        (user === "scissors" && ai === "paper") ||
        (user === "paper" && ai === "rock")) return "win";
    return "lose";
  }

  // 表情包消息：图片，最大 40% 屏宽，无文字时不显示气泡背景
  function _renderSticker(msg) {
    const U = global.Phone.Utils;
    const wrap = U.el("div", { class: "msg-sticker-inner" });
    if (msg.content) {
      wrap.innerHTML = '<img src="' + msg.content + '" alt="表情包"/>';
    }
    return wrap;
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
    if (isToday) return U.fmtHM(ts);
    const yesterday = new Date(now.getTime() - 86400000);
    if (yesterday.toDateString() === d.toDateString()) return "昨天 " + U.fmtHM(ts);
    // 本周（7 天内）：星期几 时:分
    const weekMs = 7 * 86400000;
    if (now.getTime() - ts < weekMs && now > d) {
      const WEEK_CN = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
      return WEEK_CN[d.getDay()] + " " + U.fmtHM(ts);
    }
    // 更早：月日 时:分
    if (now.getFullYear() === d.getFullYear()) {
      return (d.getMonth() + 1) + "月" + d.getDate() + "日 " + U.fmtHM(ts);
    }
    return U.fmtDate(ts) + " " + U.fmtHM(ts);
  }

  // ---------- 暴露 ----------
  global.Phone = global.Phone || {};
  global.Phone.MessageRenderer = {
    render: render,
    renderTimeDivider: renderTimeDivider,
    _renderMarkdown: _renderMarkdown, // 暴露便于验证 / 调试
    _renderThinking: _renderThinking, // 思维链渲染（便于验证）
  };
})(window);
