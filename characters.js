// apps/characters.js
// imports:
//   from '../core/storage.js': getData, setData, generateId, getNow, getAllDB, getDB, setDB, deleteDB, getByIndexDB, compressImage
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
  getByIndexDB,
  compressImage
} from '../core/storage.js';

import {
  showToast,
  showBottomSheet,
  hideBottomSheet,
  showConfirm,
  createIcon
} from '../core/ui.js';

import { addMemory, editMemory, deleteMemory } from '../core/memory.js';

const STYLE_ID = 'characters-style';
const USER_PROFILES_KEY = 'user_profiles';
const LEGACY_USER_PROFILES_KEY = 'app_user_profiles';
const ACTIVE_PROFILE_KEY = 'active_user_profile_id';
const CHARACTER_AVATAR_PREFIX = 'app_character_avatar_';
const CHARACTER_BG_PREFIX = 'app_character_chat_bg_';

const DEFAULT_CHARACTER = {
  id: '',
  name: '',
  avatar: '',
  avatarKey: '',
  avatarSource: '',
  chatBackground: {
    type: 'none',
    value: '',
    blobKey: '',
    opacity: 100
  },
  systemPrompt: '',
  quickReplies: [],
  stickerIds: [],
  worldbookIds: [],
  worldbookMode: 'bound_plus_global',
  userProfileId: '',
  nicknameForUser: '',
  relationship: '',
  speakingStyle: '',
  replyLength: 'normal',
  proactiveStyle: '',
  ttsConfig: {
    enabled: false,
    provider: 'openai',
    voice: 'alloy',
    apiKey: '',
    endpoint: '',
    model: 'tts-1'
  },
  apiConfig: {
    useGlobal: true,
    endpointId: '',
    model: ''
  },
  memoryTriggerCount: 100,
  mood: 'neutral',
  createdAt: '',
  updatedAt: ''
};

const DEFAULT_PROFILE = {
  id: '',
  name: '',
  content: '',
  avatar: '',
  avatarKey: '',
  avatarSource: '',
  isDefault: false,
  characterIds: [],
  createdAt: '',
  updatedAt: ''
};

const MOODS = [
  { value: 'happy', label: '开心' },
  { value: 'neutral', label: '平静' },
  { value: 'sad', label: '低落' },
  { value: 'excited', label: '兴奋' }
];

const REPLY_LENGTHS = [
  { value: 'short', label: '短一点' },
  { value: 'normal', label: '刚刚好' },
  { value: 'long', label: '多说点' }
];

let rootEl = null;
let mountedContainer = null;
let characters = [];
let userProfiles = [];
let worldbookEntries = [];
let stickers = [];
let longPressTimer = null;
let suppressClick = false;
let currentTab = 'ai';

export async function mount(containerEl) {
  mountedContainer = containerEl;
  injectStyle();

  rootEl = document.createElement('section');
  rootEl.className = 'app-screen characters-app';

  mountedContainer.innerHTML = '';
  mountedContainer.appendChild(rootEl);

  await migrateUserProfilesIfNeeded();
  await loadData();
  renderList();
}

export function unmount() {
  hideBottomSheet();
  clearLongPress();

  if (rootEl) {
    rootEl.remove();
    rootEl = null;
  }

  if (mountedContainer) {
    mountedContainer.innerHTML = '';
    mountedContainer = null;
  }

  characters = [];
  userProfiles = [];
  worldbookEntries = [];
  stickers = [];
  suppressClick = false;
}

async function loadData() {
  characters = normalizeCharacterList(await getAllDB('characters'));
  worldbookEntries = normalizeArray(await getAllDB('worldbook'));
  stickers = normalizeArray(await getAllDB('stickers'));
  userProfiles = loadUserProfiles();
}

function renderList() {
  if (!rootEl) return;

  rootEl.innerHTML = '';

  const nav = el('div', 'nav-bar');
  const backButton = iconButton('back', '返回桌面');
  backButton.addEventListener('click', () => window.closeCurrentApp?.());

  const titleWrap = el('div', 'characters-nav-title');
  titleWrap.append(
    el('div', 'nav-title', currentTab === 'ai' ? '角色小屋' : '我的小档案'),
    el('div', 'nav-subtitle', currentTab === 'ai'
      ? (characters.length ? `${characters.length} 个角色在这里` : '先捏一个想聊天的 TA')
      : (userProfiles.length ? `${userProfiles.length} 份小档案` : '让 TA 更懂你一点')
    )
  );

  const importButton = iconButton('upload', currentTab === 'ai' ? '导入角色' : '导入人设');
  importButton.addEventListener('click', currentTab === 'ai' ? openImportSheet : openProfileImportSheet);

  nav.append(backButton, titleWrap, importButton);

  const content = el('div', 'content-area');
  const wrap = el('div', 'content-narrow characters-wrap');

  const tabs = createSegmented(
    [
      { value: 'ai', label: 'AI 角色' },
      { value: 'me', label: '我' }
    ],
    currentTab,
    async (value) => {
      currentTab = value;
      await loadData();
      renderList();
    }
  );

  wrap.appendChild(tabs);

  if (currentTab === 'ai') {
    renderCharacterList(wrap);
  } else {
    renderProfileList(wrap);
  }

  const addButton = el('button', 'character-add-button');
  addButton.type = 'button';
  addButton.setAttribute('aria-label', currentTab === 'ai' ? '新建角色' : '新建人设');
  addButton.appendChild(createIcon('add', 26));
  addButton.addEventListener('click', () => currentTab === 'ai' ? openEditor() : openProfileEditor());

  content.appendChild(wrap);
  rootEl.append(nav, content, addButton);
}

function renderCharacterList(wrap) {
  if (!characters.length) {
    wrap.appendChild(renderCharacterEmptyState());
    return;
  }

  const grid = el('div', 'character-grid');

  characters
    .slice()
    .sort((a, b) => String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || '')))
    .forEach((character) => {
      grid.appendChild(createCharacterCard(character));
    });

  wrap.appendChild(grid);
}

function renderProfileList(wrap) {
  if (!userProfiles.length) {
    wrap.appendChild(renderProfileEmptyState());
    return;
  }

  const list = el('div', 'user-profile-grid');

  userProfiles
    .slice()
    .sort((a, b) => {
      if (a.isDefault && !b.isDefault) return -1;
      if (!a.isDefault && b.isDefault) return 1;
      return String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || ''));
    })
    .forEach((profile) => {
      list.appendChild(createProfileCard(profile));
    });

  wrap.appendChild(list);
}

function renderCharacterEmptyState() {
  const box = el('div', 'character-empty');
  const mark = el('div', 'character-empty-mark');
  mark.appendChild(createIcon('smile', 32));

  box.append(
    mark,
    el('div', 'character-empty-title', '还没有角色呢'),
    el('div', 'character-empty-text', '先捏一个 TA，写下名字、人设、头像和聊天偏好。之后聊天、记忆、礼物都会围着 TA 转。')
  );

  const createButton = button('新建角色', 'primary', 'add');
  createButton.addEventListener('click', () => openEditor());
  box.appendChild(createButton);

  return box;
}

function renderProfileEmptyState() {
  const box = el('div', 'character-empty');
  const mark = el('div', 'character-empty-mark');
  mark.appendChild(createIcon('star', 32));

  box.append(
    mark,
    el('div', 'character-empty-title', '还没有你的小档案'),
    el('div', 'character-empty-text', '写下你怎么称呼自己、喜欢什么、想被怎样理解。TA 会偷偷记住这些。')
  );

  const createButton = button('新建我的人设', 'primary', 'add');
  createButton.addEventListener('click', () => openProfileEditor());
  box.appendChild(createButton);

  return box;
}

function createCharacterCard(character) {
  const card = el('article', 'character-card');
  card.tabIndex = 0;

  const avatar = el('div', 'character-avatar');
  renderImageOrIcon(avatar, character.avatar, 'smile', 30);

  const profile = character.userProfileId === 'none'
    ? '未绑定你的小档案'
    : character.userProfileId
      ? getUserProfileNameById(character.userProfileId)
      : '跟随默认小档案';

  const info = el('div', 'character-info');
  info.append(
    el('div', 'character-name', character.name || '未命名角色'),
    el('div', 'character-prompt', getPromptPreview(character)),
    el('div', 'character-meta', `${getMoodLabel(character.mood)} · ${profile}`)
  );

  const arrow = el('div', 'character-arrow');
  arrow.appendChild(createIcon('arrow-right', 20));

  card.append(avatar, info, arrow);

  card.addEventListener('click', () => {
    if (suppressClick) {
      suppressClick = false;
      return;
    }

    openEditor(character.id);
  });

  card.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') openEditor(character.id);
  });

  card.addEventListener('pointerdown', () => {
    clearLongPress();

    longPressTimer = window.setTimeout(() => {
      suppressClick = true;
      openCharacterActions(character);
    }, 620);
  });

  card.addEventListener('pointerup', clearLongPress);
  card.addEventListener('pointercancel', clearLongPress);
  card.addEventListener('pointerleave', clearLongPress);

  return card;
}

function createProfileCard(profile) {
  const card = el('article', 'profile-card');
  card.tabIndex = 0;

  const avatar = el('div', 'profile-avatar');
  renderImageOrIcon(avatar, profile.avatar, 'star', 30);

  const boundCount = characters.filter((character) => character.userProfileId === profile.id).length;
  const meta = profile.isDefault
    ? '默认小档案'
    : boundCount
      ? `已绑定 ${boundCount} 个角色`
      : '可以单独绑定给某个 TA';

  const info = el('div', 'profile-info');
  info.append(
    el('div', 'profile-name', profile.name || '未命名人设'),
    el('div', 'profile-desc', getProfileDescPreview(profile)),
    el('div', 'profile-meta', meta)
  );

  const arrow = el('div', 'character-arrow');
  arrow.appendChild(createIcon('arrow-right', 20));

  card.append(avatar, info, arrow);

  card.addEventListener('click', () => {
    if (suppressClick) {
      suppressClick = false;
      return;
    }

    openProfileEditor(profile.id);
  });

  card.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') openProfileEditor(profile.id);
  });

  card.addEventListener('pointerdown', () => {
    clearLongPress();

    longPressTimer = window.setTimeout(() => {
      suppressClick = true;
      openProfileActions(profile);
    }, 620);
  });

  card.addEventListener('pointerup', clearLongPress);
  card.addEventListener('pointercancel', clearLongPress);
  card.addEventListener('pointerleave', clearLongPress);

  return card;
}

function renderImageOrIcon(container, image, iconName, size) {
  container.innerHTML = '';

  if (image) {
    const img = document.createElement('img');
    img.src = image;
    img.alt = '';
    img.addEventListener('error', () => {
      container.innerHTML = '';
      container.appendChild(createIcon(iconName, size));
    });
    container.appendChild(img);
    return;
  }

  container.appendChild(createIcon(iconName, size));
}

function getUserProfileNameById(profileId) {
  const profile = userProfiles.find((item) => item.id === profileId);
  return profile?.name || '已绑定小档案';
}

function getProfileDescPreview(profile) {
  const text = String(profile.content || profile.persona || profile.profile || '').trim();
  if (!text) return '还没写内容，TA 暂时只能慢慢猜';
  return text.length > 58 ? `${text.slice(0, 58)}…` : text;
}
function openCharacterActions(character) {
  clearLongPress();

  const sheet = sheetBase(character.name || '角色操作', '可以编辑、导出，或者把这个 TA 移走。');

  const editButton = button('编辑角色', 'ghost', 'edit');
  editButton.addEventListener('click', () => {
    hideBottomSheet();
    window.setTimeout(() => openEditor(character.id), 180);
  });

  const exportButton = button('导出角色', 'ghost', 'download');
  exportButton.addEventListener('click', async () => {
    await exportCharacter(character.id);
    hideBottomSheet();
  });

  const deleteButton = button('删除角色', 'ghost', 'delete');
  deleteButton.addEventListener('click', async () => {
    hideBottomSheet();
    window.setTimeout(() => deleteCharacter(character.id), 180);
  });

  sheet.actions.append(editButton, exportButton, deleteButton);
  showBottomSheet(sheet.el);
}

function openProfileActions(profile) {
  clearLongPress();

  const sheet = sheetBase(profile.name || '小档案操作', '可以设为默认，也可以导出备份或删除。');

  const editButton = button('编辑小档案', 'ghost', 'edit');
  editButton.addEventListener('click', () => {
    hideBottomSheet();
    window.setTimeout(() => openProfileEditor(profile.id), 180);
  });

  const defaultButton = button(profile.isDefault ? '取消默认' : '设为默认', 'ghost', profile.isDefault ? 'check' : 'star');
  defaultButton.addEventListener('click', async () => {
    await toggleDefaultProfile(profile.id);
    hideBottomSheet();
  });

  const exportButton = button('导出小档案', 'ghost', 'download');
  exportButton.addEventListener('click', async () => {
    await exportProfile(profile.id);
    hideBottomSheet();
  });

  const deleteButton = button('删除小档案', 'ghost', 'delete');
  deleteButton.addEventListener('click', async () => {
    hideBottomSheet();
    window.setTimeout(() => deleteProfile(profile.id), 180);
  });

  sheet.actions.append(editButton, defaultButton, exportButton, deleteButton);
  showBottomSheet(sheet.el);
}

async function openEditor(characterId = '') {
  await loadData();

  const isExisting = Boolean(characterId);
  const existing = isExisting ? characters.find((item) => item.id === characterId) : null;
  const draft = cloneCharacter(existing || createEmptyDraftCharacter());

  if (!draft.id) draft.id = generateId('char');

  const sheet = document.createElement('div');
  sheet.className = 'character-editor';

  const title = el('div', 'sheet-title', existing ? '编辑角色' : '新建角色');
  const desc = el('div', 'sheet-description', '先写名字和人设就能开聊，其他小偏好可以以后慢慢补。');

  const core = el('div', 'character-editor-core');
  const avatarInput = fileInput('image/*');
  const avatarButton = el('button', 'editor-avatar');
  avatarButton.type = 'button';

  renderAvatarButton(avatarButton, draft.avatar);
  avatarButton.addEventListener('click', () => avatarInput.click());

  avatarInput.addEventListener('change', async () => {
    const file = avatarInput.files?.[0];
    if (!file) return;

    try {
      const image = await compressImage(file, 420, 0.86);
      draft.avatar = image;
      draft.avatarSource = image;
      draft.avatarKey = getCharacterAvatarKey(draft.id);
      await saveBlobImage(draft.avatarKey, image, file);
      renderAvatarButton(avatarButton, draft.avatar);
      showToast('头像换好啦');
    } catch (_) {
      showToast('头像处理失败');
    } finally {
      avatarInput.value = '';
    }
  });

  const nameInput = input('角色名字', draft.name);
  const promptInput = textarea('写下角色的人设、说话方式、关系背景', draft.systemPrompt);
  const profileSelect = createProfileSelect(draft.userProfileId || '', (value) => {
    draft.userProfileId = value;
  });

  const nicknameInput = input('TA 怎么称呼你', draft.nicknameForUser || '');
  const relationshipInput = input('关系，比如朋友、恋人、同桌、宿敌', draft.relationship || '');
  const speakingStyleInput = textarea('说话风格，比如温柔、慢热、毒舌但心软', draft.speakingStyle || '');
  const proactiveInput = textarea('主动找你时的风格，比如睡前轻轻问候', draft.proactiveStyle || '');

  const replyLengthSelect = document.createElement('select');
  replyLengthSelect.className = 'input-card';
  REPLY_LENGTHS.forEach((item) => {
    const option = document.createElement('option');
    option.value = item.value;
    option.textContent = item.label;
    option.selected = item.value === draft.replyLength;
    replyLengthSelect.appendChild(option);
  });
  replyLengthSelect.addEventListener('change', () => {
    draft.replyLength = replyLengthSelect.value;
  });

  core.append(
    customRow('头像', wrapActions(avatarButton, avatarInput)),
    field('名字', nameInput),
    field('人设', promptInput),
    field('绑定我的小档案', profileSelect)
  );

  const sections = el('div', 'character-editor-sections');

  sections.append(
    detailsBlock('聊天个性', renderPersonalityEditor({
      nicknameInput,
      relationshipInput,
      speakingStyleInput,
      proactiveInput,
      replyLengthSelect
    })),
    detailsBlock('聊天背景', renderBackgroundEditor(draft)),
    detailsBlock('快捷回复', renderQuickRepliesEditor(draft)),
    detailsBlock('TTS 配置', renderTtsEditor(draft)),
    detailsBlock('API 配置', renderApiEditor(draft)),
    detailsBlock('记忆设置', await renderMemoryEditor(draft, isExisting)),
    detailsBlock('世界书绑定', renderWorldbookBinder(draft)),
    detailsBlock('表情包绑定', renderStickerBinder(draft)),
    detailsBlock('导入导出', renderImportExportTools(draft, isExisting))
  );

  const actions = el('div', 'settings-actions sheet-actions');
  const cancelButton = button('取消', 'ghost', 'close');
  const saveButton = button('保存', 'primary', 'check');

  cancelButton.addEventListener('click', hideBottomSheet);

  saveButton.addEventListener('click', async () => {
    draft.name = nameInput.value.trim();
    draft.systemPrompt = promptInput.value.trim();
    draft.nicknameForUser = nicknameInput.value.trim();
    draft.relationship = relationshipInput.value.trim();
    draft.speakingStyle = speakingStyleInput.value.trim();
    draft.proactiveStyle = proactiveInput.value.trim();
    draft.replyLength = replyLengthSelect.value || 'normal';

    if (!draft.name) {
      showToast('先给 TA 起个名字吧');
      return;
    }

    await saveCharacter(draft);
    hideBottomSheet();
  });

  actions.append(cancelButton, saveButton);
  sheet.append(title, desc, core, sections, actions);

  showBottomSheet(sheet);
}

function renderPersonalityEditor(controls) {
  const box = el('div', 'character-editor-panel');

  box.append(
    field('TA 怎么称呼你', controls.nicknameInput),
    field('你们的关系', controls.relationshipInput),
    field('回复长短', controls.replyLengthSelect),
    field('说话风格', controls.speakingStyleInput),
    field('主动消息风格', controls.proactiveInput),
    createSoftNote('这些会和人设一起给聊天使用，让 TA 的语气更稳定。')
  );

  return box;
}

function createProfileSelect(value, onChange) {
  const select = document.createElement('select');
  select.className = 'input-card';

  const options = [
    { value: '', label: '跟随默认小档案' },
    { value: 'none', label: '不绑定小档案' }
  ];

  userProfiles.forEach((profile) => {
    options.push({ value: profile.id, label: profile.name || '未命名小档案' });
  });

  options.forEach((option) => {
    const node = document.createElement('option');
    node.value = option.value;
    node.textContent = option.label;
    node.selected = option.value === value;
    select.appendChild(node);
  });

  select.addEventListener('change', () => onChange(select.value));
  return select;
}

async function openProfileEditor(profileId = '') {
  await loadData();

  const isExisting = Boolean(profileId);
  const existing = isExisting ? userProfiles.find((item) => item.id === profileId) : null;
  const draft = cloneProfile(existing || createEmptyProfileDraft());

  if (!draft.id) draft.id = generateId('profile');

  const sheet = document.createElement('div');
  sheet.className = 'character-editor';

  const title = el('div', 'sheet-title', existing ? '编辑我的小档案' : '新建我的小档案');
  const desc = el('div', 'sheet-description', '这是你的小档案。TA 会按这份资料理解你，也可以单独绑定到某个角色。');

  const core = el('div', 'character-editor-core');

  const avatarInput = fileInput('image/*');
  const avatarButton = el('button', 'editor-avatar');
  avatarButton.type = 'button';

  renderAvatarButton(avatarButton, draft.avatar);
  avatarButton.addEventListener('click', () => avatarInput.click());

  avatarInput.addEventListener('change', async () => {
    const file = avatarInput.files?.[0];
    if (!file) return;

    try {
      const image = await compressImage(file, 420, 0.86);
      draft.avatar = image;
      draft.avatarSource = image;
      draft.avatarKey = getProfileAvatarKey(draft.id);
      await saveBlobImage(draft.avatarKey, image, file);
      renderAvatarButton(avatarButton, draft.avatar);
      showToast('头像换好啦');
    } catch (_) {
      showToast('头像处理失败');
    } finally {
      avatarInput.value = '';
    }
  });

  const nameInput = input('你怎么称呼自己', draft.name);
  const contentInput = textarea('写一下你的性格、爱好、说话习惯、想让 TA 怎么理解你', draft.content);
  const defaultSwitch = switchButton(Boolean(draft.isDefault), (active) => {
    draft.isDefault = active;
  });

  core.append(
    customRow('头像', wrapActions(avatarButton, avatarInput)),
    field('昵称 / 称呼', nameInput),
    field('小档案内容', contentInput),
    customRow('设为默认小档案', defaultSwitch),
    createSoftNote('设为默认后，没单独绑定档案的 AI 角色都会优先使用这份资料。')
  );

  const actions = el('div', 'settings-actions sheet-actions');
  const cancelButton = button('取消', 'ghost', 'close');
  const saveButton = button('保存', 'primary', 'check');

  cancelButton.addEventListener('click', hideBottomSheet);

  saveButton.addEventListener('click', async () => {
    draft.name = nameInput.value.trim();
    draft.content = contentInput.value.trim();

    if (!draft.name) {
      showToast('先写一个称呼吧');
      return;
    }

    await saveUserProfile(draft);
    hideBottomSheet();
  });

  actions.append(cancelButton, saveButton);
  sheet.append(title, desc, core, actions);

  showBottomSheet(sheet);
}

function renderAvatarButton(buttonEl, avatar) {
  renderImageOrIcon(buttonEl, avatar, 'camera', 26);
}

function renderBackgroundEditor(draft) {
  const box = el('div', 'character-editor-panel');

  const mode = createSegmented(
    [
      { value: 'none', label: '无' },
      { value: 'color', label: '纯色' },
      { value: 'image', label: '图片' }
    ],
    draft.chatBackground.type || 'none',
    (value) => {
      draft.chatBackground.type = value;
      if (value === 'none') {
        draft.chatBackground.value = '';
        draft.chatBackground.blobKey = '';
      }
      if (value === 'color' && !draft.chatBackground.value) {
        draft.chatBackground.value = getDefaultColorValue();
      }
      renderPanelAgain(box, () => renderBackgroundEditor(draft));
    }
  );

  box.appendChild(customRow('类型', mode));

  if (draft.chatBackground.type === 'color') {
    const color = input('', normalizeColorInputValue(draft.chatBackground.value || getDefaultColorValue()), 'color');
    color.addEventListener('input', () => {
      draft.chatBackground.value = color.value;
    });
    box.appendChild(field('背景颜色', color));
  }

  if (draft.chatBackground.type === 'image') {
    const preview = el('div', 'background-preview', draft.chatBackground.value ? '' : '暂无背景');
    if (draft.chatBackground.value) {
      preview.style.backgroundImage = `url("${cssUrl(draft.chatBackground.value)}")`;
    }

    const opacity = input('', String(draft.chatBackground.opacity ?? 100), 'range');
    opacity.min = '20';
    opacity.max = '100';
    opacity.step = '1';
    opacity.addEventListener('input', () => {
      draft.chatBackground.opacity = Number(opacity.value) || 100;
      preview.style.opacity = String((Number(opacity.value) || 100) / 100);
    });

    const imageInput = fileInput('image/*');
    const uploadButton = button('上传聊天背景', 'ghost', 'upload');
    uploadButton.addEventListener('click', () => imageInput.click());

    imageInput.addEventListener('change', async () => {
      const file = imageInput.files?.[0];
      if (!file) return;

      try {
        const image = await compressImage(file, 1400, 0.86);
        draft.chatBackground.type = 'image';
        draft.chatBackground.value = image;
        draft.chatBackground.blobKey = getCharacterBgKey(draft.id);
        draft.chatBackground.opacity = draft.chatBackground.opacity ?? 100;
        await saveBlobImage(draft.chatBackground.blobKey, image, file, draft.chatBackground.opacity);
        showToast('聊天背景换好啦');
        renderPanelAgain(box, () => renderBackgroundEditor(draft));
      } catch (_) {
        showToast('背景处理失败');
      } finally {
        imageInput.value = '';
      }
    });

    const clearButton = button('清除图片', 'ghost', 'clear');
    clearButton.addEventListener('click', async () => {
      if (draft.chatBackground.blobKey) {
        await deleteDB('blobs', draft.chatBackground.blobKey).catch(() => {});
      }

      draft.chatBackground.value = '';
      draft.chatBackground.blobKey = '';
      renderPanelAgain(box, () => renderBackgroundEditor(draft));
    });

    box.append(preview, field('透明度', opacity), wrapActions(uploadButton, clearButton, imageInput));
  }

  return box;
}

function renderQuickRepliesEditor(draft) {
  const box = el('div', 'character-editor-panel');
  const list = el('div', 'quick-reply-list');

  function refresh() {
    list.innerHTML = '';

    draft.quickReplies = normalizeArray(draft.quickReplies).slice(0, 8);

    draft.quickReplies.forEach((reply, index) => {
      const row = el('div', 'quick-reply-row');
      const replyInput = input('快捷回复', reply);
      const del = iconButton('delete', '删除');

      replyInput.addEventListener('change', () => {
        draft.quickReplies[index] = replyInput.value.trim();
      });

      del.addEventListener('click', () => {
        draft.quickReplies.splice(index, 1);
        refresh();
      });

      row.append(replyInput, del);
      list.appendChild(row);
    });
  }

  const addButton = button('添加快捷回复', 'ghost', 'add');
  addButton.addEventListener('click', () => {
    if (draft.quickReplies.length >= 8) {
      showToast('最多 8 条快捷回复');
      return;
    }

    draft.quickReplies.push('');
    refresh();
  });

  refresh();
  box.append(list, addButton);
  return box;
}
function renderTtsEditor(draft) {
  const box = el('div', 'character-editor-panel');

  const enabled = switchButton(Boolean(draft.ttsConfig.enabled), (active) => {
    draft.ttsConfig.enabled = active;
  });

  const provider = createSegmented(
    [
      { value: 'openai', label: 'OpenAI' },
      { value: 'custom', label: '自定义' }
    ],
    draft.ttsConfig.provider || 'openai',
    (value) => {
      draft.ttsConfig.provider = value;
    }
  );

  const voice = input('音色，如 alloy', draft.ttsConfig.voice || 'alloy');
  const endpoint = input('TTS Endpoint，不填则用全局', draft.ttsConfig.endpoint || '');
  const key = input('TTS API Key，不填则用全局', draft.ttsConfig.apiKey || '');
  const model = input('TTS 模型，不填默认 tts-1', draft.ttsConfig.model || 'tts-1');

  voice.addEventListener('change', () => draft.ttsConfig.voice = voice.value.trim() || 'alloy');
  endpoint.addEventListener('change', () => draft.ttsConfig.endpoint = endpoint.value.trim());
  key.addEventListener('change', () => draft.ttsConfig.apiKey = key.value.trim());
  model.addEventListener('change', () => draft.ttsConfig.model = model.value.trim() || 'tts-1');

  box.append(
    customRow('启用', enabled),
    customRow('服务商', provider),
    field('Voice', voice),
    field('Endpoint', endpoint),
    field('API Key', key),
    field('模型', model)
  );

  return box;
}

function renderApiEditor(draft) {
  const box = el('div', 'character-editor-panel');
  const settings = getSettings();
  const endpoints = Array.isArray(settings.apiEndpoints) ? settings.apiEndpoints : [];

  const useGlobal = switchButton(draft.apiConfig.useGlobal !== false, (active) => {
    draft.apiConfig.useGlobal = active;
    renderPanelAgain(box, () => renderApiEditor(draft));
  });

  box.appendChild(customRow('使用全局配置', useGlobal));

  if (draft.apiConfig.useGlobal === false) {
    const endpointSelect = document.createElement('select');
    endpointSelect.className = 'input-card';

    const emptyOption = document.createElement('option');
    emptyOption.value = '';
    emptyOption.textContent = endpoints.length ? '选择 API 端点' : '设置里还没有端点';
    endpointSelect.appendChild(emptyOption);

    endpoints.forEach((endpoint) => {
      const option = document.createElement('option');
      option.value = endpoint.id;
      option.textContent = endpoint.name || endpoint.endpoint || '未命名端点';
      option.selected = draft.apiConfig.endpointId === endpoint.id;
      endpointSelect.appendChild(option);
    });

    endpointSelect.addEventListener('change', () => {
      draft.apiConfig.endpointId = endpointSelect.value;
      const current = endpoints.find((item) => item.id === endpointSelect.value);
      if (current && !draft.apiConfig.model) {
        draft.apiConfig.model = current.model || '';
      }
    });

    const modelInput = input('模型名，可覆盖端点默认模型', draft.apiConfig.model || '');
    modelInput.addEventListener('change', () => {
      draft.apiConfig.model = modelInput.value.trim();
    });

    box.append(
      field('API 端点', endpointSelect),
      field('模型', modelInput)
    );
  }

  return box;
}

async function renderMemoryEditor(draft, isExisting) {
  const box = el('div', 'character-editor-panel');

  const trigger = input('默认 100', draft.memoryTriggerCount || 100, 'number');
  trigger.min = '10';
  trigger.max = '1000';

  trigger.addEventListener('change', () => {
    draft.memoryTriggerCount = Math.max(10, Number(trigger.value) || 100);
  });

  const moodSelect = document.createElement('select');
  moodSelect.className = 'input-card';

  MOODS.forEach((mood) => {
    const option = document.createElement('option');
    option.value = mood.value;
    option.textContent = mood.label;
    option.selected = mood.value === draft.mood;
    moodSelect.appendChild(option);
  });

  moodSelect.addEventListener('change', () => {
    draft.mood = moodSelect.value;
  });

  box.append(
    field('记忆触发条数', trigger),
    field('当前心情', moodSelect)
  );

  if (isExisting && draft.id) {
    const memoryBox = el('div', 'memory-manager');
    await renderMemoryList(memoryBox, draft.id);
    box.appendChild(memoryBox);
  } else {
    box.appendChild(createSoftNote('保存角色后，可以在这里添加手动记忆。'));
  }

  return box;
}

async function renderMemoryList(container, characterId) {
  container.innerHTML = '';

  const memories = normalizeArray(await getByIndexDB('memories', 'characterId', characterId))
    .sort((a, b) => String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || '')));

  const addWrap = el('div', 'memory-add');
  const addInput = textarea('添加一条手动记忆', '');
  const addButton = button('添加记忆', 'ghost', 'add');

  addButton.addEventListener('click', async () => {
    const content = addInput.value.trim();

    if (!content) {
      showToast('先写一点记忆内容吧');
      return;
    }

    await addMemory(characterId, content, 'manual', true, { importance: 3 });

    addInput.value = '';
    showToast('记忆已经放好啦');
    await renderMemoryList(container, characterId);
    emitCharacterUpdates();
  });

  addWrap.append(addInput, addButton);
  container.appendChild(addWrap);

  if (!memories.length) {
    container.appendChild(createSoftNote('暂无记忆。聊天后会自动总结，也可以在这里手动添加。'));
    return;
  }

  const list = el('div', 'memory-list');

  memories.forEach((memory) => {
    const item = el('div', 'memory-item');
    const main = el('div', 'memory-main');

    main.append(
      el('div', 'memory-content', memory.content || ''),
      el('div', 'memory-meta', `${getMemorySourceLabel(memory.source)} · ${formatTime(memory.updatedAt || memory.createdAt)}`)
    );

    const edit = iconButton('edit', '编辑记忆');
    edit.addEventListener('click', () => {
      openMemoryEditSheet({
        memory,
        characterId,
        container
      });
    });

    const del = iconButton('delete', '删除记忆');
    del.addEventListener('click', async () => {
      const ok = await showConfirm('确定删除这条记忆吗？');
      if (!ok) return;

      await deleteMemory(characterId, memory.id);
      showToast('记忆已删除');
      await renderMemoryList(container, characterId);
      emitCharacterUpdates();
    });

    item.append(main, wrapActions(edit, del));
    list.appendChild(item);
  });

  container.appendChild(list);
}

function openMemoryEditSheet({ memory, characterId, container }) {
  const sheet = sheetBase('改一改这条记忆', '可以把它写得更像你想让 TA 记住的样子。');

  const inputEl = textarea('记忆内容', memory.content || '');
  const sourceSelect = document.createElement('select');
  sourceSelect.className = 'input-card';

  [
    { value: 'manual', label: '手写' },
    { value: 'auto', label: '自动' },
    { value: 'summary', label: '总结' }
  ].forEach((item) => {
    const option = document.createElement('option');
    option.value = item.value;
    option.textContent = item.label;
    option.selected = item.value === (memory.source || 'manual');
    sourceSelect.appendChild(option);
  });

  const cancelButton = button('取消', 'ghost', 'close');
  const saveButton = button('保存', 'primary', 'check');

  cancelButton.addEventListener('click', hideBottomSheet);

  saveButton.addEventListener('click', async () => {
    const content = inputEl.value.trim();

    if (!content) {
      showToast('记忆不能为空');
      return;
    }

    const source = ['auto', 'summary', 'manual'].includes(sourceSelect.value) ? sourceSelect.value : 'manual';
    await editMemory(characterId, memory.id, content, { source });

    hideBottomSheet();
    showToast('记忆改好啦');
    await renderMemoryList(container, characterId);
    emitCharacterUpdates();
  });

  sheet.body.append(
    field('记忆内容', inputEl),
    field('来源', sourceSelect)
  );

  sheet.actions.append(cancelButton, saveButton);
  showBottomSheet(sheet.el);
}

function renderWorldbookBinder(draft) {
  const box = el('div', 'character-editor-panel');

  const mode = createSegmented(
    [
      { value: 'bound_plus_global', label: '绑定+全局' },
      { value: 'only_bound', label: '只读绑定' }
    ],
    draft.worldbookMode || 'bound_plus_global',
    (value) => {
      draft.worldbookMode = value;
    }
  );

  box.append(
    customRow('读取范围', mode),
    createSoftNote('只读绑定会更稳定；绑定+全局会读取更多世界设定。')
  );

  if (!worldbookEntries.length) {
    box.appendChild(createSoftNote('还没有世界书条目。之后在世界书应用里创建后，可回到这里绑定。'));
    return box;
  }

  const list = el('div', 'binder-list');

  worldbookEntries
    .filter((entry) => entry && entry.enabled !== false)
    .forEach((entry) => {
      const row = checkboxRow(
        `${entry.type || 'A'} · ${entry.title || '未命名条目'}`,
        draft.worldbookIds.includes(entry.id),
        (checked) => {
          draft.worldbookIds = toggleId(draft.worldbookIds, entry.id, checked);
        }
      );

      list.appendChild(row);
    });

  box.appendChild(list);
  return box;
}

function renderStickerBinder(draft) {
  const box = el('div', 'character-editor-panel');

  if (!stickers.length) {
    box.appendChild(createSoftNote('还没有表情包。之后在聊天或设置里添加后，可回到这里绑定。'));
    return box;
  }

  const list = el('div', 'sticker-bind-list');

  stickers.forEach((sticker) => {
    const row = checkboxRow(
      sticker.description || sticker.tags?.join('、') || sticker.name || '未描述表情',
      draft.stickerIds.includes(sticker.id),
      (checked) => {
        draft.stickerIds = toggleId(draft.stickerIds, sticker.id, checked);
      }
    );

    const image = getImageFromRecord(sticker);
    if (image) {
      const img = document.createElement('img');
      img.src = image;
      img.alt = '';
      img.className = 'sticker-thumb';
      row.prepend(img);
    }

    list.appendChild(row);
  });

  box.appendChild(list);
  return box;
}

function renderImportExportTools(draft, isExisting) {
  const box = el('div', 'character-editor-panel');

  const exportButton = button('导出当前角色', 'ghost', 'download');
  exportButton.disabled = !isExisting || !draft.id;
  exportButton.addEventListener('click', () => {
    if (!isExisting || !draft.id) {
      showToast('保存后才能导出');
      return;
    }

    exportCharacter(draft.id);
  });

  box.append(
    createSoftNote('导出后的 JSON 可以通过右上角导入按钮重新导入，会尽量带上头像、背景和记忆。'),
    exportButton
  );

  return box;
}

async function openImportSheet() {
  const sheet = sheetBase('导入角色', '支持本项目导出的角色 JSON，也支持基础 SillyTavern 卡片字段。');

  const inputEl = fileInput('application/json');
  const pickButton = button('选择 JSON 文件', 'primary', 'upload');

  pickButton.addEventListener('click', () => inputEl.click());

  inputEl.addEventListener('change', async () => {
    const file = inputEl.files?.[0];
    if (!file) return;

    try {
      const data = JSON.parse(await file.text());
      const character = normalizeImportedCharacter(data, generateId('char'));

      await persistCharacterImagesFromImport(character, data);
      await setDB('characters', character.id, normalizeCharacter(character));
      await importCharacterMemories(data, character.id);

      hideBottomSheet();
      await loadData();
      renderList();
      emitCharacterUpdates();
      showToast('角色导入好啦');
    } catch (error) {
      console.error(error);
      showToast('导入失败，请检查文件');
    } finally {
      inputEl.value = '';
    }
  });

  sheet.body.append(
    createSoftNote('如果导入的是 SillyTavern 格式，会自动把描述、性格、场景和开场白合并成人设。'),
    inputEl
  );
  sheet.actions.appendChild(pickButton);

  showBottomSheet(sheet.el);
}

async function openProfileImportSheet() {
  const sheet = sheetBase('导入我的小档案', '支持本项目导出的小档案 JSON。');

  const inputEl = fileInput('application/json');
  const pickButton = button('选择 JSON 文件', 'primary', 'upload');

  pickButton.addEventListener('click', () => inputEl.click());

  inputEl.addEventListener('change', async () => {
    const file = inputEl.files?.[0];
    if (!file) return;

    try {
      const data = JSON.parse(await file.text());
      await importUserProfile(data);
      hideBottomSheet();
      await loadData();
      renderList();
      emitCharacterUpdates();
      showToast('小档案导入好啦');
    } catch (error) {
      console.error(error);
      showToast('导入失败，请检查文件');
    } finally {
      inputEl.value = '';
    }
  });

  sheet.body.append(createSoftNote('如果是本项目导出的文件，会自动导入头像和内容。'), inputEl);
  sheet.actions.appendChild(pickButton);

  showBottomSheet(sheet.el);
}
async function saveCharacter(character) {
  const now = getNow();
  const normalized = normalizeCharacter({
    ...character,
    id: character.id || generateId('char'),
    createdAt: character.createdAt || now,
    updatedAt: now
  });

  if (normalized.avatar && normalized.avatarKey) {
    await setDB('blobs', normalized.avatarKey, {
      key: normalized.avatarKey,
      value: normalized.avatar,
      source: normalized.avatarSource || normalized.avatar,
      opacity: 100,
      updatedAt: now
    }).catch(() => {});
  }

  if (normalized.chatBackground?.type === 'image' && normalized.chatBackground.value && normalized.chatBackground.blobKey) {
    await setDB('blobs', normalized.chatBackground.blobKey, {
      key: normalized.chatBackground.blobKey,
      value: normalized.chatBackground.value,
      source: normalized.chatBackground.value,
      opacity: Number(normalized.chatBackground.opacity ?? 100),
      updatedAt: now
    }).catch(() => {});
  }

  await setDB('characters', normalized.id, normalized);
  await loadData();
  renderList();
  emitCharacterUpdates();

  showToast('角色已经收好啦');
}

async function deleteCharacter(characterId) {
  const character = await getDB('characters', characterId);
  if (!character) return;

  const ok = await showConfirm(`确定删除「${character.name || '这个角色'}」吗？聊天记录不会在这里自动删除。`);
  if (!ok) return;

  await deleteDB('characters', characterId);

  if (character.avatarKey) {
    await deleteDB('blobs', character.avatarKey).catch(() => {});
  }

  if (character.chatBackground?.blobKey) {
    await deleteDB('blobs', character.chatBackground.blobKey).catch(() => {});
  }

  await loadData();
  renderList();
  emitCharacterUpdates();

  showToast('角色已经移走啦');
}

async function saveUserProfile(profile) {
  const list = loadUserProfiles();
  const now = getNow();
  const next = normalizeProfile({
    ...profile,
    id: profile.id || generateId('profile'),
    createdAt: profile.createdAt || now,
    updatedAt: now
  });

  if (next.avatar && next.avatarKey) {
    await setDB('blobs', next.avatarKey, {
      key: next.avatarKey,
      value: next.avatar,
      source: next.avatarSource || next.avatar,
      opacity: 100,
      updatedAt: now
    }).catch(() => {});
  }

  if (next.isDefault) {
    for (const item of list) {
      if (item.id !== next.id && item.isDefault) {
        item.isDefault = false;
        item.updatedAt = now;
      }
    }
    setData(ACTIVE_PROFILE_KEY, next.id);
  }

  const index = list.findIndex((item) => item.id === next.id);
  if (index >= 0) {
    list[index] = next;
  } else {
    list.push(next);
  }

  saveUserProfiles(list);
  await loadData();
  renderList();
  emitCharacterUpdates();

  showToast('小档案已经收好啦');
}

async function deleteProfile(profileId) {
  const list = loadUserProfiles();
  const target = list.find((item) => item.id === profileId);
  if (!target) return;

  const ok = await showConfirm(`确定删除「${target.name || '这个小档案'}」吗？绑定它的角色会自动回到默认档案。`);
  if (!ok) return;

  const next = list.filter((item) => item.id !== profileId);
  saveUserProfiles(next);

  if (getData(ACTIVE_PROFILE_KEY) === profileId) {
    const fallback = next.find((item) => item.isDefault) || next[0] || null;
    setData(ACTIVE_PROFILE_KEY, fallback?.id || '');
  }

  if (target.avatarKey) {
    await deleteDB('blobs', target.avatarKey).catch(() => {});
  }

  await removeProfileBinding(profileId);
  await loadData();
  renderList();
  emitCharacterUpdates();

  showToast('小档案已经删除啦');
}

async function toggleDefaultProfile(profileId) {
  const list = loadUserProfiles();
  const target = list.find((item) => item.id === profileId);
  if (!target) return;

  const now = getNow();
  target.isDefault = !target.isDefault;
  target.updatedAt = now;

  if (target.isDefault) {
    for (const item of list) {
      if (item.id !== target.id && item.isDefault) {
        item.isDefault = false;
        item.updatedAt = now;
      }
    }
    setData(ACTIVE_PROFILE_KEY, target.id);
  } else if (getData(ACTIVE_PROFILE_KEY) === target.id) {
    setData(ACTIVE_PROFILE_KEY, '');
  }

  saveUserProfiles(list);
  await loadData();
  renderList();
  emitCharacterUpdates();

  showToast(target.isDefault ? '已经设为默认啦' : '已经取消默认啦');
}

async function exportCharacter(characterId) {
  const character = await getDB('characters', characterId);
  if (!character) {
    showToast('角色不存在');
    return;
  }

  const memories = await getByIndexDB('memories', 'characterId', characterId);
  const avatarBlob = character.avatarKey ? await getDB('blobs', character.avatarKey).catch(() => null) : null;
  const backgroundBlob = character.chatBackground?.blobKey ? await getDB('blobs', character.chatBackground.blobKey).catch(() => null) : null;

  downloadJson(`${character.name || 'character'}.json`, {
    type: 'ai-phone-character',
    version: 2,
    exportedAt: getNow(),
    character,
    memories,
    blobs: {
      avatar: avatarBlob,
      chatBackground: backgroundBlob
    }
  });

  showToast('角色已导出');
}

async function exportProfile(profileId) {
  const list = loadUserProfiles();
  const profile = list.find((item) => item.id === profileId);

  if (!profile) {
    showToast('小档案不存在');
    return;
  }

  const avatarBlob = profile.avatarKey ? await getDB('blobs', profile.avatarKey).catch(() => null) : null;

  downloadJson(`${profile.name || 'user-profile'}.json`, {
    type: 'ai-phone-user-profile',
    version: 2,
    exportedAt: getNow(),
    profile,
    blobs: {
      avatar: avatarBlob
    }
  });

  showToast('小档案已导出');
}

async function importUserProfile(data) {
  const source = data?.profile || data;
  if (!source || typeof source !== 'object') throw new Error('invalid profile');

  const profile = normalizeProfile({
    ...source,
    id: source.id || generateId('profile'),
    createdAt: source.createdAt || getNow(),
    updatedAt: getNow()
  });

  const avatar = getImageFromRecord(data?.blobs?.avatar) || getImageFromRecord(source);
  if (avatar) {
    profile.avatar = avatar;
    profile.avatarSource = avatar;
    profile.avatarKey = getProfileAvatarKey(profile.id);
    await setDB('blobs', profile.avatarKey, {
      key: profile.avatarKey,
      value: avatar,
      source: avatar,
      opacity: 100,
      updatedAt: getNow()
    }).catch(() => {});
  }

  await saveUserProfile(profile);
}

async function removeProfileBinding(profileId) {
  const all = normalizeCharacterList(await getAllDB('characters'));

  for (const character of all) {
    if (character.userProfileId === profileId) {
      character.userProfileId = '';
      character.updatedAt = getNow();
      await setDB('characters', character.id, normalizeCharacter(character));
    }
  }
}

async function importCharacterMemories(data, characterId) {
  const memories = Array.isArray(data?.memories) ? data.memories : [];

  for (const memory of memories) {
    if (!memory || !memory.content) continue;

    const source = ['auto', 'summary', 'manual'].includes(memory.source) ? memory.source : 'manual';
    await addMemory(characterId, String(memory.content || '').trim(), source, true, {
      importance: memory.importance,
      mood: memory.mood,
      keywords: memory.keywords,
      pinned: memory.pinned,
      createdAt: memory.createdAt,
      updatedAt: memory.updatedAt || memory.createdAt
    });
  }
}

async function persistCharacterImagesFromImport(character, data) {
  const avatar = getImageFromRecord(data?.blobs?.avatar) || character.avatar;
  const bg = getImageFromRecord(data?.blobs?.chatBackground) || character.chatBackground?.value;

  if (avatar) {
    character.avatar = avatar;
    character.avatarSource = avatar;
    character.avatarKey = getCharacterAvatarKey(character.id);

    await setDB('blobs', character.avatarKey, {
      key: character.avatarKey,
      value: avatar,
      source: avatar,
      opacity: 100,
      updatedAt: getNow()
    }).catch(() => {});
  }

  if (bg && character.chatBackground?.type === 'image') {
    character.chatBackground.value = bg;
    character.chatBackground.blobKey = getCharacterBgKey(character.id);

    await setDB('blobs', character.chatBackground.blobKey, {
      key: character.chatBackground.blobKey,
      value: bg,
      source: bg,
      opacity: Number(character.chatBackground.opacity ?? 100),
      updatedAt: getNow()
    }).catch(() => {});
  }
}

function normalizeImportedCharacter(data, fallbackId) {
  const source = data?.character && typeof data.character === 'object' ? data.character : data;

  if (!source || typeof source !== 'object') {
    throw new Error('invalid character');
  }

  const isSillyTavern = source.name && (
    source.description ||
    source.personality ||
    source.scenario ||
    source.first_mes ||
    source.mes_example
  );

  if (isSillyTavern && !source.systemPrompt) {
    const promptParts = [
      source.description ? `[角色描述]\n${source.description}` : '',
      source.personality ? `[性格]\n${source.personality}` : '',
      source.scenario ? `[场景]\n${source.scenario}` : '',
      source.first_mes ? `[开场白]\n${source.first_mes}` : '',
      source.mes_example ? `[示例对话]\n${source.mes_example}` : ''
    ].filter(Boolean);

    return normalizeCharacter({
      ...DEFAULT_CHARACTER,
      id: fallbackId,
      name: source.name || '导入角色',
      avatar: source.avatar || source.avatarBase64 || source.image || '',
      systemPrompt: promptParts.join('\n\n'),
      createdAt: getNow(),
      updatedAt: getNow()
    });
  }

  return normalizeCharacter({
    ...source,
    id: source.id || fallbackId,
    createdAt: source.createdAt || getNow(),
    updatedAt: getNow()
  });
}

function createEmptyDraftCharacter() {
  return {
    ...cloneCharacter(DEFAULT_CHARACTER),
    createdAt: '',
    updatedAt: ''
  };
}

function createEmptyProfileDraft() {
  return normalizeProfile({
    ...DEFAULT_PROFILE,
    name: '',
    content: '',
    avatar: '',
    isDefault: false
  });
}

async function migrateUserProfilesIfNeeded() {
  const current = getData(USER_PROFILES_KEY);
  const legacy = getData(LEGACY_USER_PROFILES_KEY);

  if ((!Array.isArray(current) || !current.length) && Array.isArray(legacy) && legacy.length) {
    const migrated = legacy.map(normalizeProfile);
    setData(USER_PROFILES_KEY, migrated);
  }

  const profiles = loadUserProfiles();
  const active = getData(ACTIVE_PROFILE_KEY);
  const defaultProfile = profiles.find((item) => item.isDefault);

  if (!active && defaultProfile) {
    setData(ACTIVE_PROFILE_KEY, defaultProfile.id);
  }
}

function loadUserProfiles() {
  const current = getData(USER_PROFILES_KEY);
  const legacy = getData(LEGACY_USER_PROFILES_KEY);

  const source = Array.isArray(current) && current.length
    ? current
    : Array.isArray(legacy)
      ? legacy
      : [];

  return source.map(normalizeProfile).filter((item) => item.id);
}

function saveUserProfiles(list) {
  const normalized = Array.isArray(list) ? list.map(normalizeProfile).filter((item) => item.id) : [];
  setData(USER_PROFILES_KEY, normalized);
  setData(LEGACY_USER_PROFILES_KEY, normalized);
}

function normalizeProfile(profile) {
  const raw = profile && typeof profile === 'object' ? profile : {};
  const id = String(raw.id || generateId('profile'));

  return {
    id,
    name: String(raw.name || raw.nickname || '').trim(),
    content: String(raw.content || raw.persona || raw.profile || '').trim(),
    persona: String(raw.persona || raw.content || raw.profile || '').trim(),
    profile: String(raw.profile || raw.content || raw.persona || '').trim(),
    avatar: getImageFromRecord(raw.avatar) || getImageFromRecord(raw) || '',
    avatarKey: String(raw.avatarKey || getProfileAvatarKey(id)),
    avatarSource: String(raw.avatarSource || raw.avatar || ''),
    isDefault: Boolean(raw.isDefault),
    characterIds: normalizeArray(raw.characterIds).map(String),
    createdAt: raw.createdAt || '',
    updatedAt: raw.updatedAt || ''
  };
}

function normalizeCharacter(character) {
  const raw = character && typeof character === 'object' ? character : {};
  const id = String(raw.id || generateId('char'));

  const bg = raw.chatBackground && typeof raw.chatBackground === 'object'
    ? raw.chatBackground
    : { type: 'none', value: '' };

  return {
    id,
    name: String(raw.name || '').trim(),
    avatar: getImageFromRecord(raw.avatar) || getImageFromRecord(raw) || '',
    avatarKey: String(raw.avatarKey || getCharacterAvatarKey(id)),
    avatarSource: String(raw.avatarSource || raw.avatar || ''),
    chatBackground: {
      type: ['none', 'color', 'image'].includes(bg.type) ? bg.type : 'none',
      value: typeof bg.value === 'string' ? bg.value : getImageFromRecord(bg),
      blobKey: String(bg.blobKey || (bg.type === 'image' ? getCharacterBgKey(id) : '')),
      opacity: Math.max(20, Math.min(100, Number(bg.opacity ?? 100)))
    },
    systemPrompt: String(raw.systemPrompt || raw.prompt || '').trim(),
    quickReplies: normalizeArray(raw.quickReplies).map(String).map((item) => item.trim()).filter(Boolean).slice(0, 8),
    stickerIds: normalizeArray(raw.stickerIds).map(String),
    worldbookIds: normalizeArray(raw.worldbookIds).map(String),
    worldbookMode: ['only_bound', 'bound_plus_global'].includes(raw.worldbookMode) ? raw.worldbookMode : 'bound_plus_global',
    userProfileId: raw.userProfileId === 'none' ? 'none' : typeof raw.userProfileId === 'string' ? raw.userProfileId : '',
    nicknameForUser: String(raw.nicknameForUser || '').trim(),
    relationship: String(raw.relationship || '').trim(),
    speakingStyle: String(raw.speakingStyle || '').trim(),
    replyLength: ['short', 'normal', 'long'].includes(raw.replyLength) ? raw.replyLength : 'normal',
    proactiveStyle: String(raw.proactiveStyle || '').trim(),
    ttsConfig: {
      enabled: Boolean(raw.ttsConfig?.enabled),
      provider: raw.ttsConfig?.provider || 'openai',
      voice: raw.ttsConfig?.voice || 'alloy',
      apiKey: raw.ttsConfig?.apiKey || '',
      endpoint: raw.ttsConfig?.endpoint || '',
      model: raw.ttsConfig?.model || 'tts-1'
    },
    apiConfig: {
      useGlobal: raw.apiConfig?.useGlobal !== false,
      endpointId: raw.apiConfig?.endpointId || '',
      model: raw.apiConfig?.model || ''
    },
    memoryTriggerCount: Math.max(10, Number(raw.memoryTriggerCount) || 100),
    mood: ['happy', 'neutral', 'sad', 'excited'].includes(raw.mood) ? raw.mood : 'neutral',
    createdAt: raw.createdAt || '',
    updatedAt: raw.updatedAt || ''
  };
}

function normalizeCharacterList(list) {
  return normalizeArray(list)
    .map(normalizeCharacter)
    .filter((character) => character.id);
}

function getSettings() {
  const saved = getData('app_settings') || {};

  return {
    defaultApiEndpointId: saved.defaultApiEndpointId || '',
    defaultModel: saved.defaultModel || '',
    apiEndpoints: Array.isArray(saved.apiEndpoints) ? saved.apiEndpoints : []
  };
}

function getPromptPreview(character) {
  const text = [
    character.relationship ? `关系：${character.relationship}` : '',
    character.speakingStyle ? `风格：${character.speakingStyle}` : '',
    character.systemPrompt || ''
  ].filter(Boolean).join(' · ');

  if (!text) return '还没有填写人设';
  return text.length > 58 ? `${text.slice(0, 58)}…` : text;
}

function getMoodLabel(value) {
  return MOODS.find((item) => item.value === value)?.label || '平静';
}

function getMemorySourceLabel(value) {
  if (value === 'auto') return '自动';
  if (value === 'summary') return '总结';
  return '手写';
}

function toggleId(list, id, checked) {
  const next = new Set(normalizeArray(list).map(String));

  if (checked) {
    next.add(id);
  } else {
    next.delete(id);
  }

  return [...next];
}

function cloneCharacter(character) {
  return JSON.parse(JSON.stringify(normalizeCharacter(character)));
}

function cloneProfile(profile) {
  return JSON.parse(JSON.stringify(normalizeProfile(profile)));
}

function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}

function clearLongPress() {
  if (longPressTimer) {
    window.clearTimeout(longPressTimer);
    longPressTimer = null;
  }
}

function emitCharacterUpdates() {
  window.AppEvents?.emit?.('desktop:refresh');
  // characters:updated 统一只走 appBus 一条通道，避免三机制重复触发 chat 监听器
  try {
    window.AppBus?.emit('characters:updated', {});
  } catch (_) {}
  window.refreshDesktopBadges?.();
}

function getCharacterAvatarKey(characterId) {
  return `${CHARACTER_AVATAR_PREFIX}${characterId}`;
}

function getCharacterBgKey(characterId) {
  return `${CHARACTER_BG_PREFIX}${characterId}`;
}

function getProfileAvatarKey(profileId) {
  return `app_user_profile_avatar_${profileId}`;
}

async function saveBlobImage(key, value, file = null, opacity = 100) {
  if (!key || !value) return;

  await setDB('blobs', key, {
    key,
    value,
    source: value,
    name: file?.name || '',
    type: file?.type || '',
    opacity: Number(opacity) || 100,
    updatedAt: getNow()
  });
}

function getImageFromRecord(record) {
  if (!record) return '';
  if (typeof record === 'string') return record.trim();

  const fields = ['value', 'source', 'data', 'image', 'avatar', 'avatarUrl', 'iconImage', 'backgroundImage', 'imageBase64', 'url', 'src'];
  for (const field of fields) {
    const value = record[field];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }

  return '';
}

function readCssVariable(name) {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || '';
}

function getDefaultColorValue() {
  return normalizeColorInputValue(readCssVariable('--bg-primary'));
}

function normalizeColorInputValue(value) {
  const raw = String(value || '').trim();

  if (/^#[0-9a-fA-F]{6}$/.test(raw)) return raw;

  if (/^#[0-9a-fA-F]{3}$/.test(raw)) {
    return `#${raw[1]}${raw[1]}${raw[2]}${raw[2]}${raw[3]}${raw[3]}`;
  }

  return cssColorToHex(raw) || '#f7f4ef';
}

function cssColorToHex(value) {
  if (!value) return '';

  const probe = document.createElement('span');
  probe.style.color = value;
  probe.style.position = 'fixed';
  probe.style.left = '-9999px';
  probe.style.top = '-9999px';

  document.body.appendChild(probe);

  const resolved = getComputedStyle(probe).color;
  probe.remove();

  const match = resolved.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
  if (!match) return '';

  const toHex = (number) => {
    const valueNumber = Math.max(0, Math.min(255, Number(number) || 0));
    return valueNumber.toString(16).padStart(2, '0');
  };

  return `#${toHex(match[1])}${toHex(match[2])}${toHex(match[3])}`;
}

function cssUrl(value) {
  return String(value || '').replace(/"/g, '\\"');
}

function sheetBase(titleText, descText = '') {
  const box = el('div');
  box.appendChild(el('div', 'sheet-title', titleText));

  if (descText) {
    box.appendChild(el('div', 'sheet-description', descText));
  }

  const body = el('div', 'settings-sheet-body');
  const actions = el('div', 'settings-actions sheet-actions');

  box.append(body, actions);

  return { el: box, body, actions };
}

function detailsBlock(title, contentEl) {
  const details = document.createElement('details');
  details.className = 'character-details';

  const summary = document.createElement('summary');
  summary.textContent = title;

  details.append(summary, contentEl);
  return details;
}

function renderPanelAgain(container, factory) {
  const next = factory();
  container.replaceWith(next);
}

function field(labelText, control) {
  const wrap = el('label', 'settings-field');
  wrap.append(el('span', 'field-label', labelText), control);
  return wrap;
}

function customRow(labelText, control) {
  const row = el('div', 'form-row');
  const label = el('div', 'form-label', labelText);
  const box = el('div', 'form-control');

  box.appendChild(control);
  row.append(label, box);

  return row;
}

function input(placeholder, value = '', type = 'text') {
  const item = document.createElement('input');
  item.className = 'input-card';
  item.type = type;
  item.placeholder = placeholder || '';
  item.value = value ?? '';
  return item;
}

function textarea(placeholder, value = '') {
  const item = document.createElement('textarea');
  item.className = 'textarea-card';
  item.placeholder = placeholder || '';
  item.value = value ?? '';
  return item;
}

function fileInput(accept) {
  const item = document.createElement('input');
  item.type = 'file';
  item.accept = accept;
  item.className = 'hidden';
  return item;
}

function button(text, variant = 'ghost', iconName = '') {
  const item = el('button', variant === 'primary' ? 'btn-primary' : 'btn-ghost');
  item.type = 'button';

  if (iconName) item.appendChild(createIcon(iconName, 18));

  item.appendChild(el('span', '', text));
  return item;
}

function iconButton(iconName, label) {
  const item = el('button', 'icon-button');
  item.type = 'button';
  item.setAttribute('aria-label', label);
  item.appendChild(createIcon(iconName, 22));
  return item;
}

function switchButton(active, onChange) {
  const item = el('button', 'switch');
  item.type = 'button';
  item.classList.toggle('active', Boolean(active));
  item.setAttribute('aria-label', '开关');

  item.addEventListener('click', () => {
    item.classList.toggle('active');
    onChange?.(item.classList.contains('active'));
  });

  return item;
}

function createSegmented(options, value, onChange) {
  const wrap = el('div', 'segmented');

  options.forEach((option) => {
    const item = el('button', '', option.label);
    item.type = 'button';
    item.classList.toggle('active', option.value === value);
    item.addEventListener('click', () => onChange(option.value));
    wrap.appendChild(item);
  });

  return wrap;
}

function checkboxRow(label, checked, onChange) {
  const row = el('button', 'checkbox-row');
  row.type = 'button';
  row.classList.toggle('active', checked);

  const text = el('span', '', label);
  const mark = el('span', 'checkbox-mark');

  if (checked) mark.appendChild(createIcon('check', 16));

  row.append(text, mark);

  row.addEventListener('click', () => {
    const next = !row.classList.contains('active');
    row.classList.toggle('active', next);
    mark.innerHTML = '';
    if (next) mark.appendChild(createIcon('check', 16));
    onChange?.(next);
  });

  return row;
}

function wrapActions(...items) {
  const wrap = el('div', 'settings-actions');
  items.filter(Boolean).forEach((item) => wrap.appendChild(item));
  return wrap;
}

function createSoftNote(text) {
  return el('div', 'soft-note', text);
}

function downloadJson(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: 'application/json'
  });

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.download = filename;
  link.click();

  URL.revokeObjectURL(url);
}

function formatTime(value) {
  if (!value) return '未知时间';

  try {
    return new Intl.DateTimeFormat('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    }).format(new Date(value));
  } catch (_) {
    return '未知时间';
  }
}

function el(tag, className = '', text = '') {
  const node = document.createElement(tag);

  if (className) node.className = className;

  if (text !== undefined && text !== null && text !== '') {
    node.textContent = String(text);
  }

  return node;
}

function injectStyle() {
  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .characters-app {
      color: var(--text-primary);
    }

    .characters-nav-title {
      flex: 1;
      min-width: 0;
    }

    .characters-wrap {
      padding-bottom: calc(92px + env(safe-area-inset-bottom));
      display: flex;
      flex-direction: column;
      gap: var(--spacing-md);
    }

    .character-grid,
    .user-profile-grid {
      display: grid;
      grid-template-columns: 1fr;
      gap: var(--spacing-md);
    }

    .character-card,
    .profile-card {
      min-height: 108px;
      display: grid;
      grid-template-columns: 68px minmax(0, 1fr) 28px;
      align-items: center;
      gap: var(--spacing-md);
      padding: var(--spacing-md);
      border-radius: 28px;
      background: var(--bg-card);
      box-shadow: var(--shadow-sm);
      transition: all 200ms ease;
    }

    .character-card:active,
    .profile-card:active {
      transform: scale(0.96);
    }

    .character-avatar,
    .profile-avatar,
    .editor-avatar {
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      background: var(--surface-muted);
      color: var(--accent-dark);
      box-shadow: var(--shadow-sm);
    }

    .character-avatar,
    .profile-avatar {
      width: 68px;
      height: 68px;
      border-radius: 26px;
    }

    .character-avatar img,
    .profile-avatar img,
    .editor-avatar img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .character-info,
    .profile-info {
      min-width: 0;
    }

    .character-name,
    .profile-name {
      color: var(--text-primary);
      font-size: var(--font-size-title);
      font-weight: 600;
      line-height: 1.35;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .character-prompt,
    .profile-desc {
      margin-top: 4px;
      color: var(--text-secondary);
      font-size: var(--font-size-small);
      line-height: 1.55;
      overflow: hidden;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
    }

    .character-meta,
    .profile-meta {
      margin-top: 6px;
      color: var(--text-hint);
      font-size: 12px;
      line-height: 1.35;
    }

    .character-arrow {
      color: var(--text-secondary);
    }

    .character-add-button {
      position: fixed;
      right: 22px;
      bottom: calc(26px + env(safe-area-inset-bottom));
      z-index: 110;
      width: 58px;
      height: 58px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 22px;
      background: var(--accent);
      color: var(--bubble-user-text);
      box-shadow: var(--shadow-lg);
      transition: all 200ms ease;
    }

    .character-add-button:active {
      transform: scale(0.96);
    }

    .character-empty {
      min-height: calc(100vh - 260px);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: var(--spacing-md);
      text-align: center;
    }

    .character-empty-mark {
      width: 72px;
      height: 72px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 28px;
      background: var(--accent-light);
      color: var(--accent-dark);
      box-shadow: var(--shadow-sm);
    }

    .character-empty-title {
      color: var(--text-primary);
      font-size: 22px;
      font-weight: 600;
      line-height: 1.35;
    }

    .character-empty-text {
      max-width: 320px;
      color: var(--text-secondary);
      font-size: var(--font-size-base);
      line-height: 1.7;
    }

    .character-editor {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-md);
    }

    .character-editor-core,
    .character-editor-panel {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-md);
    }

    .editor-avatar {
      width: 78px;
      height: 78px;
      margin-left: auto;
      border-radius: 50%;
    }

    .character-editor-sections {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-sm);
    }

    .character-details {
      padding: var(--spacing-md);
      border-radius: var(--radius-lg);
      background: var(--bg-card);
      box-shadow: var(--shadow-sm);
    }

    .character-details summary {
      cursor: pointer;
      color: var(--text-primary);
      font-size: var(--font-size-title);
      font-weight: 600;
      line-height: 1.35;
      list-style: none;
    }

    .character-details summary::-webkit-details-marker {
      display: none;
    }

    .character-details > *:not(summary) {
      margin-top: var(--spacing-md);
    }

    .background-preview {
      min-height: 120px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: var(--radius-lg);
      background-color: var(--surface-muted);
      background-size: cover;
      background-position: center;
      color: var(--text-secondary);
      box-shadow: var(--shadow-sm);
      font-size: var(--font-size-small);
    }

    .quick-reply-list,
    .memory-list,
    .binder-list,
    .sticker-bind-list {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-sm);
    }

    .quick-reply-row {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 40px;
      gap: var(--spacing-sm);
      align-items: center;
    }

    .memory-add {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-sm);
    }

    .memory-item {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: var(--spacing-sm);
      align-items: center;
      padding: var(--spacing-md);
      border-radius: var(--radius-lg);
      background: var(--surface-muted);
    }

    .memory-main {
      min-width: 0;
    }

    .memory-content {
      color: var(--text-primary);
      font-size: var(--font-size-base);
      line-height: 1.6;
      word-break: break-word;
    }

    .memory-meta {
      margin-top: 4px;
      color: var(--text-secondary);
      font-size: var(--font-size-small);
      line-height: 1.4;
    }

    .checkbox-row {
      min-height: 48px;
      display: grid;
      grid-template-columns: minmax(0, 1fr) 28px;
      align-items: center;
      gap: var(--spacing-sm);
      width: 100%;
      padding: 10px 12px;
      border-radius: var(--radius-md);
      background: var(--surface-muted);
      color: var(--text-secondary);
      text-align: left;
    }

    .checkbox-row.active {
      color: var(--text-primary);
      background: var(--accent-light);
    }

    .checkbox-mark {
      width: 24px;
      height: 24px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 10px;
      color: var(--accent-dark);
      background: var(--bg-card);
      box-shadow: var(--shadow-sm);
    }

    .sticker-bind-list .checkbox-row {
      grid-template-columns: 44px minmax(0, 1fr) 28px;
    }

    .sticker-thumb {
      width: 44px;
      height: 44px;
      object-fit: cover;
      border-radius: var(--radius-md);
      background: var(--surface-muted);
    }

    .settings-sheet-body {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-md);
    }

    .settings-actions {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: var(--spacing-sm);
    }

    .sheet-actions {
      justify-content: flex-end;
      margin-top: var(--spacing-sm);
    }

    .soft-note {
      padding: 12px 14px;
      border-radius: var(--radius-lg);
      background: var(--surface-muted);
      color: var(--text-secondary);
      font-size: var(--font-size-small);
      line-height: 1.6;
    }

    @media (min-width: 680px) {
      .character-grid,
      .user-profile-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
    }
  `;

  document.head.appendChild(style);
}

// 改了什么：重写角色管理，统一 user_profiles 并兼容 app_user_profiles；头像/聊天背景写 blobs 且保留旧字段；记忆补 updatedAt；保存删除后通知桌面和聊天刷新。
// 会不会影响其他文件：会，apps/chat/thread.js 后续可读取 character.chatBackground/blobKey、nicknameForUser、relationship、speakingStyle、replyLength、proactiveStyle；apps/chat/thread-ai.js 后续可把这些字段拼进 systemPrompt。
// 更新记忆里该文件的导出函数：mount(containerEl) / unmount()。
// 依赖：../core/storage.js(getData,setData,generateId,getNow,getAllDB,getDB,setDB,deleteDB,getByIndexDB,compressImage)；../core/ui.js(showToast,showBottomSheet,hideBottomSheet,showConfirm,createIcon)
