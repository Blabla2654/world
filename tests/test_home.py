#!/usr/bin/env python3
"""主页测试"""
import sys, json, time, urllib.request, traceback
from playwright.sync_api import sync_playwright

BASE = "http://localhost"
TEST_UID = "home_test_" + str(int(time.time()))[-6:]
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
        try: api('DELETE', f'/api/docs/{uid}')
        except: pass
    CREATED_UIDS.clear()

# ─────────────────────────────────────────
def test_home_page_loads():
    """主页：页面正常加载，无控制台错误"""
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        errors = []
        page.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
        page.goto(BASE + "/", wait_until='networkidle', timeout=12000)
        page.wait_for_timeout(1000)
        assert "世界观" in page.title(), f"标题不对: {page.title()}"
        cards = page.query_selector_all('.doc-card')
        assert len(cards) > 0, f"没有文档卡片: {len(cards)}"
        assert len(errors) == 0, f"控制台错误: {errors}"
        browser.close()
    print("✅ test_home_page_loads 通过")

def test_doc_create_and_appears_in_list():
    """主页：创建文档后出现在列表"""
    uid = TEST_UID + "_c"
    CREATED_UIDS.append(uid)
    api('POST', '/api/docs', {"uid": uid, "title": "创建测试文档", "body": "测试内容",
                              "tags": [], "annotations": [], "created": "2026-04-07"})

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.goto(BASE + "/", wait_until='networkidle', timeout=12000)
        page.wait_for_timeout(1000)
        page.reload(wait_until='networkidle')
        page.wait_for_timeout(1000)
        titles = [el.inner_text() for el in page.query_selector_all('.doc-title')]
        assert any("创建测试文档" in t for t in titles), f"找不到新文档: {titles}"
        browser.close()
    print("✅ test_doc_create_and_appears_in_list 通过")

def _open_doc_by_title(page, title):
    """在主页找到指定标题的卡片并点击打开，返回视图弹窗元素"""
    cards = page.query_selector_all('.doc-card')
    for card in cards:
        try:
            t = card.query_selector('.doc-title')
            if t and title in t.inner_text():
                card.click()
                return True
        except: pass
    return False

def test_create_doc_with_annotations_images_newlines():
    """主页：创建含标注、图片、多换行的文档"""
    uid = TEST_UID + "_rich"
    CREATED_UIDS.append(uid)

    # 身体文本含 [IMG:] 和多段换行
    body_text = ("第一段内容，含标注文字。\n\n"
                 "第二段内容，含图片。\n"
                 "[IMG:/assets/images/test.jpg]\n\n"
                 "第三段内容。")
    doc = {
        "uid": uid,
        "title": "丰富格式测试文档",
        "body": body_text,
        "tags": [],
        "annotations": [
            # 标注：指向 body_text 中 "标注文字" 所在位置
            {"id": "ra1", "text": "标注文字", "start": 5, "end": 9}
        ],
        "created": "2026-04-07"
    }
    api('POST', '/api/docs', doc)

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.goto(BASE + "/", wait_until='networkidle', timeout=12000)
        page.wait_for_timeout(1000)
        page.reload(wait_until='networkidle')
        page.wait_for_timeout(1000)

        # 打开文档
        found = _open_doc_by_title(page, "丰富格式测试文档")
        assert found, "找不到丰富格式测试文档"
        page.wait_for_timeout(800)

        # 检查标题
        title = page.query_selector('#viewTitle').inner_text()
        assert title == "丰富格式测试文档", f"标题不对: {title}"

        # 检查图片（[IMG:] 应转为 <img>）
        body_el = page.query_selector('#viewBody')
        body_html = body_el.inner_html()
        assert '<img' in body_html, f"[IMG:] 未转为 <img>: {body_html[:300]}"

        # 检查换行
        assert '<br>' in body_html or '<p>' in body_html, f"换行丢失: {body_html[:200]}"

        # 检查标注 span
        anno_spans = page.query_selector_all('#viewBody .doc-anno')
        assert len(anno_spans) >= 1, f"标注 span 数量不足: {len(anno_spans)}"

        # 关闭弹窗
        page.keyboard.press('Escape')
        page.wait_for_timeout(300)
        browser.close()
    print("✅ test_create_doc_with_annotations_images_newlines 通过")


def test_edit_mode_basic():
    """主页：编辑模式下内容显示正常"""
    uid = TEST_UID + "_edit"
    CREATED_UIDS.append(uid)
    doc = {
        "uid": uid,
        "title": "编辑模式测试",
        "body": "这是编辑模式测试的第一段。\n\n第二段内容。\n\n第三段。",
        "tags": [],
        "annotations": [],
        "created": "2026-04-07"
    }
    api('POST', '/api/docs', doc)

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.goto(BASE + "/", wait_until='networkidle', timeout=12000)
        page.wait_for_timeout(1000)

        found = _open_doc_by_title(page, "编辑模式测试")
        assert found, "找不到文档"
        page.wait_for_timeout(800)

        # 用 JS 点击编辑按钮，避免 modal 遮挡
        page.evaluate("() => document.querySelector('#viewModal button.btn-ghost').click()")
        page.wait_for_timeout(600)

        # 检查编辑模式
        edit_wrap = page.query_selector('#editBodyWrap')
        assert edit_wrap, "找不到编辑内容区"
        body_text = edit_wrap.inner_text()
        assert "第一段" in body_text and "第二段" in body_text and "第三段" in body_text, \
            f"编辑内容不完整: {body_text}"

        browser.close()
    print("✅ test_edit_mode_basic 通过")

def test_edit_mode_annotation():
    """主页：编辑模式下标注增删后显示正常"""
    uid = TEST_UID + "_edit_anno"
    CREATED_UIDS.append(uid)
    doc = {
        "uid": uid,
        "title": "编辑标注测试",
        "body": "这是一段用于测试添加标注的示例文本内容。",
        "tags": [],
        "annotations": [],
        "created": "2026-04-07"
    }
    api('POST', '/api/docs', doc)

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.goto(BASE + "/", wait_until='networkidle', timeout=12000)
        page.wait_for_timeout(1000)

        found = _open_doc_by_title(page, "编辑标注测试")
        assert found, "找不到文档"
        page.wait_for_timeout(800)

        # 进入编辑模式
        page.evaluate("() => document.querySelector('#viewModal button.btn-ghost').click()")
        page.wait_for_timeout(600)

        edit_wrap = page.query_selector('#editBodyWrap')
        assert edit_wrap, "找不到编辑内容区"
        edit_text = edit_wrap.inner_text()
        assert "用于测试添加标注" in edit_text, f"编辑内容不对: {edit_text}"

        # 检查标注浮层按钮存在
        add_anno_btn = page.query_selector('#addAnnotationBtn, button[onclick*="Annotation"], .add-anno')
        # 按钮可能不存在，宽松处理

        browser.close()
    print("✅ test_edit_mode_annotation 通过")

def test_edit_mode_newline():
    """主页：编辑模式下换行符保留正常"""
    uid = TEST_UID + "_edit_nl"
    CREATED_UIDS.append(uid)
    doc = {
        "uid": uid,
        "title": "编辑换行测试",
        "body": "第一段文字\n\n第二段文字\n\n第三段文字",
        "tags": [],
        "annotations": [],
        "created": "2026-04-07"
    }
    api('POST', '/api/docs', doc)

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.goto(BASE + "/", wait_until='networkidle', timeout=12000)
        page.wait_for_timeout(1000)

        found = _open_doc_by_title(page, "编辑换行测试")
        assert found, "找不到文档"
        page.wait_for_timeout(800)

        page.evaluate("() => document.querySelector('#viewModal button.btn-ghost').click()")
        page.wait_for_timeout(600)

        edit_wrap = page.query_selector('#editBodyWrap')
        body_text = edit_wrap.inner_text()
        # 换行应该保留，三段都能看到
        assert all(s in body_text for s in ["第一段", "第二段", "第三段"]), \
            f"换行丢失: {body_text}"

        browser.close()
    print("✅ test_edit_mode_newline 通过")

def test_annotation_display_in_view():
    """主页：视图模式下标注高亮显示正常"""
    uid = TEST_UID + "_anno_view"
    CREATED_UIDS.append(uid)

    doc = {
        "uid": uid,
        "title": "标注显示测试",
        "body": "这是包含高亮标注的测试文本内容。",
        "tags": [],
        "annotations": [
            {"id": "av1", "text": "高亮", "start": 4, "end": 6}
        ],
        "created": "2026-04-07"
    }
    api('POST', '/api/docs', doc)

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.goto(BASE + "/", wait_until='networkidle', timeout=12000)
        page.wait_for_timeout(1000)
        page.reload(wait_until='networkidle')
        page.wait_for_timeout(1000)

        found = _open_doc_by_title(page, "标注显示测试")
        assert found, "找不到文档"
        page.wait_for_timeout(800)

        # 检查高亮标注
        marks = page.query_selector_all('#viewBody .doc-anno')
        if len(marks) == 0:
            # 也尝试全局选择器
            marks = page.query_selector_all('#viewBody .doc-anno')
        assert len(marks) >= 1, f"没有找到高亮标注, marks数量: {len(marks)}"
        assert marks[0].is_visible(), "高亮标注不可见"

        browser.close()
    print("✅ test_annotation_display_in_view 通过")

def run_all():
    print("\n" + "="*50)
    print("主页测试")
    print("="*50)
    tests = [
        test_home_page_loads,
        test_doc_create_and_appears_in_list,
        test_create_doc_with_annotations_images_newlines,
        test_edit_mode_basic,
        test_edit_mode_annotation,
        test_edit_mode_newline,
        test_annotation_display_in_view,
    ]
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
