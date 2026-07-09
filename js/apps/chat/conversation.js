/* ============================================================
   conversation.js — 聊天页骨架
   按预览稿页面2布局：顶部栏 + 消息区 + 输入栏
   顶部栏：返回 + 头像 + 名称 + 三点
   消息区：已有消息渲染为简单气泡
   输入栏：输入框 + 发送按钮（骨架阶段不真正发送）
   挂在 window.Phone.Conversation
   ============================================================ */
(function (global) {
  "use strict";

  /**
   * 我（聊天页）作为 Router 页面挂载
   * @param {HTMLElement} container
   * @param {object} params { conversationId, characterId }
   */
  async function mount(container, params) {
    var U = global.Phone.Utils;
    var Storage = global.Phone.Storage;

    var conversationId = params.conversationId;
    var conversation = await Storage.get("conversations", conversationId);
    if (!conversation) {
      conversation = {
        id: conversationId,
        characterId: params.characterId,
        messages: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
        mode: "bubble",
        draft: "",
        pinned: false,
        muted: false,
        contextStartIdx: 0,
      };
      await Storage.put("conversations", conversation);
    }

    var characterId = conversation.characterId || params.characterId;
    var characters = await Storage.getAll("characters");
    var character = characters.find(function (c) { return c.id === characterId; }) || { name: "AI" };

    // 进入对话清除未读
    if (conversation.unread) {
      conversation.unread = 0;
      Storage.put("conversations", conversation);
    }

    // ---------- 页面容器 ----------
    var page = U.el("div", { class: "conv-page" });

    // ---------- 顶部栏 ----------
    var nav = U.el("div", { class: "navbar conv-nav" });

    var backBtn = U.el("button", { class: "icon-btn nav-back" });
    backBtn.innerHTML = global.Phone.IconLibrary.get("chevron-left", { size: 22 });
    backBtn.addEventListener("click", function () { global.Phone.Router.back(); });
    nav.appendChild(backBtn);

    // 头像 + 名称
    var titleWrap = U.el("div", { class: "nav-title conv-nav-title" });
    var navAvatar = U.el("div", { class: "conv-nav-avatar" });
    if (character.avatar) navAvatar.innerHTML = '<img src="' + character.avatar + '" alt=""/>';
    else navAvatar.textContent = (character.name || "AI").slice(0, 1);
    titleWrap.appendChild(navAvatar);

    var titleText = U.el("div", {});
    titleText.appendChild(U.el("div", { class: "conv-title", text: character.name || "AI" }));
    titleText.appendChild(U.el("div", { class: "conv-subtitle", text: "在线" }));
    titleWrap.appendChild(titleText);
    nav.appendChild(titleWrap);

    // 三点菜单
    var navRight = U.el("div", { class: "nav-right" });
    var menuBtn = U.el("button", { class: "icon-btn nav-menu" });
    menuBtn.innerHTML = global.Phone.IconLibrary.get("more-vertical", { size: 22 });
    navRight.appendChild(menuBtn);
    nav.appendChild(navRight);
    page.appendChild(nav);

    // ---------- 消息区 ----------
    var listWrap = U.el("div", { class: "conv-list scroll" });
    var list = U.el("div", { class: "conv-list-inner" });
    listWrap.appendChild(list);
    page.appendChild(listWrap);

    // 渲染已有消息
    var msgs = conversation.messages || [];
    if (msgs.length === 0) {
      list.appendChild(U.el("div", {
        class: "chat-empty-state",
        style: { padding: "80px 24px" },
      }, [
        U.el("div", { class: "es-title", text: "开始聊天吧" }),
        U.el("div", { class: "es-sub", text: "在下方输入框说点什么" }),
      ]));
    } else {
      msgs.forEach(function (m) {
        list.appendChild(_renderMsg(m, character));
      });
    }

    // ---------- 输入栏 ----------
    var inputBar = U.el("div", { class: "input-bar" });
    var ibMain = U.el("div", { class: "ib-main" });

    var inputWrap = U.el("div", { class: "ib-input-wrap" });
    var input = U.el("textarea", {
      class: "ib-input",
      placeholder: "说点什么吧～",
      rows: 1,
    });
    if (conversation.draft) input.value = conversation.draft;
    inputWrap.appendChild(input);

    var sendBtn = U.el("button", {
      class: "ib-btn ib-send" + (input.value.trim() ? "" : " disabled"),
      html: global.Phone.IconLibrary.get("send", { size: 22 }),
    });

    ibMain.appendChild(inputWrap);
    ibMain.appendChild(sendBtn);
    inputBar.appendChild(ibMain);
    page.appendChild(inputBar);

    container.appendChild(page);

    // ---------- 输入交互 ----------
    function _autoResize() {
      input.style.height = "auto";
      var h = input.scrollHeight;
      if (h > 0) input.style.height = Math.min(h, 96) + "px";
    }

    function _updateSendBtn() {
      sendBtn.classList.toggle("disabled", !input.value.trim());
    }

    function _send() {
      var text = input.value.trim();
      if (!text) return;
      // 骨架阶段：不真正发送AI消息，只清空输入框
      input.value = "";
      _autoResize();
      _updateSendBtn();
      input.focus();
    }

    input.addEventListener("input", function () {
      _autoResize();
      _updateSendBtn();
    });
    input.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        _send();
      }
    });
    sendBtn.addEventListener("click", _send);

    _autoResize();
    _updateSendBtn();

    // 滚到底部
    requestAnimationFrame(function () {
      listWrap.scrollTop = listWrap.scrollHeight;
    });
  }

  // ---------- 渲染单条消息 ----------
  function _renderMsg(msg, character) {
    var U = global.Phone.Utils;
    var isUser = msg.role === "user";

    var row = U.el("div", { class: "msg-block" });
    var msgEl = U.el("div", { class: "msg " + (isUser ? "msg-me" : "msg-them") });

    // 头像
    var avatar = U.el("div", { class: "msg-avatar" });
    if (!isUser) {
      if (character.avatar) avatar.innerHTML = '<img src="' + character.avatar + '" alt=""/>';
      else avatar.textContent = (character.name || "AI").slice(0, 1);
    } else {
      avatar.textContent = "我";
    }
    msgEl.appendChild(avatar);

    // 气泡主体
    var body = U.el("div", { class: "msg-body" });
    var bubble = U.el("div", { class: "msg-bubble-text" });
    bubble.textContent = msg.content || "";
    body.appendChild(bubble);
    msgEl.appendChild(body);

    row.appendChild(msgEl);
    return row;
  }

  // ---------- 暴露 ----------
  global.Phone = global.Phone || {};
  global.Phone.Conversation = { mount: mount };
})(window);
