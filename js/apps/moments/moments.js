/* ============================================================
   moments.js — 朋友圈 APP
   动态列表 / 用户 & AI 发动态 / 文字+图片 / 点赞 / 评论 / 回复
   按角色筛选 / 删除自己的 / 事件写入事件中心
   AI 可自动根据人设发动态（由 chat-ai.js 触发）
   挂在 window.Phone.Moments
   ============================================================ */
(function (global) {
  "use strict";

  global.Phone = global.Phone || {};
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

  let _curFilter = "all"; // all / me / 角色 id

  async function mount(container) {
    const U = global.Phone.Utils;
    const Storage = global.Phone.Storage;
    const State = global.Phone.State;

    const currentId = await State.get("currentCharacterId");
    const chars = await Storage.getAll("characters");
    const current = chars.find((c) => c.id === currentId) || chars[0];

    const all = await Storage.getAll("moments");
    all.sort((a, b) => b.createdAt - a.createdAt);

    const page = U.el("div", { class: "page" });
    const nav = _nav(U, "朋友圈");
    const addBtn = U.el("button", { class: "icon-btn" });
    addBtn.innerHTML = global.Phone.IconLibrary.get("plus", { size: 22 });
    addBtn.addEventListener("click", () => _compose(U, current, () => _remount(container)));
    nav.querySelector(".nav-right").appendChild(addBtn);
    page.appendChild(nav);

    // 筛选条
    const filterBar = U.el("div", { class: "seg-bar" });
    const filters = [{ k: "all", t: "全部" }, { k: "me", t: "我的" }];
    chars.forEach((c) => filters.push({ k: c.id, t: c.name }));
    filters.forEach((s) => {
      const b = U.el("button", { class: "seg-btn" + (_curFilter === s.k ? " active" : ""), text: s.t });
      b.addEventListener("click", () => { _curFilter = s.k; _remount(container); });
      filterBar.appendChild(b);
    });
    page.appendChild(filterBar);

    const content = U.el("div", { class: "page-content" });

    let filtered = all;
    if (_curFilter === "me") filtered = all.filter((m) => m.authorId === "user");
    else if (_curFilter !== "all") filtered = all.filter((m) => m.authorId === _curFilter);

    if (filtered.length === 0) {
      content.appendChild(_empty(U, "还没有动态哦～\n点右上角发第一条吧"));
    } else {
      filtered.forEach((m) => content.appendChild(_card(U, m, current, chars, () => _remount(container))));
    }
    page.appendChild(content);
    container.appendChild(page);
  }

  // ---------- 动态卡片 ----------
  function _card(U, m, current, chars, onDone) {
    const author = m.authorId === "user"
      ? { name: "我", avatar: "" }
      : (chars.find((c) => c.id === m.authorId) || { name: "未知", avatar: "" });

    const wrap = U.el("div", { class: "mo-card" });
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
    headInfo.appendChild(U.el("div", { class: "mo-author", text: author.name }));
    headInfo.appendChild(U.el("div", { class: "mo-time", text: U.relTime(m.createdAt) }));
    head.appendChild(headInfo);
    wrap.appendChild(head);

    // 正文
    if (m.content) {
      wrap.appendChild(U.el("div", { class: "mo-content", text: m.content }));
    }
    // 图片
    if (m.images && m.images.length > 0) {
      const grid = U.el("div", { class: "mo-images grid-" + Math.min(m.images.length, 3) });
      m.images.forEach((src) => {
        const img = U.el("img", { class: "mo-image", src: src, alt: "图片" });
        img.addEventListener("error", () => { img.style.display = "none"; });
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
      onDone();
    });
    meta.appendChild(likeBtn);

    const cmtBtn = U.el("button", { class: "mo-action", text: "💬 " + (m.comments ? m.comments.length : 0) });
    cmtBtn.addEventListener("click", () => _comment(U, m, current, onDone));
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
        onDone();
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
        row.appendChild(U.el("span", { class: "mo-cmt-author", text: (isMine ? "我" : (c.authorName || "AI")) + "：" }));
        row.appendChild(U.el("span", { class: "mo-cmt-text", text: c.text }));
        if (isMine) {
          const del = U.el("button", { class: "mo-cmt-del", text: "删除" });
          del.addEventListener("click", async () => {
            m.comments = m.comments.filter((x) => x.id !== c.id);
            await global.Phone.Storage.put("moments", m);
            onDone();
          });
          row.appendChild(del);
        }
        cmtList.appendChild(row);
      });
      wrap.appendChild(cmtList);
    }

    return wrap;
  }

  // ---------- 发布动态 ----------
  function _compose(U, current, onDone) {
    const mask = U.el("div", { class: "modal-mask" });
    const modal = U.el("div", { class: "modal" });
    modal.appendChild(U.el("div", { class: "modal-title", text: "发朋友圈" }));

    const body = U.el("div", { class: "modal-body", style: { textAlign: "left" } });
    const ta = U.el("textarea", { class: "input", placeholder: "说点什么吧～", rows: 4 });
    body.appendChild(ta);

    // 图片
    const imgRow = U.el("div", { class: "form-group" });
    imgRow.appendChild(U.el("div", { class: "form-label", text: "图片（可选，最多 6 张）" }));
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
    imgRow.appendChild(imgGrid);
    body.appendChild(imgRow);
    modal.appendChild(body);

    const actions = U.el("div", { class: "modal-actions" });
    actions.appendChild(U.el("button", { class: "btn btn-ghost", text: "取消", onclick: () => mask.remove() }));
    const postBtn = U.el("button", { class: "btn", text: "发布" });
    postBtn.addEventListener("click", async () => {
      const content = ta.value.trim();
      if (!content && images.length === 0) {
        global.Phone.Notify.push({ appId: "moments", title: "说点什么或加张图吧" });
        return;
      }
      const moment = {
        id: global.Phone.Utils.uid("moment"),
        authorId: "user",
        content: content,
        images: images.slice(0, 6),
        likes: [],
        comments: [],
        createdAt: Date.now(),
      };
      await global.Phone.Storage.put("moments", moment);
      global.Phone.EventCenter.emit(global.Phone.EventCenter.TYPES.MOMENT_POSTED, {
        sourceApp: "moments",
        data: moment,
        summary: "我发了朋友圈：" + (content ? content.slice(0, 30) : "[图片]"),
      });
      global.Phone.Notify.push({ appId: "moments", title: "已发布" });
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
    const ta = U.el("textarea", { class: "input", placeholder: "写下评论...", rows: 3 });
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

  // ---------- 供 AI 调用：AI 自动发动态 ----------
  async function postAsCharacter(characterId, content, images) {
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
      images: images || [],
      likes: [],
      comments: [],
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
  function _nav(U, title) {
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

  function _empty(U, text) {
    const wrap = U.el("div", { class: "empty-state" });
    wrap.appendChild(U.el("div", { class: "empty-icon", html: global.Phone.IconLibrary.get("app-moments", { size: 48 }) }));
    text.split("\n").forEach((line) => wrap.appendChild(U.el("div", { class: "empty-text", text: line })));
    return wrap;
  }

  function _remount(container) {
    while (container.firstChild) container.removeChild(container.firstChild);
    mount(container);
  }

  // ---------- 暴露 ----------
  global.Phone.Moments = {
    open, mount,
    postAsCharacter, likeUserMoment, commentUserMoment,
  };
})(window);
