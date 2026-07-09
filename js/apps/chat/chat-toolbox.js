/* ============================================================
 * chat-toolbox.js — 消息APP 工具箱 + 长按消息菜单
 * 严格对照预览稿 v4 页面4（工具箱）与页面5（长按消息菜单）
 * 挂在 window.Phone.ChatToolbox
 * ============================================================ */
(function (global) {
  "use strict";

  global.Phone = global.Phone || {};

  var U = global.Phone.Utils;
  var Icons = global.Phone.ChatIcons;

  // ---------- 工具箱 12 项（顺序 / 图标严格对照预览稿） ----------
  var TOOLS = [
    { key: "mcp",         label: "MCP",     icon: "mcp" },
    { key: "emoji",       label: "表情包",   icon: "emoji" },
    { key: "image",       label: "图片",     icon: "image" },
    { key: "file",        label: "文件",     icon: "file" },
    { key: "voice",       label: "语音",     icon: "voice" },
    { key: "context",     label: "上下文",   icon: "context" },
    { key: "temperature", label: "温度",     icon: "temperature" },
    { key: "clear",       label: "清空",     icon: "clear" },
    { key: "slash",       label: "Slash",   icon: "slash" },
    { key: "github",      label: "GitHub",  icon: "github", active: true },
    { key: "cot",         label: "思维链",   icon: "cot" },
    { key: "model",       label: "模型切换", icon: "model" },
  ];

  // ---------- 长按菜单项（严格对照预览稿） ----------
  var MENU_ITEMS = [
    { key: "regenerate", label: "重新生成",      hint: "AI消息",    aiOnly: true, cb: "onRegenerate" },
    { key: "copy",       label: "复制文本",      hint: "纯文本",    cb: "onCopy" },
    { key: "copyMd",     label: "复制 Markdown", hint: "原始MD",    cb: "onCopyMarkdown" },
    { key: "quote",      label: "引用回复",      hint: "填入输入栏", cb: "onQuote" },
    { key: "forward",    label: "转发",          hint: "选择会话",   cb: "onForward" },
    { key: "delete",     label: "删除",          hint: "需确认",    danger: true, cb: "onDelete" },
  ];

  /**
   * 渲染工具箱（紧贴输入栏上方的小抽屉）
   * 返回 .toolbox-inline 元素，供聊天页插入到输入栏上方
   */
  function renderToolbox() {
    var toolbox = U.el("div", { class: "toolbox-inline" });
    toolbox.appendChild(U.el("div", { class: "toolbox-handle" }));

    var grid = U.el("div", { class: "tool-grid" });
    TOOLS.forEach(function (t) {
      var item = U.el("div", { class: "tool-item" + (t.active ? " active" : "") });
      var icon = U.el("div", { class: "tool-icon" });
      icon.innerHTML = Icons.get(t.icon);
      item.appendChild(icon);
      item.appendChild(U.el("span", { text: t.label }));
      // 骨架阶段：点击仅切换 active 状态
      item.addEventListener("click", function () {
        item.classList.toggle("active");
        U.vibrate(8);
      });
      grid.appendChild(item);
    });
    toolbox.appendChild(grid);
    return toolbox;
  }

  /**
   * 渲染长按消息菜单
   * @param {object} msg 消息对象，用于判断是否 AI 消息（isAI / role==="ai"）
   * @param {object} callbacks 回调集合
   *   { onRegenerate, onCopy, onCopyMarkdown, onQuote, onForward, onDelete, onClose }
   * @returns {HTMLDivElement} 覆盖层元素，包含 backdrop + menu-sheet
   *   供聊天页覆盖在消息区上（父级需 position:relative）
   */
  function renderMenuSheet(msg, callbacks) {
    callbacks = callbacks || {};
    var isAI = !!(msg && (msg.isAI === true || msg.role === "ai"));

    // 覆盖层容器：绝对定位铺满父级，承载 backdrop 与 menu-sheet
    var overlay = U.el("div", {
      style: {
        position: "absolute",
        top: "0", left: "0", right: "0", bottom: "0",
        zIndex: "99",
      },
    });

    // 背景遮罩（CSS 中 pointer-events:none，点击穿透到 overlay）
    var backdrop = U.el("div", { class: "backdrop" });
    overlay.appendChild(backdrop);

    // 菜单卡片
    var sheet = U.el("div", { class: "menu-sheet" });
    sheet.appendChild(U.el("div", { class: "sheet-handle" }));
    sheet.appendChild(U.el("div", { class: "sheet-title", text: "消息操作" }));

    MENU_ITEMS.forEach(function (m) {
      // 重新生成仅 AI 消息显示
      if (m.aiOnly && !isAI) return;

      var labelSpan = U.el("span", {
        class: m.danger ? "danger" : null,
        text: m.label,
      });

      var item = U.el("div", { class: "menu-item" }, [
        U.el("div", { class: "menu-left" }, [labelSpan]),
        U.el("span", { class: "menu-hint", text: m.hint }),
      ]);

      // 点击菜单项：调用对应回调，然后关闭菜单
      item.addEventListener("click", function () {
        var fn = callbacks[m.cb];
        if (typeof fn === "function") fn(msg);
        close();
      });
      sheet.appendChild(item);
    });

    overlay.appendChild(sheet);

    var closed = false;
    function close() {
      if (closed) return;
      closed = true;
      var fn = callbacks.onClose;
      if (typeof fn === "function") fn(msg);
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
    }

    // 点击遮罩区域关闭（backdrop pointer-events:none 使事件穿透到 overlay）
    overlay.addEventListener("click", function (e) {
      if (e.target === overlay) close();
    });

    // 供外部主动关闭
    overlay._close = close;

    return overlay;
  }

  global.Phone.ChatToolbox = {
    renderToolbox: renderToolbox,
    renderMenuSheet: renderMenuSheet,
  };
})(window);
