from playwright.sync_api import sync_playwright
import time

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 390, "height": 844})

    errors = []
    page.on("console", lambda msg: errors.append(f"[{msg.type}] {msg.text}") if msg.type in ("error", "warning") else None)
    page.on("pageerror", lambda err: errors.append(f"[pageerror] {err}"))

    page.goto("http://localhost:8765/index.html")
    page.wait_for_load_state("networkidle")
    time.sleep(2)

    page.screenshot(path="/workspace/tmp_shot1_desktop.png")

    try:
        chat_icon = page.locator('.app-icon[data-id="chat"]')
        chat_icon.click()
        time.sleep(2)
        page.screenshot(path="/workspace/tmp_shot2_chat.png")

        first_item = page.locator('.chat-list-item').first
        if first_item.count() > 0:
            first_item.click()
            time.sleep(2)
            page.screenshot(path="/workspace/tmp_shot3_conversation.png")
    except Exception as e:
        errors.append(f"[action_error] {e}")

    print("=== CONSOLE ERRORS ===")
    for e in errors:
        print(e)

    browser.close()
