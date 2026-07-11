// core/worldbook-prompt.js
// 世界书 prompt 格式化共用 helper
// 对齐 thread-ai.js 的 buildWorldbookPrompt 格式，避免多处复制
// 不改变 getWorldbookForCharacter 的返回结构

import { getWorldbookForCharacter } from '../apps/worldbook.js';

// 格式化世界书条目为 prompt 文本，最多取 16 条
// 无条目时返回空串，调用方可用 filter(Boolean) 过滤
export function formatWorldbookPrompt(items) {
  const list = Array.isArray(items) ? items.filter(Boolean) : [];
  if (!list.length) return '';

  return [
    '世界书规则与背景：',
    '以下内容是我所在世界和关系里的真实设定，我回应时会优先遵守：',
    ...list.slice(0, 16).map((item) => `- ${item.title || item.name || '设定'}：${item.content || item.description || ''}`)
  ].join('\n');
}

// 便捷函数：读取角色绑定的世界书并格式化为 prompt 文本
// character 可为对象或 characterId 字符串
// 无世界书 / 读取失败时返回空串，不抛异常
export async function loadWorldbookPromptForCharacter(character) {
  if (!character) return '';
  try {
    const items = await getWorldbookForCharacter(character);
    return formatWorldbookPrompt(items);
  } catch (_) {
    return '';
  }
}
