const { JSDOM } = require('jsdom');
const fs = require('fs');

const html = fs.readFileSync('/workspace/index.html', 'utf8');

const errors = [];
const consoleLogs = [];

const dom = new JSDOM(html, {
  url: 'http://localhost:8765/index.html',
  runScripts: 'dangerously',
  resources: 'usable',
  pretendToBeVisual: true,
  beforeParse(window) {
    // polyfill missing APIs
    window.matchMedia = window.matchMedia || function(q) { return { matches: false, addListener(){}, removeListener(){}, addEventListener(){}, removeEventListener(){} }; };
    window.scrollTo = () => {};
    window.HTMLElement.prototype.scrollIntoView = () => {};
    window.HTMLInputElement.prototype.scrollWidth = 100;
    
    window.addEventListener('error', (e) => {
      errors.push('[window.error] ' + (e.error ? e.error.stack : e.message));
    });
    window.addEventListener('unhandledrejection', (e) => {
      errors.push('[unhandledrejection] ' + (e.reason && e.reason.stack ? e.reason.stack : e.reason));
    });
    
    const origError = window.console.error;
    window.console.error = function(...args) {
      consoleLogs.push('[console.error] ' + args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' '));
      origError.apply(this, args);
    };
    const origWarn = window.console.warn;
    window.console.warn = function(...args) {
      consoleLogs.push('[console.warn] ' + args.map(a => String(a)).join(' '));
      origWarn.apply(this, args);
    };
  },
});

// 等待加载
setTimeout(() => {
  const doc = dom.window.document;
  
  // 检查桌面是否渲染
  const appGrid = doc.querySelector('.app-grid');
  console.log('=== DOM 检查 ===');
  console.log('app-grid 存在:', !!appGrid);
  console.log('app-icon 数量:', doc.querySelectorAll('.app-icon').length);
  console.log('widget 数量:', doc.querySelectorAll('.widget').length);
  console.log('dock-item 数量:', doc.querySelectorAll('.dock-item').length);
  
  // 检查 Phone 对象
  console.log('\n=== Phone 对象 ===');
  console.log('Phone 存在:', !!dom.window.Phone);
  if (dom.window.Phone) {
    console.log('Phone.AppRegistry:', !!dom.window.Phone.AppRegistry);
    console.log('Phone.Router:', !!dom.window.Phone.Router);
    console.log('Phone.Chat:', !!dom.window.Phone.Chat);
    console.log('Phone.Conversation:', !!dom.window.Phone.Conversation);
    console.log('Phone.InputBar:', !!dom.window.Phone.InputBar);
  }
  
  // 尝试点击 chat 图标
  console.log('\n=== 尝试进入消息APP ===');
  const chatIcon = doc.querySelector('.app-icon[data-id="chat"]');
  if (chatIcon) {
    try {
      chatIcon.click();
      setTimeout(() => {
        const chatListPage = doc.querySelector('.chat-list-page');
        const convPage = doc.querySelector('.conv-page');
        const inputBar = doc.querySelector('.input-bar');
        console.log('chat-list-page 存在:', !!chatListPage);
        console.log('conv-page 存在:', !!convPage);
        console.log('input-bar 存在:', !!inputBar);
        console.log('chat-list-item 数量:', doc.querySelectorAll('.chat-list-item').length);
        
        // 尝试点击第一个会话
        const firstItem = doc.querySelector('.chat-list-item');
        if (firstItem) {
          try {
            firstItem.click();
            setTimeout(() => {
              const convPage2 = doc.querySelector('.conv-page');
              const msgBubbles = doc.querySelectorAll('.msg-bubble, .msg-item, .conv-msg');
              const inputBar2 = doc.querySelector('.input-bar');
              const navBar = doc.querySelector('.conv-nav');
              console.log('\n=== 进入会话后 ===');
              console.log('conv-page 存在:', !!convPage2);
              console.log('conv-nav 存在:', !!navBar);
              console.log('input-bar 存在:', !!inputBar2);
              console.log('消息元素数量:', msgBubbles.length);
              console.log('conv-page 子元素:', convPage2 ? Array.from(convPage2.children).map(c => c.className).join(', ') : 'N/A');
              
              console.log('\n=== JS 错误 ===');
              errors.forEach(e => console.log(e));
              console.log('\n=== Console 日志 ===');
              consoleLogs.forEach(l => console.log(l));
              
              process.exit(0);
            }, 2000);
          } catch(e) {
            console.log('点击会话失败:', e.message);
          }
        } else {
          console.log('没有会话列表项');
          console.log('\n=== JS 错误 ===');
          errors.forEach(e => console.log(e));
          console.log('\n=== Console 日志 ===');
          consoleLogs.forEach(l => console.log(l));
          process.exit(0);
        }
      }, 2000);
    } catch(e) {
      console.log('点击chat图标失败:', e.message);
      errors.forEach(e => console.log(e));
      process.exit(0);
    }
  } else {
    console.log('chat 图标不存在');
    console.log('\n=== JS 错误 ===');
    errors.forEach(e => console.log(e));
    console.log('\n=== Console 日志 ===');
    consoleLogs.forEach(l => console.log(l));
    process.exit(0);
  }
}, 3000);
