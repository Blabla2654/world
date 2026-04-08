#!/usr/bin/env python3
"""世界观档案 API 服务器 - Flask + 内存缓存"""

import json
import os
import subprocess
import time
from datetime import datetime
import fcntl
import threading
from flask import Flask, request, jsonify

app = Flask(__name__)

# ── 配置 ──────────────────────────────────────────
DOCS_DIR = "/var/www/html/world/documents"
TRASH_DIR = "/var/www/html/world/trash"
TAGS_FILE = "/var/www/html/world/tags.json"
LOCK_FILE = "/var/www/html/world/.lockfile"
UPLOAD_DIR = "/var/www/html/world/assets/images"
ALLOWED_EXTENSIONS = {"png", "jpg", "jpeg", "gif", "webp", "bmp"}

# ── 内存缓存 ─────────────────────────────────────
_cache = {"tags": None, "docs": None}
_cache_lock = threading.Lock()

# ── 锁工具 ───────────────────────────────────────
def flock(lock_type="shared"):
    lockfd = open(LOCK_FILE, 'a')
    fcntl.flock(lockfd.fileno(), fcntl.LOCK_EX if lock_type == "exclusive" else fcntl.LOCK_SH)
    return lockfd

def funlock(lockfd):
    fcntl.flock(lockfd.fileno(), fcntl.LOCK_UN)
    lockfd.close()

# ── 文件读写（带锁）────────────────────────────────
def write_file(path, content):
    with flock("exclusive"):
        with open(path, "w", encoding="utf-8") as f:
            f.write(content)

# ── 标签缓存操作 ──────────────────────────────────
def load_tags_cache():
    with flock("shared"):
        if os.path.exists(TAGS_FILE):
            with open(TAGS_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
    default = {
        "primary": ["地理", "角色", "基础设定", "科技", "历史", "势力", "事件", "职业"],
        "children": {
            "地理": ["浮岛", "城市", "气候", "地形", "海域"],
            "角色": ["能力体系", "阵营", "职业", "种族", "身份"],
            "基础设定": ["世界观", "法则", "时间", "货币", "语言"],
            "科技": ["符文", "机械", "炼金", "蒸汽", "禁忌"],
            "历史": ["年表", "事件", "人物", "文明", "战争"],
            "势力": ["政权", "组织", "家族", "公会", "教派"],
            "事件": ["灾变", "政治", "军事", "文化", "神秘"],
            "职业": ["工匠", "旅人", "战士", "学者", "商人"]
        }
    }
    write_file(TAGS_FILE, json.dumps(default, ensure_ascii=False, indent=2))
    return default

def save_tags_cache(tags):
    write_file(TAGS_FILE, json.dumps(tags, ensure_ascii=False, indent=2))

# ── 文档缓存操作 ─────────────────────────────────
def load_docs_cache():
    docs = []
    lockfd = flock("shared")
    try:
        if os.path.isdir(DOCS_DIR):
            for fname in sorted(os.listdir(DOCS_DIR)):
                if fname.endswith(".json"):
                    fpath = os.path.join(DOCS_DIR, fname)
                    with open(fpath, "r", encoding="utf-8") as f:
                        try:
                            docs.append(json.load(f))
                        except Exception:
                            pass
    finally:
        funlock(lockfd)
    return docs

def save_doc_cache(doc):
    uid = doc.get("uid")
    if not uid:
        return
    lockfd = flock("exclusive")
    try:
        if not os.path.isdir(DOCS_DIR):
            os.makedirs(DOCS_DIR)
        fpath = os.path.join(DOCS_DIR, f"{uid}.json")
        with open(fpath, "w", encoding="utf-8") as f:
            json.dump(doc, f, ensure_ascii=False, indent=2)
    finally:
        funlock(lockfd)

def delete_doc_cache(uid):
    lockfd = flock("exclusive")
    try:
        fpath = os.path.join(DOCS_DIR, f"{uid}.json")
        if os.path.exists(fpath):
            os.remove(fpath)
            return True
        return False
    finally:
        funlock(lockfd)

# ── 废弃文档缓存操作 ─────────────────────────────────
def load_trash_cache():
    docs = []
    lockfd = flock("shared")
    try:
        if os.path.isdir(TRASH_DIR):
            for fname in sorted(os.listdir(TRASH_DIR)):
                if fname.endswith(".json"):
                    fpath = os.path.join(TRASH_DIR, fname)
                    with open(fpath, "r", encoding="utf-8") as f:
                        try:
                            docs.append(json.load(f))
                        except Exception:
                            pass
    finally:
        funlock(lockfd)
    return docs

def save_trash_cache(doc):
    uid = doc.get("uid")
    if not uid:
        return
    lockfd = flock("exclusive")
    try:
        if not os.path.isdir(TRASH_DIR):
            os.makedirs(TRASH_DIR)
        fpath = os.path.join(TRASH_DIR, f"{uid}.json")
        with open(fpath, "w", encoding="utf-8") as f:
            json.dump(doc, f, ensure_ascii=False, indent=2)
    finally:
        funlock(lockfd)

def delete_trash_cache(uid):
    lockfd = flock("exclusive")
    try:
        fpath = os.path.join(TRASH_DIR, f"{uid}.json")
        if os.path.exists(fpath):
            os.remove(fpath)
            return True
        return False
    finally:
        funlock(lockfd)

# ── 启动时初始化缓存 ───────────────────────────────
_trash_cache = {"docs": []}

def _init_cache():
    _cache["tags"] = load_tags_cache()
    _cache["docs"] = load_docs_cache()
    _trash_cache["docs"] = load_trash_cache()
    print(f"[init] tags={len(_cache['tags']['primary'])}, docs={len(_cache['docs'])}, trash={len(_trash_cache['docs'])}")

# ── 路由 ──────────────────────────────────────────
@app.route("/api/tags", methods=["GET"])
def get_tags():
    return jsonify(_cache["tags"])

@app.route("/api/tags", methods=["POST"])
def save_tags():
    tags = request.get_json()
    if not isinstance(tags, dict):
        return jsonify({"error": "invalid data"}), 400
    with _cache_lock:
        _cache["tags"]["primary"] = tags.get("primary", [])
        _cache["tags"]["children"] = tags.get("children", {})
        save_tags_cache(_cache["tags"])
    return jsonify({"ok": True})

@app.route("/api/docs", methods=["GET"])
def get_docs():
    return jsonify(_cache["docs"])

@app.route("/api/docs", methods=["POST"])
def save_docs():
    data = request.get_json()
    if not data:
        return jsonify({"error": "invalid data"}), 400
    # 支持单个文档或文档数组，遍历全部保存
    doc_list = data if isinstance(data, list) else [data]
    with _cache_lock:
        for doc in doc_list:
            uid = doc.get("uid")
            if not uid:
                continue
            # 更新内存缓存
            for i, d in enumerate(_cache["docs"]):
                if d.get("uid") == uid:
                    _cache["docs"][i] = doc
                    break
            else:
                _cache["docs"].insert(0, doc)
            # 写文件
            save_doc_cache(doc)
    return jsonify({"ok": True})

@app.route("/api/docs/<uid>", methods=["DELETE"])
def delete_doc(uid):
    permanent = request.get_json(silent=True).get("permanent", False) if request.get_json(silent=True) else False
    if permanent:
        # 彻底删除
        with _cache_lock:
            before = len(_cache["docs"])
            _cache["docs"] = [d for d in _cache["docs"] if d.get("uid") != uid]
            _trash_cache["docs"] = [d for d in _trash_cache["docs"] if d.get("uid") != uid]
            delete_doc_cache(uid)
            delete_trash_cache(uid)
        return jsonify({"ok": True, "deleted": 1})
    else:
        # 移入废弃区
        with _cache_lock:
            doc = None
            for d in _cache["docs"]:
                if d.get("uid") == uid:
                    doc = d
                    break
            if doc:
                from datetime import datetime
                doc["deletedAt"] = datetime.now().strftime("%Y-%m-%d %H:%M")
                _trash_cache["docs"].insert(0, doc)
                _cache["docs"] = [d for d in _cache["docs"] if d.get("uid") != uid]
                delete_doc_cache(uid)
                save_trash_cache(doc)
                return jsonify({"ok": True, "moved_to_trash": True})
        return jsonify({"ok": False, "error": "doc not found"}), 404

@app.route("/api/docs/trash", methods=["GET"])
def get_trash_docs():
    return jsonify(_trash_cache["docs"])

@app.route("/api/docs/<uid>/restore", methods=["POST"])
def restore_doc(uid):
    with _cache_lock:
        doc = None
        for d in _trash_cache["docs"]:
            if d.get("uid") == uid:
                doc = d
                break
        if doc:
            if "deletedAt" in doc:
                del doc["deletedAt"]
            _cache["docs"].insert(0, doc)
            _trash_cache["docs"] = [d for d in _trash_cache["docs"] if d.get("uid") != uid]
            delete_trash_cache(uid)
            save_doc_cache(doc)
            return jsonify({"ok": True})
    return jsonify({"ok": False, "error": "doc not found in trash"}), 404

@app.route("/api/upload", methods=["POST"])
def upload_image():
    """上传图片，返回 URL 路径"""
    if "file" not in request.files:
        return jsonify({"error": "没有文件"}), 400
    file = request.files["file"]
    if file.filename == "":
        return jsonify({"error": "文件名为空"}), 400
    ext = file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else ""
    if ext not in ALLOWED_EXTENSIONS:
        return jsonify({"error": f"不支持的图片格式: {ext}"}), 400
    if not os.path.isdir(UPLOAD_DIR):
        os.makedirs(UPLOAD_DIR)
    import uuid
    filename = f"{uuid.uuid4().hex}.{ext}"
    fpath = os.path.join(UPLOAD_DIR, filename)
    file.save(fpath)
    url = f"/assets/images/{filename}"
    return jsonify({"url": url, "filename": filename})


@app.route("/api/git/push", methods=["POST"])
def git_push():
    """推送文档改动到 GitHub"""
    try:
        repo = os.path.dirname(os.path.abspath(__file__))
        now = datetime.now().strftime("%Y-%m-%d %H:%M")
        # git add
        env = {**os.environ, "GIT_TERMINAL_PROMPT": "0"}
        r1 = subprocess.run(["git", "add", "documents/", "trash/", "assets/"], cwd=repo, capture_output=True, text=True, timeout=30, env=env)
        # git commit
        r2 = subprocess.run(
            ["git", "commit", "-m", f"Auto-push: {now}"],
            cwd=repo, capture_output=True, text=True, timeout=30, env=env
        )
        # git push
        r3 = subprocess.run(
            ["git", "push", "origin", "main"],
            cwd=repo, capture_output=True, text=True, timeout=60, env=env
        )
        if r3.returncode == 0:
            return jsonify({"ok": True, "message": f"推送成功 ({now})"})
        else:
            return jsonify({"ok": False, "error": r3.stderr or r3.stdout}), 500
    except subprocess.TimeoutExpired:
        return jsonify({"ok": False, "error": "推送超时"}), 500
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


@app.route("/api/reload", methods=["POST"])
def reload_cache():
    """从硬盘重新加载文档缓存"""
    try:
        _init_cache()
        return jsonify({"ok": True, "message": f"已重新加载 (文档数: {len(_cache['docs'])})"})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500

# ── 启动 ──────────────────────────────────────────
if __name__ == "__main__":
    _init_cache()
    print("Flask API running on port 8081")
    app.run(host="0.0.0.0", port=8081, threaded=True)
