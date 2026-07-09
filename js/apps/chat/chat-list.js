/* ============================================================
 * chat-list.js — 消息APP 会话列表页（预览稿页面1）+ 搜索结果页（预览稿页面8）
 * 严格对照预览稿 v4 的 HTML 结构 / class 命名 / 层级关系
 * 挂在 window.Phone.ChatList
 *   - mountList(container)           挂载会话列表页（async）
 *   - mountSearch(container, params) 挂载搜索结果页
 * ============================================================ */
(function (global) {
  "use strict";

  global.Phone = global.Phone || {};

  // ---------- 图标（延迟读取，避免加载顺序问题） ----------
  function _icon(name, size) {
    var ci = global.Phone.ChatIcons;
    return ci ? ci.get(name, size) : "";
  }

  // ---------- 时间格式：列表页时间戳 ----------
  // 今天 HH:mm / 昨天 HH:mm / 本周内 周X HH:mm / 今年 M月D日 / 跨年 YYYY年M月D日
  function _fmtTime(ts) {
    if (!ts) return "";
    var U = global.Phone.Utils;
    var now = new Date();
    var d = new Date(ts);
    var day = 24 * 3600 * 1000;
    if (now.toDateString() === d.toDateString()) return U.fmtHM(ts);
    if (new Date(now.getTime() - day).toDateString() === d.toDateString()) return "昨天 " + U.fmtHM(ts);
    if (now.getTime() - ts < 7 * day) return U.WEEK_CN[d.getDay()] + " " + U.fmtHM(ts);
    if (now.getFullYear() === d.getFullYear()) return (d.getMonth() + 1) + "月" + d.getDate() + "日";
    return d.getFullYear() + "年" + (d.getMonth() + 1) + "月" + d.getDate() + "日";
  }

  // ---------- 角色名首字 ----------
  function _firstChar(name) {
    if (!name) return "?";
    return String(name).charAt(0);
  }

  // ---------- 会话预览文本（草稿优先，否则取最后一条消息） ----------
  function _previewText(conv) {
    var U = global.Phone.Utils;
    if (conv.draft) return "[草稿] " + U.truncate(conv.draft, 40);
    var msgs = conv.messages || [];
    if (msgs.length === 0) return "";
    var last = msgs[msgs.length - 1];
    var content = last && last.content ? String(last.content) : "";
    return U.truncate(content, 40);
  }

  // ---------- 空状态 ----------
  function _emptyState(title, sub) {
    var U = global.Phone.Utils;
    // minHeight:100% 让空状态在 .list / .content（定高 flex 项）内撑满并垂直居中
    var wrap = U.el("div", { class: "chat-empty", style: { minHeight: "100%" } });
    var iconBox = U.el("div", { html: _icon("msg-empty", 80) });
    wrap.appendChild(iconBox);
    if (title) wrap.appendChild(U.el("div", { class: "chat-empty-title", text: title }));
    if (sub) wrap.appendChild(U.el("div", { class: "chat-empty-sub", text: sub }));
    return wrap;
  }

  // ============================================================
  //  会话列表页（预览稿页面1）
  // ============================================================
  async function mountList(container) {
    var U = global.Phone.Utils;
    var Storage = global.Phone.Storage;
    var Router = global.Phone.Router;

    var screen = U.el("div", { class: "chat-screen" });

    // 标题
    screen.appendChild(U.el("div", { class: "app-title", text: "消息" }));

    // 搜索栏（点击跳转搜索页）
    var searchbar = U.el("div", {
      class: "searchbar",
      style: { cursor: "pointer" },
      onClick: function () { Router.push("chat-search", mountSearch, {}); },
    });
    searchbar.innerHTML = _icon("search", 16);
    searchbar.appendChild(document.createTextNode("搜索角色名、消息内容..."));
    screen.appendChild(searchbar);

    // 工具行：tabs + 新建按钮
    var toolbar = U.el("div", { class: "list-toolbar" });
    var tabs = U.el("div", { class: "tabs" });
    ["全部", "未读", "群聊"].forEach(function (name, i) {
      var span = U.el("span", {
        class: i === 0 ? "active" : "",
        text: name,
        // 骨架阶段：仅切换 active，不实现真实过滤
        onClick: function () {
          Array.prototype.forEach.call(tabs.children, function (s) { s.classList.remove("active"); });
          span.classList.add("active");
        },
      });
      tabs.appendChild(span);
    });
    toolbar.appendChild(tabs);

    var plusBtn = U.el("div", {
      class: "icon-btn",
      onClick: function () {
        // 跳转角色选择，从角色页发起会话
        if (global.Phone.AppRegistry && global.Phone.AppRegistry.open) {
          global.Phone.AppRegistry.open("characters");
        }
      },
    });
    plusBtn.innerHTML = _icon("plus", 16);
    toolbar.appendChild(plusBtn);
    screen.appendChild(toolbar);

    // 列表容器
    var list = U.el("div", { class: "list" });
    screen.appendChild(list);

    container.appendChild(screen);

    // ---------- 拉数据 ----------
    var conversations = [];
    var charMap = {};
    try {
      conversations = (await Storage.getAll("conversations")) || [];
      var chars = (await Storage.getAll("characters")) || [];
      chars.forEach(function (c) { charMap[c.id] = c; });
    } catch (e) {
      console.error("[ChatList] 读取会话数据失败", e);
    }

    // 过滤隐藏会话 + 排序：置顶优先，再按更新时间降序
    conversations = conversations.filter(function (c) { return !c.hidden; });
    conversations.sort(function (a, b) {
      var pa = a.pinned ? 1 : 0;
      var pb = b.pinned ? 1 : 0;
      if (pa !== pb) return pb - pa;
      return (b.updatedAt || 0) - (a.updatedAt || 0);
    });

    if (conversations.length === 0) {
      list.appendChild(_emptyState("还没有对话", "点击右上角加号开始吧"));
      return;
    }

    conversations.forEach(function (conv) {
      list.appendChild(_listItem(conv, charMap));
    });
  }

  // ---------- 单个会话列表项 ----------
  function _listItem(conv, charMap) {
    var U = global.Phone.Utils;
    var Router = global.Phone.Router;
    var character = charMap[conv.characterId] || null;
    var name = character && character.name ? character.name : "未知";

    var item = U.el("div", {
      class: "list-item" + (conv.pinned ? " pinned" : ""),
      onClick: function () {
        Router.push("conversation", global.Phone.Conversation.mount, {
          conversationId: conv.id,
          characterId: conv.characterId,
        });
      },
    });

    // 头像：有图用图，否则取角色名首字
    var avatar = U.el("div", { class: "avatar" });
    if (character && character.avatar) {
      avatar.appendChild(U.el("img", { src: character.avatar, alt: name }));
    } else {
      avatar.textContent = _firstChar(name);
    }
    item.appendChild(avatar);

    // 主体：名称 + 时间 + 预览
    var main = U.el("div", { class: "list-main" });
    var top = U.el("div", { class: "list-top" });
    top.appendChild(U.el("div", { class: "list-name", text: name }));
    top.appendChild(U.el("div", { class: "list-time", text: _fmtTime(conv.updatedAt) }));
    main.appendChild(top);
    main.appendChild(U.el("div", { class: "list-preview", text: _previewText(conv) }));
    item.appendChild(main);

    // 未读角标：>99 显示 99+
    if (conv.unread && conv.unread > 0) {
      var badgeText = conv.unread > 99 ? "99+" : String(conv.unread);
      item.appendChild(U.el("div", { class: "badge", text: badgeText }));
    }

    return item;
  }

  // ============================================================
  //  搜索结果页（预览稿页面8）
  // ============================================================
  function mountSearch(container, params) {
    var U = global.Phone.Utils;
    var Router = global.Phone.Router;
    params = params || {};

    var screen = U.el("div", { class: "chat-screen" });

    // 顶部栏：返回 + 标题
    var topbar = U.el("div", { class: "topbar" });
    var topbarLeft = U.el("div", { class: "topbar-left" });
    var backBtn = U.el("div", {
      class: "icon-btn",
      onClick: function () { Router.back(); },
    });
    backBtn.innerHTML = _icon("chevron-left", 16);
    topbarLeft.appendChild(backBtn);
    var info = U.el("div", { class: "topbar-info" });
    info.appendChild(U.el("div", { class: "topbar-name", text: "搜索消息" }));
    info.appendChild(U.el("div", { class: "topbar-sub", text: "跨会话查找角色名 / 内容" }));
    topbarLeft.appendChild(info);
    topbar.appendChild(topbarLeft);
    screen.appendChild(topbar);

    // 搜索栏（带真实 input）
    var searchbar = U.el("div", { class: "searchbar", style: { marginTop: "8px" } });
    searchbar.innerHTML = _icon("search", 16);
    searchbar.appendChild(U.el("input", { type: "text", placeholder: "搜索角色名、消息内容..." }));
    screen.appendChild(searchbar);

    // 内容区
    var content = U.el("div", { class: "content scroll" });
    screen.appendChild(content);

    container.appendChild(screen);

    // 骨架阶段：不实现真实搜索，展示空状态提示
    content.appendChild(_emptyState("搜索消息", "输入关键词跨会话查找"));
  }

  // ---------- 暴露 ----------
  global.Phone.ChatList = {
    mountList: mountList,
    mountSearch: mountSearch,
  };
})(window);
