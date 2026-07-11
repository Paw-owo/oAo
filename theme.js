// imports:
//   from './storage.js': getData, setData

import { getData, setData } from './storage.js';

const THEME_KEY = 'app_theme';
const PRESET_KEY = 'app_theme_preset';
const MODE_KEY = 'app_theme_mode';

const DEFAULT_PRESET = 'coconut-spring';
const DEFAULT_MODE = 'light';

const FONT_FALLBACK = "'PingFang SC', 'Microsoft YaHei', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

// ═══════════════════════════════════════
// 【基础变量】默认值（椰乳四季春）
// ═══════════════════════════════════════

const BASE_VARIABLES = {
  'bg-main': '#F8F2E8',
  'bg-light': '#FFF5E6',
  'bg-card': '#FFFCF5',
  'color-accent': '#C8A87A',
  'color-text': '#6B5B4E',
  'bg-primary': '#F8F2E8',
  'bg-secondary': '#FFF5E6',
  'bg-overlay': 'rgba(0, 0, 0, 0.28)',
  'surface': '#FFFCF5',
  'surface-muted': 'color-mix(in srgb, var(--bg-card) 90%, var(--text-hint) 10%)',
  'accent': '#C8A87A',
  'accent-light': '#E8D8C0',
  'accent-dark': '#A88A5A',
  'text-primary': '#6B5B4E',
  'text-secondary': '#8A7A6C',
  'text-hint': '#B0A498',
  'bubble-user-bg': '#C8A87A',
  'bubble-user-text': '#FFFCF5',
  'bubble-ai-bg': '#EDE5D8',
  'bubble-ai-text': '#6B5B4E',
  'bubble-radius': '18px',
  'bubble-radius-tail': '4px',
  'font-main': FONT_FALLBACK,
  'font-size-base': '15px',
  'font-size-small': '13px',
  'font-size-title': '17px',
  'spacing-xs': '4px',
  'spacing-sm': '8px',
  'spacing-md': '16px',
  'spacing-lg': '24px',
  'radius-sm': '8px',
  'radius-md': '16px',
  'radius-lg': '24px',
  'shadow-sm': '0 1px 4px rgba(0, 0, 0, 0.05)',
  'shadow-md': '0 2px 12px rgba(0, 0, 0, 0.08)',
  'shadow-lg': '0 8px 32px rgba(0, 0, 0, 0.12)',
  'shadow-card': '0 2px 12px rgba(0, 0, 0, 0.06)',
  'shadow-float': '0 8px 32px rgba(0, 0, 0, 0.10)',
  'shadow-neu-out': '2px 2px 6px rgba(0,0,0,0.06), -2px -2px 6px rgba(255,255,255,0.8)',
  'shadow-neu-in': 'inset 2px 2px 6px rgba(0,0,0,0.06), inset -2px -2px 6px rgba(255,255,255,0.8)',
  'motion': 'all 200ms ease',
  'press-scale': '0.96',
  'radius-xl': '28px',
  'radius-full': '999px'
};

// ═══════════════════════════════════════
// 【阴影常量】日间 / 夜间
// ═══════════════════════════════════════

const LIGHT_SHADOWS = {
  'shadow-sm': '0 1px 4px rgba(0, 0, 0, 0.05)',
  'shadow-md': '0 2px 12px rgba(0, 0, 0, 0.08)',
  'shadow-lg': '0 8px 32px rgba(0, 0, 0, 0.12)',
  'shadow-card': '0 2px 12px rgba(0, 0, 0, 0.06)',
  'shadow-float': '0 8px 32px rgba(0, 0, 0, 0.10)'
};

const DARK_SHADOWS = {
  'shadow-sm': '0 1px 4px rgba(0, 0, 0, 0.18)',
  'shadow-md': '0 2px 12px rgba(0, 0, 0, 0.24)',
  'shadow-lg': '0 8px 32px rgba(0, 0, 0, 0.36)',
  'shadow-card': '0 2px 12px rgba(0, 0, 0, 0.20)',
  'shadow-float': '0 8px 32px rgba(0, 0, 0, 0.28)'
};

// ═══════════════════════════════════════
// 【主题预设】3 浅色 + 3 夜间
// ═══════════════════════════════════════

const PRESETS = {
  // ────────────────────────────────────────────
  // 椰乳四季春 — 米黄暖色系
  // ────────────────────────────────────────────
  'coconut-spring': {
    id: 'coconut-spring',
    name: '椰乳四季春',
    mode: 'light',
    variables: {
      'bg-main': '#F8F2E8',
      'bg-light': '#FFF5E6',
      'bg-card': '#FFFCF5',
      'color-accent': '#C8A87A',
      'color-text': '#6B5B4E',
      'bg-primary': '#F8F2E8',
      'bg-secondary': '#FFF5E6',
      'bg-overlay': 'rgba(0, 0, 0, 0.28)',
      'surface': '#FFFCF5',
      'surface-muted': 'color-mix(in srgb, #FFFCF5 90%, #B0A498 10%)',
      'accent': '#C8A87A',
      'accent-light': '#E8D8C0',
      'accent-dark': '#A88A5A',
      'text-primary': '#6B5B4E',
      'text-secondary': '#8A7A6C',
      'text-hint': '#B0A498',
      'bubble-user-bg': '#C8A87A',
      'bubble-user-text': '#FFFCF5',
      'bubble-ai-bg': '#EDE5D8',
      'bubble-ai-text': '#6B5B4E',
      ...LIGHT_SHADOWS
    }
  },

  // ────────────────────────────────────────────
  // 椰青冰美式 — 蓝灰底 + 棕色气泡
  // ────────────────────────────────────────────
  'coconut-iced': {
    id: 'coconut-iced',
    name: '椰青冰美式',
    mode: 'light',
    variables: {
      'bg-main': '#E1EFF4',
      'bg-light': '#EDDFD4',
      'bg-card': '#F5EDE6',
      'color-accent': '#9D7C6D',
      'color-text': '#512128',
      'bg-primary': '#E1EFF4',
      'bg-secondary': '#EDDFD4',
      'bg-overlay': 'rgba(0, 0, 0, 0.28)',
      'surface': '#F5EDE6',
      'surface-muted': 'color-mix(in srgb, #F5EDE6 90%, #A89890 10%)',
      'accent': '#9D7C6D',
      'accent-light': '#C8B8A8',
      'accent-dark': '#7A5C4D',
      'text-primary': '#512128',
      'text-secondary': '#7A6058',
      'text-hint': '#A89890',
      'bubble-user-bg': '#9D7C6D',
      'bubble-user-text': '#FFF8F0',
      'bubble-ai-bg': '#E8DDD4',
      'bubble-ai-text': '#512128',
      ...LIGHT_SHADOWS
    }
  },

  // ────────────────────────────────────────────
  // 葡萄气泡 — 紫色系撞色
  // ────────────────────────────────────────────
  'strawberry-milk': {
    id: 'strawberry-milk',
    name: '葡萄气泡',
    mode: 'light',
    variables: {
      'bg-main': '#F4F0F8',
      'bg-light': '#EDE6F5',
      'bg-card': '#FCFAFF',
      'color-accent': '#9B7EC8',
      'color-text': '#4A3A5C',
      'bg-primary': '#F4F0F8',
      'bg-secondary': '#EDE6F5',
      'bg-overlay': 'rgba(0, 0, 0, 0.28)',
      'surface': '#FCFAFF',
      'surface-muted': 'color-mix(in srgb, #FCFAFF 90%, #A898B8 10%)',
      'accent': '#9B7EC8',
      'accent-light': '#D4C8E8',
      'accent-dark': '#7A5CAE',
      'text-primary': '#4A3A5C',
      'text-secondary': '#7A6890',
      'text-hint': '#B0A4C0',
      'bubble-user-bg': '#9B7EC8',
      'bubble-user-text': '#FCFAFF',
      'bubble-ai-bg': '#E8E0F0',
      'bubble-ai-text': '#4A3A5C',
      ...LIGHT_SHADOWS
    }
  },

  // ────────────────────────────────────────────
  // 黑巧夜语 — 深巧底 + 金强调
  // ────────────────────────────────────────────
  'dark-chocolate': {
    id: 'dark-chocolate',
    name: '黑巧夜语',
    mode: 'dark',
    variables: {
      'bg-main': '#1E1410',
      'bg-light': '#2A1C15',
      'bg-card': '#2F1F18',
      'color-accent': '#D4A853',
      'color-text': '#E8D5C0',
      'bg-primary': '#1E1410',
      'bg-secondary': '#2A1C15',
      'bg-overlay': 'rgba(0, 0, 0, 0.52)',
      'surface': '#2F1F18',
      'surface-muted': 'color-mix(in srgb, #2F1F18 90%, #786858 10%)',
      'accent': '#D4A853',
      'accent-light': '#4A3C28',
      'accent-dark': '#E8C070',
      'text-primary': '#E8D5C0',
      'text-secondary': '#B8A090',
      'text-hint': '#786858',
      'bubble-user-bg': '#D4A853',
      'bubble-user-text': '#2A1C15',
      'bubble-ai-bg': '#3A2C22',
      'bubble-ai-text': '#E8D5C0',
      ...DARK_SHADOWS
    }
  },

  // ────────────────────────────────────────────
  // 泰迪暖窝 — 暖棕底 + 奶茶气泡
  // ────────────────────────────────────────────
  'teddy-nest': {
    id: 'teddy-nest',
    name: '泰迪暖窝',
    mode: 'dark',
    variables: {
      'bg-main': '#2A1F1A',
      'bg-light': '#332520',
      'bg-card': '#3A2820',
      'color-accent': '#E8C4A0',
      'color-text': '#F5E6D3',
      'bg-primary': '#2A1F1A',
      'bg-secondary': '#332520',
      'bg-overlay': 'rgba(0, 0, 0, 0.52)',
      'surface': '#3A2820',
      'surface-muted': 'color-mix(in srgb, #3A2820 90%, #807060 10%)',
      'accent': '#E8C4A0',
      'accent-light': '#4A3830',
      'accent-dark': '#F0D8B8',
      'text-primary': '#F5E6D3',
      'text-secondary': '#C0A890',
      'text-hint': '#807060',
      'bubble-user-bg': '#E8C4A0',
      'bubble-user-text': '#3A2820',
      'bubble-ai-bg': '#443428',
      'bubble-ai-text': '#F5E6D3',
      ...DARK_SHADOWS
    }
  },

  // ────────────────────────────────────────────
  // 香草米布丁 — 深米底 + 灰粉气泡
  // ────────────────────────────────────────────
  'vanilla-pudding': {
    id: 'vanilla-pudding',
    name: '香草米布丁',
    mode: 'dark',
    variables: {
      'bg-main': '#2A1F18',
      'bg-light': '#2F231A',
      'bg-card': '#352820',
      'color-accent': '#C3AB99',
      'color-text': '#F3EEE9',
      'bg-primary': '#2A1F18',
      'bg-secondary': '#2F231A',
      'bg-overlay': 'rgba(0, 0, 0, 0.52)',
      'surface': '#352820',
      'surface-muted': 'color-mix(in srgb, #352820 90%, #786858 10%)',
      'accent': '#C3AB99',
      'accent-light': '#4A3C32',
      'accent-dark': '#D8C0B0',
      'text-primary': '#F3EEE9',
      'text-secondary': '#B8A898',
      'text-hint': '#786858',
      'bubble-user-bg': '#C3AB99',
      'bubble-user-text': '#2A1F18',
      'bubble-ai-bg': '#3E3028',
      'bubble-ai-text': '#F3EEE9',
      ...DARK_SHADOWS
    }
  }
};

// ═══════════════════════════════════════
// 【旧版兼容】老主题 ID 映射到新 ID
// ═══════════════════════════════════════

const LEGACY_PRESET_ALIAS = {
  default: 'coconut-spring',
  light: 'coconut-spring',
  blue: 'coconut-spring',
  pink: 'strawberry-milk',
  cream: 'coconut-spring',
  sky: 'coconut-iced',
  paper: 'coconut-spring',
  peach: 'coconut-spring',
  coral: 'coconut-iced',
  berry: 'strawberry-milk',
  strawberry: 'strawberry-milk',
  blush: 'coconut-spring',
  lavender: 'strawberry-milk',
  purple: 'strawberry-milk',
  warm: 'coconut-spring',
  dark: 'dark-chocolate',
  night: 'dark-chocolate',
  dusk: 'dark-chocolate',
  'rose-noir': 'dark-chocolate',
  candle: 'teddy-nest',
  milk: 'vanilla-pudding',
  cocoa: 'vanilla-pudding',
  'warm-gray': 'vanilla-pudding',
  'milk-cafe': 'teddy-nest',
  caramel: 'teddy-nest',
  gray: 'vanilla-pudding'
};

let currentTheme = null;

// ═══════════════════════════════════════
// 【主题应用】写入变量 + 更新主题对象
// ═══════════════════════════════════════

export function applyTheme(variables = {}) {
  const safeVariables = normalizeVariables(variables);
  const root = document.documentElement;

  Object.entries(safeVariables).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    root.style.setProperty(`--${key}`, String(value));
  });

  const base = readCurrentTheme();
  const mergedCustom = {
    ...(base.customVariables || {}),
    ...safeVariables
  };

  currentTheme = normalizeTheme({
    ...base,
    variables: {
      ...(base.variables || {}),
      ...safeVariables
    },
    customVariables: mergedCustom
  });

  setMetaColor(currentTheme.variables['bg-main'] || currentTheme.variables['bg-primary']);
  return currentTheme;
}

// ═══════════════════════════════════════
// 【导入导出】主题文件读写
// ═══════════════════════════════════════

export function exportTheme() {
  const theme = getCurrentTheme();
  return {
    preset: theme.preset,
    mode: theme.mode,
    variables: { ...theme.variables },
    customVariables: { ...theme.customVariables }
  };
}

export function importTheme(json) {
  const data = typeof json === 'string' ? JSON.parse(json) : json;
  const imported = data && typeof data === 'object' ? data : {};

  const preset = normalizePresetId(imported.preset || getData(PRESET_KEY) || DEFAULT_PRESET);
  const presetTheme = getPresetById(preset);
  const mode = normalizeMode(imported.mode || presetTheme.mode || DEFAULT_MODE);

  document.documentElement.setAttribute('data-theme', preset);

  const next = normalizeTheme({
    preset,
    mode,
    variables: {
      ...BASE_VARIABLES,
      ...presetTheme.variables,
      ...normalizeVariables(imported.variables || {}),
      ...normalizeVariables(imported.customVariables || {})
    },
    customVariables: {
      ...normalizeVariables(imported.customVariables || {})
    }
  });

  currentTheme = next;
  writeTheme(next);
  applyVariablesToDOM(next.variables);
  setMetaColor(next.variables['bg-main'] || next.variables['bg-primary']);
  return next;
}

// ═══════════════════════════════════════
// 【预设切换】选择内置主题，清除自定义颜色
// ═══════════════════════════════════════

export function setPreset(name) {
  const presetId = normalizePresetId(name);
  const presetTheme = getPresetById(presetId);

  document.documentElement.setAttribute('data-theme', presetId);

  const next = normalizeTheme({
    preset: presetId,
    mode: presetTheme.mode,
    variables: {
      ...BASE_VARIABLES,
      ...presetTheme.variables
    },
    customVariables: {}
  });

  currentTheme = next;
  writeTheme(next);
  applyVariablesToDOM(next.variables);
  setMetaColor(next.variables['bg-main'] || next.variables['bg-primary']);
  return next;
}

// ═══════════════════════════════════════
// 【模式切换】浅色 → 椰乳四季春 / 夜间 → 黑巧夜语
// ═══════════════════════════════════════

export function setThemeMode(mode) {
  const safeMode = normalizeMode(mode);
  const presetId = safeMode === 'dark' ? 'dark-chocolate' : 'coconut-spring';
  const presetTheme = getPresetById(presetId);

  document.documentElement.setAttribute('data-theme', presetId);

  const next = normalizeTheme({
    preset: presetId,
    mode: safeMode,
    variables: {
      ...BASE_VARIABLES,
      ...presetTheme.variables
    },
    customVariables: {}
  });

  currentTheme = next;
  writeTheme(next);
  applyVariablesToDOM(next.variables);
  setMetaColor(next.variables['bg-main'] || next.variables['bg-primary']);
  return next;
}

// ═══════════════════════════════════════
// 【保存 / 加载】持久化到 localStorage
// ═══════════════════════════════════════

export function saveTheme() {
  const theme = getCurrentTheme();
  writeTheme(theme);
  return theme;
}

export function loadTheme() {
  const saved = getData(THEME_KEY);
  const preset = normalizePresetId(getData(PRESET_KEY) || saved?.preset || DEFAULT_PRESET);
  const presetTheme = getPresetById(preset);
  const mode = normalizeMode(getData(MODE_KEY) || saved?.mode || presetTheme.mode || DEFAULT_MODE);

  const savedVars = normalizeVariables(saved?.variables || {});
  const savedCustom = normalizeVariables(saved?.customVariables || {});

  document.documentElement.setAttribute('data-theme', preset);

  const next = normalizeTheme({
    preset,
    mode,
    variables: {
      ...BASE_VARIABLES,
      ...presetTheme.variables,
      ...savedVars,
      ...savedCustom
    },
    customVariables: { ...savedCustom }
  });

  currentTheme = next;
  applyVariablesToDOM(next.variables);
  setMetaColor(next.variables['bg-main'] || next.variables['bg-primary']);
  return next;
}

// ═══════════════════════════════════════
// 【查询】获取预设列表 / 当前主题
// ═══════════════════════════════════════

export function getThemePresets() {
  return Object.values(PRESETS).map((preset) => ({
    id: preset.id,
    name: preset.name,
    mode: preset.mode
  }));
}

export function getCurrentTheme() {
  if (currentTheme) return { ...currentTheme };
  return readCurrentTheme();
}

// ═══════════════════════════════════════
// 【内部工具】读写、归一化、DOM操作
// ═══════════════════════════════════════

function readCurrentTheme() {
  if (currentTheme) return { ...currentTheme };

  const saved = getData(THEME_KEY);
  const preset = normalizePresetId(getData(PRESET_KEY) || saved?.preset || DEFAULT_PRESET);
  const presetTheme = getPresetById(preset);
  const mode = normalizeMode(getData(MODE_KEY) || saved?.mode || presetTheme.mode || DEFAULT_MODE);

  return normalizeTheme({
    preset,
    mode,
    variables: {
      ...BASE_VARIABLES,
      ...presetTheme.variables,
      ...normalizeVariables(saved?.variables || {}),
      ...normalizeVariables(saved?.customVariables || {})
    },
    customVariables: normalizeVariables(saved?.customVariables || {})
  });
}

function writeTheme(theme) {
  setData(THEME_KEY, {
    preset: theme.preset,
    mode: theme.mode,
    variables: { ...theme.variables },
    customVariables: { ...theme.customVariables }
  });

  setData(PRESET_KEY, theme.preset);
  setData(MODE_KEY, theme.mode);
}

function applyVariablesToDOM(variables) {
  const root = document.documentElement;

  Object.entries(variables).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    root.style.setProperty(`--${key}`, String(value));
  });
}

function setMetaColor(color) {
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta && color) meta.setAttribute('content', String(color));
}

function normalizeTheme(raw) {
  const obj = raw && typeof raw === 'object' ? raw : {};

  return {
    preset: normalizePresetId(obj.preset || DEFAULT_PRESET),
    mode: normalizeMode(obj.mode || DEFAULT_MODE),
    variables: {
      ...BASE_VARIABLES,
      ...normalizeVariables(obj.variables || {})
    },
    customVariables: normalizeVariables(obj.customVariables || {})
  };
}

function normalizeVariables(vars) {
  if (!vars || typeof vars !== 'object') return {};

  const result = {};

  Object.entries(vars).forEach(([key, value]) => {
    if (value === undefined || value === null) return;
    const cleanKey = String(key).replace(/^--/, '');
    if (!cleanKey) return;
    result[cleanKey] = String(value);
  });

  return result;
}

function normalizePresetId(id) {
  const cleanId = String(id || '').trim().toLowerCase();
  if (PRESETS[cleanId]) return cleanId;
  if (LEGACY_PRESET_ALIAS[cleanId]) return LEGACY_PRESET_ALIAS[cleanId];
  return DEFAULT_PRESET;
}

function normalizeMode(mode) {
  const clean = String(mode || '').trim().toLowerCase();
  return clean === 'dark' ? 'dark' : 'light';
}

function getPresetById(id) {
  return PRESETS[normalizePresetId(id)] || PRESETS[DEFAULT_PRESET];
}

function isPresetDark(id) {
  const preset = PRESETS[normalizePresetId(id)];
  return preset ? preset.mode === 'dark' : false;
}

// 依赖：./storage.js(getData, setData)
