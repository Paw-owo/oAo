"""
以新用户视角探索消息APP
"""
from playwright.sync_api import sync_playwright
import os

OUT = "/workspace/tests/chat_test_out"
os.makedirs(OUT, exist_ok=True)

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    context = browser.new_context(
        viewport={"width": 390, "height": 844},
        device_scale_factor=2,
        is_mobile=True,
        has_touch=True,
        user_agent="Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15"
    )
    page = context.new_page()
    
    errors = []
    page.on("console", lambda msg: errors.append(f"[{msg.type}] {msg.text}") if msg.type in ["error", "warning"] else None)
    page.on("pageerror", lambda err: errors.append(f"[PAGEERROR] {err}"))
    
    print("=== 步骤1: 打开小手机桌面 ===")
    page.goto("http://127.0.0.1:8765/index.html")
    page.wait_for_load_state("networkidle", timeout=10000)
    page.wait_for_timeout(2000)
    page.screenshot(path=f"{OUT}/01_desktop.png", full_page=False)
    print("桌面截图已保存")
    
    body_text = page.inner_text("body")
    print(f"页面文字(前500): {body_text[:500]}")
    
    clickables = page.locator("[class*='app'], [class*='icon'], [class*='dock'], button, [role='button'], [onclick]").all()
    print(f"可点击元素数量: {len(clickables)}")
    for i, el in enumerate(clickables[:25]):
        try:
            txt = el.inner_text()[:40]
            cls = el.get_attribute("class") or ""
            tag = el.evaluate("el => el.tagName")
            print(f"  [{i}] <{tag}> class='{cls}' text='{txt}'")
        except:
            pass
    
    print("\n=== 步骤2: 寻找消息APP入口 ===")
    chat_candidates = page.locator("text=/消息|聊天|chat|message/i").all()
    print(f"包含消息相关文字的元素: {len(chat_candidates)}")
    for el in chat_candidates[:10]:
        try:
            txt = el.inner_text()[:50]
            cls = el.get_attribute("class") or ""
            tag = el.evaluate("el => el.tagName")
            print(f"  <{tag}> class='{cls}' text='{txt}'")
        except:
            pass
    
    browser.close()

print("\n=== Console错误 ===")
for e in errors:
    print(e)
if not errors:
    print("(无错误)")
