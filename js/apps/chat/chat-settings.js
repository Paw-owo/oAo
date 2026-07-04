/* ============================================================
   chat-settings.js — 聊天设置页（规范第六章）
   对方资料 / 聊天设置 / AI 设置 / 聊天记录 / 危险操作
   接受 (container, params)，params 含 conversationId / characterId
   从 conversation.js 导航栏中间点击或更多菜单进入
   挂在 window.Phone.ChatSettings
   ============================================================ */
(function (global) {
  "use strict";

  /**
   * 我（聊天设置页）渲染到容器
   * @param {HTMLElement} container
   * @param {object} params { conversationId, characterId }
   *   - 不传 conversationId 时显示"选择聊天"列表，点一条进入对应设置页
   */
  async function mount(container, params) {
    params = params || {};
    if (params.conversationId) {
      await _mountSettings(container, params);
    } else {
      await _mountPicker(container, params);
    }
  }

  // ---------- 没指定 conversationId 时：列出所有聊天让用户选 ----------
  async function _mountPicker(container, params) {
    const U = global.Phone.Utils;
    const Storage = global.Phone.Storage;

    const page = U.el("div", { class: "page" });
    page.appendChild(_nav("聊天设置"));

    const content = U.el("div", { class: "scroll page-content" });
    content.appendChild(U.el("div", {
      class: "form-hint",
      text: "挑一个聊天来调它的设置～",
      style: { padding: "12px 16px 4px" }
    }));

    const list = U.el("div", { class: "chat-list" });
    content.appendChild(list);
    page.appendChild(content);
    container.appendChild(page);

    async function refresh() {
      U.empty(list);
      const convs = await Storage.getAll("conversations");
      convs.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
      const chars = await Storage.getAll("characters");
      if (convs.length === 0) {
        list.appendChild(U.el("div", { class: "empty-state" }, [
          U.el("div", { class: "es-icon", html: global.Phone.IconLibrary.get("app-chat", { size: 32 }) }),
          U.el("div", { class: "es-title", text: "还没有聊天" }),
          U.el("div", { class: "es-sub", text: "去消息列表新建一个吧" })
        ]));
        return;
      }
      convs.forEach((c) => {
        const char = chars.find((ch) => ch.id === c.characterId) || { name: "AI" };
        const lastMsg = c.messages && c.messages.length ? c.messages[c.messages.length - 1] : null;
        const item = U.el("div", { class: "list-item" }, [
          _renderAvatar(char),
          U.el("div", { class: "li-main" }, [
            U.el("div", { class: "li-title", text: char.name || "AI" }),
            U.el("div", { class: "li-sub", text: lastMsg ? ((lastMsg.content || "").slice(0, 30)) : "开始聊天吧～" })
          ]),
          U.el("div", { class: "li-right", html: global.Phone.IconLibrary.get("chevron-right", { size: 18 }) })
        ]);
        item.addEventListener("click", () => {
          global.Phone.Router.push("chat-settings", mount, {
            conversationId: c.id,
            characterId: c.characterId
          });
        });
        list.appendChild(item);
      });
    }
    refresh();
  }

  // ---------- 真正的设置页 ----------
  async function _mountSettings(container, params) {
    const U = global.Phone.Utils;
    const Storage = global.Phone.Storage;
    const State = global.Phone.State;
    const CC = global.Phone.Components && global.Phone.Components.CollapsibleCard;

    const conversationId = params.conversationId;
    let conversation = await Storage.get("conversations", conversationId);
    if (!conversation) {
      // 兜底：直接返回
      global.Phone.Notify.push({ appId: "chat", title: "找不到这个聊天哦" });
      global.Phone.Router.back();
      return;
    }

    const characterId = conversation.characterId || params.characterId;
    const character = (await Storage.getAll("characters")).find((c) => c.id === characterId) || { name: "AI" };

    // 拉取全局设置作为对照
    const globalShowThinking = (await State.get("showThinking")) === true;
    const globalEnterToSend = (await State.get("enterToSend")) !== false; // 默认开
    const globalShowAvatar = (await State.get("showAvatar")) !== false;   // 默认开

    const page = U.el("div", { class: "page chat-settings-page" });
    page.appendChild(_nav("聊天设置"));

    const content = U.el("div", { class: "scroll page-content" });
    content.style.paddingTop = "12px";
    page.appendChild(content);
    container.appendChild(page);

    // ============== 1. 对方资料 ==============
    content.appendChild(_charProfileCard(character, characterId));

    // ============== 2. 聊天设置（折叠） ==============
    CC && CC.mount(content, {
      title: "聊天设置",
      subtitle: "免打扰 / 置顶 / 背景 / 字号 / 头像 / 模式 / 思维链 / 回车发送",
      icon: "app-chat",
      defaultOpen: true,
      content: (body) => {
        // 免打扰
        body.appendChild(_toggleRow({
          icon: "bell-off",
          title: "免打扰",
          sub: "开启后收到消息不再弹桌面通知条",
          on: !!conversation.muted,
          onToggle: async (v) => {
            conversation.muted = v;
            conversation.updatedAt = Date.now();
            await Storage.put("conversations", conversation);
          }
        }));
        // 置顶
        body.appendChild(_toggleRow({
          icon: "pin",
          title: "置顶",
          sub: "把这个聊天固定在消息列表最上面",
          on: !!conversation.pinned,
          onToggle: async (v) => {
            conversation.pinned = v;
            conversation.updatedAt = Date.now();
            await Storage.put("conversations", conversation);
          }
        }));

        // 聊天背景
        body.appendChild(_chatBackgroundRow(conversation, () => _remount(container, params)));

        // 聊天字体大小
        body.appendChild(_segmentRow({
          label: "聊天字体大小",
          icon: "edit",
          items: [
            { val: "sm", label: "小" },
            { val: "base", label: "标准" },
            { val: "md", label: "大" },
          ],
          current: conversation.fontSize || "base",
          onPick: async (v) => {
            conversation.fontSize = v;
            conversation.updatedAt = Date.now();
            await Storage.put("conversations", conversation);
          }
        }));

        // 头像显示开关
        body.appendChild(_toggleRow({
          icon: "user",
          title: "显示头像",
          sub: "在气泡旁边显示头像（关闭后只看到气泡）",
          on: conversation.showAvatar !== false,
          onToggle: async (v) => {
            conversation.showAvatar = v;
            conversation.updatedAt = Date.now();
            await Storage.put("conversations", conversation);
          }
        }));

        // 模式选择
        body.appendChild(_segmentRow({
          label: "显示模式",
          icon: "list",
          items: [
            { val: "bubble", label: "气泡" },
            { val: "dialog", label: "对话" },
          ],
          current: conversation.mode || "bubble",
          onPick: async (v) => {
            conversation.mode = v;
            conversation.updatedAt = Date.now();
            await Storage.put("conversations", conversation);
          }
        }));

        // 思维链开关（显示）
        body.appendChild(_toggleRow({
          icon: "info",
          title: "展示思维链",
          sub: "开启后我会在回复里展示思考过程（如有）",
          on: conversation.showThinking === true,
          onToggle: async (v) => {
            conversation.showThinking = v;
            conversation.updatedAt = Date.now();
            await Storage.put("conversations", conversation);
          }
        }));

        // 回车发送开关
        body.appendChild(_toggleRow({
          icon: "send",
          title: "回车发送",
          sub: "关闭后回车换行，点按钮才发送",
          on: conversation.enterToSend !== false,
          onToggle: async (v) => {
            conversation.enterToSend = v;
            conversation.updatedAt = Date.now();
            await Storage.put("conversations", conversation);
          }
        }));
      }
    });

    // ============== 3. AI 设置（当前聊天专属） ==============
    CC && CC.mount(content, {
      title: "AI 设置（仅本聊天）",
      subtitle: "接口分组 / 模型 / 思维链 / 说话风格",
      icon: "app-memory",
      defaultOpen: false,
      content: (body) => {
        // 接口分组：默认 / 自定义
        body.appendChild(_apiGroupRow(conversation, () => _remount(container, params)));

        // 当前聊天的模型
        body.appendChild(_modelRow(conversation, () => _remount(container, params)));

        // 思维链开关（同上方，控制 AI 是否生成思维链）
        body.appendChild(_toggleRow({
          icon: "info",
          title: "展示思维链",
          sub: "本聊天是否展示思维链",
          on: conversation.showThinking === true,
          onToggle: async (v) => {
            conversation.showThinking = v;
            conversation.updatedAt = Date.now();
            await Storage.put("conversations", conversation);
          }
        }));

        // AI 说话风格（覆盖全局）
        body.appendChild(_speakingStyleRow(conversation, character));
      }
    });

    // ============== 4. 聊天记录 ==============
    CC && CC.mount(content, {
      title: "聊天记录",
      subtitle: "统计 / 导出 / 清空",
      icon: "archive",
      defaultOpen: false,
      content: (body) => {
        const msgCount = (conversation.messages || []).length;
        body.appendChild(U.el("div", { class: "form-hint", text: "共 " + msgCount + " 条消息", style: { padding: "4px 0 8px" } }));

        // 导出
        body.appendChild(_btnRow("导出为 TXT", "download", "btn-ghost btn-sm", () => _exportTxt(conversation, character)));
        body.appendChild(_btnRow("导出为 JSON", "download", "btn-ghost btn-sm", () => _exportJson(conversation, character)));

        // 清空
        body.appendChild(_btnRow("清空聊天记录", "trash", "btn-text btn-sm danger-text", async () => {
          const ok = await global.Phone.Modal.confirm({
            title: "清空聊天记录",
            message: "确定要清空吗？清空了就找不回来啦～",
            danger: true,
            okText: "清空",
          });
          if (!ok) return;
          conversation.messages = [];
          conversation.updatedAt = Date.now();
          await Storage.put("conversations", conversation);
          global.Phone.Notify.push({ appId: "chat", title: "已清空聊天记录" });
          _remount(container, params);
        }));
      }
    });

    // ============== 5. 危险操作 ==============
    CC && CC.mount(content, {
      title: "危险操作",
      subtitle: "删除这个聊天",
      icon: "warning",
      defaultOpen: false,
      content: (body) => {
        body.appendChild(_btnRow("删除聊天", "trash", "btn-danger btn-sm", async () => {
          const ok = await global.Phone.Modal.confirm({
            title: "删除聊天",
            message: "确定要删除和" + (character.name || "AI") + "的聊天吗？～",
            danger: true,
            okText: "删除",
          });
          if (!ok) return;
          await Storage.del("conversations", conversation.id);
          // 关联消息（如果走了 messages 表）也清掉
          try {
            const msgs = await Storage.getByIndex("messages", "conversationId", conversation.id);
            for (const m of msgs) await Storage.del("messages", m.id);
          } catch {}
          global.Phone.Notify.push({ appId: "chat", title: "已删除聊天" });
          // 退两层（设置页 + 聊天页），回到消息列表
          global.Phone.Router.back();
          setTimeout(() => global.Phone.Router.back(), 60);
        }));
      }
    });
  }

  function _remount(container, params) {
    while (container.firstChild) container.removeChild(container.firstChild);
    mount(container, params);
  }

  // ---------- 通用组件 ----------
  function _nav(title) {
    const U = global.Phone.Utils;
    const nav = U.el("div", { class: "navbar" });
    const navLeft = U.el("div", { class: "nav-left" });
    const backBtn = U.el("button", { class: "icon-btn" });
    backBtn.innerHTML = global.Phone.IconLibrary.get("chevron-left", { size: 22 });
    backBtn.addEventListener("click", () => global.Phone.Router.back());
    navLeft.appendChild(backBtn);
    nav.appendChild(navLeft);
    nav.appendChild(U.el("div", { class: "nav-title", text: title }));
    nav.appendChild(U.el("div", { class: "nav-right" }));
    return nav;
  }

  function _renderAvatar(char) {
    const U = global.Phone.Utils;
    const av = U.el("div", { class: "li-avatar" });
    if (char.avatar) av.innerHTML = '<img src="' + char.avatar + '" alt=""/>';
    else av.textContent = (char.name || "AI").slice(0, 1);
    return av;
  }

  // ---------- 对方资料卡片 ----------
  function _charProfileCard(character, characterId) {
    const U = global.Phone.Utils;
    const card = U.el("div", { class: "char-profile-card card-section open" });

    const head = U.el("div", { class: "cpc-head" });
    const avatar = U.el("div", { class: "cpc-avatar" });
    if (character.avatar) avatar.innerHTML = '<img src="' + character.avatar + '" alt=""/>';
    else avatar.textContent = (character.name || "AI").slice(0, 1);
    head.appendChild(avatar);

    const info = U.el("div", { class: "cpc-info" }, [
      U.el("div", { class: "cpc-name", text: character.name || "AI" }),
      U.el("div", { class: "cpc-desc", text: character.description || "还没有简介，去角色管理补一个吧～" }),
    ]);
    head.appendChild(info);

    const editBtn = U.el("button", { class: "cpc-edit icon-btn" });
    editBtn.innerHTML = global.Phone.IconLibrary.get("edit", { size: 18 });
    editBtn.title = "编辑角色";
    editBtn.addEventListener("click", () => {
      // 跳转角色管理编辑页（用现有 editMount，避免引入新 API）
      const Edit = global.Phone.Characters && global.Phone.Characters.editMount;
      if (Edit) global.Phone.Router.push("char-edit", Edit, { id: characterId });
      else global.Phone.Notify.push({ appId: "chat", title: "角色管理还没加载好" });
    });
    head.appendChild(editBtn);

    card.appendChild(head);
    return card;
  }

  // ---------- 通用 toggle 行 ----------
  function _toggleRow(opts) {
    const U = global.Phone.Utils;
    const row = U.el("div", { class: "list-item" }, [
      U.el("div", { class: "li-avatar li-avatar-icon", html: global.Phone.IconLibrary.get(opts.icon, { size: 18 }) }),
      U.el("div", { class: "li-main" }, [
        U.el("div", { class: "li-title", text: opts.title }),
        opts.sub ? U.el("div", { class: "li-sub", text: opts.sub }) : null,
      ]),
    ]);
    const sw = U.el("div", { class: "switch" + (opts.on ? " on" : "") });
    sw.addEventListener("click", async () => {
      const v = !sw.classList.contains("on");
      sw.classList.toggle("on", v);
      try { await opts.onToggle(v); } catch (e) { console.warn(e); }
    });
    row.appendChild(sw);
    return row;
  }

  // ---------- segment 行 ----------
  function _segmentRow(opts) {
    const U = global.Phone.Utils;
    const group = U.el("div", { class: "form-group" }, [
      U.el("div", { class: "form-label", text: opts.label }),
    ]);
    const seg = U.el("div", { class: "segment", style: { display: "flex", flexWrap: "wrap" } });
    opts.items.forEach((it) => {
      const node = U.el("div", {
        class: "segment-item" + (opts.current === it.val ? " active" : ""),
        text: it.label
      });
      node.addEventListener("click", async () => {
        seg.querySelectorAll(".segment-item").forEach((n) => n.classList.remove("active"));
        node.classList.add("active");
        try { await opts.onPick(it.val); } catch (e) { console.warn(e); }
      });
      seg.appendChild(node);
    });
    group.appendChild(seg);
    return group;
  }

  // ---------- 按钮 行 ----------
  function _btnRow(label, icon, cls, onclick) {
    const U = global.Phone.Utils;
    const row = U.el("div", { class: "form-group", style: { marginBottom: "8px" } });
    const btn = U.el("button", { class: "btn " + (cls || ""), style: { width: "100%" } }, [
      U.el("span", { html: global.Phone.IconLibrary.get(icon, { size: 16 }) }),
      U.el("span", { text: label, style: { marginLeft: "6px" } }),
    ]);
    btn.addEventListener("click", onclick);
    row.appendChild(btn);
    return row;
  }

  // ---------- 聊天背景 ----------
  function _chatBackgroundRow(conversation, remount) {
    const U = global.Phone.Utils;
    const group = U.el("div", { class: "form-group" });
    group.appendChild(U.el("div", { class: "form-label", text: "聊天背景" }));

    const bg = conversation.background || "";
    const preview = U.el("div", { class: "card-soft cs-bg-preview" }, [
      U.el("div", {
        class: "avatar avatar-sm cs-bg-thumb",
        style: bg ? { backgroundImage: "url(" + bg + ")", backgroundSize: "cover", backgroundPosition: "center" } : {},
        html: bg ? "" : global.Phone.IconLibrary.get("image", { size: 16 })
      }),
      U.el("div", { class: "flex-1" }, [
        U.el("div", { text: bg ? "已设置背景" : "未设置" }),
        U.el("div", { class: "form-hint", text: "可上传本地图片或填图床 URL" }),
      ]),
    ]);
    group.appendChild(preview);

    const btnRow = U.el("div", { class: "row gap-8", style: { marginTop: "8px", flexWrap: "wrap" } });
    // 上传
    btnRow.appendChild(_miniBtn("上传", "btn-ghost btn-sm", async () => {
      const inp = U.el("input", { type: "file", accept: "image/*", style: "display:none" });
      document.body.appendChild(inp);
      inp.addEventListener("change", async () => {
        const f = inp.files[0]; if (!f) return;
        const b64 = await U.fileToBase64(f);
        conversation.background = b64;
        conversation.updatedAt = Date.now();
        await global.Phone.Storage.put("conversations", conversation);
        inp.remove();
        remount();
      });
      inp.click();
    }));
    // URL
    btnRow.appendChild(_miniBtn("填 URL", "btn-ghost btn-sm", async () => {
      const url = await global.Phone.Modal.prompt({
        title: "填一个图片 URL",
        placeholder: "https://...",
        defaultValue: /^https?:\/\//.test(bg || "") ? bg : ""
      });
      if (url == null) return;
      conversation.background = url.trim();
      conversation.updatedAt = Date.now();
      await global.Phone.Storage.put("conversations", conversation);
      remount();
    }));
    // 恢复默认
    if (bg) {
      btnRow.appendChild(_miniBtn("恢复默认", "btn-text btn-sm", async () => {
        conversation.background = "";
        conversation.updatedAt = Date.now();
        await global.Phone.Storage.put("conversations", conversation);
        remount();
      }));
    }
    group.appendChild(btnRow);
    return group;
  }

  function _miniBtn(label, cls, onclick) {
    const U = global.Phone.Utils;
    const b = U.el("button", { class: "btn " + (cls || ""), text: label });
    b.addEventListener("click", onclick);
    return b;
  }

  // ---------- API 分组行 ----------
  function _apiGroupRow(conversation, remount) {
    const U = global.Phone.Utils;
    const group = U.el("div", { class: "form-group" });
    group.appendChild(U.el("div", { class: "form-label", text: "接口分组" }));

    const hasCustom = !!(conversation.apiEndpoint && conversation.apiKey);
    const sel = U.el("select", { class: "input" });
    sel.appendChild(U.el("option", { value: "global", text: "默认接口（用全局配置）" }));
    sel.appendChild(U.el("option", { value: "custom", text: hasCustom ? "本聊天自定义接口" : "自定义本聊天接口…" }));
    sel.value = hasCustom ? "custom" : "global";
    group.appendChild(sel);

    const hint = U.el("div", { class: "form-hint", text: hasCustom
      ? "本聊天使用自定义接口，端点：" + _truncateMid(conversation.apiEndpoint)
      : "本聊天使用全局接口配置" });
    group.appendChild(hint);

    // 自定义时展开输入
    const wrap = U.el("div", { class: "cs-custom-api", style: { display: hasCustom ? "block" : "none", marginTop: "8px" } });
    const epInp = U.el("input", {
      class: "input", placeholder: "https://api.openai.com/v1/chat/completions",
      value: conversation.apiEndpoint || ""
    });
    const keyInp = U.el("input", {
      class: "input", type: "password", placeholder: "sk-...",
      value: conversation.apiKey || ""
    });
    wrap.appendChild(epInp);
    wrap.appendChild(U.el("div", { style: { height: "6px" } }));
    wrap.appendChild(keyInp);
    const saveBtn = U.el("button", { class: "btn btn-ghost btn-sm", text: "保存本聊天接口", style: { marginTop: "8px" } });
    saveBtn.addEventListener("click", async () => {
      const ep = epInp.value.trim();
      const k = keyInp.value.trim();
      if (!ep || !k) {
        global.Phone.Notify.push({ appId: "chat", title: "接口地址和 Key 都要填哦" });
        return;
      }
      conversation.apiEndpoint = ep;
      conversation.apiKey = k;
      conversation.updatedAt = Date.now();
      await global.Phone.Storage.put("conversations", conversation);
      global.Phone.Notify.push({ appId: "chat", title: "本聊天接口已保存" });
      remount();
    });
    wrap.appendChild(saveBtn);
    const clearBtn = U.el("button", { class: "btn btn-text btn-sm", text: "改回全局接口", style: { marginTop: "8px", marginLeft: "6px" } });
    clearBtn.addEventListener("click", async () => {
      conversation.apiEndpoint = "";
      conversation.apiKey = "";
      conversation.updatedAt = Date.now();
      await global.Phone.Storage.put("conversations", conversation);
      global.Phone.Notify.push({ appId: "chat", title: "已切回全局接口" });
      remount();
    });
    wrap.appendChild(clearBtn);
    group.appendChild(wrap);

    sel.addEventListener("change", () => {
      const v = sel.value;
      if (v === "custom") {
        wrap.style.display = "block";
        hint.textContent = "填好接口地址和 Key 后点保存";
      } else {
        wrap.style.display = "none";
        // 切回全局：清掉自定义
        if (hasCustom) {
          (async () => {
            conversation.apiEndpoint = "";
            conversation.apiKey = "";
            conversation.updatedAt = Date.now();
            await global.Phone.Storage.put("conversations", conversation);
            global.Phone.Notify.push({ appId: "chat", title: "已切回全局接口" });
            remount();
          })();
        }
        hint.textContent = "本聊天使用全局接口配置";
      }
    });

    return group;
  }

  // ---------- 模型行 ----------
  function _modelRow(conversation, remount) {
    const U = global.Phone.Utils;
    const group = U.el("div", { class: "form-group" });
    group.appendChild(U.el("div", { class: "form-label", text: "当前聊天的模型" }));

    const cur = conversation.aiModel || "";
    const inp = U.el("input", { class: "input", placeholder: "留空则用全局模型", value: cur });
    group.appendChild(inp);

    // 常用模型 chip
    const chipWrap = U.el("div", { class: "segment", style: { display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "8px" } });
    (global.Phone.AIClient && global.Phone.AIClient.POPULAR_MODELS || []).forEach((m) => {
      const chip = U.el("div", {
        class: "segment-item" + (m.id === cur ? " active" : ""),
        text: m.name,
        style: { fontSize: "11px", padding: "4px 10px" }
      });
      chip.addEventListener("click", () => {
        inp.value = m.id;
        chipWrap.querySelectorAll(".segment-item").forEach((n) => n.classList.remove("active"));
        chip.classList.add("active");
      });
      chipWrap.appendChild(chip);
    });
    group.appendChild(chipWrap);

    const btnRow = U.el("div", { class: "row gap-8", style: { marginTop: "8px" } });
    btnRow.appendChild(_miniBtn("保存", "btn-ghost btn-sm", async () => {
      conversation.aiModel = inp.value.trim();
      conversation.updatedAt = Date.now();
      await global.Phone.Storage.put("conversations", conversation);
      global.Phone.Notify.push({ appId: "chat", title: "本聊天模型已保存" });
      remount();
    }));
    if (cur) {
      btnRow.appendChild(_miniBtn("清空（用全局）", "btn-text btn-sm", async () => {
        conversation.aiModel = "";
        conversation.updatedAt = Date.now();
        await global.Phone.Storage.put("conversations", conversation);
        remount();
      }));
    }
    group.appendChild(btnRow);
    return group;
  }

  // ---------- 说话风格 ----------
  function _speakingStyleRow(conversation, character) {
    const U = global.Phone.Utils;
    const group = U.el("div", { class: "form-group" });
    group.appendChild(U.el("div", { class: "form-label", text: "AI 说话风格（覆盖全局）" }));
    const ta = U.el("textarea", {
      class: "textarea",
      placeholder: "本聊天专属风格，比如：撒娇一点、爱用语气词、回复要短一点…",
      html: U.escapeHtml(conversation.aiSpeakingStyle || "")
    });
    group.appendChild(ta);
    group.appendChild(U.el("div", {
      class: "form-hint",
      text: conversation.aiSpeakingStyle
        ? "已设置本聊天专属风格，会覆盖全局设置"
        : "留空则用全局风格"
    }));
    const btnRow = U.el("div", { class: "row gap-8", style: { marginTop: "8px" } });
    btnRow.appendChild(_miniBtn("保存", "btn-ghost btn-sm", async () => {
      conversation.aiSpeakingStyle = ta.value;
      conversation.updatedAt = Date.now();
      await global.Phone.Storage.put("conversations", conversation);
      global.Phone.Notify.push({ appId: "chat", title: "说话风格已保存" });
    }));
    if (conversation.aiSpeakingStyle) {
      btnRow.appendChild(_miniBtn("清空", "btn-text btn-sm", async () => {
        conversation.aiSpeakingStyle = "";
        conversation.updatedAt = Date.now();
        await global.Phone.Storage.put("conversations", conversation);
        ta.value = "";
      }));
    }
    group.appendChild(btnRow);
    return group;
  }

  // ---------- 导出 ----------
  function _exportTxt(conv, char) {
    const U = global.Phone.Utils;
    const lines = (conv.messages || []).map((m) => {
      const who = m.role === "user" ? "我" : (char.name || "AI");
      return "[" + U.fmtDateTime(m.createdAt || Date.now()) + "] " + who + "：" + (m.content || "");
    });
    const text = "和 " + (char.name || "AI") + " 的聊天记录\n\n" + lines.join("\n");
    U.download("聊天记录_" + (char.name || "AI") + ".txt", text, "text/plain;charset=utf-8");
    global.Phone.Notify.push({ appId: "chat", title: "已导出 TXT" });
  }

  function _exportJson(conv, char) {
    const U = global.Phone.Utils;
    const data = {
      conversationId: conv.id,
      characterId: conv.characterId,
      characterName: char.name || "AI",
      exportedAt: Date.now(),
      messages: conv.messages || [],
    };
    U.download("聊天记录_" + (char.name || "AI") + ".json", JSON.stringify(data, null, 2), "application/json;charset=utf-8");
    global.Phone.Notify.push({ appId: "chat", title: "已导出 JSON" });
  }

  function _truncateMid(s) {
    if (!s) return "";
    if (s.length <= 40) return s;
    return s.slice(0, 20) + "…" + s.slice(-12);
  }

  // ---------- 暴露 ----------
  global.Phone = global.Phone || {};
  global.Phone.ChatSettings = { mount };
})(window);
