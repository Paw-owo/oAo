/* ============================================================
   moments.js — 朋友圈 APP（专业版）
   对齐参考：微信朋友圈 / 小红书 / 微博 / Instagram
   功能：
     - 动态列表（用户 & AI 都可发）
     - 文字 + 多图（最多 6 张）+ 话题 + 心情 + 位置
     - 可见性：公开 / 仅自己
     - 点赞 / 评论 / 回复
     - 置顶
     - 按角色筛选 + 搜索 + 话题筛选
     - 统计概览：总数 / 我的 / AI / 今日
     - 图片预览大图
     - 设置页：默认可见性 / 显示统计 / 自动加载图片 / 清空 / 导出
   挂在 window.Phone.Moments
   ============================================================ */
(function (global) {
  "use strict";

  global.Phone = global.Phone || {};

  // 心情选项
  const MOODS = [
    { v: "", l: "无" },
    { v: "happy", l: "开心" },
    { v: "calm", l: "平静" },
    { v: "tired", l: "疲惫" },
    { v: "sad", l: "难过" },
    { v: "excited", l: "兴奋" },
    { v: "thoughtful", l: "感慨" },
  ];

  // 可见性
  const VISIBILITIES = [
    { v: "public", l: "公开" },
    { v: "private", l: "仅自己" },
  ];

  global.Phone.AppRegistry.register({
    id: "moments",
    name: "朋友圈",
    icon: "app-moments",
    entry: () => open(),
    events: ["moment_posted", "moment_liked", "moment_commented"],
    settings: [],
    order: 11,
  });

  function open() { global.Phone.Router.push("moments", mount, {}); }

  async function mount(container) {
    const U = global.Phone.Utils;
    const Storage = global.Phone.Storage;
    const State = global.Phone.State;

    const currentId = await State.get("currentCharacterId");
    const chars = await Storage.getAll("characters");
    const current = chars.find((c) => c.id === currentId) || chars[0];

    const page = U.el("div", { class: "page" });
    if (global.Phone.ThemeEngine && global.Phone.ThemeEngine.tagApp) {
      global.Phone.ThemeEngine.tagApp(page, "moments");
    }
    page.appendChild(_nav(U, "朋友圈",
      () => _compose(U, current, () => _remount(container)),
      () => _openSettings(U, () => _remount(container))));

    const content = U.el("div", { class: "scroll page-content", style: { padding: "16px" } });

    // ---------- 统计概览 ----------
    const all = await Storage.getAll("moments");
    const now = Date.now();
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const total = all.length;
    const mine = all.filter((m) => m.authorId === "user").length;
    const aiCount = all.filter((m) => m.authorId !== "user").length;
    const todayCount = all.filter((m) => m.createdAt >= today.getTime()).length;
    if (State.get("momentsShowStats") !== false) {
      content.appendChild(U.el("div", { class: "mo-stats-bar" }, [
        U.el("div", { class: "msb-card" }, [
          U.el("div", { class: "msb-num", text: String(total) }),
          U.el("div", { class: "msb-label", text: "全部" }),
        ]),
        U.el("div", { class: "msb-card" }, [
          U.el("div", { class: "msb-num", text: String(mine) }),
          U.el("div", { class: "msb-label", text: "我的" }),
        ]),
        U.el("div", { class: "msb-card" }, [
          U.el("div", { class: "msb-num", text: String(aiCount) }),
          U.el("div", { class: "msb-label", text: "TA的" }),
        ]),
        U.el("div", { class: "msb-card" + (todayCount > 0 ? " highlight" : "") }, [
          U.el("div", { class: "msb-num", text: String(todayCount) }),
          U.el("div", { class: "msb-label", text: "今日" }),
        ]),
      ]));
    }

    // ---------- 搜索 ----------
    const search = U.el("input", { class: "input", placeholder: "搜索动态 / 话题...", style: { marginBottom: "12px" } });
    content.appendChild(search);

    // ---------- 筛选 ----------
    const filterSeg = U.el("div", { class: "segment", style: { display: "flex", marginBottom: "8px", overflowX: "auto" } });
    const filters = [{ k: "all", t: "全部" }, { k: "me", t: "我的" }];
    chars.forEach((c) => filters.push({ k: c.id, t: c.name }));
    let curFilter = "all";
    const listWrap = U.el("div", {});

    async function _load() {
      let list = await Storage.getAll("moments");
      list.sort((a, b) => {
        // 置顶永远在最前
        if (!!b.pinned - !!a.pinned !== 0) return (!!b.pinned ? 1 : 0) - (!!a.pinned ? 1 : 0);
        return (b.createdAt || 0) - (a.createdAt || 0);
      });
      const kw = search.value.trim().toLowerCase();
      if (kw) {
        list = list.filter((m) =>
          (m.content || "").toLowerCase().includes(kw) ||
          (m.topic || "").toLowerCase().includes(kw) ||
          (m.location || "").toLowerCase().includes(kw) ||
          (m.authorName || "").toLowerCase().includes(kw)
        );
      }
      // 仅自己看的动态只对自己可见
      list = list.filter((m) => {
        if (m.visibility === "private" && m.authorId !== "user") return false;
        return true;
      });
      if (curFilter === "me") list = list.filter((m) => m.authorId === "user");
      else if (curFilter !== "all") list = list.filter((m) => m.authorId === curFilter);

      U.empty(listWrap);
      if (list.length === 0) {
        listWrap.appendChild(_empty(U, kw ? "没找到相关动态" : "还没有动态", kw ? "换个关键词试试" : "点右上角发第一条吧~"));
        return;
      }
      list.forEach((m) => listWrap.appendChild(_card(U, m, current, chars, () => _load())));
    }

    filters.forEach((s) => {
      const node = U.el("div", { class: "segment-item" + (curFilter === s.k ? " active" : ""), text: s.t });
      node.addEventListener("click", () => {
        curFilter = s.k;
        filterSeg.querySelectorAll(".segment-item").forEach((n) => n.classList.remove("active"));
        node.classList.add("active");
        _load();
      });
      filterSeg.appendChild(node);
    });
    content.appendChild(filterSeg);

    search.addEventListener("input", global.Phone.Utils.debounce(_load, 200));
    content.appendChild(listWrap);
    _load();

    page.appendChild(content);
    container.appendChild(page);
  }

  // ---------- 动态卡片 ----------
  function _card(U, m, current, chars, onReload) {
    const author = m.authorId === "user"
      ? { name: "我", avatar: "" }
      : (chars.find((c) => c.id === m.authorId) || { name: m.authorName || "未知", avatar: "" });

    const wrap = U.el("div", { class: "mo-card" + (m.pinned ? " pinned" : "") });
    // 头部
    const head = U.el("div", { class: "mo-head" });
    const avatar = U.el("div", { class: "avatar avatar-sm" });
    if (author.avatar) {
      avatar.style.backgroundImage = "url(" + author.avatar + ")";
      avatar.style.backgroundSize = "cover";
    } else {
      avatar.textContent = (author.name || "?").slice(0, 1);
    }
    head.appendChild(avatar);
    const headInfo = U.el("div", { class: "mo-head-info" });
    headInfo.appendChild(U.el("div", { class: "mo-author" }, [
      document.createTextNode(author.name),
      m.visibility === "private" ? U.el("span", { class: "mo-viz-tag", text: "仅自己", title: "仅自己可见" }) : null,
    ].filter(Boolean)));
    headInfo.appendChild(U.el("div", { class: "mo-time", text: U.relTime(m.createdAt) + (m.location ? " · " + m.location : "") }));
    head.appendChild(headInfo);

    // 置顶 / 删除（自己的）
    if (m.authorId === "user") {
      const ops = U.el("div", { class: "mo-ops" });
      const pinBtn = U.el("button", { class: "icon-btn btn-sm" });
      pinBtn.innerHTML = global.Phone.IconLibrary.get(m.pinned ? "pin-fill" : "pin", { size: 14 });
      pinBtn.title = m.pinned ? "取消置顶" : "置顶";
      pinBtn.addEventListener("click", async (e) => {
        e.stopPropagation();
        m.pinned = !m.pinned;
        await global.Phone.Storage.put("moments", m);
        onReload();
      });
      ops.appendChild(pinBtn);
      head.appendChild(ops);
    }
    wrap.appendChild(head);

    // 正文
    if (m.content) {
      wrap.appendChild(U.el("div", { class: "mo-content", text: m.content }));
    }
    // 话题 + 心情
    const tags = [];
    if (m.topic) tags.push("#" + m.topic + "#");
    if (m.mood) {
      const moodObj = MOODS.find((x) => x.v === m.mood);
      if (moodObj) tags.push("心情·" + moodObj.l);
    }
    if (tags.length > 0) {
      wrap.appendChild(U.el("div", { class: "mo-tags" }, tags.map((t) => U.el("span", { class: "mo-tag", text: t }))));
    }
    // 图片
    if (m.images && m.images.length > 0) {
      const grid = U.el("div", { class: "mo-images grid-" + Math.min(m.images.length, 3) });
      m.images.forEach((src) => {
        const img = U.el("img", { class: "mo-image", src: src, alt: "图片" });
        img.addEventListener("error", () => { img.style.display = "none"; });
        img.addEventListener("click", () => _preview(U, src, m.images));
        grid.appendChild(img);
      });
      wrap.appendChild(grid);
    }

    // 互动栏
    const meta = U.el("div", { class: "mo-meta" });
    const likes = m.likes || [];
    const likeBtn = U.el("button", { class: "mo-action" + (likes.includes("user") ? " liked" : "") });
    likeBtn.innerHTML = global.Phone.IconLibrary.get(likes.includes("user") ? "heart-fill" : "heart", { size: 16 });
    likeBtn.appendChild(document.createTextNode(" " + likes.length));
    likeBtn.addEventListener("click", async () => {
      const idx = likes.indexOf("user");
      if (idx >= 0) likes.splice(idx, 1);
      else likes.push("user");
      m.likes = likes;
      await global.Phone.Storage.put("moments", m);
      if (idx < 0 && m.authorId !== "user") {
        global.Phone.EventCenter.emit(global.Phone.EventCenter.TYPES.MOMENT_LIKED, {
          sourceApp: "moments",
          data: { momentId: m.id, authorId: m.authorId },
          summary: "赞了 " + (author.name) + " 的朋友圈",
        });
      }
      onReload();
    });
    meta.appendChild(likeBtn);

    const cmtBtn = U.el("button", { class: "mo-action" });
    cmtBtn.innerHTML = global.Phone.IconLibrary.get("comment", { size: 16 }) + "<span>" + (m.comments ? m.comments.length : 0) + "</span>";
    cmtBtn.addEventListener("click", () => _comment(U, m, current, onReload));
    meta.appendChild(cmtBtn);

    // 删除（只能删自己的）
    if (m.authorId === "user") {
      const delBtn = U.el("button", { class: "mo-action danger", text: "删除" });
      delBtn.addEventListener("click", async () => {
        const ok = await global.Phone.Modal.confirm({
          title: "删除动态", message: "删除这条朋友圈？", danger: true, okText: "删除",
        });
        if (!ok) return;
        await global.Phone.Storage.del("moments", m.id);
        global.Phone.Notify.push({ appId: "moments", title: "已删除" });
        onReload();
      });
      meta.appendChild(delBtn);
    }
    wrap.appendChild(meta);

    // 评论列表
    if (m.comments && m.comments.length > 0) {
      const cmtList = U.el("div", { class: "mo-comments" });
      m.comments.forEach((c) => {
        const row = U.el("div", { class: "mo-comment" });
        const isMine = c.authorId === "user";
        row.appendChild(U.el("span", { class: "mo-cmt-author", text: (isMine ? "我" : (c.authorName || "AI")) + (c.replyTo ? " 回复 " + c.replyTo : "") + "：" }));
        row.appendChild(U.el("span", { class: "mo-cmt-text", text: c.text }));
        if (isMine) {
          const del = U.el("button", { class: "mo-cmt-del", text: "删除" });
          del.addEventListener("click", async () => {
            m.comments = m.comments.filter((x) => x.id !== c.id);
            await global.Phone.Storage.put("moments", m);
            onReload();
          });
          row.appendChild(del);
        }
        cmtList.appendChild(row);
      });
      wrap.appendChild(cmtList);
    }

    return wrap;
  }

  // ---------- 大图预览 ----------
  function _preview(U, src, allImages) {
    const mask = U.el("div", { class: "mo-preview-mask" });
    const img = U.el("img", { class: "mo-preview-img", src: src });
    mask.appendChild(img);
    mask.addEventListener("click", () => mask.remove());
    document.body.appendChild(mask);
  }

  // ---------- 发布动态 ----------
  function _compose(U, current, onDone) {
    const State = global.Phone.State;
    const mask = U.el("div", { class: "modal-mask" });
    const modal = U.el("div", { class: "modal" });
    modal.appendChild(U.el("div", { class: "modal-title", text: "发朋友圈" }));

    const body = U.el("div", { class: "modal-body", style: { textAlign: "left" } });
    const ta = U.el("textarea", { class: "textarea", placeholder: "说点什么吧~", style: { minHeight: "80px" } });
    body.appendChild(ta);

    // 话题
    body.appendChild(U.el("div", { class: "form-label", text: "话题（可选）", style: { marginTop: "10px" } }));
    const topicIn = U.el("input", { class: "input", placeholder: "如：今天的小事" });
    body.appendChild(topicIn);

    // 心情
    body.appendChild(U.el("div", { class: "form-label", text: "心情", style: { marginTop: "10px" } }));
    const moodSeg = U.el("div", { class: "segment", style: { display: "flex", flexWrap: "wrap" } });
    let curMood = "";
    MOODS.forEach((mo) => {
      const node = U.el("div", { class: "segment-item" + (curMood === mo.v ? " active" : ""), text: mo.l });
      node.addEventListener("click", () => {
        curMood = mo.v;
        moodSeg.querySelectorAll(".segment-item").forEach((n) => n.classList.remove("active"));
        node.classList.add("active");
      });
      moodSeg.appendChild(node);
    });
    body.appendChild(moodSeg);

    // 位置
    body.appendChild(U.el("div", { class: "form-label", text: "位置（可选）", style: { marginTop: "10px" } }));
    const locIn = U.el("input", { class: "input", placeholder: "如：北京·家" });
    body.appendChild(locIn);

    // 可见性
    body.appendChild(U.el("div", { class: "form-label", text: "可见性", style: { marginTop: "10px" } }));
    const vizSeg = U.el("div", { class: "segment", style: { display: "flex" } });
    let curViz = State.get("momentsDefaultVisibility") || "public";
    VISIBILITIES.forEach((v) => {
      const node = U.el("div", { class: "segment-item" + (curViz === v.v ? " active" : ""), text: v.l });
      node.addEventListener("click", () => {
        curViz = v.v;
        vizSeg.querySelectorAll(".segment-item").forEach((n) => n.classList.remove("active"));
        node.classList.add("active");
      });
      vizSeg.appendChild(node);
    });
    body.appendChild(vizSeg);

    // 图片
    body.appendChild(U.el("div", { class: "form-label", text: "图片（可选，最多 6 张）", style: { marginTop: "10px" } }));
    const imgGrid = U.el("div", { class: "mo-compose-grid grid-3" });
    const images = [];
    const addImgBtn = U.el("button", { class: "btn btn-ghost btn-sm", text: "+ 添加图片" });
    const fileInput = U.el("input", { type: "file", accept: "image/*", multiple: true, style: { display: "none" } });
    fileInput.addEventListener("change", () => {
      const files = Array.from(fileInput.files).slice(0, 6 - images.length);
      let processed = 0;
      files.forEach((f) => {
        if (f.size > 1.5 * 1024 * 1024) {
          global.Phone.Notify.push({ appId: "moments", title: f.name + " 太大，跳过" });
          processed++;
          if (processed === files.length) fileInput.value = "";
          return;
        }
        const reader = new FileReader();
        reader.onload = () => {
          images.push(reader.result);
          const thumb = U.el("div", { class: "mo-compose-thumb", style: { backgroundImage: "url(" + reader.result + ")", backgroundSize: "cover", backgroundPosition: "center" } });
          imgGrid.insertBefore(thumb, addImgBtn);
          processed++;
          if (processed === files.length) fileInput.value = "";
        };
        reader.readAsDataURL(f);
      });
    });
    addImgBtn.addEventListener("click", () => fileInput.click());
    imgGrid.appendChild(addImgBtn);
    body.appendChild(imgGrid);
    modal.appendChild(body);

    const actions = U.el("div", { class: "modal-actions" });
    actions.appendChild(U.el("button", { class: "btn btn-ghost", text: "取消", onclick: () => mask.remove() }));
    const postBtn = U.el("button", { class: "btn", text: "发布" });
    postBtn.addEventListener("click", async () => {
      const content = ta.value.trim();
      const topic = topicIn.value.trim();
      const location = locIn.value.trim();
      if (!content && images.length === 0) {
        global.Phone.Notify.push({ appId: "moments", title: "说点什么或加张图吧" });
        return;
      }
      const moment = {
        id: global.Phone.Utils.uid("moment"),
        authorId: "user",
        content: content,
        topic: topic,
        mood: curMood,
        location: location,
        visibility: curViz,
        images: images.slice(0, 6),
        likes: [],
        comments: [],
        pinned: false,
        createdAt: Date.now(),
      };
      await global.Phone.Storage.put("moments", moment);
      global.Phone.EventCenter.emit(global.Phone.EventCenter.TYPES.MOMENT_POSTED, {
        sourceApp: "moments",
        data: moment,
        summary: "我发了朋友圈：" + (content ? content.slice(0, 30) : "[图片]"),
      });
      global.Phone.Notify.push({ appId: "moments", title: "已发布啦" });
      mask.remove();
      onDone();
    });
    actions.appendChild(postBtn);
    modal.appendChild(actions);
    mask.appendChild(modal);
    mask.addEventListener("click", (e) => { if (e.target === mask) mask.remove(); });
    document.body.appendChild(mask);
  }

  // ---------- 评论 ----------
  function _comment(U, m, current, onDone) {
    const mask = U.el("div", { class: "modal-mask" });
    const modal = U.el("div", { class: "modal" });
    modal.appendChild(U.el("div", { class: "modal-title", text: "评论" }));
    const body = U.el("div", { class: "modal-body", style: { textAlign: "left" } });
    if (m.content) body.appendChild(U.el("div", { class: "mo-cite", text: "「" + m.content.slice(0, 40) + "」" }));
    const ta = U.el("textarea", { class: "textarea", placeholder: "写下评论...", style: { minHeight: "60px" } });
    body.appendChild(ta);
    modal.appendChild(body);

    const actions = U.el("div", { class: "modal-actions" });
    actions.appendChild(U.el("button", { class: "btn btn-ghost", text: "取消", onclick: () => mask.remove() }));
    const okBtn = U.el("button", { class: "btn", text: "发送" });
    okBtn.addEventListener("click", async () => {
      const text = ta.value.trim();
      if (!text) return;
      m.comments = m.comments || [];
      m.comments.push({
        id: global.Phone.Utils.uid("cmt"),
        authorId: "user",
        authorName: "我",
        text: text,
        createdAt: Date.now(),
      });
      await global.Phone.Storage.put("moments", m);
      if (m.authorId !== "user") {
        global.Phone.EventCenter.emit(global.Phone.EventCenter.TYPES.MOMENT_COMMENTED, {
          sourceApp: "moments",
          data: { momentId: m.id, authorId: m.authorId, text: text },
          summary: "评论了朋友圈：" + text.slice(0, 20),
        });
      }
      mask.remove();
      onDone();
    });
    actions.appendChild(okBtn);
    modal.appendChild(actions);
    mask.appendChild(modal);
    mask.addEventListener("click", (e) => { if (e.target === mask) mask.remove(); });
    document.body.appendChild(mask);
  }

  // ---------- 设置页 ----------
  function _openSettings(U, onDone) {
    global.Phone.AppSettings.open({
      appId: "moments",
      title: "朋友圈设置",
      build: (content, tools) => {
        const State = global.Phone.State;

        tools.section("显示");
        tools.toggle("显示统计概览", "关闭后隐藏顶部的数字卡片", "momentsShowStats", null);
        tools.toggle("隐藏已点赞", "只看还没点赞的动态", "momentsHideLiked", null);
        tools.toggle("自动加载图片", "关闭后图片用占位框，点击再加载", "momentsAutoLoadImages", null);

        tools.section("发布默认值");
        const curViz = State.get("momentsDefaultVisibility") || "public";
        const vizSeg = U.el("div", { class: "segment", style: { display: "flex" } });
        VISIBILITIES.forEach((v) => {
          const node = U.el("div", { class: "segment-item" + (curViz === v.v ? " active" : ""), text: v.l });
          node.addEventListener("click", async () => {
            await State.set("momentsDefaultVisibility", v.v);
            vizSeg.querySelectorAll(".segment-item").forEach((n) => n.classList.remove("active"));
            node.classList.add("active");
          });
          vizSeg.appendChild(node);
        });
        const vizGroup = U.el("div", { class: "settings-group", style: { padding: "12px 16px" } }, [vizSeg]);
        content.appendChild(vizGroup);

        tools.section("数据");
        tools.action("导出全部动态", async () => {
          const list = await global.Phone.Storage.getAll("moments");
          const blob = new Blob([JSON.stringify(list, null, 2)], { type: "application/json" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = "moments-" + new Date().toISOString().slice(0, 10) + ".json";
          a.click();
          URL.revokeObjectURL(url);
          global.Phone.Notify.push({ appId: "moments", title: "已导出 " + list.length + " 条" });
        });
        tools.action("清空我的动态", async () => {
          const ok = await global.Phone.Modal.confirm({ title: "清空动态", message: "删除所有你发的朋友圈？AI 的会保留。", danger: true });
          if (!ok) return;
          const list = await global.Phone.Storage.getAll("moments");
          for (const m of list) if (m.authorId === "user") await global.Phone.Storage.del("moments", m.id);
          global.Phone.Notify.push({ appId: "moments", title: "已清空" });
          onDone && onDone();
        }, { danger: true });

        tools.section("关于");
        tools.hint("朋友圈 APP 让你和 TA 互相分享日常，支持图片、话题、心情、位置。仅自己可见的动态只有你能看到。所有数据保存在本地。");
      },
    });
  }

  // ---------- 供 AI 调用：AI 自动发动态 ----------
  async function postAsCharacter(characterId, content, images, opts) {
    if (!characterId || !content) return false;
    const Storage = global.Phone.Storage;
    const chars = await Storage.getAll("characters");
    const char = chars.find((c) => c.id === characterId);
    if (!char) return false;
    const moment = {
      id: global.Phone.Utils.uid("moment"),
      authorId: characterId,
      authorName: char.name,
      content: content,
      topic: (opts && opts.topic) || "",
      mood: (opts && opts.mood) || "",
      location: (opts && opts.location) || "",
      visibility: "public",
      images: images || [],
      likes: [],
      comments: [],
      pinned: false,
      createdAt: Date.now(),
    };
    await Storage.put("moments", moment);
    global.Phone.EventCenter.emit(global.Phone.EventCenter.TYPES.MOMENT_POSTED, {
      sourceApp: "moments",
      data: moment,
      summary: char.name + " 发了朋友圈：" + content.slice(0, 30),
    });
    return true;
  }

  // ---------- 供 AI 调用：给用户动态点赞/评论 ----------
  async function likeUserMoment(characterId) {
    const Storage = global.Phone.Storage;
    const list = await Storage.getAll("moments");
    const userMoments = list.filter((m) => m.authorId === "user" && !(m.likes || []).includes(characterId));
    if (userMoments.length === 0) return false;
    const target = userMoments[Math.floor(Math.random() * userMoments.length)];
    target.likes = target.likes || [];
    target.likes.push(characterId);
    await Storage.put("moments", target);
    const chars = await Storage.getAll("characters");
    const char = chars.find((c) => c.id === characterId);
    global.Phone.EventCenter.emit(global.Phone.EventCenter.TYPES.MOMENT_LIKED, {
      sourceApp: "moments",
      data: { momentId: target.id, characterId: characterId },
      summary: (char ? char.name : "AI") + " 赞了你的朋友圈",
    });
    return true;
  }

  async function commentUserMoment(characterId, text) {
    if (!text) return false;
    const Storage = global.Phone.Storage;
    const list = await Storage.getAll("moments");
    const userMoments = list.filter((m) => m.authorId === "user");
    if (userMoments.length === 0) return false;
    const target = userMoments[Math.floor(Math.random() * userMoments.length)];
    const chars = await Storage.getAll("characters");
    const char = chars.find((c) => c.id === characterId);
    target.comments = target.comments || [];
    target.comments.push({
      id: global.Phone.Utils.uid("cmt"),
      authorId: characterId,
      authorName: char ? char.name : "AI",
      text: text,
      createdAt: Date.now(),
    });
    await Storage.put("moments", target);
    global.Phone.EventCenter.emit(global.Phone.EventCenter.TYPES.MOMENT_COMMENTED, {
      sourceApp: "moments",
      data: { momentId: target.id, characterId: characterId, text: text },
      summary: (char ? char.name : "AI") + " 评论了你的朋友圈：" + text.slice(0, 20),
    });
    return true;
  }

  // ---------- 工具 ----------
  function _nav(U, title, onAdd, onSettings) {
    const nav = U.el("div", { class: "navbar" });
    const navLeft = U.el("div", { class: "nav-left" });
    const back = U.el("button", { class: "icon-btn" });
    back.innerHTML = global.Phone.IconLibrary.get("chevron-left", { size: 22 });
    back.addEventListener("click", () => global.Phone.Router.back());
    navLeft.appendChild(back);
    nav.appendChild(navLeft);
    nav.appendChild(U.el("div", { class: "nav-title", text: title }));
    const navRight = U.el("div", { class: "nav-right" });
    if (onSettings) {
      const setBtn = U.el("button", { class: "icon-btn" });
      setBtn.innerHTML = global.Phone.IconLibrary.get("app-settings", { size: 20 });
      setBtn.addEventListener("click", onSettings);
      navRight.appendChild(setBtn);
    }
    const addBtn = U.el("button", { class: "icon-btn" });
    addBtn.innerHTML = global.Phone.IconLibrary.get("plus", { size: 22 });
    addBtn.addEventListener("click", onAdd);
    navRight.appendChild(addBtn);
    nav.appendChild(navRight);
    return nav;
  }

  function _empty(U, title, sub) {
    return U.el("div", { class: "empty-state" }, [
      U.el("div", { class: "es-icon", html: global.Phone.IconLibrary.get("app-moments", { size: 32 }) }),
      U.el("div", { class: "es-title", text: title }),
      U.el("div", { class: "es-sub", text: sub }),
    ]);
  }

  function _remount(container) {
    while (container.firstChild) container.removeChild(container.firstChild);
    mount(container);
  }

  // ---------- 暴露 API ----------
  global.Phone.Moments = {
    open, mount,
    MOODS, VISIBILITIES,
    postAsCharacter, likeUserMoment, commentUserMoment,
    /** 列出动态 */
    async list(filter) {
      let list = await global.Phone.Storage.getAll("moments");
      if (filter) {
        if (filter.authorId) list = list.filter((m) => m.authorId === filter.authorId);
        if (filter.topic) list = list.filter((m) => m.topic === filter.topic);
        if (filter.since) list = list.filter((m) => m.createdAt >= filter.since);
        if (filter.visibility) list = list.filter((m) => m.visibility === filter.visibility);
      }
      return list.sort((a, b) => {
        if (!!b.pinned - !!a.pinned !== 0) return (!!b.pinned ? 1 : 0) - (!!a.pinned ? 1 : 0);
        return (b.createdAt || 0) - (a.createdAt || 0);
      });
    },
    /** 用户发动态（API） */
    async create(opts) {
      const m = {
        id: global.Phone.Utils.uid("moment"),
        authorId: "user",
        content: opts.content || "",
        topic: opts.topic || "",
        mood: opts.mood || "",
        location: opts.location || "",
        visibility: opts.visibility || "public",
        images: opts.images || [],
        likes: [], comments: [], pinned: false,
        createdAt: Date.now(),
      };
      await global.Phone.Storage.put("moments", m);
      global.Phone.EventCenter.emit(global.Phone.EventCenter.TYPES.MOMENT_POSTED, {
        sourceApp: "moments",
        data: m,
        summary: "我发了朋友圈：" + (m.content ? m.content.slice(0, 30) : "[图片]"),
      });
      return m;
    },
    /** 统计 */
    async stats() {
      const list = await global.Phone.Storage.getAll("moments");
      const today = new Date(); today.setHours(0, 0, 0, 0);
      return {
        total: list.length,
        mine: list.filter((m) => m.authorId === "user").length,
        ai: list.filter((m) => m.authorId !== "user").length,
        today: list.filter((m) => m.createdAt >= today.getTime()).length,
        topics: list.filter((m) => m.topic).reduce((acc, m) => { acc[m.topic] = (acc[m.topic] || 0) + 1; return acc; }, {}),
      };
    },
  };
})(window);
