/* ============================================================
   toolbox.js — 输入栏工具箱小抽屉
   点击 + 号向上弹出，4列×3格共12个工具
   MCP / 表情 / 图片 / 文件 / 语音 / 上下文 / 温度 / 清空
   Slash / GitHub / 思维链 / 模型切换
   挂在 window.Phone.Toolbox

   接口：
     Phone.Toolbox.mount(opts) -> { el, open, close, toggle, isOpen, destroy }
     opts: {
       onEmoji, onImage, onFile(file), onVoice,
       onClearContext, onSlash(cmd), onGitHub({cmd,label}),
       characterId, conversationId
     }

   CSS 约定类名（样式由 chat.css 提供）：
     .chat-toolbox / .ctb-grid / .ctb-item / .ctb-icon / .ctb-label
     .ctb-item.active / .ctb-panel / .ctb-panel-host / .ctb-panel-title
     .ctb-seg / .ctb-seg-item / .ctb-slider / .ctb-marks / .ctb-cur
     .ctb-toggle-row / .ctb-switch / .ctb-tr-text / .ctb-tr-name / .ctb-tr-desc
     .ctb-cmd-row / .ctb-cmd-name / .ctb-cmd-desc
     .ctb-github-btn / .ctb-model-row / .ctb-model-name
     .ctb-empty
   ============================================================ */
(function (global) {
  "use strict";

  // ---------- 12 格定义 ----------
  // type: action=点击即执行并关抽屉 / panel=展开二级面板 / toggle=开关
  const CELLS = [
    { id: "mcp",         icon: "tool",        label: "MCP",   type: "panel"  },
    { id: "emoji",       icon: "smile",       label: "表情包", type: "action" },
    { id: "image",       icon: "image",       label: "图片",   type: "action" },
    { id: "file",        icon: "file-text",   label: "文件",   type: "action" },
    { id: "voice",       icon: "mic",         label: "语音",   type: "action" },
    { id: "context",     icon: "sliders",     label: "上下文", type: "panel"  },
    { id: "temperature", icon: "thermometer", label: "温度",   type: "panel"  },
    { id: "clear",       icon: "eraser",      label: "清空",   type: "action" },
    { id: "slash",       icon: "command",     label: "Slash",  type: "panel"  },
    { id: "github",      icon: "github",      label: "GitHub", type: "panel"  },
    { id: "thinking",    icon: "brain",       label: "思维链", type: "toggle" },
    { id: "model",       icon: "cpu",         label: "模型",   type: "panel"  },
  ];

  // ---------- 内置 Slash 指令 ----------
  const SLASH_COMMANDS = [
    { cmd: "/clear",            desc: "清空上下文" },
    { cmd: "/retry",            desc: "重新生成上一条AI回复" },
    { cmd: "/export",           desc: "导出当前对话为 Markdown" },
    { cmd: "/github pr",        desc: "查看当前仓库 PR 列表" },
    { cmd: "/github branches",  desc: "查看分支列表" },
    { cmd: "/github merge",     desc: "合并指定 PR" },
    { cmd: "/github create pr", desc: "创建 PR" },
    { cmd: "/github commits",   desc: "查看最近提交记录" },
    { cmd: "/github push",      desc: "触发 AI 推送到 GitHub" },
    { cmd: "/github checkout",  desc: "切换/创建分支" },
    { cmd: "/github file",      desc: "查看指定文件内容" },
    { cmd: "/temp 0.7",         desc: "快速设置温度" },
    { cmd: "/model",            desc: "快速切换模型" },
  ];

  // ---------- GitHub 快捷操作（cmd 对应 slash 指令，每个按钮差异化） ----------
  // cmd 透传给输入框预填，AI 收到后调对应 github_* 工具
  const GITHUB_ACTIONS = [
    { cmd: "/github pr",        label: "查看PR列表" },
    { cmd: "/github branches",  label: "查看分支" },
    { cmd: "/github merge",     label: "合并PR" },
    { cmd: "/github create pr", label: "创建PR" },
    { cmd: "/github commits",   label: "查看Commits" },
    { cmd: "/github push",      label: "Push当前改动" },
    { cmd: "/github checkout",  label: "切换分支" },
    { cmd: "/github file",      label: "查看文件" },
  ];

  /**
   * 挂载工具箱
   * @param {object} opts 见文件头注释
   * @returns {{el,open,close,toggle,isOpen,destroy}}
   */
  function mount(opts) {
    opts = opts || {};
    const U = global.Phone.Utils;
    const Icon = global.Phone.IconLibrary;
    const Storage = global.Phone.Storage;

    const convId = opts.conversationId || "_default";
    const charId = opts.characterId || "_default";

    // 抽屉根容器
    const toolboxEl = U.el("div", { class: "chat-toolbox" });

    // 二级面板容器（展开时显示在网格上方）
    const panelHost = U.el("div", { class: "ctb-panel-host" });
    toolboxEl.appendChild(panelHost);

    // 4列网格
    const grid = U.el("div", { class: "ctb-grid" });
    toolboxEl.appendChild(grid);

    // 隐藏文件选择器（文件格专用）
    const fileInput = U.el("input", {
      type: "file",
      accept: ".pdf,.doc,.docx,.txt,.zip",
      style: "display:none",
    });
    toolboxEl.appendChild(fileInput);
    fileInput.addEventListener("change", function () {
      const f = fileInput.files && fileInput.files[0];
      if (!f) return;
      opts.onFile && opts.onFile(f);
      fileInput.value = "";
      close();
    });

    // ---------- 构建12格 ----------
    const cellNodes = {};
    CELLS.forEach(function (cell) {
      const node = _buildCell(cell);
      grid.appendChild(node);
      cellNodes[cell.id] = node;
    });

    function _buildCell(cell) {
      const item = U.el("button", { class: "ctb-item", type: "button" });
      const iconWrap = U.el("div", { class: "ctb-icon", html: Icon.get(cell.icon, { size: 24 }) });
      const label = U.el("div", { class: "ctb-label", text: cell.label });
      item.appendChild(iconWrap);
      item.appendChild(label);
      item.addEventListener("click", function () { _onCellClick(cell); });
      return item;
    }

    // ---------- 格子点击分发 ----------
    function _onCellClick(cell) {
      if (cell.type === "action") {
        _handleAction(cell.id);
        return;
      }
      if (cell.type === "toggle") {
        _handleToggle(cell.id);
        return;
      }
      // panel：切换二级面板
      if (activePanelId === cell.id) {
        _closePanel();
      } else {
        _openPanel(cell.id);
      }
    }

    function _handleAction(id) {
      if (id === "emoji") { opts.onEmoji && opts.onEmoji(); close(); }
      else if (id === "image") { opts.onImage && opts.onImage(); close(); }
      else if (id === "voice") { opts.onVoice && opts.onVoice(); close(); }
      else if (id === "file") { fileInput.click(); } // change 时自动关
      else if (id === "clear") { _handleClear(); }
    }

    async function _handleClear() {
      let ok = false;
      try {
        ok = await global.Phone.Modal.confirm({
          title: "清空上下文",
          message: "确定清空当前上下文吗？这会重置 AI 的思考状态。",
          okText: "清空",
          danger: true,
        });
      } catch (e) {
        ok = window.confirm("确定清空当前上下文吗？");
      }
      if (!ok) return;
      opts.onClearContext && opts.onClearContext();
      _toast("已清空，思考重置");
      close();
    }

    async function _handleToggle(id) {
      if (id === "thinking") {
        const key = "chat.thinking_" + convId;
        const cur = (await Storage.getSetting(key)) === true;
        const next = !cur;
        await Storage.setSetting(key, next);
        cellNodes[id].classList.toggle("active", next);
      }
    }

    // ---------- 面板开关 ----------
    let activePanelId = null;

    function _openPanel(id) {
      if (activePanelId && cellNodes[activePanelId]) {
        cellNodes[activePanelId].classList.remove("active");
      }
      activePanelId = id;
      if (cellNodes[id]) cellNodes[id].classList.add("active");
      U.empty(panelHost);
      const builder = PANEL_BUILDERS[id];
      if (builder) panelHost.appendChild(builder());
      panelHost.classList.add("open");
    }

    function _closePanel() {
      if (activePanelId && cellNodes[activePanelId]) {
        cellNodes[activePanelId].classList.remove("active");
      }
      activePanelId = null;
      panelHost.classList.remove("open");
      U.empty(panelHost);
    }

    // ---------- 面板构造器 ----------
    const PANEL_BUILDERS = {
      mcp: _buildMcpPanel,
      context: _buildContextPanel,
      temperature: _buildTempPanel,
      slash: _buildSlashPanel,
      github: _buildGithubPanel,
      model: _buildModelPanel,
    };

    // 1. MCP 工具开关
    function _buildMcpPanel() {
      const wrap = U.el("div", { class: "ctb-panel ctb-mcp" });
      wrap.appendChild(U.el("div", { class: "ctb-panel-title", text: "MCP 工具开关" }));
      const mcp = global.Phone.McpClient;
      const enabled = (mcp && typeof mcp.isEnabled === "function") ? mcp.isEnabled() : false;
      if (!enabled) {
        wrap.appendChild(U.el("div", { class: "ctb-empty", text: "MCP 未启用，去设置里开启吧" }));
        return wrap;
      }
      const tools = (mcp && typeof mcp.list === "function") ? mcp.list() : [];
      if (!tools.length) {
        wrap.appendChild(U.el("div", { class: "ctb-empty", text: "还没有可用的 MCP 工具" }));
        return wrap;
      }
      const list = U.el("div", { class: "ctb-toggle-list" });
      // 同步先建行（保持顺序），再异步校正开关状态
      const rows = [];
      tools.forEach(function (t) {
        const name = t.name || "tool";
        const desc = t.description || "";
        const key = "chat.mcp_" + convId + "_" + name;
        const row = _buildToggleRow(name, desc, true, async function (next) {
          await Storage.setSetting(key, next);
        });
        rows.push({ row: row, key: key });
        list.appendChild(row);
      });
      wrap.appendChild(list);
      rows.forEach(function (r) {
        Storage.getSetting(r.key).then(function (val) {
          _setToggleRow(r.row, val !== false);
        });
      });
      return wrap;
    }

    // 2. 上下文窗口
    function _buildContextPanel() {
      const wrap = U.el("div", { class: "ctb-panel ctb-context" });
      wrap.appendChild(U.el("div", { class: "ctb-panel-title", text: "上下文窗口" }));
      const curLabel = U.el("div", { class: "ctb-cur", text: "当前：8 条" });
      wrap.appendChild(curLabel);
      const seg = U.el("div", { class: "ctb-seg" });
      const options = [2, 4, 8, 16, 32];
      const key = "chat.ctx_" + convId;
      const buttons = [];
      options.forEach(function (n) {
        const b = U.el("button", { class: "ctb-seg-item", type: "button", text: String(n) });
        b.addEventListener("click", async function () {
          await Storage.setSetting(key, n);
          buttons.forEach(function (x) { x.classList.remove("active"); });
          b.classList.add("active");
          curLabel.textContent = "当前：" + n + " 条";
        });
        buttons.push(b);
        seg.appendChild(b);
      });
      wrap.appendChild(seg);
      Storage.getSetting(key).then(function (val) {
        const cur = val || 8;
        const idx = options.indexOf(cur);
        const target = idx >= 0 ? idx : options.indexOf(8);
        buttons.forEach(function (b) { b.classList.remove("active"); });
        if (buttons[target]) buttons[target].classList.add("active");
        curLabel.textContent = "当前：" + cur + " 条";
      });
      return wrap;
    }

    // 3. 温度调节
    function _buildTempPanel() {
      const wrap = U.el("div", { class: "ctb-panel ctb-temp" });
      wrap.appendChild(U.el("div", { class: "ctb-panel-title", text: "温度调节" }));
      const valLabel = U.el("div", { class: "ctb-cur", text: "0.7" });
      wrap.appendChild(valLabel);
      const slider = U.el("input", {
        class: "ctb-slider", type: "range", min: "0", max: "2", step: "0.1", value: "0.7",
      });
      const key = "chat.temp_" + convId;
      slider.addEventListener("input", async function () {
        const v = parseFloat(slider.value).toFixed(1);
        valLabel.textContent = v;
        try { await Storage.setSetting(key, parseFloat(v)); } catch (e) {}
      });
      wrap.appendChild(slider);
      wrap.appendChild(U.el("div", { class: "ctb-marks" }, [
        U.el("span", { text: "冷" }),
        U.el("span", { text: "均衡" }),
        U.el("span", { text: "创意" }),
      ]));
      Storage.getSetting(key).then(function (val) {
        let v = val;
        if (typeof v !== "number") {
          const st = global.Phone.State;
          v = (st && st.get("aiTemperature")) || 0.7;
        }
        slider.value = v;
        valLabel.textContent = Number(v).toFixed(1);
      });
      return wrap;
    }

    // 4. Slash 快捷指令
    function _buildSlashPanel() {
      const wrap = U.el("div", { class: "ctb-panel ctb-slash" });
      wrap.appendChild(U.el("div", { class: "ctb-panel-title", text: "Slash 指令" }));
      const list = U.el("div", { class: "ctb-cmd-list" });
      SLASH_COMMANDS.forEach(function (c) {
        const row = U.el("button", { class: "ctb-cmd-row", type: "button" }, [
          U.el("span", { class: "ctb-cmd-name", text: c.cmd }),
          U.el("span", { class: "ctb-cmd-desc", text: c.desc }),
        ]);
        row.addEventListener("click", function () {
          opts.onSlash && opts.onSlash(c.cmd);
          close();
        });
        list.appendChild(row);
      });
      wrap.appendChild(list);
      return wrap;
    }

    // 5. GitHub 操作
    function _buildGithubPanel() {
      const wrap = U.el("div", { class: "ctb-panel ctb-github" });
      wrap.appendChild(U.el("div", { class: "ctb-panel-title", text: "GitHub 操作" }));
      const grid2 = U.el("div", { class: "ctb-github-grid" });
      GITHUB_ACTIONS.forEach(function (a) {
        const b = U.el("button", { class: "ctb-github-btn", type: "button", text: a.label });
        b.addEventListener("click", function () {
          opts.onGitHub && opts.onGitHub({ cmd: a.cmd, label: a.label });
          close();
        });
        grid2.appendChild(b);
      });
      wrap.appendChild(grid2);
      return wrap;
    }

    // 6. 模型切换
    function _buildModelPanel() {
      const wrap = U.el("div", { class: "ctb-panel ctb-model" });
      wrap.appendChild(U.el("div", { class: "ctb-panel-title", text: "模型切换" }));
      const list = U.el("div", { class: "ctb-model-list" });
      wrap.appendChild(list);
      const models = _getModelList();
      const def = _getDefaultModel();
      const key = "chat.model_" + convId;
      const rows = [];
      if (!models.length) {
        list.appendChild(U.el("div", { class: "ctb-empty", text: "还没有可用模型，去 AI 设置里配置吧" }));
        return wrap;
      }
      models.forEach(function (m) {
        const row = U.el("button", { class: "ctb-model-row", type: "button" }, [
          U.el("span", { class: "ctb-model-name", text: m }),
        ]);
        row.addEventListener("click", async function () {
          await Storage.setSetting(key, m);
          rows.forEach(function (r) { r.classList.remove("active"); });
          row.classList.add("active");
        });
        rows.push(row);
        list.appendChild(row);
      });
      Storage.getSetting(key).then(function (val) {
        const cur = val || def;
        rows.forEach(function (r, i) {
          r.classList.toggle("active", models[i] === cur);
        });
      });
      return wrap;
    }

    // ---------- 模型列表来源 ----------
    // 优先 ApiConfig.getGroups()（如该模块存在），否则回退 POPULAR_MODELS + 当前 aiModel
    function _getModelList() {
      const ApiConfig = global.Phone.ApiConfig;
      if (ApiConfig && typeof ApiConfig.getGroups === "function") {
        try {
          const groups = ApiConfig.getGroups() || {};
          const set = [];
          ["chat", "general", "vision"].forEach(function (k) {
            const g = groups[k];
            if (!g) return;
            if (g.model) set.push(g.model);
            if (Array.isArray(g.models)) {
              g.models.forEach(function (m) {
                set.push(typeof m === "string" ? m : (m && (m.id || m.name)));
              });
            }
          });
          const uniq = [];
          set.forEach(function (m) {
            if (m && uniq.indexOf(m) < 0) uniq.push(m);
          });
          if (uniq.length) return uniq;
        } catch (e) { /* 回退 */ }
      }
      const list = [];
      const popular = (global.Phone.AIClient && global.Phone.AIClient.POPULAR_MODELS) || [];
      popular.forEach(function (m) { if (m && m.id) list.push(m.id); });
      const cur = (global.Phone.State && global.Phone.State.get("aiModel")) || "";
      if (cur && list.indexOf(cur) < 0) list.unshift(cur);
      return list;
    }

    function _getDefaultModel() {
      const ApiConfig = global.Phone.ApiConfig;
      if (ApiConfig && typeof ApiConfig.getDefaultModelName === "function") {
        try {
          const m = ApiConfig.getDefaultModelName("chat");
          if (m) return m;
        } catch (e) { /* 回退 */ }
      }
      return (global.Phone.State && global.Phone.State.get("aiModel")) || "gpt-4o-mini";
    }

    // ---------- 通用 toggle 行 ----------
    function _buildToggleRow(name, desc, on, onChange) {
      const row = U.el("div", { class: "ctb-toggle-row" + (on ? " on" : "") });
      const text = U.el("div", { class: "ctb-tr-text" }, [
        U.el("div", { class: "ctb-tr-name", text: name }),
        desc ? U.el("div", { class: "ctb-tr-desc", text: desc }) : null,
      ]);
      const sw = U.el("div", { class: "ctb-switch" + (on ? " on" : "") });
      row.appendChild(text);
      row.appendChild(sw);
      row.addEventListener("click", async function () {
        const next = !row.classList.contains("on");
        row.classList.toggle("on", next);
        sw.classList.toggle("on", next);
        try { await onChange(next); } catch (e) {}
      });
      return row;
    }

    function _setToggleRow(row, on) {
      if (!row) return;
      row.classList.toggle("on", !!on);
      const sw = row.querySelector(".ctb-switch");
      if (sw) sw.classList.toggle("on", !!on);
    }

    // ---------- 初始 toggle 态 ----------
    (async function _initToggles() {
      try {
        const key = "chat.thinking_" + convId;
        const on = (await Storage.getSetting(key)) === true;
        if (cellNodes["thinking"]) cellNodes["thinking"].classList.toggle("active", on);
      } catch (e) {}
    })();

    // ---------- 公共 API ----------
    function open() { toolboxEl.classList.add("open"); }
    function close() { toolboxEl.classList.remove("open"); _closePanel(); }
    function toggle() {
      if (toolboxEl.classList.contains("open")) close();
      else open();
    }
    function isOpen() { return toolboxEl.classList.contains("open"); }
    function destroy() {
      if (toolboxEl.parentNode) toolboxEl.parentNode.removeChild(toolboxEl);
    }

    return { el: toolboxEl, open: open, close: close, toggle: toggle, isOpen: isOpen, destroy: destroy };
  }

  // ---------- 本地 Toast（复用 .notify-toast-host 样式） ----------
  function _toast(text) {
    const U = global.Phone.Utils;
    let host = document.querySelector(".notify-toast-host");
    if (!host) {
      host = U.el("div", { class: "notify-toast-host" });
      document.body.appendChild(host);
    }
    const item = U.el("div", { class: "notify-toast anim-slide-up" }, [
      U.el("div", { class: "nt-title", text: text }),
    ]);
    host.appendChild(item);
    setTimeout(function () {
      item.classList.add("nt-leave");
      setTimeout(function () { if (item.parentNode) item.remove(); }, 300);
    }, 2200);
  }

  // ---------- 暴露 ----------
  global.Phone = global.Phone || {};
  global.Phone.Toolbox = {
    mount: mount,
    SLASH_COMMANDS: SLASH_COMMANDS,
    GITHUB_ACTIONS: GITHUB_ACTIONS,
  };
})(window);
