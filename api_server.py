#!/usr/bin/env python3
"""世界观档案 API 服务器 - Flask + 内存缓存"""

import json
import os
import fcntl
import threading
from flask import Flask, request, jsonify

app = Flask(__name__)

# ── 配置 ──────────────────────────────────────────
DOCS_DIR = "/var/www/html/world/documents"
TAGS_FILE = "/var/www/html/world/tags.json"
LOCK_FILE = "/var/www/html/world/.lockfile"

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

# ── 启动时初始化缓存 ───────────────────────────────
def _init_cache():
    _cache["tags"] = load_tags_cache()
    _cache["docs"] = load_docs_cache()
    print(f"[init] tags={len(_cache['tags']['primary'])}, docs={len(_cache['docs'])}")

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
    with _cache_lock:
        before = len(_cache["docs"])
        _cache["docs"] = [d for d in _cache["docs"] if d.get("uid") != uid]
        deleted = before - len(_cache["docs"])
        delete_doc_cache(uid)
    return jsonify({"ok": True, "deleted": deleted})

# ── 启动 ──────────────────────────────────────────
if __name__ == "__main__":
    _init_cache()
    print("Flask API running on port 8081")
    app.run(host="0.0.0.0", port=8081, threaded=True)
