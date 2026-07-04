/* ============================================================
   input-bar.js — 输入工具栏
   布局：表情按钮 / 输入框 / 加号按钮 / 发送按钮
   颜文字浮层 / 图片表情包面板（收藏 / 添加）
   加号功能面板（相册 / 转账 / 送礼物 / 发位置 / 角色名片 / 提醒事项 / 掷骰子 / 石头剪刀布）
   斜杠命令 / 草稿自动保存 / 防抖提交
   挂在 window.Phone.InputBar
   ============================================================ */
(function (global) {
  "use strict";

  // 颜文字（文字符号组合，不是 emoji）
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

  // 加号面板 8 个功能定义（每行 4 个）
  const PLUS_FEATURES = [
    { key: "album",    icon: "image",     label: "相册" },
    { key: "transfer", icon: "wallet",    label: "转账" },
    { key: "gift",     icon: "gift",      label: "送礼物" },
    { key: "location", icon: "map-pin",   label: "发位置" },
    { key: "card",     icon: "user",      label: "角色名片" },
    { key: "memo",     icon: "clock",     label: "提醒事项" },
    { key: "dice",     icon: "dice",      label: "掷骰子" },
    { key: "rps",      icon: "hand",      label: "石头剪刀布" },
  ];

  // 表情包大小上限（2MB）
  const STICKER_MAX_BYTES = 2 * 1024 * 1024;

  /**
   * 我（输入栏）渲染到容器
   * @param {object} opts {
   *   initialDraft, onSend(text|{type,content}), onTyping, quote,
   *   onCancelQuote, onDraft, onCommand, enterToSend,
   *   conversationId, characterId, character
   * }
   *   enterToSend: 默认 true；false 时回车换行，点按钮才发送
   */
  function mount(opts) {
    opts = opts || {};
    const U = global.Phone.Utils;
    const enterToSend = opts.enterToSend !== false;

    const bar = U.el("div", { class: "input-bar" });

    // 引用回复区
    if (opts.quote) {
      bar.appendChild(_renderQuote(opts.quote, opts.onCancelQuote));
    }

    const main = U.el("div", { class: "ib-main" });

    // 1. 表情按钮
    const emojiBtn = U.el("button", {
      class: "ib-btn ib-emoji-btn",
      html: global.Phone.IconLibrary.get("smile", { size: 22 }),
      title: "表情",
      "aria-label": "表情",
    });
    main.appendChild(emojiBtn);

    // 2. 输入框
    const inputWrap = U.el("div", { class: "ib-input-wrap" });
    const input = U.el("textarea", {
      class: "ib-input",
      placeholder: "说点什么吧～",
      rows: 1,
    });
    if (opts.initialDraft) input.value = opts.initialDraft;
    inputWrap.appendChild(input);
    main.appendChild(inputWrap);

    // 3. 加号按钮
    const plusBtn = U.el("button", {
      class: "ib-btn ib-plus-btn",
      html: global.Phone.IconLibrary.get("plus", { size: 22 }),
      title: "更多功能",
      "aria-label": "更多功能",
    });
    main.appendChild(plusBtn);

    // 4. 发送按钮（44x44 主色渐变圆形，纸飞机白色，scale(0.97) 点击效果）
    const sendBtn = U.el("button", {
      class: "ib-send" + (input.value.trim() ? "" : " disabled"),
      html: global.Phone.IconLibrary.get("send", { size: 22 }),
      title: "发送",
      "aria-label": "发送",
    });
    main.appendChild(sendBtn);

    bar.appendChild(main);

    // 隐藏的图片选择 input（相册 / 添加表情包共用）
    const imgInput = U.el("input", { type: "file", accept: "image/*", style: "display:none" });
    bar.appendChild(imgInput);

    // ---------- 表情 / 表情包面板 ----------
    let panel = null;       // 当前打开的面板元素（颜文字+表情包 / 加号功能）
    let panelMode = null;   // "emoji" | "plus" | null

    emojiBtn.addEventListener("click", () => {
      _closeCmdPanel();
      if (panel && panelMode === "emoji") {
        _closePanel();
        return;
      }
      _closePanel();
      _openEmojiPanel();
    });

    plusBtn.addEventListener("click", () => {
      _closeCmdPanel();
      if (panel && panelMode === "plus") {
        _closePanel();
        return;
      }
      _closePanel();
      _openPlusPanel();
    });

    function _openEmojiPanel() {
      panel = U.el("div", { class: "ib-panel ib-emoji-panel open" });
      panelMode = "emoji";

      // 顶部 tab：颜文字 / 收藏 / 添加
      const tabs = U.el("div", { class: "ibe-tabs" }, [
        U.el("div", { class: "ibe-tab active", text: "颜文字", dataset: { tab: "kaomoji" } }),
        U.el("div", { class: "ibe-tab", text: "收藏", dataset: { tab: "fav" } }),
        U.el("div", { class: "ibe-tab", text: "添加", dataset: { tab: "add" } }),
      ]);
      panel.appendChild(tabs);

      const body = U.el("div", { class: "ibe-body" });
      panel.appendChild(body);

      // 三个内容区
      const kaomojiView = U.el("div", { class: "ibe-view active" });
      EMOJIS.forEach((e) => {
        const item = U.el("button", { class: "ibe-emoji-item", text: e });
        item.addEventListener("click", () => {
          input.value += e;
          _autoResize();
          _updateSendBtn();
          input.focus();
        });
        kaomojiView.appendChild(item);
      });
      body.appendChild(kaomojiView);

      const favView = U.el("div", { class: "ibe-view" });
      body.appendChild(favView);

      const addView = U.el("div", { class: "ibe-view" });
      const addHint = U.el("div", {
        class: "ibe-add-hint",
        text: "选一张图片加到表情包收藏里，长按可以删除。单张不超过 2MB 哦。",
      });
      const addBtn = U.el("button", { class: "btn btn-ghost btn-block", text: "从相册选一张" });
      addView.appendChild(addHint);
      addView.appendChild(addBtn);
      addBtn.addEventListener("click", () => {
        imgInput._ibPurpose = "sticker";
        imgInput.click();
      });
      body.appendChild(addView);

      // tab 切换
      tabs.addEventListener("click", (e) => {
        const tabEl = e.target.closest(".ibe-tab");
        if (!tabEl) return;
        const tab = tabEl.dataset.tab;
        tabs.querySelectorAll(".ibe-tab").forEach((n) => n.classList.toggle("active", n === tabEl));
        body.querySelectorAll(".ibe-view").forEach((n) => n.classList.remove("active"));
        if (tab === "kaomoji") kaomojiView.classList.add("active");
        else if (tab === "fav") { favView.classList.add("active"); _renderFavStickers(favView); }
        else addView.classList.add("active");
      });

      bar.insertBefore(panel, main);
      requestAnimationFrame(() => panel.classList.add("open"));
    }

    // 渲染收藏的表情包
    async function _renderFavStickers(container) {
      U.empty(container);
      const stickers = await _getStickers();
      if (!stickers.length) {
        container.appendChild(U.el("div", {
          class: "ibe-empty",
          text: "还没有收藏的表情包，去「添加」tab 加一张吧～",
        }));
        return;
      }
      const grid = U.el("div", { class: "ibe-sticker-grid" });
      stickers.forEach((s) => {
        const item = U.el("button", { class: "ibe-sticker-item", title: s.name || "表情包" });
        item.innerHTML = '<img src="' + s.src + '" alt="' + (s.name || "表情包") + '"/>';
        // 点击发送
        item.addEventListener("click", () => {
          opts.onSend && opts.onSend({ type: "sticker", content: s.src });
          _closePanel();
        });
        // 长按删除
        let pressTimer = null;
        const startPress = (e) => {
          pressTimer = setTimeout(() => {
            e.preventDefault();
            _deleteSticker(s.id);
          }, 500);
        };
        const cancelPress = () => clearTimeout(pressTimer);
        item.addEventListener("touchstart", startPress);
        item.addEventListener("touchend", cancelPress);
        item.addEventListener("touchmove", cancelPress);
        item.addEventListener("mousedown", startPress);
        item.addEventListener("mouseup", cancelPress);
        item.addEventListener("mouseleave", cancelPress);
        item.addEventListener("contextmenu", (e) => { e.preventDefault(); _deleteSticker(s.id); });
        grid.appendChild(item);
      });
      container.appendChild(grid);
    }

    async function _getStickers() {
      const S = global.Phone.Storage;
      const list = await S.getSetting("chatStickers");
      return Array.isArray(list) ? list : [];
    }

    async function _saveStickers(list) {
      await global.Phone.Storage.setSetting("chatStickers", list);
    }

    async function _addSticker(src, name) {
      const list = await _getStickers();
      list.push({ id: U.uid("stk"), src: src, name: name || "表情包", createdAt: Date.now() });
      await _saveStickers(list);
    }

    async function _deleteSticker(id) {
      const ok = await global.Phone.Modal.confirm({
        title: "删除表情包",
        message: "要从收藏里删掉这张吗？",
        okText: "删除",
        danger: true,
      });
      if (!ok) return;
      const list = await _getStickers();
      const filtered = list.filter((s) => s.id !== id);
      await _saveStickers(filtered);
      // 刷新收藏 tab
      const favView = panel && panel.querySelector(".ibe-view.active");
      if (favView && panelMode === "emoji") _renderFavStickers(favView);
      global.Phone.Notify.push({ appId: "chat", title: "已删除" });
    }

    // ---------- 加号功能面板 ----------
    function _openPlusPanel() {
      panel = U.el("div", { class: "ib-panel ib-plus-panel" });
      panelMode = "plus";

      const grid = U.el("div", { class: "ibp-grid" });
      PLUS_FEATURES.forEach((f) => {
        const item = U.el("button", { class: "ibp-item", title: f.label, dataset: { key: f.key } }, [
          U.el("div", { class: "ibp-icon", html: global.Phone.IconLibrary.get(f.icon, { size: 24 }) }),
          U.el("div", { class: "ibp-label", text: f.label }),
        ]);
        item.addEventListener("click", () => {
          _closePanel();
          _handlePlusFeature(f.key);
        });
        grid.appendChild(item);
      });
      panel.appendChild(grid);
      bar.insertBefore(panel, main);
      requestAnimationFrame(() => panel.classList.add("open"));
    }

    function _closePanel() {
      if (panel && panel.parentNode) {
        panel.classList.remove("open");
        const node = panel;
        setTimeout(() => { if (node.parentNode) node.parentNode.removeChild(node); }, 220);
      }
      panel = null;
      panelMode = null;
    }

    // ---------- 加号 8 个功能 ----------
    async function _handlePlusFeature(key) {
      try {
        if (key === "album") {
          imgInput._ibPurpose = "image";
          imgInput.click();
        } else if (key === "transfer") {
          await _doTransfer();
        } else if (key === "gift") {
          await _doGift();
        } else if (key === "location") {
          await _doLocation();
        } else if (key === "card") {
          await _doCharCard();
        } else if (key === "memo") {
          await _doMemo();
        } else if (key === "dice") {
          await _doDice();
        } else if (key === "rps") {
          await _doRps();
        }
      } catch (e) {
        console.warn("[InputBar] plus feature error", key, e);
      }
    }

    // 相册：图片选择回调在 imgInput change 里处理
    // 转账：弹输入框，输入金额
    async function _doTransfer() {
      const Wallet = global.Phone.Wallet;
      if (!Wallet || !Wallet.userToAi) {
        global.Phone.Notify.push({ appId: "chat", title: "钱包还没准备好呀" });
        return;
      }
      const balance = await Wallet.getBalance("user");
      const amountStr = await global.Phone.Modal.prompt({
        title: "转账给 " + ((opts.character && opts.character.name) || "TA"),
        message: "当前余额：" + balance + " 元",
        placeholder: "输入转账金额",
        inputType: "number",
        okText: "转账",
        cancelText: "再想想",
      });
      if (amountStr == null) return;
      const amount = parseInt(amountStr, 10);
      if (isNaN(amount) || amount <= 0) {
        global.Phone.Notify.push({ appId: "chat", title: "请输入正整数金额呀" });
        return;
      }
      opts.onSend && opts.onSend({ type: "transfer", amount: amount, content: String(amount) });
    }

    // 送礼物：从商店选一个
    async function _doGift() {
      const Shop = global.Phone.Shop;
      if (!Shop || !Shop.listItems) {
        global.Phone.Notify.push({ appId: "chat", title: "商店还没准备好呀" });
        return;
      }
      const items = await Shop.listItems();
      const pool = items && items.length ? items : (Shop.TEMPLATES || []);
      if (!pool.length) {
        global.Phone.Notify.push({ appId: "chat", title: "商店里还没有商品呀" });
        return;
      }
      const sheetItems = pool.slice(0, 24).map((it) => ({
        label: it.name + "  " + (it.price || 0) + " 元",
        icon: it.icon || "gift",
      }));
      const idx = await global.Phone.Modal.actionSheet({
        title: "选个礼物送给 " + ((opts.character && opts.character.name) || "TA"),
        items: sheetItems,
        cancelText: "再想想",
      });
      if (idx < 0 || idx >= pool.length) return;
      const gift = pool[idx];
      opts.onSend && opts.onSend({
        type: "gift",
        itemId: gift.id || gift.name,
        name: gift.name,
        icon: gift.icon || "gift",
        content: gift.name,
      });
    }

    // 发位置：预设几个可爱位置
    async function _doLocation() {
      const presets = [
        { label: "我家的小沙发", icon: "map-pin" },
        { label: "楼下的咖啡店", icon: "map-pin" },
        { label: "公园的长椅", icon: "map-pin" },
        { label: "海边的灯塔", icon: "map-pin" },
        { label: "图书馆角落", icon: "map-pin" },
        { label: "深夜的便利店", icon: "map-pin" },
      ];
      const idx = await global.Phone.Modal.actionSheet({
        title: "发个位置",
        items: presets,
        cancelText: "取消",
      });
      if (idx < 0) return;
      opts.onSend && opts.onSend({ type: "location", content: presets[idx].label });
    }

    // 角色名片：从角色列表选一个
    async function _doCharCard() {
      const chars = await global.Phone.Storage.getAll("characters");
      if (!chars.length) {
        global.Phone.Notify.push({ appId: "chat", title: "还没有角色可选" });
        return;
      }
      const sheetItems = chars.slice(0, 24).map((c) => ({
        label: c.name || "未命名",
        icon: "user",
      }));
      const idx = await global.Phone.Modal.actionSheet({
        title: "发个角色名片",
        items: sheetItems,
        cancelText: "取消",
      });
      if (idx < 0 || idx >= chars.length) return;
      const char = chars[idx];
      opts.onSend && opts.onSend({
        type: "card",
        character: char,
        content: char.name || "角色名片",
      });
    }

    // 提醒事项：弹输入框 + 选时间，写入备忘录
    async function _doMemo() {
      const Memo = global.Phone.Memo;
      if (!Memo || !Memo.create) {
        global.Phone.Notify.push({ appId: "chat", title: "备忘录还没准备好呀" });
        return;
      }
      const content = await global.Phone.Modal.prompt({
        title: "新建提醒事项",
        message: "写一件不想忘的事，我会帮你记着。",
        placeholder: "例如：明天晚上给 TA 打电话",
        okText: "下一步",
        cancelText: "取消",
      });
      if (content == null || !content.trim()) return;
      const idx = await global.Phone.Modal.actionSheet({
        title: "什么时候提醒你？",
        items: [
          { label: "1 小时后", icon: "clock" },
          { label: "今晚 8 点", icon: "clock" },
          { label: "明天上午 9 点", icon: "clock" },
          { label: "三天后", icon: "clock" },
          { label: "先不提醒，只记着", icon: "clock" },
        ],
        cancelText: "取消",
      });
      const now = new Date();
      let remindAt = null;
      if (idx === 0) remindAt = now.getTime() + 60 * 60 * 1000;
      else if (idx === 1) {
        const d = new Date(now);
        d.setHours(20, 0, 0, 0);
        if (d.getTime() < now.getTime()) d.setDate(d.getDate() + 1);
        remindAt = d.getTime();
      } else if (idx === 2) {
        const d = new Date(now);
        d.setDate(d.getDate() + 1);
        d.setHours(9, 0, 0, 0);
        remindAt = d.getTime();
      } else if (idx === 3) {
        remindAt = now.getTime() + 3 * 24 * 60 * 60 * 1000;
      } else if (idx === 4) {
        remindAt = null;
      } else {
        return;
      }
      await Memo.create({
        title: content.trim().slice(0, 30),
        content: content.trim(),
        category: "聊天提醒",
        priority: 1,
        remindAt: remindAt,
      });
      global.Phone.Notify.push({ appId: "chat", title: "已经记下来啦" });
      // 同时在聊天里发一条系统消息提示
      opts.onSend && opts.onSend({
        type: "text",
        content: "[提醒事项] " + content.trim() + (remindAt ? "（已设提醒）" : "（仅记录）"),
      });
    }

    // 掷骰子：1-6 随机
    async function _doDice() {
      const point = U.randInt(1, 6);
      // 同时发 value（规范）和 point（renderer 兼容）
      opts.onSend && opts.onSend({
        type: "dice",
        point: point,
        value: point,
        content: String(point),
      });
    }

    // 石头剪刀布：用户选，AI 随机
    async function _doRps() {
      const idx = await global.Phone.Modal.actionSheet({
        title: "出什么？",
        items: [
          { label: "石头", icon: "hand" },
          { label: "布", icon: "hand" },
          { label: "剪刀", icon: "hand" },
        ],
        cancelText: "不出",
      });
      if (idx < 0) return;
      const choices = ["rock", "paper", "scissors"];
      const userHand = choices[idx];
      const aiHand = U.pick(choices);
      const result = _rpsResult(userHand, aiHand);
      // 同时发 userChoice（规范）和 userHand（renderer 兼容）
      opts.onSend && opts.onSend({
        type: "rps",
        userHand: userHand,
        userChoice: userHand,
        aiHand: aiHand,
        result: result,
        content: userHand,
      });
    }

    function _rpsResult(user, ai) {
      if (user === ai) return "draw";
      if ((user === "rock" && ai === "scissors") ||
          (user === "scissors" && ai === "paper") ||
          (user === "paper" && ai === "rock")) return "win";
      return "lose";
    }

    // ---------- 图片选择回调（相册发送 / 表情包添加） ----------
    imgInput.addEventListener("change", async () => {
      const f = imgInput.files[0];
      if (!f) return;
      const purpose = imgInput._ibPurpose || "image";
      imgInput._ibPurpose = null;
      // 表情包模式：检查大小
      if (purpose === "sticker") {
        if (f.size > STICKER_MAX_BYTES) {
          global.Phone.Notify.push({ appId: "chat", title: "图片超过 2MB 啦，换一张小一点的" });
          imgInput.value = "";
          return;
        }
        const base64 = await U.fileToBase64(f);
        await _addSticker(base64, f.name || "表情包");
        global.Phone.Notify.push({ appId: "chat", title: "已加到收藏" });
        // 切到收藏 tab
        if (panel && panelMode === "emoji") {
          const favTab = panel.querySelector('.ibe-tab[data-tab="fav"]');
          if (favTab) favTab.click();
        }
        imgInput.value = "";
        return;
      }
      // 默认：当作图片消息发送
      const base64 = await U.fileToBase64(f);
      opts.onSend && opts.onSend({ type: "image", content: base64, name: f.name, mime: f.type, size: f.size });
      imgInput.value = "";
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

    // ---------- 输入交互 ----------
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
      const v = input.value;
      if (v.charAt(0) === "/") {
        const spaceIdx = v.indexOf(" ");
        const query = spaceIdx === -1 ? v.slice(1) : "";
        _closePanel();
        _openCmdPanel(query);
      } else {
        _closeCmdPanel();
      }
      const now = Date.now();
      if (now - lastTyping > 2000) {
        lastTyping = now;
        opts.onTyping && opts.onTyping();
      }
      clearTimeout(typingTimer);
      typingTimer = setTimeout(_saveDraft, 500);
    });
    input.addEventListener("focus", () => { _closePanel(); });
    input.addEventListener("keydown", (e) => {
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
        if (!enterToSend) return;
        e.preventDefault();
        _send();
      }
    });

    function _send() {
      const text = input.value.trim();
      if (!text) return;
      if (text.charAt(0) === "/") {
        const spaceIdx = text.indexOf(" ");
        const key = spaceIdx === -1 ? text : text.slice(0, spaceIdx);
        const matched = COMMANDS.find((c) => c.key === key);
        if (matched) {
          _runCommand(key);
          return;
        }
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
      _closePanel();
      _closeCmdPanel();
    }
    sendBtn.addEventListener("click", _send);

    _autoResize();
    _updateSendBtn();

    // 切换 onCommand 回调
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
  global.Phone.InputBar = { mount, EMOJIS, COMMANDS, PLUS_FEATURES };
})(window);
