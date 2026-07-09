/* ============================================================
 * chat-settings.js — 消息APP 聊天设置页（预览稿页面7）
 * 独立页面，胶囊椭圆框包裹的可爱清爽列表
 * 挂在 window.Phone.ChatSettings
 * 入口：Phone.Router.push("chat-settings", Phone.ChatSettings.mount, {conversationId?})
 *   - conversationId 可选：从聊天页三点菜单进入时传入
 *   - 未传时（从设置APP进入）显示默认信息
 * ============================================================ */
(function (global) {
  "use strict";

  global.Phone = global.Phone || {};

  // ---------- 数据加载 ----------
  // 读取会话与对应角色；容错：任一环节失败均回退到默认展示
  async function _loadContext(params) {
    var Storage = global.Phone.Storage;
    var conv = null;
    var character = null;

    if (params.conversationId && Storage) {
      try { conv = await Storage.get("conversations", params.conversationId); } catch (e) {}
    }

    // 角色定位：优先会话内 characterId，其次全局当前角色
    var charId = conv && conv.characterId;
    if (!charId && Storage) {
      try { charId = await Storage.getSetting("currentCharacterId"); } catch (e) {}
    }
    if (charId && Storage) {
      try {
        var chars = await Storage.getAll("characters");
        for (var i = 0; i < chars.length; i++) {
          if (chars[i].id === charId) { character = chars[i]; break; }
        }
      } catch (e) {}
    }

    return { conv: conv, character: character };
  }

  // ---------- 轻量提示（骨架阶段诚实反馈，不假造功能） ----------
  function _hint(screen, msg) {
    if (!screen) return;
    var U = global.Phone.Utils;
    var t = U.el("div", {
      text: msg,
      style: {
        position: "absolute",
        left: "50%",
        bottom: "18px",
        transform: "translateX(-50%)",
        background: "var(--bg-surface)",
        color: "var(--text-secondary)",
        border: "1px solid var(--border-soft)",
        boxShadow: "var(--shadow-soft)",
        borderRadius: "var(--radius-button)",
        padding: "7px 14px",
        fontSize: "11px",
        zIndex: "200",
        opacity: "0",
        transition: "opacity var(--duration-fast) var(--ease-out)",
        pointerEvents: "none",
        whiteSpace: "nowrap",
      },
    });
    screen.appendChild(t);
    requestAnimationFrame(function () { t.style.opacity = "1"; });
    setTimeout(function () {
      t.style.opacity = "0";
      setTimeout(function () {
        if (t.parentNode) t.parentNode.removeChild(t);
      }, 200);
    }, 1100);
  }

  // ---------- 组件 ----------
  // 开关：点击切换 on class（骨架阶段仅切换视觉，不持久化）
  function _toggle(on) {
    var U = global.Phone.Utils;
    var t = U.el("div", { class: "toggle" + (on ? " on" : "") });
    t.addEventListener("click", function () { t.classList.toggle("on"); });
    return t;
  }

  // 模式分段控制器（气泡 / 对话）：骨架阶段仅切换 active，不真实切换模式
  function _modeTabs(active) {
    var U = global.Phone.Utils;
    var tabs = U.el("div", { class: "tabs", style: { margin: "0" } });
    var bubble = U.el("span", { text: "气泡" });
    var dialog = U.el("span", { text: "对话" });
    if (active === "dialog") dialog.classList.add("active");
    else bubble.classList.add("active");
    bubble.addEventListener("click", function () {
      bubble.classList.add("active");
      dialog.classList.remove("active");
    });
    dialog.addEventListener("click", function () {
      dialog.classList.add("active");
      bubble.classList.remove("active");
    });
    tabs.appendChild(bubble);
    tabs.appendChild(dialog);
    return tabs;
  }

  // 小按钮：骨架阶段不实现真实功能，给予诚实提示
  function _miniBtn(label, screen, hint) {
    var U = global.Phone.Utils;
    var b = U.el("div", { class: "mini-btn", text: label });
    b.addEventListener("click", function () { _hint(screen, hint || (label + " · 开发中")); });
    return b;
  }

  // 通用 pill：左右两个直接子节点
  function _pill(leftEl, controlEl, extraClass) {
    var U = global.Phone.Utils;
    return U.el("div", { class: "setting-pill" + (extraClass ? " " + extraClass : "") }, [leftEl, controlEl]);
  }

  // 带 label + meta 的 pill（左侧包一层 div）
  function _labeledPill(label, meta, controlEl, extraClass) {
    var U = global.Phone.Utils;
    var left = U.el("div", {}, [
      U.el("div", { class: "setting-label", text: label }),
      meta != null ? U.el("div", { class: "setting-meta", text: meta }) : null,
    ]);
    return _pill(left, controlEl, extraClass);
  }

  // ---------- 挂载 ----------
  async function mount(container, params) {
    params = params || {};
    var U = global.Phone.Utils;
    var Icons = global.Phone.ChatIcons;
    var Router = global.Phone.Router;

    var ctx = await _loadContext(params);
    var conv = ctx.conv;
    var character = ctx.character;

    // 展示文案：角色名 · 对话标题
    var charName = (character && character.name) || "AI";
    var convTitle = (conv && conv.title) || "新对话";
    var displayTitle = charName + " · " + convTitle;

    // 模型：会话级优先，其次全局设置，最后默认
    var modelText = (conv && conv.model) || "";
    if (!modelText) {
      try { modelText = await global.Phone.Storage.getSetting("aiModel"); } catch (e) {}
    }
    if (!modelText) modelText = "默认模型";

    // 会话级开关：有则用，无则用预览稿默认（骨架）
    var s = (conv && conv.settings) || {};
    var cotOn = s.showThinking !== undefined ? !!s.showThinking : true;
    var ttsOn = s.ttsEnabled !== undefined ? !!s.ttsEnabled : false;
    var tokenOn = s.showTokens !== undefined ? !!s.showTokens : false;
    var ctxOn = s.showContextRange !== undefined ? !!s.showContextRange : true;
    var mode = s.mode || (conv && conv.mode) || "bubble";

    // GitHub 关联：有配置才标记 active
    var gh = conv && conv.github ? conv.github : null;
    var ghText = gh ? (gh.repo + " · " + (gh.branch || "main")) : "未关联仓库";
    var ghActive = gh ? "active" : "";

    // ---- 页面骨架 ----
    var screen = U.el("div", { class: "chat-screen", style: { position: "relative" } });

    // 顶部栏
    var topbar = U.el("div", { class: "topbar" });
    var topbarLeft = U.el("div", { class: "topbar-left" });
    var back = U.el("div", { class: "icon-btn", html: Icons.get("chevron-left") });
    back.addEventListener("click", function () { Router.back(); });
    topbarLeft.appendChild(back);
    topbarLeft.appendChild(U.el("div", { class: "topbar-info" }, [
      U.el("div", { class: "topbar-name", text: "聊天设置" }),
      U.el("div", { class: "topbar-sub", text: displayTitle }),
    ]));
    topbar.appendChild(topbarLeft);
    screen.appendChild(topbar);

    // 设置列表
    var page = U.el("div", { class: "settings-page" });

    // 分组1：当前对话
    var g1 = U.el("div", { class: "settings-group" });
    g1.appendChild(U.el("div", { class: "group-title", text: "当前对话" }));
    g1.appendChild(_labeledPill("对话标题", displayTitle,
      _miniBtn("编辑", screen, "编辑标题 · 开发中")));
    g1.appendChild(_labeledPill("聊天模式", "气泡 / 对话", _modeTabs(mode)));
    g1.appendChild(_labeledPill("模型", modelText,
      _miniBtn("切换", screen, "模型切换 · 开发中")));
    page.appendChild(g1);

    // 分组2：显示与AI
    var g2 = U.el("div", { class: "settings-group" });
    g2.appendChild(U.el("div", { class: "group-title", text: "显示与AI" }));
    g2.appendChild(_labeledPill("思维链", "默认折叠显示", _toggle(cotOn)));
    g2.appendChild(_labeledPill("TTS 朗读", "软一点 · 云端音色", _toggle(ttsOn)));
    g2.appendChild(_labeledPill("Token 用量显示", "每条消息底部显示", _toggle(tokenOn)));
    g2.appendChild(_labeledPill("上下文范围可视化", "高亮边线标记", _toggle(ctxOn)));
    page.appendChild(g2);

    // 分组3：GitHub
    var g3 = U.el("div", { class: "settings-group" });
    g3.appendChild(U.el("div", { class: "group-title", text: "GitHub" }));
    g3.appendChild(_labeledPill("关联仓库", ghText,
      _miniBtn("进入", screen, "GitHub 设置 · 开发中"), ghActive));
    page.appendChild(g3);

    // 分组4：操作
    var g4 = U.el("div", { class: "settings-group" });
    g4.appendChild(_pill(
      U.el("div", { class: "danger", text: "清空当前对话" }),
      _miniBtn("确认", screen, "清空对话 · 开发中")
    ));
    g4.appendChild(_pill(
      U.el("div", { class: "setting-label", text: "导出整段对话" }),
      _miniBtn("Markdown", screen, "导出 Markdown · 开发中")
    ));
    page.appendChild(g4);

    screen.appendChild(page);

    // 挂载（路由已清空容器，此处再保险清一次）
    U.empty(container);
    container.appendChild(screen);
  }

  global.Phone.ChatSettings = { mount: mount };
})(window);
