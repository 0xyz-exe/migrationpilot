import time
from pathlib import Path
from playwright.sync_api import sync_playwright

OUT_DIR = Path("docs/screenshots")
OUT_DIR.mkdir(parents=True, exist_ok=True)

def capture():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 1440, "height": 900})
        page = context.new_page()

        # 1. Safety Workspace (Default Overview)
        print("Capturing workspace overview...")
        page.goto("http://127.0.0.1:3080/")
        page.wait_for_selector("text=Migration SQL Workspace", timeout=15000)
        time.sleep(2)
        page.screenshot(path=str(OUT_DIR / "overview.png"), full_page=False)
        print("Captured docs/screenshots/overview.png")

        # 2. Dashboard
        print("Capturing dashboard...")
        page.locator("button:has-text('Dashboard')").click()
        page.wait_for_selector("text=Migration Safety Dashboard", timeout=10000)
        time.sleep(1.5)
        page.screenshot(path=str(OUT_DIR / "dashboard.png"), full_page=False)
        print("Captured docs/screenshots/dashboard.png")

        # 3. Rules Catalog
        print("Capturing rules catalog...")
        page.locator("button:has-text('Rules Catalog')").click()
        page.wait_for_selector("text=PostgreSQL Migration Safety Rules", timeout=10000)
        time.sleep(1.5)
        page.screenshot(path=str(OUT_DIR / "rules_catalog.png"), full_page=False)
        print("Captured docs/screenshots/rules_catalog.png")

        # 4. History & Diff
        print("Capturing history & diff...")
        page.locator("button:has-text('History & Diff')").click()
        page.wait_for_selector("text=Migration Comparison & Diff Tool", timeout=10000)
        time.sleep(1.5)
        page.screenshot(path=str(OUT_DIR / "history_diff.png"), full_page=False)
        print("Captured docs/screenshots/history_diff.png")

        browser.close()

if __name__ == "__main__":
    capture()
