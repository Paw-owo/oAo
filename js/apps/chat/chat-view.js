/* ============================================================
 * chat-view.js — 消息APP 聊天页骨架
 * 严格对照预览稿：页面2 气泡模式 / 页面3 对话模式 / 页面6 GitHub卡片
 * 挂在 window.Phone.Conversation
 * 对外接口：mount(container, {conversationId, characterId})
 *   —— characters.js 通过此接口进入对话
 * 骨架阶段：渲染布局 + 基本交互，不实现真实 AI / GitHub 功能
 * ============================================================ */
(function (global) {
  "use strict";
  global.Phone = global.Phone || {};

  /**
   * 挂载聊天页
   * @param {HTMLElement} container
   * @param {{conversationId:string, characterId:string}} params
   */
  async function mount(container, params) {
    if (!container) return;
    params = params || {};

    var Storage = global.Phone.Storage;
    var U = global.Phone.Utils;
    var State = global.Phone.State;
    var Icons = global.Phone.ChatIcons;

    var conversationId = params.conversationId;
    var characterId = params.characterId;

    // ---------- 数据加载 ----------
    var conversation = conversationId ? await Storage.get("conversations", conversationId) : null;
    if (!conversation) {
      conversation = {
        id: conversationId || U.uid("conv"),
        characterId: characterId || null,
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
    if (!Array.isArray(conversation.messages)) conversation.messages = [];

    // 找到对应角色
    var character = null;
    var cid = conversation.characterId || characterId;
    if (cid) {
      var chars = await Storage.getAll("characters");
      for (var i = 0; i < chars.length; i++) {
        if (chars[i].id === cid) { character = chars[i]; break; }
      }
    }

    // 进入对话清未读
    if (conversation.unread) {
      conversation.unread = 0;
      await Storage.put("conversations", conversation);
    }

    var userName = (State && State.get("userName")) || "我";
    var charName = (character && character.name) || "AI";

    // 渲染上下文
    var ctx = {
      conversation: conversation,
      character: character,
      userName: userName,
      charName: charName,
      mode: conversation.mode === "dialog" ? "dialog" : "bubble",
      content: null,
      messagesEl: null,
    };

    // ---------- 小工具 ----------
    function icon(name, size) { return Icons.get(name, size); }
    function esc(s) { return U.escapeHtml(s); }
    function textHtml(t) { return esc(t || "").replace(/\n/g, "<br>"); }
    function notify(msg) {
      try {
        if (global.Phone.Notify && global.Phone.Notify.push) {
          global.Phone.Notify.push({ appId: "chat", title: msg });
        }
      } catch (e) {}
    }

    function aiAvatarHtml() {
      if (character && character.avatar) return '<img src="' + character.avatar + '" alt=""/>';
      return esc(charName.slice(0, 1));
    }
    function userAvatarHtml() { return esc(userName.slice(0, 1)); }

    // 时间分隔文案（对齐预览稿「今天 HH:MM」风格）
    function fmtSep(ts) {
      var d = new Date(ts);
      var now = new Date();
      var hh = U.pad2(d.getHours()), mm = U.pad2(d.getMinutes());
      if (d.toDateString() === now.toDateString()) return "今天 " + hh + ":" + mm;
      var y = new Date(now.getTime() - 86400000);
      if (d.toDateString() === y.toDateString()) return "昨天 " + hh + ":" + mm;
      if ((now.getTime() - d.getTime()) < 7 * 86400000) return U.WEEK_CN[d.getDay()] + " " + hh + ":" + mm;
      return (d.getMonth() + 1) + "月" + d.getDate() + "日";
    }

    // ---------- GitHub 结果卡片 HTML（嵌在气泡 / 对话块内）----------
    function githubCardHtml(g) {
      if (!g) return "";
      var statusClass = g.status === "merge" ? "status-merge"
        : (g.status === "closed" ? "status-closed" : "status-open");
      var html = '<div class="github-card">';
      html += '<div class="github-top"><span>' + esc(g.header || "") + "</span>";
      if (g.statusText) html += '<span class="' + statusClass + '">' + esc(g.statusText) + "</span>";
      html += "</div>";
      if (g.title) html += '<div class="github-title">' + esc(g.title) + "</div>";
      if (g.meta && g.meta.length) {
        html += '<div class="github-meta">';
        g.meta.forEach(function (m) { html += "<span>" + esc(m) + "</span>"; });
        html += "</div>";
      }
      if (g.actions && g.actions.length) {
        html += '<div class="github-actions">';
        g.actions.forEach(function (a) { html += '<span class="mini-btn">' + esc(a) + "</span>"; });
        html += "</div>";
      }
      html += "</div>";
      return html;
    }

    // ---------- 消息渲染 ----------
    function renderMessages() {
      U.empty(ctx.messagesEl);
      var msgs = conversation.messages || [];
      if (msgs.length === 0) {
        var empty = U.el("div", { class: "chat-empty" });
        empty.innerHTML = icon("msg-empty", 64);
        var svg = empty.querySelector("svg");
        if (svg) { svg.style.width = "64px"; svg.style.height = "64px"; }
        empty.appendChild(U.el("div", { class: "chat-empty-title", text: "还没有消息" }));
        empty.appendChild(U.el("div", { class: "chat-empty-sub", text: "在下面输入框里说点什么吧" }));
        ctx.messagesEl.appendChild(empty);
        return;
      }
      var lastTs = 0;
      msgs.forEach(function (msg) {
        var ts = msg.createdAt || 0;
        var needSep = !lastTs
          || (ts && new Date(ts).toDateString() !== new Date(lastTs).toDateString())
          || (ts && ts - lastTs > 5 * 60 * 1000);
        if (needSep) {
          ctx.messagesEl.appendChild(U.el("div", { class: "time-sep", text: fmtSep(ts || lastTs || Date.now()) }));
        }
        if (ts) lastTs = ts;
        ctx.messagesEl.appendChild(renderRow(msg));
      });
    }

    function renderRow(msg) {
      return ctx.mode === "dialog" ? renderDialogRow(msg) : renderBubbleRow(msg);
    }

    // 气泡模式（页面2）
    function renderBubbleRow(msg) {
      var isAi = msg.role === "assistant";
      var row = U.el("div", { class: "row " + (isAi ? "ai" : "user") });
      var wrap = U.el("div", { class: "bubble-wrap" });

      // 思维链折叠卡片（可选）
      if (msg.cot) {
        var steps = (typeof msg.cot === "object" && msg.cot.steps) ? msg.cot.steps + "步" : "展开";
        wrap.appendChild(U.el("div", { class: "cot-card", html: "<span>查看思考过程</span><span>" + esc(steps) + "</span>" }));
      }

      // GitHub 操作作者标签
      if (msg.type === "github" && isAi) {
        wrap.appendChild(U.el("div", { class: "msg-author-tag", text: charName + " · GitHub 操作" }));
      }

      // 引用块（用户消息可选）
      if (!isAi && msg.quote) {
        wrap.appendChild(U.el("div", {
          class: "quote-box",
          html: "引用 · " + esc(msg.quote.name || charName) + "<br>" + esc(msg.quote.text || ""),
        }));
      }

      // 气泡
      var bubbleHtml = textHtml(msg.content) + (msg.type === "github" ? githubCardHtml(msg.github) : "");
      wrap.appendChild(U.el("div", { class: "bubble " + (isAi ? "ai" : "user"), html: bubbleHtml }));

      // AI 消息底部操作行（刷新 / 朗读 / 复制）
      if (isAi) {
        var actions = U.el("div", { class: "msg-actions" });
        actions.appendChild(U.el("span", { class: "action-pill", html: icon("refresh", 12) + "刷新" }));
        actions.appendChild(U.el("span", { class: "action-pill", html: icon("volume", 12) + "朗读" }));
        var copyPill = U.el("span", { class: "action-pill", html: icon("copy", 12) + "复制" });
        copyPill.addEventListener("click", function () { copyText(msg.content || ""); });
        actions.appendChild(copyPill);
        wrap.appendChild(actions);
      }

      // 组装：AI 头像在左，用户头像在右（严格对照预览稿 DOM 顺序）
      if (isAi) {
        row.appendChild(U.el("div", { class: "avatar chat-avatar", html: aiAvatarHtml() }));
        row.appendChild(wrap);
      } else {
        row.appendChild(wrap);
        row.appendChild(U.el("div", { class: "avatar chat-avatar soft", html: userAvatarHtml() }));
      }
      return row;
    }

    // 对话模式（页面3）——左右头像布局，无气泡底色
    function renderDialogRow(msg) {
      var isAi = msg.role === "assistant";
      var row = U.el("div", { class: "dialog-row " + (isAi ? "ai" : "user") });
      var content = U.el("div", { class: "dialog-content" });
      content.appendChild(U.el("div", { class: "dialog-role-tag", text: isAi ? "AI" : "用户" }));
      var blockHtml = textHtml(msg.content) + (msg.type === "github" ? githubCardHtml(msg.github) : "");
      content.appendChild(U.el("div", { class: "dialog-text-block", html: blockHtml }));

      // 思维链折叠卡片（对话模式下放在文本块下方）
      if (msg.cot) {
        var steps = (typeof msg.cot === "object" && msg.cot.steps) ? msg.cot.steps + "步" : "展开";
        var cot = U.el("div", { class: "cot-card", html: "<span>查看思考过程</span><span>" + esc(steps) + "</span>" });
        cot.style.marginTop = "8px";
        content.appendChild(cot);
      }

      if (isAi) {
        row.appendChild(U.el("div", { class: "avatar chat-avatar", html: aiAvatarHtml() }));
        row.appendChild(content);
      } else {
        row.appendChild(content);
        row.appendChild(U.el("div", { class: "avatar chat-avatar soft", html: userAvatarHtml() }));
      }
      return row;
    }

    // ---------- 顶部栏 ----------
    function buildTopbar() {
      var bar = U.el("div", { class: "topbar" });

      var left = U.el("div", { class: "topbar-left" });
      var back = U.el("div", { class: "icon-btn", html: icon("chevron-left") });
      back.addEventListener("click", function () { global.Phone.Router.back(); });
      left.appendChild(back);
      left.appendChild(U.el("div", { class: "avatar chat-avatar", html: aiAvatarHtml() }));
      var info = U.el("div", { class: "topbar-info" });
      info.appendChild(U.el("div", { class: "topbar-name", text: charName }));
      var subText = (character && character.description) ? character.description : "人设来源";
      info.appendChild(U.el("div", { class: "topbar-sub", text: subText }));
      left.appendChild(info);
      bar.appendChild(left);

      var right = U.el("div", { class: "topbar-right" });
      // 心形按钮：骨架阶段不实现
      right.appendChild(U.el("div", { class: "icon-btn", html: icon("heart") }));
      var more = U.el("div", { class: "icon-btn", html: icon("more") });
      more.addEventListener("click", openSettings);
      right.appendChild(more);
      bar.appendChild(right);

      return bar;
    }

    function openSettings() {
      if (global.Phone.ChatSettings && typeof global.Phone.ChatSettings.mount === "function") {
        global.Phone.Router.push("chat-settings", global.Phone.ChatSettings.mount, { conversationId: conversation.id });
      } else {
        notify("聊天设置即将上线");
      }
    }

    // ---------- 内容区（含模式切换 tabs）----------
    function buildContent() {
      var content = U.el("div", { class: "content scroll" });

      // 模式切换 tabs（对齐预览稿页面3）
      var tabs = U.el("div", { class: "tabs" });
      tabs.style.margin = "8px 14px 4px";
      var tabBubble = U.el("span", { text: "气泡模式" });
      var tabDialog = U.el("span", { text: "对话模式" });
      function syncTabs() {
        tabBubble.className = ctx.mode === "bubble" ? "active" : "";
        tabDialog.className = ctx.mode === "dialog" ? "active" : "";
      }
      tabBubble.addEventListener("click", function () {
        if (ctx.mode === "bubble") return;
        ctx.mode = "bubble";
        persistMode();
        syncTabs();
        renderMessages();
        scrollBottom();
      });
      tabDialog.addEventListener("click", function () {
        if (ctx.mode === "dialog") return;
        ctx.mode = "dialog";
        persistMode();
        syncTabs();
        renderMessages();
        scrollBottom();
      });
      syncTabs();
      tabs.appendChild(tabBubble);
      tabs.appendChild(tabDialog);
      content.appendChild(tabs);

      var messages = U.el("div", { class: "messages" });
      content.appendChild(messages);
      return { content: content, messages: messages };
    }

    function persistMode() {
      conversation.mode = ctx.mode;
      conversation.updatedAt = Date.now();
      Storage.put("conversations", conversation);
    }

    function scrollBottom() {
      requestAnimationFrame(function () {
        if (ctx.content) ctx.content.scrollTop = ctx.content.scrollHeight;
      });
    }

    // ---------- 输入栏 ----------
    function buildInputZone() {
      var zone = U.el("div", { class: "input-zone" });
      var bar = U.el("div", { class: "inputbar" });

      // 加号：骨架阶段不实现工具箱展开
      bar.appendChild(U.el("div", { class: "icon-btn", html: icon("plus") }));

      var textarea = U.el("textarea", { class: "textarea", placeholder: "输入消息…" });
      bar.appendChild(textarea);

      bar.appendChild(U.el("div", { class: "icon-btn", html: icon("smile") }));

      var sendBtn = U.el("div", { class: "send-btn muted", html: icon("send", 14) });
      bar.appendChild(sendBtn);

      zone.appendChild(bar);

      function syncSend() {
        var v = textarea.value.trim();
        if (v) sendBtn.classList.remove("muted");
        else sendBtn.classList.add("muted");
      }
      function autoSize() {
        textarea.style.height = "auto";
        if (textarea.scrollHeight > 0) {
          textarea.style.height = Math.min(textarea.scrollHeight, 96) + "px";
        }
      }
      textarea.addEventListener("input", function () { autoSize(); syncSend(); });
      textarea.addEventListener("keydown", function (e) {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          doSend();
        }
      });
      sendBtn.addEventListener("click", function () {
        if (!sendBtn.classList.contains("muted")) doSend();
      });

      function doSend() {
        // 骨架阶段：只清空输入框，不真正发送 AI 消息
        textarea.value = "";
        autoSize();
        syncSend();
      }

      return { zone: zone, textarea: textarea, sendBtn: sendBtn };
    }

    // ---------- 复制 ----------
    function copyText(text) {
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(function () { notify("已复制"); }, function () { fallbackCopy(text); });
        } else {
          fallbackCopy(text);
        }
      } catch (e) {
        fallbackCopy(text);
      }
    }
    function fallbackCopy(text) {
      try {
        var ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        ta.remove();
        notify("已复制");
      } catch (e) {}
    }

    // ---------- 组装 ----------
    var screen = U.el("div", { class: "chat-screen" });
    container.appendChild(screen);

    screen.appendChild(buildTopbar());

    var c = buildContent();
    ctx.content = c.content;
    ctx.messagesEl = c.messages;
    screen.appendChild(c.content);
    renderMessages();

    var iz = buildInputZone();
    screen.appendChild(iz.zone);

    // 进入时滚到底部
    scrollBottom();
  }

  // ---------- 暴露 ----------
  global.Phone.Conversation = { mount: mount };
})(window);
