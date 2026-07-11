// apps/moments.js
// imports:
//   from '../core/storage.js': getData, setData, generateId, getNow, getAllDB, getDB, setDB, deleteDB, compressImage
//   from '../core/api.js': silentRequest
//   from '../core/ui.js': showToast, showBottomSheet, hideBottomSheet, showConfirm, createIcon

import {
  getData,
  setData,
  generateId,
  getNow,
  getAllDB,
  getDB,
  setDB,
  deleteDB,
  compressImage
} from '../core/storage.js';

import { silentRequest } from '../core/api.js';
import { loadWorldbookPromptForCharacter } from '../core/worldbook-prompt.js';

import {
  showToast,
  showBottomSheet,
  hideBottomSheet,
  showConfirm,
  createIcon
} from '../core/ui.js';

const MAX_IMAGES = 9;
const AUTO_MOMENT_CHANCE = 0.3;
const AUTO_MOMENT_COOLDOWN = 2 * 60 * 60 * 1000;
const AI_INTERACT_CHANCE = 0.38;
const AI_DAILY_LIMIT = 5;
const INTERACTION_STATE_KEY = 'moment_interaction_state';
const MOMENTS_UNREAD_KEY = 'moments_unread_count';

let rootEl = null;
let mountedContainer = null;
let moments = [];
let characters = [];
let injectedStyle = false;
let longPressTimer = null;
let unsubscribeCharsUpdated = null;

export async function mount(containerEl) {
  mountedContainer = containerEl;
  injectStyle();

  rootEl = el('section', 'app-screen moments-app');
  mountedContainer.innerHTML = '';
  mountedContainer.appendChild(rootEl);

  await loadData();
  await markAllRead();
  render();
  await maybeAutoInteractLatest();

  unsubscribeCharsUpdated = window.AppBus?.on('characters:updated', async () => {
    if (!rootEl) return;
    characters = normalizeArray(await getAllDB('characters')).filter((item) => item?.id);
    render();
  });
}

export function unmount() {
  hideBottomSheet();
  clearLongPress();

  if (unsubscribeCharsUpdated) {
    try { unsubscribeCharsUpdated(); } catch (_) {}
    unsubscribeCharsUpdated = null;
  }

  if (rootEl) rootEl.remove();
  if (mountedContainer) mountedContainer.innerHTML = '';

  rootEl = null;
  mountedContainer = null;
  moments = [];
  characters = [];
}

export async function maybeCreateAutoMoment(characterId, sourceText = '') {
  const character = await getDB('characters', characterId);
  if (!character) return null;

  const last = Number(character.lastMomentTime || getData(`last_moment_${characterId}`) || 0);
  if (Date.now() - last < AUTO_MOMENT_COOLDOWN) return null;
  if (Math.random() > AUTO_MOMENT_CHANCE) return null;

  const worldbookPrompt = await loadWorldbookPromptForCharacter(character).catch(() => '');

  const result = await silentRequest({
    prompt: `${worldbookPrompt ? worldbookPrompt + '\n\n' : ''}你要判断这个角色是否适合发一条朋友圈。只返回 JSON：{"post":"朋友圈内容或null","mood":"happy|neutral|sad|excited"}。内容要像真实朋友圈，短一点，不要解释。\n\n角色名：${character.name || 'AI'}\n聊天内容：${sourceText || ''}`,
    endpointId: character.apiConfig?.useGlobal === false ? character.apiConfig.endpointId : '',
    model: character.apiConfig?.useGlobal === false ? character.apiConfig.model : '',
    json: true,
    temperature: 0.8
  });

  if (!result?.post || String(result.post).toLowerCase() === 'null') return null;

  const post = {
    id: generateId(),
    authorId: characterId,
    content: String(result.post || '').slice(0, 300),
    images: [],
    likes: [],
    comments: [],
    timestamp: getNow(),
    isRead: false
  };

  await setDB('moments', post.id, post);

  character.lastMomentTime = Date.now();
  if (result.mood) character.mood = result.mood;
  await setDB('characters', character.id, character);
  setData(`last_moment_${characterId}`, Date.now());

  await syncMomentsUnreadCount();
  window.refreshDesktopBadges?.();

  return post;
}

async function loadData() {
  const [postList, characterList] = await Promise.all([
    getAllDB('moments'),
    getAllDB('characters')
  ]);

  characters = normalizeArray(characterList).filter((item) => item?.id);
  moments = normalizeArray(postList)
    .filter((item) => item?.id && item.deleted !== true)
    .map(normalizeMoment)
    .sort((a, b) => String(b.timestamp || '').localeCompare(String(a.timestamp || '')));

  writeMomentsUnreadCount(moments);
}

async function markAllRead() {
  const unread = moments.filter((item) => item.isRead === false);
  if (!unread.length) return;

  await Promise.all(unread.map((item) => {
    item.isRead = true;
    return setDB('moments', item.id, item);
  }));

  writeMomentsUnreadCount(moments);
  window.refreshDesktopBadges?.();
}

function render() {
  if (!rootEl) return;

  rootEl.innerHTML = '';

  const nav = el('div', 'nav-bar');
  const backButton = iconButton('back', '返回');
  backButton.addEventListener('click', () => window.closeCurrentApp?.());

  const titleWrap = el('div', 'moments-title-wrap');
  titleWrap.append(
    el('div', 'nav-title', '朋友圈'),
    el('div', 'nav-subtitle', '今天也有人在分享小事')
  );

  const publishButton = iconButton('add', '发布');
  publishButton.classList.add('accent');
  publishButton.addEventListener('click', openPublishSheet);

  nav.append(backButton, titleWrap, publishButton);

  const content = el('div', 'content-area moments-area');
  const wrap = el('div', 'content-narrow moments-feed');

  if (!moments.length) {
    wrap.appendChild(emptyState());
  } else {
    moments.forEach((post) => wrap.appendChild(createMomentCard(post)));
  }

  content.appendChild(wrap);
  rootEl.append(nav, content);
}

function createMomentCard(post) {
  const card = el('article', 'moment-card');
  card.dataset.postId = post.id;

  const author = getAuthor(post.authorId);
  const head = el('div', 'moment-head');
  head.append(
    createAvatar(author.avatar, author.name),
    el('div', 'moment-head-main')
  );

  head.querySelector('.moment-head-main').append(
    el('div', 'moment-author', author.name),
    el('div', 'moment-time', formatTime(post.timestamp))
  );

  const content = el('div', 'moment-content', post.content || '');

  card.append(head, content);

  if (Array.isArray(post.images) && post.images.length) {
    card.appendChild(createImageGrid(post.images));
  }

  const actions = el('div', 'moment-actions');
  const liked = post.likes.includes('user');

  const likeButton = actionButton('heart', liked ? '已喜欢' : '喜欢');
  likeButton.classList.toggle('active', liked);
  likeButton.addEventListener('click', () => toggleLike(post));

  const commentButton = actionButton('edit', '评论');
  commentButton.addEventListener('click', () => openCommentSheet(post));

  const moreButton = actionButton('more', '更多');
  moreButton.addEventListener('click', () => openMomentMoreSheet(post));

  actions.append(likeButton, commentButton, moreButton);
  card.appendChild(actions);

  if (post.likes.length || post.comments.length) {
    card.appendChild(createInteractionBox(post));
  }

  card.addEventListener('pointerdown', () => {
    clearLongPress();
    longPressTimer = window.setTimeout(() => openMomentMoreSheet(post), 520);
  });
  card.addEventListener('pointerup', clearLongPress);
  card.addEventListener('pointercancel', clearLongPress);
  card.addEventListener('pointerleave', clearLongPress);

  return card;
}

function createImageGrid(images) {
  const grid = el('div', `moment-images count-${Math.min(images.length, 9)}`);

  images.slice(0, 9).forEach((src) => {
    const button = el('button', 'moment-image-button');
    button.type = 'button';

    const img = document.createElement('img');
    img.src = src;
    img.alt = '';

    button.appendChild(img);
    button.addEventListener('click', () => previewImage(src));

    grid.appendChild(button);
  });

  return grid;
}

function createInteractionBox(post) {
  const box = el('div', 'moment-interactions');

  if (post.likes.length) {
    const likes = el('div', 'moment-likes');
    likes.append(createIcon('heart', 14), el('span', '', post.likes.map((id) => getAuthor(id).name).join('、')));
    box.appendChild(likes);
  }

  if (post.comments.length) {
    const comments = el('div', 'moment-comments');

    post.comments.forEach((comment) => {
      const row = el('div', 'moment-comment');
      row.append(
        el('span', 'moment-comment-author', `${getAuthor(comment.authorId).name}：`),
        el('span', 'moment-comment-text', comment.content || '')
      );
      comments.appendChild(row);
    });

    box.appendChild(comments);
  }

  return box;
}

function openPublishSheet() {
  const draft = { content: '', images: [] };

  const sheet = el('div', 'moment-publish-sheet');
  sheet.append(
    el('div', 'sheet-title', '发一条小动态'),
    el('div', 'sheet-description', '可以写文字，也可以放几张图。')
  );

  const text = textarea('今天想分享什么', '');
  const preview = el('div', 'publish-image-preview');

  const upload = button('添加图片', 'ghost', 'image');
  upload.addEventListener('click', () => pickImages(draft, preview));

  const submit = button('发布', 'primary', 'send');
  submit.addEventListener('click', async () => {
    draft.content = text.value.trim();

    if (!draft.content && !draft.images.length) {
      showToast('先写点什么或放张图');
      return;
    }

    const post = {
      id: generateId(),
      authorId: 'user',
      content: draft.content,
      images: draft.images,
      likes: [],
      comments: [],
      timestamp: getNow(),
      isRead: true
    };

    await setDB('moments', post.id, post);
    hideBottomSheet();

    await loadData();
    render();
    showToast('发出去啦');

    await maybeAiInteract(post);
  });

  sheet.append(field('内容', text), upload, preview, submit);
  showBottomSheet(sheet);
}

async function pickImages(draft, preview) {
  const inputEl = document.createElement('input');
  inputEl.type = 'file';
  inputEl.accept = 'image/*';
  inputEl.multiple = true;

  inputEl.addEventListener('change', async () => {
    const files = [...(inputEl.files || [])].slice(0, MAX_IMAGES - draft.images.length);

    if (!files.length) return;

    for (const file of files) {
      try {
        const base64 = await compressImage(file, 1200, 0.84);
        draft.images.push(base64);
      } catch (_) {
        showToast('有张图片没处理好');
      }
    }

    renderPublishPreview(draft, preview);
  });

  inputEl.click();
}

function renderPublishPreview(draft, preview) {
  preview.innerHTML = '';

  draft.images.forEach((src, index) => {
    const item = el('button', 'publish-image-item');
    item.type = 'button';

    const img = document.createElement('img');
    img.src = src;
    img.alt = '';

    const remove = el('span', 'publish-image-remove');
    remove.appendChild(createIcon('close', 12));

    item.append(img, remove);
    item.addEventListener('click', () => {
      draft.images.splice(index, 1);
      renderPublishPreview(draft, preview);
    });

    preview.appendChild(item);
  });
}

async function toggleLike(post) {
  const set = new Set(post.likes || []);

  if (set.has('user')) set.delete('user');
  else set.add('user');

  post.likes = [...set];
  await setDB('moments', post.id, post);
  await loadData();
  render();

  if (post.authorId !== 'user' && set.has('user')) {
    await recordToChat(post.authorId, 'user', `我喜欢了你的朋友圈：${post.content || '图片动态'}`, '朋友圈点赞');
    try {
      window.AppBus?.emit('moments:interaction', { type: 'like', characterId: post.authorId, postId: post.id });
    } catch (_) {}
  }
}

function openCommentSheet(post) {
  const sheet = el('div');
  sheet.append(
    el('div', 'sheet-title', '写评论'),
    el('div', 'sheet-description', '轻轻留一句，TA 可能会回你。')
  );

  const text = textarea('写一句评论', '');
  const send = button('发评论', 'primary', 'send');

  send.addEventListener('click', async () => {
    const content = text.value.trim();
    if (!content) {
      showToast('评论不能为空');
      return;
    }

    const comment = {
      id: generateId(),
      authorId: 'user',
      content,
      timestamp: getNow()
    };

    post.comments.push(comment);
    await setDB('moments', post.id, post);

    hideBottomSheet();
    await loadData();
    render();

    if (post.authorId !== 'user') {
      await recordToChat(post.authorId, 'user', `我评论了你的朋友圈：${content}`, '朋友圈评论');
      try {
        window.AppBus?.emit('moments:interaction', { type: 'comment', characterId: post.authorId, postId: post.id, content });
      } catch (_) {}
      await aiReplyToUserComment(post, content);
    } else {
      await maybeAiInteract(post);
    }
  });

  sheet.append(field('评论', text), send);
  showBottomSheet(sheet);
}

async function aiReplyToUserComment(post, userComment) {
  const character = characters.find((item) => item.id === post.authorId);
  if (!character) return;

  const worldbookPrompt = await loadWorldbookPromptForCharacter(character).catch(() => '');

  const reply = await silentRequest({
    prompt: `${worldbookPrompt ? worldbookPrompt + '\n\n' : ''}你是${character.name || 'AI'}。用户评论了你的朋友圈，请自然回复一句，不要太长。\n\n朋友圈：${post.content || '图片动态'}\n用户评论：${userComment}`,
    endpointId: character.apiConfig?.useGlobal === false ? character.apiConfig.endpointId : '',
    model: character.apiConfig?.useGlobal === false ? character.apiConfig.model : '',
    temperature: 0.8
  });

  if (!reply) return;

  const latest = await getDB('moments', post.id);
  if (!latest) return;

  latest.comments = Array.isArray(latest.comments) ? latest.comments : [];
  latest.comments.push({
    id: generateId(),
    authorId: character.id,
    content: reply.slice(0, 180),
    timestamp: getNow()
  });
  latest.isRead = false;

  await setDB('moments', latest.id, latest);
  await recordToChat(character.id, 'assistant', `我回复了你在朋友圈的评论：${reply}`, '朋友圈回复');

  try {
    window.AppBus?.emit('moments:interaction', { type: 'reply', characterId: character.id, postId: latest.id, content: reply });
  } catch (_) {}

  await syncMomentsUnreadCount();
  window.refreshDesktopBadges?.();

  await loadData();
  render();
}

async function maybeAiInteract(post) {
  if (!characters.length) return;

  const latest = await getDB('moments', post.id);
  if (!latest) return;

  const targetPost = normalizeMoment(latest);

  const candidates = shuffle(characters)
    .filter((character) => character.id !== targetPost.authorId)
    .filter((character) => canCharacterInteract(character.id, targetPost.id))
    .slice(0, 3);

  for (const character of candidates) {
    if (Math.random() > AI_INTERACT_CHANCE) continue;

    const action = Math.random() > 0.45 ? 'comment' : 'like';

    if (action === 'like') {
      targetPost.likes = [...new Set([...(targetPost.likes || []), character.id])];
      touchCharacterInteract(character.id, targetPost.id);
      continue;
    }

    const worldbookPrompt = await loadWorldbookPromptForCharacter(character).catch(() => '');

    const content = await silentRequest({
      prompt: `${worldbookPrompt ? worldbookPrompt + '\n\n' : ''}你是${character.name || 'AI'}。请给这条朋友圈写一句自然评论，短一点，不要解释。\n\n作者：${getAuthor(targetPost.authorId).name}\n内容：${targetPost.content || '图片动态'}`,
      endpointId: character.apiConfig?.useGlobal === false ? character.apiConfig.endpointId : '',
      model: character.apiConfig?.useGlobal === false ? character.apiConfig.model : '',
      temperature: 0.85
    });

    if (!content) continue;

    targetPost.comments.push({
      id: generateId(),
      authorId: character.id,
      content: content.slice(0, 180),
      timestamp: getNow()
    });

    touchCharacterInteract(character.id, targetPost.id);
    await recordToChat(character.id, 'assistant', `我评论了朋友圈：${content}`, '朋友圈互动');
    try {
      window.AppBus?.emit('moments:interaction', { type: 'ai-interaction', characterId: character.id, postId: targetPost.id, content });
    } catch (_) {}
  }

  targetPost.isRead = targetPost.authorId === 'user' ? false : targetPost.isRead;
  await setDB('moments', targetPost.id, targetPost);

  if (targetPost.authorId === 'user' && (targetPost.likes.length || targetPost.comments.length)) {
    await syncMomentsUnreadCount();
    window.refreshDesktopBadges?.();
  }

  await loadData();
  render();
}

async function maybeAutoInteractLatest() {
  const latest = moments.find((post) => post.authorId === 'user');
  if (!latest) return;
  await maybeAiInteract(latest);
}

function openMomentMoreSheet(post) {
  const sheet = el('div');
  sheet.appendChild(el('div', 'sheet-title', '这条动态'));

  const actions = [
    { icon: 'copy', label: '复制文字', action: () => copyText(post.content || '') },
    { icon: 'refresh', label: '让 AI 看看', action: () => maybeAiInteract(post) }
  ];

  if (post.authorId === 'user') {
    actions.push({ icon: 'delete', label: '删除', action: () => deleteMoment(post) });
  }

  sheet.appendChild(createToolGrid(actions));
  showBottomSheet(sheet);
}

async function deleteMoment(post) {
  hideBottomSheet();

  const ok = await showConfirm('要删掉这条小动态吗？');
  if (!ok) return;

  await deleteDB('moments', post.id);
  await loadData();
  render();
  showToast('删掉啦');
  window.refreshDesktopBadges?.();
}

function previewImage(src) {
  const sheet = el('div', 'image-preview-sheet');
  const img = document.createElement('img');
  img.src = src;
  img.alt = '';
  sheet.appendChild(img);
  showBottomSheet(sheet);
}

async function copyText(text) {
  hideBottomSheet();

  try {
    await navigator.clipboard.writeText(text);
    showToast('复制好了');
  } catch (_) {
    showToast('复制失败啦');
  }
}

async function recordToChat(characterId, role, content, source) {
  if (!characterId || characterId === 'user') return null;

  try {
    return await window.AppBus.recordExternalInteraction({
      characterId,
      role,
      content,
      source,
      importance: 3
    });
  } catch (_) {
    return null;
  }
}

function getAuthor(authorId) {
  if (authorId === 'user') {
    const settings = getData('app_settings') || {};
    return {
      id: 'user',
      name: settings.user?.name || '我',
      avatar: settings.user?.avatar || ''
    };
  }

  const character = characters.find((item) => item.id === authorId);
  return {
    id: authorId,
    name: character?.name || 'AI',
    avatar: character?.avatar || ''
  };
}

function normalizeMoment(post) {
  return {
    id: post.id || generateId(),
    authorId: post.authorId || 'user',
    content: post.content || '',
    images: Array.isArray(post.images) ? post.images : [],
    likes: Array.isArray(post.likes) ? post.likes : [],
    comments: Array.isArray(post.comments) ? post.comments : [],
    timestamp: post.timestamp || getNow(),
    isRead: post.isRead !== false
  };
}

function getInteractionState() {
  const today = new Date().toISOString().slice(0, 10);
  const saved = getData(INTERACTION_STATE_KEY) || {};

  if (saved.date !== today) {
    return { date: today, counts: {}, lastByPost: {} };
  }

  return {
    date: today,
    counts: saved.counts || {},
    lastByPost: saved.lastByPost || {}
  };
}

function saveInteractionState(state) {
  setData(INTERACTION_STATE_KEY, state);
}

function canCharacterInteract(characterId, postId) {
  const state = getInteractionState();
  const count = Number(state.counts[characterId] || 0);
  const lastKey = `${characterId}:${postId}`;

  return count < AI_DAILY_LIMIT && !state.lastByPost[lastKey];
}

function touchCharacterInteract(characterId, postId) {
  const state = getInteractionState();
  const lastKey = `${characterId}:${postId}`;

  state.counts[characterId] = Number(state.counts[characterId] || 0) + 1;
  state.lastByPost[lastKey] = Date.now();

  saveInteractionState(state);
}

function formatTime(value) {
  if (!value) return '刚刚';

  const diff = Date.now() - new Date(value).getTime();
  const minute = Math.floor(diff / 60000);
  const hour = Math.floor(diff / 3600000);

  if (minute < 1) return '刚刚';
  if (minute < 60) return `${minute} 分钟前`;
  if (hour < 24) return `${hour} 小时前`;

  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(value));
}

function createAvatar(src, name) {
  const box = el('div', 'moment-avatar');

  if (src) {
    const img = document.createElement('img');
    img.src = src;
    img.alt = '';
    box.appendChild(img);
  } else {
    box.appendChild(createIcon('smile', 22));
  }

  box.setAttribute('aria-label', name || '头像');
  return box;
}

function createToolGrid(items) {
  const grid = el('div', 'moment-tool-grid');

  items.forEach((item) => {
    const buttonEl = el('button', 'moment-tool-item');
    buttonEl.type = 'button';
    buttonEl.append(createIcon(item.icon, 20), el('span', '', item.label));
    buttonEl.addEventListener('click', () => {
      hideBottomSheet();
      window.setTimeout(item.action, 180);
    });
    grid.appendChild(buttonEl);
  });

  return grid;
}

function actionButton(iconName, label) {
  const item = el('button', 'moment-action');
  item.type = 'button';
  item.append(createIcon(iconName, 16), el('span', '', label));
  return item;
}

function iconButton(iconName, label) {
  const item = el('button', 'icon-button');
  item.type = 'button';
  item.setAttribute('aria-label', label);
  item.appendChild(createIcon(iconName, 22));
  return item;
}

function button(text, variant = 'ghost', iconName = '') {
  const item = el('button', variant === 'primary' ? 'btn-primary' : 'btn-ghost');
  item.type = 'button';
  if (iconName) item.appendChild(createIcon(iconName, 18));
  item.appendChild(el('span', '', text));
  return item;
}

function field(labelText, control) {
  const wrap = el('label', 'moments-field');
  wrap.append(el('span', 'field-label', labelText), control);
  return wrap;
}

function textarea(placeholder, value = '') {
  const item = document.createElement('textarea');
  item.className = 'textarea-card';
  item.placeholder = placeholder || '';
  item.value = value || '';
  return item;
}

function emptyState() {
  const box = el('div', 'empty-state');
  box.append(
    el('div', 'empty-state-title', '还没有动态'),
    el('div', 'empty-state-text', '点右上角发一条，看看谁会来互动。')
  );
  return box;
}

function clearLongPress() {
  if (longPressTimer) {
    window.clearTimeout(longPressTimer);
    longPressTimer = null;
  }
}

function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}

// 按未读朋友圈数同步 localStorage 角标键，供桌面 getUnreadMap 读取
function writeMomentsUnreadCount(list) {
  try {
    const count = normalizeArray(list).filter((item) => item && item.isRead === false).length;
    setData(MOMENTS_UNREAD_KEY, count);
  } catch (error) {
    console.warn('[moments] writeMomentsUnreadCount failed', error);
  }
}

// moments 数组可能过期时（如外部新增朋友圈），从 DB 重读计数后写键
async function syncMomentsUnreadCount() {
  try {
    const all = await getAllDB('moments');
    writeMomentsUnreadCount(normalizeArray(all).filter((item) => item && item.deleted !== true));
  } catch (error) {
    console.warn('[moments] syncMomentsUnreadCount failed', error);
  }
}

function shuffle(list) {
  return list.slice().sort(() => Math.random() - 0.5);
}

function el(tag, className = '', text = '') {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null && text !== '') node.textContent = String(text);
  return node;
}

function injectStyle() {
  if (injectedStyle || document.getElementById('moments-style')) return;
  injectedStyle = true;

  const style = document.createElement('style');
  style.id = 'moments-style';
  style.textContent = `
    .moments-app {
      color: var(--text-primary);
      font-size: var(--font-size-base);
    }

    .moments-title-wrap {
      flex: 1;
      min-width: 0;
    }

    .moments-area {
      background: var(--bg-primary);
    }

    .moments-feed {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-md);
      padding-bottom: var(--spacing-lg);
    }

    .moment-card {
      padding: var(--spacing-md);
      border-radius: var(--radius-lg);
      background: var(--bg-card);
      box-shadow: var(--shadow-sm);
      transition: var(--motion);
    }

    .moment-card:active {
      transform: scale(var(--press-scale));
    }

    .moment-head {
      display: grid;
      grid-template-columns: 44px minmax(0, 1fr);
      gap: var(--spacing-sm);
      align-items: center;
    }

    .moment-avatar {
      width: 44px;
      height: 44px;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      border-radius: 18px;
      background: var(--surface-muted);
      color: var(--accent-dark);
      box-shadow: var(--shadow-sm);
    }

    .moment-avatar img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .moment-author {
      color: var(--text-primary);
      font-size: var(--font-size-title);
      font-weight: 600;
      line-height: 1.35;
    }

    .moment-time {
      margin-top: 2px;
      color: var(--text-secondary);
      font-size: var(--font-size-small);
      line-height: 1.35;
    }

    .moment-content {
      margin-top: var(--spacing-md);
      color: var(--text-primary);
      font-size: var(--font-size-base);
      line-height: 1.7;
      white-space: pre-wrap;
      word-break: break-word;
    }

    .moment-images {
      display: grid;
      gap: var(--spacing-xs);
      margin-top: var(--spacing-md);
    }

    .moment-images.count-1 {
      grid-template-columns: minmax(0, 1fr);
    }

    .moment-images:not(.count-1) {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }

    .moment-image-button {
      aspect-ratio: 1;
      overflow: hidden;
      border-radius: var(--radius-md);
      background: var(--surface-muted);
      box-shadow: var(--shadow-sm);
    }

    .moment-images.count-1 .moment-image-button {
      aspect-ratio: 4 / 3;
      max-width: 260px;
    }

    .moment-image-button img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .moment-actions {
      display: flex;
      align-items: center;
      gap: var(--spacing-xs);
      margin-top: var(--spacing-md);
    }

    .moment-action {
      min-height: 32px;
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 6px 10px;
      border-radius: 999px;
      background: var(--surface-muted);
      color: var(--text-secondary);
      font-size: var(--font-size-small);
      box-shadow: var(--shadow-sm);
    }

    .moment-action.active {
      background: var(--accent-light);
      color: var(--accent-dark);
    }

    .moment-interactions {
      margin-top: var(--spacing-sm);
      padding: 10px 12px;
      border-radius: var(--radius-md);
      background: var(--surface-muted);
      color: var(--text-secondary);
      font-size: var(--font-size-small);
      line-height: 1.6;
    }

    .moment-likes {
      display: flex;
      align-items: center;
      gap: 6px;
      color: var(--accent-dark);
    }

    .moment-comments {
      display: flex;
      flex-direction: column;
      gap: 4px;
      margin-top: var(--spacing-xs);
    }

    .moment-comment-author {
      color: var(--text-primary);
      font-weight: 600;
    }

    .moment-comment-text {
      color: var(--text-secondary);
    }

    .moment-publish-sheet,
    .image-preview-sheet {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-md);
    }

    .moments-field {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-sm);
    }

    .publish-image-preview {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: var(--spacing-sm);
    }

    .publish-image-item {
      position: relative;
      aspect-ratio: 1;
      overflow: hidden;
      border-radius: var(--radius-lg);
      background: var(--surface-muted);
      box-shadow: var(--shadow-sm);
    }

    .publish-image-item img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .publish-image-remove {
      position: absolute;
      top: 6px;
      right: 6px;
      width: 22px;
      height: 22px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 999px;
      background: var(--accent-dark);
      color: var(--bubble-user-text);
      box-shadow: var(--shadow-sm);
    }

    .moment-tool-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: var(--spacing-sm);
    }

    .moment-tool-item {
      min-height: 78px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: var(--spacing-sm);
      padding: var(--spacing-sm);
      border-radius: var(--radius-lg);
      background: var(--surface-muted);
      color: var(--text-primary);
      font-size: var(--font-size-small);
    }

    .image-preview-sheet img {
      width: 100%;
      max-height: 70vh;
      object-fit: contain;
      border-radius: var(--radius-lg);
      box-shadow: var(--shadow-sm);
      background: var(--surface-muted);
    }
  `;

  document.head.appendChild(style);
}

// 依赖：../core/storage.js 的 getData/setData/generateId/getNow/getAllDB/getDB/setDB/deleteDB/compressImage；../core/api.js 的 silentRequest；../core/ui.js 的 showToast/showBottomSheet/hideBottomSheet/showConfirm/createIcon；动态依赖 ./chat.js 的 recordExternalInteraction
