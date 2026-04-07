#!/usr/bin/env python3
"""删除页测试"""
import sys, json, time, urllib.request, traceback
from playwright.sync_api import sync_playwright

BASE = "http://localhost"
TEST_UID = "trash_test_" + str(int(time.time()))[-6:]
CREATED_UIDS = []

def api(method, path, data=None):
    url = "http://localhost:8081" + path
    headers = {'Content-Type': 'application/json'}
    if data is not None:
        body = json.dumps(data).encode()
    elif method == 'DELETE':
        body = json.dumps({"permanent": False}).encode()
    else:
        body = None
    req = urllib.request.Request(url, method=method, data=body, headers=headers)
    try:
        res = urllib.request.urlopen(req)
        raw = res.read()
        if not raw: return {"_ok": True}
        return json.loads(raw)
    except urllib.error.HTTPError as e:
        return {"_error": e.code}

def cleanup():
    for uid in list(CREATED_UIDS):
        try: api('POST', f'/api/docs/{uid}/restore')
        except: pass
        try: api('DELETE', f'/api/docs/{uid}', {"permanent": True})
        except: pass
    CREATED_UIDS.clear()

def test_trash_page_loads():
    """删除页：页面正常加载，显示废弃文档列表"""
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        errors = []
        page.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
        page.goto(BASE + "/trash.html", wait_until='networkidle', timeout=12000)
        page.wait_for_timeout(1500)
        assert "废弃" in page.title()
        cards = page.query_selector_all('.trash-card')
        empty = page.query_selector('.trash-empty')
        assert cards or empty
        assert len(errors) == 0, f"控制台错误: {errors}"
        browser.close()
    print("✅ test_trash_page_loads 通过")

def test_doc_delete_and_appears_in_trash():
    """主页：删除文档后出现在删除页"""
    uid = TEST_UID + "_d"
    CREATED_UIDS.append(uid)
    api('POST', '/api/docs', {"uid": uid, "title": "API删除测试文档", "body": "将为删除",
                              "tags": [], "annotations": [], "created": "2026-04-07"})
    del_result = api('DELETE', f'/api/docs/{uid}')
    assert del_result.get('moved_to_trash') or del_result.get('ok'), f"DELETE失败: {del_result}"

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.goto(BASE + "/", wait_until='networkidle', timeout=12000)
        page.wait_for_timeout(500)
        page.reload(wait_until='networkidle')
        page.wait_for_timeout(1000)
        titles = [el.inner_text() for el in page.query_selector_all('.doc-title')]
        assert "API删除测试文档" not in titles, "删除后文档仍在主页"

        page.goto(BASE + "/trash.html", wait_until='networkidle', timeout=12000)
        page.wait_for_timeout(2000)
        page.wait_for_function(
            f"() => typeof trashList !== 'undefined' && trashList.some(d => d.title === 'API删除测试文档')",
            timeout=8000
        )
        trash_titles = [c.query_selector('.trash-title').inner_text()
                        for c in page.query_selector_all('.trash-card')]
        assert any("API删除测试文档" in t for t in trash_titles), f"删除页找不到: {trash_titles}"
        browser.close()
    print("✅ test_doc_delete_and_appears_in_trash 通过")

def test_trash_view_modal():
    """删除页：点击查看按钮弹出只读弹窗"""
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.goto(BASE + "/trash.html", wait_until='networkidle', timeout=12000)
        page.wait_for_timeout(1500)
        cards = page.query_selector_all('.trash-card')
        assert cards, "没有废弃文档"
        cards[0].query_selector('button').click()
        page.wait_for_timeout(500)
        modal = page.query_selector('#viewModal')
        assert modal.evaluate('el => el.style.display') == 'flex'
        assert page.query_selector('#viewDocTitle').inner_text()
        page.click('.modal-close')
        page.wait_for_timeout(300)
        assert modal.evaluate('el => el.style.display') == 'none'
        browser.close()
    print("✅ test_trash_view_modal 通过")

def test_trash_restore_doc():
    """删除页：还原文档后消失在废弃列表"""
    uid = TEST_UID + "_r"
    CREATED_UIDS.append(uid)
    api('POST', '/api/docs', {"uid": uid, "title": "还原测试文档", "body": "将为还原",
                              "tags": [], "annotations": [], "created": "2026-04-07"})
    api('DELETE', f'/api/docs/{uid}')

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.goto(BASE + "/trash.html", wait_until='networkidle', timeout=12000)
        page.wait_for_timeout(1500)
        # 覆盖 confirm 避免 dialog 事件时序问题
        page.evaluate("() => { window.confirm = () => true; }")
        page.wait_for_timeout(1500)

        cards = page.query_selector_all('.trash-card')
        for card in cards:
            t = card.query_selector('.trash-title').inner_text()
            if "还原测试文档" in t:
                for btn in card.query_selector_all('button'):
                    if '还原' in btn.inner_text():
                        btn.click()
                        break
                break
        page.wait_for_timeout(1000)
        titles = [c.query_selector('.trash-title').inner_text() for c in page.query_selector_all('.trash-card')]
        assert "还原测试文档" not in titles, f"还原后仍在列表: {titles}"
        browser.close()
    print("✅ test_trash_restore_doc 通过")

def test_trash_permanent_delete():
    """删除页：彻底删除按钮从DOM和存储中永久移除文档"""
    uid = TEST_UID + "_pd"
    CREATED_UIDS.append(uid)
    api('POST', '/api/docs', {"uid": uid, "title": "彻底删除测试", "body": "将永久删除",
                              "tags": [], "annotations": [], "created": "2026-04-07"})
    api('DELETE', f'/api/docs/{uid}')  # move to trash first

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.goto(BASE + "/trash.html", wait_until='networkidle', timeout=12000)
        page.wait_for_timeout(1500)

        # 确认页面有要彻底删除的文档
        cards = page.query_selector_all('.trash-card')
        found = None
        for card in cards:
            t = card.query_selector('.trash-title').inner_text()
            if "彻底删除测试" in t:
                found = card
                break
        assert found, "找不到要彻底删除的文档"

        # 覆盖 confirm 避免 dialog 阻塞
        page.evaluate("() => { window.confirm = () => true; }")
        page.wait_for_timeout(500)

        # 找到彻底删除按钮并点击
        for btn in found.query_selector_all('button'):
            if '彻底删除' in btn.inner_text():
                btn.click()
                break

        page.wait_for_timeout(2000)

        # 验证文档从页面消失
        titles = [c.query_selector('.trash-title').inner_text() for c in page.query_selector_all('.trash-card')]
        assert "彻底删除测试" not in titles, f"彻底删除后仍在列表: {titles}"

        # 验证 API 层面也已永久删除（不在 trash 中）
        trash = api('GET', '/api/docs/trash')
        assert not any(d.get('uid') == uid for d in trash), f"API层仍在trash中: {uid}"
        browser.close()
    print("✅ test_trash_permanent_delete 通过")

def test_trash_empty_trash():
    """删除页：清空全部按钮永久删除所有废弃文档"""
    # 创建两个测试文档
    uid1 = TEST_UID + "_et1"
    uid2 = TEST_UID + "_et2"
    CREATED_UIDS.extend([uid1, uid2])
    api('POST', '/api/docs', {"uid": uid1, "title": "清空测试A", "body": "测试清空",
                              "tags": [], "annotations": [], "created": "2026-04-07"})
    api('POST', '/api/docs', {"uid": uid2, "title": "清空测试B", "body": "测试清空",
                              "tags": [], "annotations": [], "created": "2026-04-07"})
    api('DELETE', f'/api/docs/{uid1}')
    api('DELETE', f'/api/docs/{uid2}')

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.goto(BASE + "/trash.html", wait_until='networkidle', timeout=12000)
        page.wait_for_timeout(1500)

        # 覆盖 confirm
        page.evaluate("() => { window.confirm = () => true; }")
        page.wait_for_timeout(500)

        # 点击清空全部按钮
        empty_btn = page.query_selector('button[onclick="emptyTrash()"]')
        assert empty_btn, "找不到清空全部按钮"
        empty_btn.click()

        page.wait_for_timeout(2000)

        # 验证页面已清空
        cards = page.query_selector_all('.trash-card')
        et_cards = [c for c in cards if '清空测试' in c.query_selector('.trash-title').inner_text()]
        assert len(et_cards) == 0, f"清空后仍有文档: {len(et_cards)}"
        browser.close()
    print("✅ test_trash_empty_trash 通过")

def run_all():
    print("\n" + "="*50)
    print("删除页测试")
    print("="*50)
    tests = [test_trash_page_loads, test_doc_delete_and_appears_in_trash,
             test_trash_view_modal, test_trash_restore_doc,
             test_trash_permanent_delete, test_trash_empty_trash]
    failed = 0
    for t in tests:
        try: t()
        except Exception as e:
            print(f"❌ {t.__name__}: {e}")
            traceback.print_exc()
            failed += 1
    cleanup()
    print("="*50)
    print(f"通过 {len(tests)-failed}/{len(tests)} ✅" if failed == 0 else f"失败 {failed} 个 ❌")
    print("="*50)
    return failed == 0

if __name__ == '__main__':
    ok = run_all()
    sys.exit(0 if ok else 1)
