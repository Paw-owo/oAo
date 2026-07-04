/* ============================================================
   ai-config.js — AI 与接口设置
   API 地址 / Key / 模型 / 说话风格 / 思维链 / 温度
   改造成可折叠卡片：接口配置（默认展开）/ 说话方式 / 高级参数 /
   主动行为 / TTS / MCP（后五项默认折叠）
   挂在 window.Phone.AIConfig
   ============================================================ */
(function (global) {
  "use strict";

  async function mount(container) {
    const U = global.Phone.Utils;
    const State = global.Phone.State;
    const Storage = global.Phone.Storage;
    const CC = global.Phone.Components && global.Phone.Components.CollapsibleCard;

    const page = U.el("div", { class: "page settings-page" });
    page.appendChild(_nav("AI 与接口"));

    const content = U.el("div", { class: "scroll page-content" });
    // 可折叠卡片之间需要留点空隙
    content.style.paddingTop = "12px";

    const [endpoint, apiKey, model, speakingStyle, showThinking, temperature, maxTokens,
           aiFirstPerson, aiHasOwnLife, aiSenseWorld, aiEmotionalResponse, aiReplyLength, aiThinkTag,
           ttsEnabled, ttsAutoPlay, ttsVoice, ttsRate, ttsPitch, ttsVolume,
           mcpEnabled] = await Promise.all([
      State.get("aiEndpoint"), State.get("aiApiKey"), State.get("aiModel"),
      State.get("aiSpeakingStyle"), State.get("showThinking"),
      State.get("aiTemperature"), State.get("aiMaxTokens"),
      State.get("aiFirstPerson"), State.get("aiHasOwnLife"),
      State.get("aiSenseWorld"), State.get("aiEmotionalResponse"),
      State.get("aiReplyLength"), State.get("aiThinkTag"),
      State.get("ttsEnabled"), State.get("ttsAutoPlay"),
      State.get("ttsVoice"), State.get("ttsRate"), State.get("ttsPitch"), State.get("ttsVolume"),
      State.get("mcpEnabled"),
    ]);

    // 主动行为相关设置（getSetting 异步）
    const proactiveSettings = (Storage.getAllSettings ? await Storage.getAllSettings() : {}) || {};
    const aiProactiveEnabled = proactiveSettings.aiProactiveEnabled !== false;
    const aiAutoMoment = proactiveSettings.aiAutoMoment !== false;
    const aiAutoInteract = proactiveSettings.aiAutoInteract !== false;
    const aiAutoChat = proactiveSettings.aiAutoChat !== false;

    // ============== 卡片 1：接口配置（默认展开） ==============
    const apiCard = CC ? CC.mount(content, {
      title: "接口配置",
      subtitle: "API 地址 / Key / 模型",
      icon: "app-settings",
      defaultOpen: true,
      content: (body) => {
        body.appendChild(U.el("div", { class: "form-group" }, [
          U.el("div", { class: "form-label", text: "接口地址" }),
          U.el("input", { class: "input", id: "cfg-endpoint", placeholder: "https://api.openai.com/v1/chat/completions", value: endpoint || "" }),
          U.el("div", { class: "form-hint", text: "OpenAI 兼容格式接口地址" }),
        ]));
        body.appendChild(U.el("div", { class: "form-group" }, [
          U.el("div", { class: "form-label", text: "API Key" }),
          U.el("input", { class: "input", id: "cfg-apikey", type: "password", placeholder: "sk-...", value: apiKey || "" }),
          U.el("div", { class: "form-hint", text: "本地存储，不会上传到任何第三方" }),
        ]));
        body.appendChild(U.el("div", { class: "form-group" }, [
          U.el("div", { class: "form-label", text: "模型名称" }),
          U.el("input", { class: "input", id: "cfg-model", placeholder: "gpt-4o-mini", value: model || "" }),
        ]));

        // 拉取模型按钮 + 状态提示
        const fetchRow = U.el("div", { class: "form-group" }, [
          U.el("button", { class: "btn btn-ghost btn-sm", id: "cfg-fetch-models", text: "拉取可用模型列表" }),
          U.el("div", { class: "form-hint", id: "cfg-fetch-hint", text: "填好接口地址和 Key 后点这里，我帮你拉一份可用模型清单" }),
        ]);
        body.appendChild(fetchRow);

        // 模型列表容器（拉取后填充，默认隐藏）
        const modelListWrap = U.el("div", { class: "form-group", id: "cfg-model-list-wrap", style: { display: "none" } });
        body.appendChild(modelListWrap);

        // 常用预设快捷按钮
        const presetGroup = U.el("div", { class: "form-group" }, [
          U.el("div", { class: "form-label", text: "常用模型快捷填入" }),
        ]);
        const presetGrid = U.el("div", { class: "segment", style: { display: "flex", flexWrap: "wrap", gap: "6px" } });
        (global.Phone.AIClient.POPULAR_MODELS || []).forEach((m) => {
          const chip = U.el("div", { class: "segment-item", text: m.name, style: { fontSize: "11px", padding: "4px 10px" } });
          chip.addEventListener("click", () => {
            const inp = document.getElementById("cfg-model");
            if (inp) { inp.value = m.id; }
            presetGrid.querySelectorAll(".segment-item").forEach((n) => n.classList.remove("active"));
            chip.classList.add("active");
          });
          presetGrid.appendChild(chip);
        });
        presetGroup.appendChild(presetGrid);
        body.appendChild(presetGroup);

        // 拉取模型事件
        const fetchBtn = fetchRow.querySelector("#cfg-fetch-models");
        const fetchHint = fetchRow.querySelector("#cfg-fetch-hint");
        if (fetchBtn && fetchHint) {
          fetchBtn.addEventListener("click", async () => {
            fetchBtn.setAttribute("disabled", "1");
            fetchBtn.textContent = "拉取中...";
            fetchHint.textContent = "我去问一下接口有哪些模型可用";
            try {
              const e = document.getElementById("cfg-endpoint").value.trim();
              const k = document.getElementById("cfg-apikey").value.trim();
              const r = await global.Phone.AIClient.fetchModels({ endpoint: e, apiKey: k });
              if (!r.ok) { fetchHint.textContent = r.error || "拉取失败"; return; }
              if (!r.models || !r.models.length) { fetchHint.textContent = "接口没返回模型列表"; return; }
              fetchHint.textContent = "我拉到 " + r.models.length + " 个模型，点一下就能填入";
              const wrap = document.getElementById("cfg-model-list-wrap");
              if (!wrap) return;
              U.empty(wrap);
              wrap.style.display = "block";
              wrap.appendChild(U.el("div", { class: "form-label", text: "可用模型（" + r.models.length + "）" }));
              const grid = U.el("div", { class: "segment", style: { display: "flex", flexWrap: "wrap", gap: "6px", maxHeight: "180px", overflowY: "auto" } });
              const cur = (document.getElementById("cfg-model").value || "").trim();
              r.models.forEach((m) => {
                const chip = U.el("div", { class: "segment-item" + (m.id === cur ? " active" : ""), text: m.id, style: { fontSize: "11px", padding: "4px 10px" } });
                chip.addEventListener("click", () => {
                  const inp = document.getElementById("cfg-model");
                  if (inp) inp.value = m.id;
                  grid.querySelectorAll(".segment-item").forEach((n) => n.classList.remove("active"));
                  chip.classList.add("active");
                });
                grid.appendChild(chip);
              });
              wrap.appendChild(grid);
              // 展开卡片以显示拉取结果
              if (apiCard._collapsible && !apiCard._collapsible.isOpen()) apiCard._collapsible.open();
            } catch (e) {
              fetchHint.textContent = "拉取出错：" + (e.message || e);
            } finally {
              fetchBtn.removeAttribute("disabled");
              fetchBtn.textContent = "重新拉取模型列表";
            }
          });
        }
      },
    }) : null;

    // 兜底：组件未加载时直接挂到 content
    const apiHost = apiCard ? null : content;

    // ============== 卡片 2：AI 说话方式 ==============
    CC ? CC.mount(content, {
      title: "AI 说话方式",
      subtitle: "风格 / 长度 / 思维链",
      icon: "app-chat",
      defaultOpen: false,
      content: (body) => {
        body.appendChild(U.el("div", { class: "form-group" }, [
          U.el("div", { class: "form-label", text: "说话风格（全局补充）" }),
          U.el("textarea", { class: "textarea", id: "cfg-style", placeholder: "例如：回复要短一点、爱用颜文字、偶尔撒娇", html: U.escapeHtml(speakingStyle || "") }),
          U.el("div", { class: "form-hint", text: speakingStyle ? "当前生效：你的补充会完全接管默认风格" : "留空则用默认可爱风格；填了就完全接管" }),
        ]));

        // 回复长度 segment
        const lenGroup = U.el("div", { class: "form-group" }, [
          U.el("div", { class: "form-label", text: "回复长度" }),
        ]);
        const lenSeg = U.el("div", { class: "segment", style: { display: "flex" } });
        const lenOpts = [{ v: "short", l: "简短" }, { v: "normal", l: "适中" }, { v: "long", l: "详细" }];
        const curLen = aiReplyLength || "normal";
        lenOpts.forEach((o) => {
          const it = U.el("div", { class: "segment-item" + (curLen === o.v ? " active" : ""), text: o.l });
          it.addEventListener("click", async () => {
            lenSeg.querySelectorAll(".segment-item").forEach((n) => n.classList.remove("active"));
            it.classList.add("active");
            await State.set("aiReplyLength", o.v);
          });
          lenSeg.appendChild(it);
        });
        lenGroup.appendChild(lenSeg);
        body.appendChild(lenGroup);

        // 思维链标签
        body.appendChild(U.el("div", { class: "form-group" }, [
          U.el("div", { class: "form-label", text: "思维链标签" }),
          U.el("input", { class: "input", id: "cfg-thinktag", placeholder: "<think >...</think >", value: aiThinkTag || "<think >...</think >" }),
          U.el("div", { class: "form-hint", text: "不同模型的思维链标签可能不同，按需调整" }),
        ]));

        // 思维链开关
        const thinkRow = U.el("div", { class: "list-item" }, [
          U.el("div", { class: "li-main" }, [
            U.el("div", { class: "li-title", text: "展示思维链" }),
            U.el("div", { class: "li-sub", text: "显示 AI 的思考过程" }),
          ]),
        ]);
        const thinkSwitch = U.el("div", { class: "switch" + (showThinking ? " on" : "") });
        thinkSwitch.addEventListener("click", async () => {
          const v = !showThinking;
          await State.set("showThinking", v);
          thinkSwitch.classList.toggle("on", v);
        });
        thinkRow.appendChild(thinkSwitch);
        body.appendChild(thinkRow);
      },
    }) : null;

    // ============== 卡片 3：高级参数（性格开关 + 温度 + token） ==============
    CC ? CC.mount(content, {
      title: "高级参数",
      subtitle: "性格 / 温度 / 长度",
      icon: "app-memory",
      defaultOpen: false,
      content: (body) => {
        const softGroup = U.el("div", { class: "settings-group", style: { padding: "0", marginBottom: "12px" } });
        const _softToggle = (title, sub, cur, key) => {
          const row = U.el("div", { class: "list-item" }, [
            U.el("div", { class: "li-main" }, [
              U.el("div", { class: "li-title", text: title }),
              U.el("div", { class: "li-sub", text: sub }),
            ]),
          ]);
          const sw = U.el("div", { class: "switch" + (cur !== false ? " on" : "") });
          sw.addEventListener("click", async () => {
            const v = !sw.classList.contains("on");
            sw.classList.toggle("on", v);
            await State.set(key, v);
          });
          row.appendChild(sw);
          return row;
        };
        softGroup.appendChild(_softToggle("第一人称", "用「我」说话", aiFirstPerson, "aiFirstPerson"));
        softGroup.appendChild(_softToggle("有自己的生活", "有记忆/情绪/钱包/朋友圈", aiHasOwnLife, "aiHasOwnLife"));
        softGroup.appendChild(_softToggle("感知世界", "能感知小手机世界里发生的事", aiSenseWorld, "aiSenseWorld"));
        softGroup.appendChild(_softToggle("情绪回应", "开心/不开心会表达出来", aiEmotionalResponse, "aiEmotionalResponse"));
        body.appendChild(softGroup);

        // 温度
        body.appendChild(U.el("div", { class: "form-group" }, [
          U.el("div", { class: "form-label", text: "温度（创造性）：" + (temperature != null ? temperature : 0.7) }),
          (() => {
            const slider = U.el("input", { type: "range", min: "0", max: "1", step: "0.1", value: String(temperature != null ? temperature : 0.7), style: { width: "100%" } });
            slider.addEventListener("change", () => State.set("aiTemperature", parseFloat(slider.value)));
            return slider;
          })(),
        ]));

        // 最大 token
        body.appendChild(U.el("div", { class: "form-group" }, [
          U.el("div", { class: "form-label", text: "最大回复长度（token）" }),
          U.el("input", { class: "input", id: "cfg-maxtokens", type: "number", value: String(maxTokens || 2000) }),
        ]));
      },
    }) : null;

    // ============== 卡片 4：我的主动行为 ==============
    CC ? CC.mount(content, {
      title: "我的主动行为",
      subtitle: "我会像真人一样主动找你",
      icon: "bell",
      defaultOpen: false,
      content: (body) => {
        body.appendChild(U.el("div", { class: "form-hint", text: "我会像真人一样主动找你、发朋友圈、给你点赞评论", style: { marginBottom: "8px" } }));

        const pEnabled = aiProactiveEnabled;
        const pMoment = aiAutoMoment;
        const pInteract = aiAutoInteract;
        const pChat = aiAutoChat;

        const _toggle = (title, sub, cur, onToggle) => {
          const row = U.el("div", { class: "list-item" }, [
            U.el("div", { class: "li-main" }, [
              U.el("div", { class: "li-title", text: title }),
              U.el("div", { class: "li-sub", text: sub }),
            ]),
          ]);
          const sw = U.el("div", { class: "switch" + (cur ? " on" : "") });
          sw.addEventListener("click", async () => {
            const v = !sw.classList.contains("on");
            sw.classList.toggle("on", v);
            await onToggle(v);
          });
          row.appendChild(sw);
          return row;
        };

        body.appendChild(_toggle("启用主动行为", "关闭后我不会主动打扰你", pEnabled, async (v) => {
          await Storage.setSetting("aiProactiveEnabled", v);
          if (!v && global.Phone.AIProactive) global.Phone.AIProactive.stop();
          else if (v && global.Phone.AIProactive) global.Phone.AIProactive.start();
        }));
        body.appendChild(_toggle("我会自动发朋友圈", "每 6 小时发一条", pMoment, (v) => Storage.setSetting("aiAutoMoment", v)));
        body.appendChild(_toggle("我会点赞评论朋友圈", "每 2 小时互动一次", pInteract, (v) => Storage.setSetting("aiAutoInteract", v)));
        body.appendChild(_toggle("我会主动找你聊天", "每 4 小时来打个招呼", pChat, (v) => Storage.setSetting("aiAutoChat", v)));

        const triggerBtn = U.el("button", { class: "btn btn-ghost btn-sm", text: "立即触发一次（测试）", style: { marginTop: "8px", width: "100%" } });
        triggerBtn.addEventListener("click", () => {
          if (global.Phone.AIProactive) {
            global.Phone.AIProactive.trigger();
            global.Phone.Notify.push({ appId: "settings", title: "已触发，去看朋友圈/消息列表" });
          }
        });
        body.appendChild(triggerBtn);
      },
    }) : null;

    // ============== 卡片 5：TTS 语音朗读 ==============
    CC ? CC.mount(content, {
      title: "语音朗读（TTS）",
      subtitle: "让我能被听到",
      icon: "sb-music",
      defaultOpen: !!ttsEnabled,
      content: (body) => {
        // TTS 总开关
        const ttsEnabledRow = U.el("div", { class: "list-item" }, [
          U.el("div", { class: "li-main" }, [
            U.el("div", { class: "li-title", text: "启用语音朗读" }),
            U.el("div", { class: "li-sub", text: "让我的回复能被听到" }),
          ]),
        ]);
        const ttsEnabledSw = U.el("div", { class: "switch" + (ttsEnabled ? " on" : "") });
        ttsEnabledSw.addEventListener("click", async () => {
          if (!global.Phone.TTS) {
            global.Phone.Notify.push({ appId: "settings", title: "TTS 模块没加载好，先刷新页面试试" });
            return;
          }
          const v = !ttsEnabledSw.classList.contains("on");
          ttsEnabledSw.classList.toggle("on", v);
          await State.set("ttsEnabled", v);
        });
        ttsEnabledRow.appendChild(ttsEnabledSw);
        body.appendChild(ttsEnabledRow);
        if (!global.Phone.TTS) {
          body.appendChild(U.el("div", { class: "form-hint", text: "TTS 模块没加载好，刷新页面看看", style: { padding: "8px 0" } }));
        }

        // 自动朗读
        const ttsAutoRow = U.el("div", { class: "list-item" }, [
          U.el("div", { class: "li-main" }, [
            U.el("div", { class: "li-title", text: "自动朗读我的回复" }),
            U.el("div", { class: "li-sub", text: "我回复完就自动念给你听" }),
          ]),
        ]);
        const ttsAutoSw = U.el("div", { class: "switch" + (ttsAutoPlay ? " on" : "") });
        ttsAutoSw.addEventListener("click", async () => {
          const v = !ttsAutoSw.classList.contains("on");
          ttsAutoSw.classList.toggle("on", v);
          await State.set("ttsAutoPlay", v);
        });
        ttsAutoRow.appendChild(ttsAutoSw);
        body.appendChild(ttsAutoRow);

        // 音色选择
        const ttsVoiceGroup = U.el("div", { class: "form-group" }, [
          U.el("div", { class: "form-label", text: "音色" }),
        ]);
        const voiceSelect = U.el("select", { class: "input", id: "cfg-tts-voice" });
        voiceSelect.appendChild(U.el("option", { value: "", text: "默认音色" }));
        if (global.Phone.TTS) {
          const voices = global.Phone.TTS.getVoices();
          const zhVoices = voices.filter((v) => /zh|cmn/i.test(v.lang));
          (zhVoices.length ? zhVoices : voices).forEach((v) => {
            voiceSelect.appendChild(U.el("option", { value: v.voiceURI, text: v.name + "（" + v.lang + "）", selected: v.voiceURI === ttsVoice }));
          });
        }
        ttsVoiceGroup.appendChild(voiceSelect);
        body.appendChild(ttsVoiceGroup);

        // 语速/音调/音量滑块
        const _slider = (label, cur, min, max, step, key) => {
          const g = U.el("div", { class: "form-group" }, [
            U.el("div", { class: "form-label", text: label + "：" + (cur != null ? cur : 1) }),
          ]);
          const s = U.el("input", { type: "range", min: String(min), max: String(max), step: String(step), value: String(cur != null ? cur : 1), style: { width: "100%" } });
          s.addEventListener("change", async () => { await State.set(key, parseFloat(s.value)); g.querySelector(".form-label").textContent = label + "：" + s.value; });
          g.appendChild(s);
          return g;
        };
        body.appendChild(_slider("语速", ttsRate, 0.5, 2, 0.1, "ttsRate"));
        body.appendChild(_slider("音调", ttsPitch, 0, 2, 0.1, "ttsPitch"));
        body.appendChild(_slider("音量", ttsVolume, 0, 1, 0.1, "ttsVolume"));

        // 试听按钮
        const previewBtn = U.el("button", { class: "btn btn-ghost btn-sm", text: "试听一下", style: { margin: "8px 0 0", width: "100%" } });
        previewBtn.addEventListener("click", async () => {
          if (!global.Phone.TTS) return;
          await State.set("ttsVoice", voiceSelect.value);
          const sliders = body.querySelectorAll("input[type=range]");
          const rate = parseFloat(sliders[0].value);
          const pitch = parseFloat(sliders[1].value);
          const vol = parseFloat(sliders[2].value);
          await State.set("ttsRate", rate);
          await State.set("ttsPitch", pitch);
          await State.set("ttsVolume", vol);
          global.Phone.TTS.preview();
        });
        body.appendChild(previewBtn);
      },
    }) : null;

    // ============== 卡片 6：MCP 工具调用 ==============
    CC ? CC.mount(content, {
      title: "MCP 工具调用",
      subtitle: "让我能操作小手机",
      icon: "app-memory",
      defaultOpen: false,
      content: (body) => {
        const mcpEnableRow = U.el("div", { class: "list-item" }, [
          U.el("div", { class: "li-main" }, [
            U.el("div", { class: "li-title", text: "启用 MCP 工具调用" }),
            U.el("div", { class: "li-sub", text: "让我能通过 function calling 操作小手机" }),
          ]),
        ]);
        const mcpEnableSw = U.el("div", { class: "switch" + (mcpEnabled ? " on" : "") });
        mcpEnableSw.addEventListener("click", async () => {
          if (!global.Phone.McpClient) {
            global.Phone.Notify.push({ appId: "settings", title: "MCP 模块没加载好，先刷新页面试试" });
            return;
          }
          const v = !mcpEnableSw.classList.contains("on");
          mcpEnableSw.classList.toggle("on", v);
          await State.set("mcpEnabled", v);
          if (v && global.Phone.McpClient) global.Phone.McpClient.enable();
          else if (!v && global.Phone.McpClient) global.Phone.McpClient.disable();
        });
        mcpEnableRow.appendChild(mcpEnableSw);
        body.appendChild(mcpEnableRow);

        if (global.Phone.McpClient) {
          const tools = global.Phone.McpClient.list();
          const catCount = {};
          tools.forEach((t) => { catCount[t.category] = (catCount[t.category] || 0) + 1; });
          body.appendChild(U.el("div", { class: "form-hint", text: "已注册 " + tools.length + " 个工具，覆盖：" + Object.keys(catCount).join("、"), style: { padding: "8px 0" } }));
        } else {
          body.appendChild(U.el("div", { class: "form-hint", text: "MCP 模块未加载", style: { padding: "8px 0" } }));
        }
      },
    }) : null;

    // ============== 兜底：组件未加载时直接挂到 content（保留旧逻辑）==============
    if (!CC) {
      content.appendChild(U.el("div", { class: "form-group" }, [
        U.el("div", { class: "form-label", text: "接口地址" }),
        U.el("input", { class: "input", id: "cfg-endpoint", placeholder: "https://api.openai.com/v1/chat/completions", value: endpoint || "" }),
      ]));
      content.appendChild(U.el("div", { class: "form-group" }, [
        U.el("div", { class: "form-label", text: "API Key" }),
        U.el("input", { class: "input", id: "cfg-apikey", type: "password", placeholder: "sk-...", value: apiKey || "" }),
      ]));
      content.appendChild(U.el("div", { class: "form-group" }, [
        U.el("div", { class: "form-label", text: "模型名称" }),
        U.el("input", { class: "input", id: "cfg-model", placeholder: "gpt-4o-mini", value: model || "" }),
      ]));
      content.appendChild(U.el("div", { class: "form-group" }, [
        U.el("div", { class: "form-label", text: "说话风格（全局补充）" }),
        U.el("textarea", { class: "textarea", id: "cfg-style", placeholder: "例如：回复要短一点、爱用颜文字、偶尔撒娇", html: U.escapeHtml(speakingStyle || "") }),
      ]));
      content.appendChild(U.el("div", { class: "form-group" }, [
        U.el("div", { class: "form-label", text: "最大回复长度（token）" }),
        U.el("input", { class: "input", id: "cfg-maxtokens", type: "number", value: String(maxTokens || 2000) }),
      ]));
      content.appendChild(U.el("div", { class: "form-group" }, [
        U.el("div", { class: "form-label", text: "思维链标签" }),
        U.el("input", { class: "input", id: "cfg-thinktag", placeholder: "<think >...</think >", value: aiThinkTag || "<think >...</think >" }),
      ]));
      const voiceSelect = U.el("select", { class: "input", id: "cfg-tts-voice" });
      voiceSelect.appendChild(U.el("option", { value: "", text: "默认音色" }));
      content.appendChild(voiceSelect);
    }

    // 保存按钮
    content.appendChild(U.el("button", { class: "btn btn-block", style: { marginTop: "20px" }, text: "保存配置", id: "cfg-save" }));

    page.appendChild(content);
    container.appendChild(page);

    document.getElementById("cfg-save").addEventListener("click", async () => {
      const e = document.getElementById("cfg-endpoint").value.trim();
      const k = document.getElementById("cfg-apikey").value.trim();
      const m = document.getElementById("cfg-model").value.trim();
      const s = document.getElementById("cfg-style").value.trim();
      const mt = parseInt(document.getElementById("cfg-maxtokens").value) || 2000;
      const tt = (document.getElementById("cfg-thinktag") || {}).value;
      const tv = (document.getElementById("cfg-tts-voice") || {}).value;
      try {
        await Promise.all([
          State.set("aiEndpoint", e), State.set("aiApiKey", k), State.set("aiModel", m),
          State.set("aiSpeakingStyle", s), State.set("aiMaxTokens", mt),
          State.set("aiThinkTag", tt || "<think >...</think >"),
          State.set("ttsVoice", tv || ""),
        ]);
        // 同步到默认 API 分组（保持新分组系统与老配置一致）
        if (global.Phone.AIClient && global.Phone.AIClient.saveApiGroup) {
          try {
            const groups = await global.Phone.AIClient.getApiGroups();
            const def = groups.find((g) => g.isDefault) || groups[0];
            if (def) {
              const models = def.models || [];
              const newModels = (m && models.indexOf(m) < 0) ? models.concat([m]) : models;
              await global.Phone.AIClient.saveApiGroup({
                id: def.id,
                name: def.name,
                baseUrl: e,
                apiKey: k,
                models: newModels,
                isDefault: true,
              });
              await global.Phone.AIClient.setCurrentModel(def.id, m);
            }
          } catch (err) { console.warn("[AIConfig] 同步默认分组失败", err); }
        }
      } catch (err) {
        global.Phone.Notify.push({ appId: "settings", title: "保存失败了，再试一次" });
        return;
      }
      global.Phone.Notify.push({ appId: "settings", title: "AI 配置已保存", body: e ? "接口已就绪" : "记得填接口地址哦" });
      global.Phone.Router.back();
    });

    // 角色管理入口（独立卡片）
    CC ? CC.mount(content, {
      title: "角色管理",
      subtitle: "创建 / 编辑 / 切换 AI 角色",
      icon: "app-characters",
      defaultOpen: false,
      content: (body) => {
        const charLink = U.el("div", { class: "list-item", style: { margin: "0" } }, [
          U.el("div", { class: "li-avatar", style: { background: "var(--color-accent-ultralight)", color: "var(--color-accent)" }, html: global.Phone.IconLibrary.get("app-characters", { size: 18 }) }),
          U.el("div", { class: "li-main" }, [
            U.el("div", { class: "li-title", text: "打开角色管理" }),
            U.el("div", { class: "li-sub", text: "可创建多个角色并切换" }),
          ]),
          U.el("div", { class: "li-right", html: global.Phone.IconLibrary.get("chevron-right", { size: 18 }) }),
        ]);
        charLink.addEventListener("click", () => {
          if (global.Phone.Characters) global.Phone.Characters.open();
        });
        body.appendChild(charLink);
      },
    }) : null;
  }

  function _nav(title) {
    const U = global.Phone.Utils;
    const nav = U.el("div", { class: "navbar" });
    const navLeft = U.el("div", { class: "nav-left" });
    const back = U.el("button", { class: "icon-btn" });
    back.innerHTML = global.Phone.IconLibrary.get("chevron-left", { size: 22 });
    back.addEventListener("click", () => global.Phone.Router.back());
    navLeft.appendChild(back);
    nav.appendChild(navLeft);
    nav.appendChild(U.el("div", { class: "nav-title", text: title }));
    nav.appendChild(U.el("div", { class: "nav-right" }));
    return nav;
  }

  // ---------- 暴露 ----------
  global.Phone = global.Phone || {};
  global.Phone.AIConfig = { mount };
})(window);
