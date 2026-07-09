/* ============================================================
   message-renderer.js — 消息渲染器
   两种模式：
     · bubble  气泡模式（对齐微信：左右气泡 + 头像）
     · dialog  对话模式（对齐 Kelivo：块状流 + Markdown + 思维链）
   能力（规范第 5 节 / 第 6 节）：
     · 5.1 纯文本 / 5.2 Markdown（代码块顶栏+复制 / 表格滚动 / 链接 WebView）
     · 5.3 思维链 CoT 折叠卡（brain 图标，cot-bg，展开 border-left）
     · 5.4 AI 等待态三步走（占位气泡 → 三枚跳动图标 → 打字光标）
     · 5.5 流式输出（.msg-cursor 打字光标）
     · 5.5 语音气泡（波形 + 播放 + 时长 + 倍速）
     · 5.6 图片气泡（圆角 + 全屏预览 + 双指缩放 + 下滑关闭）
     · 5.7 视频气泡（缩略图 + 播放图标 + 时长角标 + 全屏播放）
     · 5.8 文件附件（按类型色 + 下载）
     · 5.9 引用回复气泡
     · 5.10 错误消息（感叹号 toggle + 错误详情 + 重试）
     · 5.11 GitHub 操作结果卡片（PR / Merge / file / error）
     · 6   长按菜单（300ms，AI 9 项 + 用户额外项，撤回 60s 门控，删除二次确认）
     ·     AI 气泡底部操作行（刷新 / 朗读 / 复制 / 更多）
     · 10.4 版本指示点
   挂在 window.Phone.MessageRenderer
   ============================================================ */
(function (global) {
  "use strict";

  const U = global.Phone.Utils;
  const Icons = global.Phone.IconLibrary;

  // 我记住当前正在朗读的消息，方便朗读按钮切换图标
  let _speakingMsgId = null;
  let _speakingBtn = null;     // 持有图标的 span（会被替换 innerHTML）
  let _speakingHost = null;    // 持有 .speaking class 的宿主（按钮）
  let _speakingSize = 14;

  // ---------- TTS 朗读 ----------
  // iconEl: 持有图标的元素（innerHTML 被替换）；hostEl: 加 .speaking 的宿主，缺省=iconEl
  function _toggleSpeak(msg, iconEl, hostEl, size) {
    const TTS = global.Phone.TTS;
    if (!TTS || !iconEl) return;
    hostEl = hostEl || iconEl;
    try {
      if (_speakingMsgId === msg.id && TTS.isSpeaking()) {
        TTS.cancel();
        _resetSpeakBtn();
      } else {
        TTS.cancel();
        _speakingMsgId = msg.id;
        _speakingBtn = iconEl;
        _speakingHost = hostEl;
        _speakingSize = size || 14;
        iconEl.innerHTML = Icons.get("volume-mute", { size: _speakingSize });
        hostEl.classList.add("speaking");
        // 朗读时用纯文本，不念 Markdown 符号
        TTS.speak(_plainText(msg.content || ""), { onEnd: () => { _resetSpeakBtn(); } });
      }
    } catch (e) {
      console.warn("[MessageRenderer] TTS 朗读失败", e);
      _resetSpeakBtn();
    }
  }

  function _resetSpeakBtn() {
    _speakingMsgId = null;
    if (_speakingBtn) {
      _speakingBtn.innerHTML = Icons.get("volume", { size: _speakingSize });
      if (_speakingHost) _speakingHost.classList.remove("speaking");
      _speakingBtn = null;
      _speakingHost = null;
    }
  }

  // 读会话级音色：chat.ttsVoice_<conversationId>
  function _ctxVoice(ctx) {
    try {
      const State = global.Phone.State;
      if (State && ctx && ctx.conversationId) {
        return State.get("chat.ttsVoice_" + ctx.conversationId) || "";
      }
    } catch (_) {}
    return "";
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
      return U.escapeHtml(text).replace(/\n/g, "<br>");
    }
    try {
      return global.marked.parse(text, { breaks: true, gfm: true });
    } catch (e) {
      return U.escapeHtml(text).replace(/\n/g, "<br>");
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

  // 5.2 代码块顶栏：把 pre 包成 .code-wrap > .code-header(.code-lang + .code-copy) > pre
  // 流式期间不调用（由 render 统一门控），避免抖动
  function _wrapCodeBlocks(container) {
    if (!container) return;
    const pres = container.querySelectorAll("pre");
    pres.forEach((pre) => {
      const parent = pre.parentElement;
      if (parent && parent.classList && parent.classList.contains("code-wrap")) return;
      const code = pre.querySelector("code");
      let lang = "";
      if (code && code.className) {
        const m = /language-(\w+)/.exec(code.className);
        if (m) lang = m[1];
      }
      const wrap = U.el("div", { class: "code-wrap" });
      const header = U.el("div", { class: "code-header" });
      header.appendChild(U.el("span", { class: "code-lang", text: lang || "code" }));
      const copyBtn = U.el("button", { class: "code-copy", type: "button", text: "复制" });
      copyBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        const txt = code ? code.textContent : pre.textContent;
        _copyText(txt);
        copyBtn.textContent = "已复制";
        copyBtn.classList.add("done");
        setTimeout(() => {
          copyBtn.textContent = "复制";
          copyBtn.classList.remove("done");
        }, 1500);
      });
      header.appendChild(copyBtn);
      if (parent) parent.insertBefore(wrap, pre);
      wrap.appendChild(header);
      wrap.appendChild(pre);
    });
  }

  // 5.2 表格：外层包 div.table-scroll
  function _wrapTables(container) {
    if (!container) return;
    container.querySelectorAll("table").forEach((t) => {
      const parent = t.parentElement;
      if (parent && parent.classList && parent.classList.contains("table-scroll")) return;
      const wrap = U.el("div", { class: "table-scroll" });
      if (parent) parent.insertBefore(wrap, t);
      wrap.appendChild(t);
    });
  }

  // 5.2 链接 WebView：拦截 a 链接，在应用内打开；无 webview 路由则 window.open 兜底
  function _interceptLinks(container, ctx) {
    if (!container) return;
    container.querySelectorAll("a[href]").forEach((a) => {
      a.addEventListener("click", (e) => {
        const href = a.getAttribute("href") || "";
        if (!href || href.charAt(0) === "#") return; // 锚点不拦
        e.preventDefault();
        _openLink(href, ctx);
      });
    });
  }

  function _openLink(url, ctx) {
    // 优先应用内 webview 路由（若已注册）；否则 window.open 兜底
    const R = global.Phone.Router;
    if (R && typeof R.push === "function" && typeof R._webviewMount === "function") {
      try { R.push("webview", R._webviewMount, { url: url }); return; } catch (_) {}
    }
    try { global.open(url, "_blank"); } catch (_) {}
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

  // 思维链总开关：读全局设置 showThinking（归 settings-center 管，这里只读）
  function _chainEnabled(ctx) {
    // ctx.thinking 优先（会话级显式控制），否则读全局
    if (ctx && ctx.thinking != null) return !!ctx.thinking;
    try {
      const State = global.Phone.State;
      if (State && typeof State.get === "function") {
        return State.get("showThinking") === true;
      }
    } catch (_) {}
    return false;
  }

  // ---------- 5.3 思维链 CoT 折叠卡 ----------
  function _renderCoT(thinking, msg, ctx) {
    const mode = (ctx && ctx.mode) || "bubble";
    const card = U.el("div", { class: "msg-cot collapsed", dataset: { id: msg.id } });

    const header = U.el("button", { class: "msg-cot-toggle", type: "button" });
    const iconSpan = U.el("span", { class: "msg-cot-icon", html: Icons.get("brain", { size: 14 }) });
    header.appendChild(iconSpan);
    header.appendChild(U.el("span", { class: "msg-cot-label", text: "查看思考过程" }));
    const arrow = U.el("span", { class: "msg-cot-arrow", html: Icons.get("chevron-right", { size: 14 }) });
    header.appendChild(arrow);

    const body = U.el("div", { class: "msg-cot-body" + (mode === "dialog" ? " dialog-expanded" : "") });
    body.appendChild(U.el("div", { class: "msg-cot-text", text: thinking }));

    card.appendChild(header);
    card.appendChild(body);

    let expanded = false;
    header.addEventListener("click", (e) => {
      e.stopPropagation();
      expanded = !expanded;
      card.classList.toggle("collapsed", !expanded);
      arrow.innerHTML = Icons.get(expanded ? "chevron-down" : "chevron-right", { size: 14 });
    });
    return card;
  }

  // ---------- 5.4 AI 等待态 ----------
  // 步骤一/二：占位气泡 .msg-waiting + 三枚 .mw-icon（star-fill/heart/moon 里取3枚）
  function _renderWaiting() {
    const keys = ["heart", "star-fill", "moon"];
    const w = U.el("div", { class: "msg-waiting" });
    keys.forEach((k, i) => {
      const ic = U.el("span", { class: "mw-icon", html: Icons.get(k, { size: 14 }) });
      ic.style.animationDelay = (i * 300) + "ms";
      w.appendChild(ic);
    });
    return w;
  }

  // ---------- 5.9 引用回复 ----------
  function _renderQuote(msg) {
    const q = msg.quote || {};
    const wrap = U.el("div", { class: "msg-quote" });
    if (q.author) wrap.appendChild(U.el("div", { class: "mq-author", text: q.author }));
    wrap.appendChild(U.el("div", { class: "mq-text", text: q.content || "" }));
    return wrap;
  }

  // ---------- 5.5 语音气泡 ----------
  function _renderVoice(msg) {
    const wrap = U.el("div", { class: "msg-voice" });
    // 波形图：多条 span，高度随机
    const wave = U.el("div", { class: "msg-voice-wave" });
    const bars = 12;
    for (let i = 0; i < bars; i++) {
      const h = 6 + Math.round(Math.abs(Math.sin(i * 1.3)) * 18); // 6~24px 伪随机
      wave.appendChild(U.el("span", { class: "mv-bar", style: { height: h + "px" } }));
    }
    wrap.appendChild(wave);

    // 播放/暂停按钮：圆形 44px
    const play = U.el("button", { class: "msg-voice-play", type: "button" });
    const playIcon = U.el("span", { class: "mv-play-icon", html: Icons.get("play", { size: 18 }) });
    play.appendChild(playIcon);
    wrap.appendChild(play);

    // 时长 + 倍速
    const info = U.el("div", { class: "msg-voice-info" });
    const dur = msg.duration || 3;
    info.appendChild(U.el("span", { class: "msg-voice-dur", text: U.fmtDur(dur) }));
    const rate = U.el("button", { class: "msg-voice-rate", type: "button", text: "1x" });
    const rates = ["1x", "1.5x", "2x"];
    let rateIdx = 0;
    rate.addEventListener("click", (e) => {
      e.stopPropagation();
      rateIdx = (rateIdx + 1) % rates.length;
      rate.textContent = rates[rateIdx];
    });
    info.appendChild(rate);
    wrap.appendChild(info);

    // 播放逻辑：有音频 URL 用 HTMLAudioElement，否则只 toggle 图标（UI 骨架）
    let audio = null;
    let playing = false;
    const toggle = () => {
      const src = (typeof msg.content === "string" && /^https?:|^data:audio/.test(msg.content)) ? msg.content : null;
      if (src) {
        if (!audio) {
          audio = new global.Audio(src);
          audio.addEventListener("ended", () => {
            playing = false;
            wrap.classList.remove("playing");
            playIcon.innerHTML = Icons.get("play", { size: 18 });
          });
        }
        audio.playbackRate = parseFloat(rates[rateIdx]) || 1;
      }
      playing = !playing;
      if (playing) {
        wrap.classList.add("playing");
        playIcon.innerHTML = Icons.get("pause", { size: 18 });
        if (audio) { try { audio.playbackRate = parseFloat(rates[rateIdx]) || 1; audio.play(); } catch (_) {} }
      } else {
        wrap.classList.remove("playing");
        playIcon.innerHTML = Icons.get("play", { size: 18 });
        if (audio) { try { audio.pause(); } catch (_) {} }
      }
    };
    play.addEventListener("click", (e) => { e.stopPropagation(); toggle(); });
    return wrap;
  }

  // ---------- 5.6 图片气泡 ----------
  function _renderImage(msg) {
    const src = msg.content || msg.url || "";
    const img = U.el("img", { class: "msg-image", src: src, alt: "图片" });
    img.addEventListener("click", (e) => { e.stopPropagation(); _showImageViewer(src); });
    return img;
  }

  function _showImageViewer(src) {
    if (document.querySelector(".img-viewer")) return;
    const viewer = U.el("div", { class: "img-viewer" });
    const img = U.el("img", { class: "img-viewer-img", src: src, alt: "" });
    const close = U.el("button", { class: "img-viewer-close", type: "button", html: Icons.get("x", { size: 24 }) });
    viewer.appendChild(img);
    viewer.appendChild(close);
    const closeFn = () => viewer.remove();
    close.addEventListener("click", closeFn);
    viewer.addEventListener("click", (e) => { if (e.target === viewer) closeFn(); });

    // 双指缩放 + 下滑关闭
    let scale = 1, startDist = 0, startScale = 1, startY = 0;
    img.addEventListener("touchstart", (e) => {
      if (e.touches.length === 2) {
        startDist = _touchDist(e.touches);
        startScale = scale;
      } else if (e.touches.length === 1) {
        startY = e.touches[0].clientY;
      }
    }, { passive: true });
    img.addEventListener("touchmove", (e) => {
      if (e.touches.length === 2) {
        const d = _touchDist(e.touches);
        scale = Math.max(1, Math.min(3, startScale * (d / (startDist || 1))));
        img.style.transform = "scale(" + scale + ")";
      } else if (e.touches.length === 1) {
        const dy = e.touches[0].clientY - startY;
        if (dy > 80) closeFn();
      }
    }, { passive: true });
    document.body.appendChild(viewer);
  }

  function _touchDist(touches) {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  // ---------- 5.7 视频气泡 ----------
  function _renderVideo(msg) {
    const wrap = U.el("div", { class: "msg-video" });
    const thumb = U.el("div", { class: "msg-video-thumb" });
    const poster = msg.poster || msg.thumbnail || "";
    if (poster) thumb.style.backgroundImage = "url('" + poster + "')";
    const playBtn = U.el("div", { class: "msg-video-play", html: Icons.get("play", { size: 32 }) });
    thumb.appendChild(playBtn);
    if (msg.duration) {
      thumb.appendChild(U.el("span", { class: "msg-video-duration", text: U.fmtDur(msg.duration) }));
    }
    wrap.appendChild(thumb);
    thumb.addEventListener("click", (e) => { e.stopPropagation(); _showVideoViewer(msg.content, poster); });
    return wrap;
  }

  function _showVideoViewer(src, poster) {
    if (document.querySelector(".video-viewer")) return;
    const viewer = U.el("div", { class: "video-viewer" });
    const video = U.el("video", {
      class: "video-viewer-video", src: src, controls: true, autoplay: true, playsInline: true,
    });
    if (poster) video.setAttribute("poster", poster);
    const close = U.el("button", { class: "video-viewer-close", type: "button", html: Icons.get("x", { size: 24 }) });
    viewer.appendChild(video);
    viewer.appendChild(close);
    const closeFn = () => { try { video.pause(); } catch (_) {} viewer.remove(); };
    close.addEventListener("click", closeFn);
    viewer.addEventListener("click", (e) => { if (e.target === viewer) closeFn(); });
    document.body.appendChild(viewer);
  }

  // ---------- 5.8 文件附件 ----------
  function _renderFile(msg) {
    const f = msg.file || msg.payload || msg;
    const name = f.name || "文件";
    const size = f.size ? U.bytesToSize(f.size) : "";
    const ext = _fileExt(name);
    const meta = _fileMeta(ext);
    const wrap = U.el("div", { class: "msg-file" });
    const ic = U.el("div", { class: "mf-icon", html: Icons.get(meta.icon, { size: 22, color: meta.color }) });
    wrap.appendChild(ic);
    const info = U.el("div", { class: "mf-info" });
    info.appendChild(U.el("div", { class: "mf-name", text: name }));
    if (size) info.appendChild(U.el("div", { class: "mf-size", text: size }));
    wrap.appendChild(info);
    const href = f.url || msg.content || "#";
    const dl = U.el("a", {
      class: "mf-download", href: href, download: name, target: "_blank",
      html: Icons.get("download", { size: 18 }), title: "下载",
    });
    dl.addEventListener("click", (e) => e.stopPropagation());
    wrap.appendChild(dl);
    return wrap;
  }

  function _fileExt(name) {
    const m = /\.(\w+)$/.exec(name || "");
    return m ? m[1].toLowerCase() : "";
  }

  // PDF红(danger)/Doc蓝(primary)/TXT灰(secondary)/ZIP橙(warning)
  function _fileMeta(ext) {
    if (ext === "pdf") return { icon: "file-text", color: "var(--color-danger)" };
    if (ext === "doc" || ext === "docx") return { icon: "file-text", color: "var(--color-primary)" };
    if (ext === "txt" || ext === "md") return { icon: "file-text", color: "var(--text-secondary)" };
    if (["zip", "rar", "7z", "tar", "gz"].includes(ext)) return { icon: "file-text", color: "var(--color-warning)" };
    if (["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg"].includes(ext)) return { icon: "image", color: "var(--color-primary)" };
    return { icon: "file-text", color: "var(--text-secondary)" };
  }

  // ---------- 5.11 GitHub 操作结果卡片 ----------
  // 双向兼容：工具返回 ghPR/ghMerge/ghFile/ghList/ghError，旧代码用 pr/merge/file/error
  function _renderGithub(msg, ctx) {
    const p = msg.payload || {};
    const k = (p.kind || "").toLowerCase();
    const isError = k === "gherror" || k === "error";
    const card = U.el("div", { class: "msg-github" + (isError ? " gh-error" : "") });
    if (k === "ghpr" || k === "pr") _ghPR(card, p, ctx, msg);
    else if (k === "ghmerge" || k === "merge") _ghMerge(card, p, ctx, msg);
    else if (k === "ghfile" || k === "file") _ghFile(card, p, ctx, msg);
    else if (k === "ghlist") _ghList(card, p, ctx, msg);
    else _ghError(card, p);
    return card;
  }

  function _ghBtn(label, fn, primary) {
    const b = U.el("button", { class: "mgh-btn" + (primary ? " primary" : ""), type: "button", text: label });
    b.addEventListener("click", (e) => { e.stopPropagation(); try { fn(); } catch (_) {} });
    return b;
  }

  function _ghPR(card, p, ctx, msg) {
    // 工具返回 head/base，旧代码读 branch；这里双向兼容
    const headBranch = p.head || p.branch || "";
    const baseBranch = p.base || "";
    const head = U.el("div", { class: "mgh-head" });
    head.appendChild(U.el("span", { class: "mgh-icon", html: Icons.get("github", { size: 16 }) }));
    head.appendChild(U.el("span", { class: "mgh-title", text: "PR #" + (p.number || "?") + " " + (p.title || "") }));
    card.appendChild(head);

    const meta = U.el("div", { class: "mgh-meta" });
    const state = (p.state || "open").toLowerCase();
    // 合并状态用紫色调（GitHub API 里 merged PR 的 state 仍是 closed，这里靠 merged 字段区分）
    const stateCls = (p.merged || state === "merged") ? "merged" : (state === "closed" ? "closed" : "open");
    meta.appendChild(U.el("span", { class: "mgh-state " + stateCls, text: (p.merged || state === "merged") ? "merged" : state }));
    // 分支显示：base ← head（如 main ← feature/fix）
    if (baseBranch && headBranch) {
      meta.appendChild(U.el("span", { class: "gh-branch", text: baseBranch + " ← " + headBranch }));
    } else if (headBranch) {
      meta.appendChild(U.el("span", { class: "gh-branch", text: headBranch }));
    }
    if (p.commits != null) meta.appendChild(U.el("span", { class: "gh-commits", text: p.commits + " commits" }));
    if (p.additions != null && p.deletions != null) {
      meta.appendChild(U.el("span", { class: "gh-add", text: "+" + p.additions }));
      meta.appendChild(U.el("span", { class: "gh-del", text: "−" + p.deletions }));
    }
    card.appendChild(meta);

    const actions = U.el("div", { class: "mgh-actions" });
    actions.appendChild(_ghBtn("查看详情", () => ctx && ctx.onAction && ctx.onAction("github-view", msg, { kind: "pr", payload: p })));
    actions.appendChild(_ghBtn("合并", () => ctx && ctx.onAction && ctx.onAction("github-merge", msg, { kind: "pr", payload: p })));
    actions.appendChild(_ghBtn("关闭", () => ctx && ctx.onAction && ctx.onAction("github-close", msg, { kind: "pr", payload: p })));
    card.appendChild(actions);
  }

  function _ghMerge(card, p, ctx, msg) {
    // 工具返回 sha，旧代码读 commit；这里双向兼容
    const sha = p.sha || p.commit || "";
    const headBranch = p.head || p.branch || "";
    const baseBranch = p.base || "";
    const head = U.el("div", { class: "mgh-head" });
    head.appendChild(U.el("span", { class: "mgh-icon", html: Icons.get("check", { size: 16, color: "var(--github-merge-color)" }) }));
    head.appendChild(U.el("span", { class: "mgh-title", text: "已合并 PR #" + (p.number || "?") }));
    card.appendChild(head);

    const meta = U.el("div", { class: "mgh-meta" });
    if (headBranch && baseBranch) {
      meta.appendChild(U.el("span", { class: "gh-branch", text: headBranch + " → " + baseBranch }));
    } else if (headBranch) {
      meta.appendChild(U.el("span", { class: "gh-branch", text: headBranch }));
    }
    if (p.method) meta.appendChild(U.el("span", { class: "gh-commit", text: p.method + " merge" }));
    if (sha) meta.appendChild(U.el("span", { class: "gh-commit", text: "commit " + String(sha).slice(0, 7) }));
    card.appendChild(meta);

    const actions = U.el("div", { class: "mgh-actions" });
    actions.appendChild(_ghBtn("查看Commit", () => ctx && ctx.onAction && ctx.onAction("github-view-commit", msg, { kind: "merge", payload: p })));
    card.appendChild(actions);
  }

  function _ghFile(card, p, ctx, msg) {
    // 工具返回 path，旧代码读 file；这里双向兼容（已有 p.file || p.path）
    const head = U.el("div", { class: "mgh-head" });
    head.appendChild(U.el("span", { class: "mgh-icon", html: Icons.get("file-text", { size: 16 }) }));
    head.appendChild(U.el("span", { class: "mgh-title", text: p.file || p.path || "文件变更" }));
    card.appendChild(head);

    const meta = U.el("div", { class: "mgh-meta" });
    const adds = p.additions != null ? p.additions : 0;
    const dels = p.deletions != null ? p.deletions : 0;
    meta.appendChild(U.el("span", { class: "gh-add", text: "+" + adds }));
    meta.appendChild(U.el("span", { class: "gh-del", text: "−" + dels }));
    if (p.branch) meta.appendChild(U.el("span", { class: "gh-branch", text: "已提交到 " + p.branch }));
    if (p.message) meta.appendChild(U.el("span", { class: "gh-msg", text: "commit: " + p.message }));
    card.appendChild(meta);

    const actions = U.el("div", { class: "mgh-actions" });
    actions.appendChild(_ghBtn("查看Diff", () => ctx && ctx.onAction && ctx.onAction("github-view-diff", msg, { kind: "file", payload: p })));
    actions.appendChild(_ghBtn("撤销Commit", () => ctx && ctx.onAction && ctx.onAction("github-revert", msg, { kind: "file", payload: p })));
    card.appendChild(actions);
  }

  // 列表类卡片：branches / commits / issues
  function _ghList(card, p, ctx, msg) {
    const typeMap = {
      branches: "分支列表",
      commits: "提交记录",
      issues: "Issues 列表",
    };
    const title = typeMap[p.type] || "列表";
    const head = U.el("div", { class: "mgh-head" });
    head.appendChild(U.el("span", { class: "mgh-icon", html: Icons.get("github", { size: 16 }) }));
    head.appendChild(U.el("span", { class: "mgh-title", text: title }));
    const total = p.count != null ? p.count : (Array.isArray(p.items) ? p.items.length : 0);
    head.appendChild(U.el("span", { class: "gh-count", text: "共 " + total + " 条", style: { fontSize: "var(--font-xs)", color: "var(--text-secondary)", marginLeft: "auto" } }));
    card.appendChild(head);

    const items = Array.isArray(p.items) ? p.items : [];
    const MAX = 10;
    const shown = items.slice(0, MAX);
    const listEl = U.el("div", { class: "gh-list", style: { display: "flex", flexDirection: "column", gap: "4px", marginTop: "6px" } });
    shown.forEach((it) => {
      let line = "";
      if (p.type === "branches") {
        line = it.name || "";
        if (it.protected) line += " （受保护）";
      } else if (p.type === "commits") {
        const sha = it.sha ? String(it.sha).slice(0, 7) : "";
        const msgTxt = (it.message || "").split("\n")[0].slice(0, 50);
        line = (sha ? sha + " " : "") + msgTxt;
      } else if (p.type === "issues") {
        const num = it.number != null ? "#" + it.number + " " : "";
        line = num + (it.title || "");
        if (it.state) line += "（" + it.state + "）";
      } else {
        line = JSON.stringify(it);
      }
      const row = U.el("div", {
        class: "gh-list-item",
        text: line,
        style: {
          padding: "6px 8px",
          borderRadius: "var(--radius-md)",
          background: "var(--github-bg)",
          border: "1px solid var(--github-border)",
          fontSize: "var(--font-xs)",
          color: "var(--text-primary)",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        },
      });
      // 点击行：如果有 html_url，交给 onAction 用 webview 打开
      if (it && it.html_url) {
        row.style.cursor = "pointer";
        row.addEventListener("click", (e) => {
          e.stopPropagation();
          if (ctx && ctx.onAction) ctx.onAction("github-view", msg, { kind: "ghlist", payload: { html_url: it.html_url } });
        });
      }
      listEl.appendChild(row);
    });
    card.appendChild(listEl);
    if (items.length > MAX) {
      card.appendChild(U.el("div", {
        class: "gh-list-more",
        text: "共 " + items.length + " 条，仅显示前 " + MAX + " 条",
        style: { fontSize: "var(--font-xs)", color: "var(--text-secondary)", marginTop: "6px", textAlign: "center" },
      }));
    }
  }

  function _ghError(card, p) {
    const head = U.el("div", { class: "mgh-head" });
    head.appendChild(U.el("span", { class: "mgh-icon", html: Icons.get("alert-circle", { size: 16, color: "var(--color-danger)" }) }));
    head.appendChild(U.el("span", { class: "mgh-title", text: "操作失败" }));
    card.appendChild(head);
    card.appendChild(U.el("div", { class: "gh-err-text", text: p.message || p.error || "GitHub 接口返回错误", style: { color: "var(--text-danger)", fontSize: "var(--font-sm)", lineHeight: 1.4 } }));
  }

  // ---------- 5.10 错误消息 ----------
  function _renderErrorParts(msg, ctx) {
    const isMe = msg.role === "user";
    const toggle = U.el("button", {
      class: "msg-error-toggle", type: "button", title: "查看错误",
      html: Icons.get("alert-circle", { size: 16, color: "var(--color-danger)" }),
    });
    const detail = U.el("div", { class: "msg-error-detail hidden" });
    detail.appendChild(U.el("div", { class: "msg-error-text", text: msg.content || (isMe ? "发送失败" : "出错了") }));
    const retry = U.el("button", { class: "msg-retry-btn", type: "button", text: "重试" });
    retry.addEventListener("click", (e) => {
      e.stopPropagation();
      if (ctx && ctx.onAction) ctx.onAction(isMe ? "resend" : "regenerate", msg);
    });
    detail.appendChild(retry);
    toggle.addEventListener("click", (e) => { e.stopPropagation(); detail.classList.toggle("hidden"); });
    return { toggle: toggle, detail: detail };
  }

  // ---------- AI 气泡底部操作行（始终显示，pending/streaming 时不显示）----------
  function _renderActions(msg, ctx) {
    const row = U.el("div", { class: "msg-actions" });
    row.appendChild(_actBtn("refresh", "刷新", () => ctx && ctx.onAction && ctx.onAction("regenerate", msg)));
    // 朗读：图标 span 单独替换，按钮加 .speaking
    const ttsBtn = U.el("button", { class: "msg-action msg-action-tts", type: "button" });
    const ttsIcon = U.el("span", { class: "msg-action-icon", html: Icons.get("volume", { size: 16 }) });
    ttsBtn.appendChild(ttsIcon);
    ttsBtn.appendChild(U.el("span", { class: "msg-action-label", text: "朗读" }));
    ttsBtn.addEventListener("click", (e) => { e.stopPropagation(); _toggleSpeak(msg, ttsIcon, ttsBtn, 16); });
    row.appendChild(ttsBtn);
    row.appendChild(_actBtn("copy", "复制", () => {
      _copyText(_plainText(msg.content));
      _toast("已复制");
    }));
    const more = _actBtn("more", "更多", () => _showActionSheet(msg, ctx));
    row.appendChild(more);
    return row;
  }

  function _actBtn(icon, label, fn) {
    const b = U.el("button", { class: "msg-action", type: "button" });
    b.appendChild(U.el("span", { class: "msg-action-icon", html: Icons.get(icon, { size: 16 }) }));
    b.appendChild(U.el("span", { class: "msg-action-label", text: label }));
    b.addEventListener("click", (e) => { e.stopPropagation(); try { fn(); } catch (_) {} });
    return b;
  }

  // ---------- 10.4 版本指示点 ----------
  function _renderVersions(msg, ctx) {
    const versions = msg.versions || [];
    const total = versions.length;
    if (total <= 1) return null;
    let cur = msg.versionIdx || 0;
    if (cur < 0) cur = 0;
    if (cur >= total) cur = total - 1;

    const row = U.el("div", { class: "msg-versions" });
    const prev = U.el("button", { class: "mv-prev", type: "button", html: Icons.get("chevron-left", { size: 14 }) });
    const label = U.el("span", { class: "mv-label", text: (cur + 1) + "/" + total });
    const next = U.el("button", { class: "mv-next", type: "button", html: Icons.get("chevron-right", { size: 14 }) });
    row.appendChild(prev);
    row.appendChild(label);
    row.appendChild(next);

    const update = (i) => {
      cur = i;
      label.textContent = (cur + 1) + "/" + total;
      if (ctx && ctx.onAction) ctx.onAction("switch-version", msg, { versionIdx: cur });
    };
    prev.addEventListener("click", (e) => { e.stopPropagation(); if (cur > 0) update(cur - 1); });
    next.addEventListener("click", (e) => { e.stopPropagation(); if (cur < total - 1) update(cur + 1); });
    return row;
  }

  // ---------- 群聊 @ 高亮 ----------
  // 把 content 里的 @角色名 包成 <span class="mention">@角色名</span>
  // memberNames: 群成员名字数组（用于精确匹配；为空时跳过，单聊不受影响）
  function _highlightMentions(text, memberNames) {
    if (!text) return "";
    if (!memberNames || !memberNames.length) return text;
    // 按名字长度降序，避免短名先匹配（如 "小" 抢了 "小红"）
    const names = memberNames.slice().sort((a, b) => (b || "").length - (a || "").length);
    // 转义正则元字符
    const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp("@(" + names.map(esc).join("|") + ")(?![\\w])", "g");
    return text.replace(re, '<span class="mention">@$1</span>');
  }

  // 群聊角色色调：按 senderId hash 到 0-30 度，保持柔和
  // 同一个 senderId 在整个会话里 hue 稳定，不同 sender 视觉上有轻微区分
  function _hueForSender(senderId) {
    if (!senderId) return 0;
    let h = 0;
    for (let i = 0; i < senderId.length; i++) {
      h = (h * 31 + senderId.charCodeAt(i)) >>> 0;
    }
    return h % 31; // 0~30
  }

  // ---------- 渲染单条消息 ----------
  /**
   * @param {object} msg { id, role, content, type, createdAt, status, quote, thinking, pending, payload, versions, versionIdx, duration, poster, file, senderId }
   * @param {object} ctx { mode, character, thinking, tokenShow, ctxViz, contextStartIdx, ctxCount, conversationId, streaming, onAction,
   *                       isGroup, members, sender, mentionNames }
   *   群聊字段：
   *     ctx.isGroup=true 时启用群聊渲染（名称标签 + @ 高亮 + 按 sender 取头像）
   *     ctx.sender：当前消息的发送角色对象（群聊 AI 消息按 msg.senderId 查得），优先于 ctx.character
   *     ctx.mentionNames：群成员名字数组，用于 @ 高亮；为空则不高亮
   */
  function render(msg, ctx) {
    ctx = ctx || {};
    const isMe = msg.role === "user";
    const mode = ctx.mode || "bubble";
    // streaming 以 ctx.streaming 为准（conversation.js 流式期间传 true），缺省回退到 pending
    const streaming = ctx.streaming != null ? !!ctx.streaming : !!msg.pending;
    const failed = msg.status === "failed";
    // 群聊：AI 消息用 ctx.sender（按 msg.senderId 查的角色）代替 ctx.character
    const isGroup = !!ctx.isGroup;
    const senderChar = (isGroup && !isMe && ctx.sender) ? ctx.sender : ctx.character;
    const senderName = (isGroup && !isMe && senderChar) ? (senderChar.name || "AI") : (isMe ? "我" : ((ctx.character && ctx.character.name) || "AI"));

    const wrap = U.el("div", {
      class: "msg " + (mode === "bubble" ? "msg-bubble" : "msg-dialog")
        + (isMe ? " msg-me" : " msg-them")
        + (msg.pending ? " msg-pending" : "")
        + (failed ? " msg-failed" : ""),
      dataset: { id: msg.id, role: msg.role },
    });
    // 群聊 AI 消息：在 wrap 上挂 data-sender，CSS 可按需做轻微色调偏移
    // hue 通过 inline style 直接作用在气泡上（规范第 9 节），0-30 度保持柔和
    let groupHue = 0;
    if (isGroup && !isMe && msg.senderId) {
      wrap.setAttribute("data-sender", msg.senderId);
      groupHue = _hueForSender(msg.senderId);
    }

    // dialog 模式：顶部头像 + 名字 + 时间一行
    if (mode === "dialog") {
      const header = U.el("div", { class: "msg-dialog-head" });
      header.appendChild(_renderAvatar(isMe, senderChar));
      const headInfo = U.el("div", { class: "msg-dialog-headinfo" });
      headInfo.appendChild(U.el("span", { class: "msg-dialog-name", text: senderName }));
      headInfo.appendChild(U.el("span", { class: "msg-dialog-time", text: U.fmtHM(msg.createdAt || Date.now()) }));
      header.appendChild(headInfo);
      wrap.appendChild(header);
    } else {
      // bubble 模式：左侧（AI）或右侧（我）头像
      wrap.appendChild(_renderAvatar(isMe, senderChar));
    }

    // 主体
    const body = U.el("div", { class: "msg-body" });

    // 群聊名称标签（规范第 9 节）：气泡模式 AI 消息，气泡上方显示名称（11px secondary）
    if (isGroup && !isMe && mode === "bubble") {
      body.appendChild(U.el("div", { class: "msg-sender-name", text: senderName }));
    }

    // 5.9 引用（如果有）
    if (msg.quote) body.appendChild(_renderQuote(msg));

    // 5.3 思维链（仅 AI 消息，且有 thinking，且开关开）
    if (!isMe) {
      const { clean: _clean, thinking: tagThink } = _stripThink(msg.content || "");
      const thinking = msg.thinking || tagThink;
      if (thinking && _chainEnabled(ctx)) {
        body.appendChild(_renderCoT(thinking, msg, ctx));
      }
    }

    // 内容气泡
    const bubble = U.el("div", { class: "msg-bubble-text" });
    // 群聊 AI 消息：气泡色调偏移（规范第 9 节，hue-rotate 0-30 度，保持柔和）
    if (isGroup && !isMe && msg.senderId && groupHue) {
      try { bubble.style.filter = "hue-rotate(" + groupHue + "deg)"; } catch (_) {}
    }

    if (failed) {
      // 5.10 failed 态主区域不渲染 content（视为错误文本）
      bubble.classList.add("msg-error");
      bubble.appendChild(U.el("div", { class: "msg-error-hint", text: isMe ? "发送失败" : "出错了，点击查看详情" }));
      const parts = _renderErrorParts(msg, ctx);
      bubble.appendChild(parts.toggle);
      body.appendChild(bubble);
      body.appendChild(parts.detail);
    } else {
      const type = msg.type || "text";
      if (type === "image") {
        bubble.appendChild(_renderImage(msg));
      } else if (type === "voice") {
        bubble.appendChild(_renderVoice(msg));
      } else if (type === "video") {
        bubble.appendChild(_renderVideo(msg));
      } else if (type === "file") {
        bubble.appendChild(_renderFile(msg));
      } else if (type === "github") {
        bubble.appendChild(_renderGithub(msg, ctx));
      } else {
        // 文本：AI 消息剥离 <think> 后渲染；用户消息直接渲染
        let renderText = msg.content || "";
        if (!isMe) renderText = _stripThink(renderText).clean;
        if (streaming && renderText === "") {
          // 5.4 步骤一/二：占位气泡 + 跳动图标
          bubble.appendChild(_renderWaiting());
        } else {
          // 群聊：渲染前先 @ 高亮（在 Markdown 渲染之前包 span，避免破坏 MD 语法）
          if (isGroup && ctx.mentionNames && ctx.mentionNames.length) {
            renderText = _highlightMentions(renderText, ctx.mentionNames);
          }
          bubble.innerHTML = _renderMarkdown(renderText);
          _enhanceMarkdown(bubble, streaming);
          if (!streaming) {
            // 流式期间不调，避免抖动
            _wrapCodeBlocks(bubble);
            _wrapTables(bubble);
            _interceptLinks(bubble, ctx);
          } else {
            // 5.5 流式输出：打字光标 | 接替
            bubble.appendChild(U.el("span", { class: "msg-cursor", text: "|" }));
          }
        }
      }
      body.appendChild(bubble);
    }

    // 状态 / 时间
    const meta = U.el("div", { class: "msg-meta" });
    if (isMe && msg.status === "sending") {
      meta.appendChild(U.el("span", { class: "msg-status", text: "发送中" }));
    } else if (isMe && failed) {
      meta.appendChild(U.el("span", { class: "msg-status msg-status-fail", text: "发送失败" }));
    }
    // dialog 模式时间已在头部显示，气泡下不重复
    if (mode !== "dialog") {
      meta.appendChild(U.el("span", { class: "msg-time", text: U.fmtHM(msg.createdAt || Date.now()) }));
    }
    if (meta.childNodes.length) body.appendChild(meta);

    // AI 气泡底部操作行（pending/streaming/failed 时不显示）
    if (!isMe && !streaming && !msg.pending && !failed) {
      body.appendChild(_renderActions(msg, ctx));
    }

    // 10.4 版本指示点（AI 消息有多版本）
    if (!isMe && Array.isArray(msg.versions) && msg.versions.length > 1) {
      const v = _renderVersions(msg, ctx);
      if (v) body.appendChild(v);
    }

    wrap.appendChild(body);

    // 长按操作（300ms）
    let pressTimer = null;
    const startPress = () => {
      pressTimer = setTimeout(() => { _showActionSheet(msg, ctx); }, 300);
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

  // ---------- 6 长按操作面板 ----------
  function _showActionSheet(msg, ctx) {
    if (document.querySelector(".sheet-mask")) return;
    const isMe = msg.role === "user";
    const items = [];

    // AI 消息 9 项
    if (!isMe) {
      items.push({ icon: "refresh", label: "重新生成", fn: () => ctx && ctx.onAction && ctx.onAction("regenerate", msg) });
    }
    items.push({ icon: "copy", label: "复制文本", fn: () => { _copyText(_plainText(msg.content)); _toast("已复制"); } });
    if (!isMe) {
      items.push({
        icon: "copy", label: "复制Markdown", fn: () => {
          _copyText(msg.content || "");
          _toast("已复制 Markdown");
          if (ctx && ctx.onAction) ctx.onAction("copy-md", msg);
        },
      });
    }
    if (isMe) {
      // 用户消息额外项
      items.push({ icon: "edit", label: "编辑", fn: () => ctx && ctx.onAction && ctx.onAction("edit", msg) });
      items.push({ icon: "refresh", label: "重发", fn: () => ctx && ctx.onAction && ctx.onAction("resend", msg) });
      // 撤回 60s 门控：超时隐藏
      if (Date.now() - (msg.createdAt || 0) < 60000) {
        items.push({ icon: "backspace", label: "撤回", fn: () => ctx && ctx.onAction && ctx.onAction("recall", msg) });
      }
    }
    items.push({ icon: "quote", label: "引用回复", fn: () => ctx && ctx.onAction && ctx.onAction("quote", msg) });
    items.push({ icon: "forward", label: "转发", fn: () => ctx && ctx.onAction && ctx.onAction("forward", msg) });
    if (!isMe) {
      items.push({ icon: "volume", label: "TTS朗读", fn: () => _speakFromSheet(msg, ctx) });
    }
    items.push({
      icon: "star-fill", label: "收藏", fn: () => {
        if (ctx && ctx.onAction) ctx.onAction("favorite", msg);
        _toast("已收藏，收藏夹APP开发中");
      },
    });
    if (!isMe) {
      items.push({ icon: "download", label: "导出消息", fn: () => _exportMsg(msg, ctx) });
    }
    items.push({ icon: "trash", label: "删除", danger: true, fn: () => _confirmDelete(msg, ctx) });

    const mask = U.el("div", { class: "sheet-mask" });
    const sheet = U.el("div", { class: "sheet msg-action-sheet" });
    sheet.appendChild(U.el("div", { class: "sheet-handle" }));
    items.forEach((a) => {
      const item = U.el("div", { class: "sheet-item" + (a.danger ? " danger" : "") });
      const iconWrap = U.el("span", { class: "sheet-item-icon", html: Icons.get(a.icon, { size: 20 }) });
      item.appendChild(iconWrap);
      item.appendChild(document.createTextNode(a.label));
      item.addEventListener("click", () => { try { a.fn(); } catch (e) { console.warn(e); } mask.remove(); });
      sheet.appendChild(item);
    });
    const cancel = U.el("div", { class: "sheet-cancel", text: "取消" });
    cancel.addEventListener("click", () => mask.remove());
    sheet.appendChild(cancel);
    mask.appendChild(sheet);

    // 点击遮罩关闭
    mask.addEventListener("click", (e) => { if (e.target === mask) mask.remove(); });
    // 上滑关闭
    let startY = null;
    sheet.addEventListener("touchstart", (e) => { startY = e.touches[0].clientY; }, { passive: true });
    sheet.addEventListener("touchmove", (e) => {
      if (startY == null) return;
      const dy = e.touches[0].clientY - startY;
      if (dy < -40) { mask.remove(); startY = null; }
    }, { passive: true });

    document.body.appendChild(mask);
  }

  function _speakFromSheet(msg, ctx) {
    const TTS = global.Phone.TTS;
    if (!TTS) { _toast("朗读不可用"); return; }
    TTS.speak(_plainText(msg.content || ""), { voice: _ctxVoice(ctx), onEnd: () => {} });
  }

  function _exportMsg(msg, ctx) {
    const role = msg.role === "user" ? "我" : "AI";
    const time = U.fmtDateTime(msg.createdAt || Date.now());
    const body = msg.content || "";
    const md = "# 消息导出\n\n**角色**: " + role + "  \n**时间**: " + time + "\n\n---\n\n" + body + "\n";
    try { U.download("msg_" + (msg.id || "export") + ".md", md, "text/markdown"); } catch (_) {}
    if (ctx && ctx.onAction) ctx.onAction("export-msg", msg);
    _toast("已导出消息");
  }

  function _confirmDelete(msg, ctx) {
    const doDelete = () => { if (ctx && ctx.onAction) ctx.onAction("delete", msg); };
    const Modal = global.Phone.Modal;
    if (Modal && typeof Modal.confirm === "function") {
      Modal.confirm({
        title: "删除消息", message: "确定删除这条消息吗？", danger: true, okText: "删除",
      }).then((ok) => { if (ok) doDelete(); }).catch(() => {});
    } else {
      // 兜底（无 Modal 时）
      try { if (global.confirm("确定删除这条消息吗？")) doDelete(); } catch (_) {}
    }
  }

  function _copyText(text) {
    if (global.navigator && navigator.clipboard) {
      navigator.clipboard.writeText(text || "").catch(() => _copyFallback(text));
    } else {
      _copyFallback(text);
    }
  }

  function _copyFallback(text) {
    try {
      const ta = document.createElement("textarea");
      ta.value = text || "";
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy"); } catch (_) {}
      ta.remove();
    } catch (_) {}
  }

  function _toast(text) {
    const N = global.Phone.Notify;
    if (N && typeof N.push === "function") N.push({ appId: "chat", title: text });
  }

  // 渲染时间分组标签
  function renderTimeDivider(ts) {
    return U.el("div", { class: "msg-time-divider" }, [
      U.el("span", { text: _timeLabel(ts) }),
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
    stripThink: _stripThink,       // 暴露给 conversation.js 流式时剥离用
    enhanceMarkdown: _enhanceMarkdown,
    wrapCodeBlocks: _wrapCodeBlocks,
    plainText: _plainText,
    openLink: _openLink,
  };
})(window);
