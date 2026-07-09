/* ============================================================
   chat.js — 会话列表页
   按预览稿页面1布局：顶部栏 + 搜索栏 + 会话列表
   数据从 Phone.Storage 统一读取
   挂在 window.Phone.Chat.mount
   ============================================================ */
(function (global) {
  "use strict";

  /**
   * 我（会话列表）挂载到容器
   */
  async function mount(container) {
    var U = global.Phone.Utils;
    var Storage = global.Phone.Storage;

    var page = U.el("div", { class: "page chat-list-page" });

    // ---------- 顶部栏 ----------
    var nav = U.el("div", { class: "navbar" });
    var navLeft = U.el("div", { class: "nav-left" });
    var backBtn = U.el("button", { class: "icon-btn" });
    backBtn.innerHTML = global.Phone.IconLibrary.get("chevron-left", { size: 22 });
    backBtn.addEventListener("click", function () { global.Phone.Router.back(); });
    navLeft.appendChild(backBtn);
    nav.appendChild(navLeft);

    nav.appendChild(U.el("div", { class: "nav-title", text: "消息" }));

    var navRight = U.el("div", { class: "nav-right" });
    nav.appendChild(navRight);
    page.appendChild(nav);

    // ---------- 搜索栏 ----------
    var searchBar = U.el("div", { class: "chat-search" }, [
      U.el("span", { class: "cs-icon", html: global.Phone.IconLibrary.get("search", { size: 18 }) }),
    ]);
    var searchInput = U.el("input", { class: "cs-input", placeholder: "搜索角色名、消息内容..." });
    searchBar.appendChild(searchInput);
    page.appendChild(searchBar);

    // ---------- 列表 ----------
    var listWrap = U.el("div", { class: "chat-list-wrap scroll" });
    var list = U.el("div", { class: "chat-list" });
    listWrap.appendChild(list);
    page.appendChild(listWrap);

    container.appendChild(page);

    // ---------- 数据加载 ----------
    async function refresh() {
      U.empty(list);
      var convs = await Storage.getAll("conversations");
      convs = convs.filter(function (c) { return !c.hidden; });
      convs.sort(function (a, b) {
        if (!!b.pinned !== !!a.pinned) return !!b.pinned ? 1 : -1;
        return (b.updatedAt || 0) - (a.updatedAt || 0);
      });

      if (convs.length === 0) {
        list.appendChild(_emptyState());
        return;
      }

      var chars = await Storage.getAll("characters");
      convs.forEach(function (c) {
        var char = chars.find(function (ch) { return ch.id === c.characterId; }) || { name: "AI" };
        var lastMsg = c.messages && c.messages.length ? c.messages[c.messages.length - 1] : null;
        list.appendChild(_renderItem(c, char, lastMsg));
      });
    }

    // 搜索（骨架：输入时不刷新，保留列表）
    searchInput.addEventListener("input", function () {
      // 骨架阶段不实现搜索逻辑
    });

    refresh();
  }

  // ---------- 渲染单条会话 ----------
  function _renderItem(conv, char, lastMsg) {
    var U = global.Phone.Utils;
    var item = U.el("div", { class: "chat-list-item" + (conv.pinned ? " pinned" : "") });

    // 主体：头像 + 信息
    var main = U.el("div", { class: "cli-main" });

    // 头像
    var avatar = U.el("div", { class: "li-avatar" });
    if (char.avatar) avatar.innerHTML = '<img src="' + char.avatar + '" alt=""/>';
    else avatar.textContent = (char.name || "AI").slice(0, 1);
    main.appendChild(avatar);

    // 信息区
    var info = U.el("div", { class: "li-main" });

    // 上行：名字 + 时间
    info.appendChild(U.el("div", { class: "cli-top" }, [
      U.el("div", { class: "li-title", text: char.name || "AI" }),
      U.el("div", { class: "li-right", text: lastMsg ? _fmtTime(lastMsg.createdAt || conv.updatedAt) : "" }),
    ]));

    // 下行：预览 + 未读角标
    var subWrap = U.el("div", { class: "cli-sub" });
    var preview = "开始聊天吧～";
    if (lastMsg) {
      if (lastMsg.type === "image") preview = "[图片]";
      else if (lastMsg.type === "voice") preview = "[语音]";
      else preview = U.truncate(lastMsg.content || "", 30);
    }
    subWrap.appendChild(U.el("div", { class: "li-sub", text: preview }));
    if (conv.unread > 0) {
      subWrap.appendChild(U.el("div", {
        class: "cli-badge",
        text: conv.unread > 99 ? "99+" : String(conv.unread),
      }));
    }
    info.appendChild(subWrap);

    main.appendChild(info);
    item.appendChild(main);

    // 点击进入聊天页
    item.addEventListener("click", function () {
      global.Phone.Router.push("conversation", global.Phone.Conversation.mount, {
        conversationId: conv.id,
        characterId: conv.characterId,
      });
    });

    return item;
  }

  // ---------- 时间格式 ----------
  function _fmtTime(ts) {
    var U = global.Phone.Utils;
    var now = new Date();
    var d = new Date(ts);
    var day = 24 * 3600 * 1000;
    if (now.toDateString() === d.toDateString()) return U.fmtHM(ts);
    if (new Date(now.getTime() - day).toDateString() === d.toDateString()) return "昨天";
    if (now.getFullYear() === d.getFullYear() && (now.getTime() - ts) < day * 7) {
      return U.WEEK_CN[d.getDay()];
    }
    if (now.getFullYear() === d.getFullYear()) {
      return (d.getMonth() + 1) + "月" + d.getDate() + "日";
    }
    return d.getFullYear() + "年" + (d.getMonth() + 1) + "月";
  }

  // ---------- 空状态 ----------
  function _emptyState() {
    var U = global.Phone.Utils;
    return U.el("div", { class: "chat-empty-state" }, [
      U.el("div", {
        class: "chat-empty-illust",
        html: '<svg viewBox="0 0 96 96" width="96" height="96" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">' +
              '<path d="M16 30a10 10 0 0 1 10-10h44a10 10 0 0 1 10 10v22a10 10 0 0 1-10 10H38l-14 12v-12h-2a6 6 0 0 1-6-6V30z"/>' +
              '<path d="M34 41h28M34 50h20"/></svg>',
      }),
      U.el("div", { class: "es-title", text: "还没有对话" }),
      U.el("div", { class: "es-sub", text: "在角色APP里选个人开始聊吧" }),
    ]);
  }

  // ---------- 暴露 ----------
  global.Phone = global.Phone || {};
  global.Phone.Chat = global.Phone.Chat || {};
  global.Phone.Chat.mount = mount;
})(window);
