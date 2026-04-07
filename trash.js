var API_BASE = '/api';
var trashList = [];

function renderBody(body) {
    if (!body) return '';
    var html = body.replace(/\[IMG:([^\]]+)\]/g, function(m, src) {
        return '<img src="' + src + '" style="max-width:100%;border-radius:4px;margin:8px 0;">';
    });
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\$\{([^}]+)\}/g, '<mark>$1</mark>');
    html = html.split('\n').map(function(line) { return line.trim(); }).filter(function(l) { return l; }).join('</p><p>');
    return '<p>' + html + '</p>';
}

function stripHtml(html) { return html.replace(/<[^>]+>/g, ''); }

function formatDate(str) {
    if (!str) return '';
    var d = new Date(str);
    if (isNaN(d.getTime())) return str;
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

async function loadTrashDocs() {
    var listEl = document.getElementById('trashList');
    listEl.innerHTML = '<div class="trash-loading">加载中...</div>';
    try {
        var res = await fetch(API_BASE + '/docs/trash');
        if (!res.ok) throw new Error('加载失败');
        trashList = await res.json();
        renderTrashList();
    } catch (e) {
        listEl.innerHTML = '<div class="trash-error">加载失败：' + e.message + '</div>';
    }
}

async function restoreDoc(uid, title) {
    if (!confirm('确认还原「' + title + '」？')) return;
    try {
        var res = await fetch(API_BASE + '/docs/' + uid + '/restore', { method: 'POST' });
        if (!res.ok) throw new Error('还原失败');
        trashList = trashList.filter(function(d) { return d.uid !== uid; });
        renderTrashList();
    } catch (e) { alert('还原失败：' + e.message); }
}

async function deleteDoc(uid, title) {
    if (!confirm('彻底删除「' + title + '」？此操作不可恢复！')) return;
    try {
        var res = await fetch(API_BASE + '/docs/' + uid, { method: 'DELETE', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({permanent: true}) });
        if (!res.ok) throw new Error('删除失败');
        trashList = trashList.filter(function(d) { return d.uid !== uid; });
        renderTrashList();
    } catch (e) { alert('删除失败：' + e.message); }
}

async function emptyTrash() {
    if (!trashList || trashList.length === 0) { alert('没有文档'); return; }
    if (!confirm('确定彻底删除全部 ' + trashList.length + ' 篇文档？此操作不可恢复！')) return;
    var failed = 0;
    for (var i = 0; i < trashList.length; i++) {
        try {
            var res = await fetch(API_BASE + '/docs/' + trashList[i].uid, { method: 'DELETE', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({permanent: true}) });
            if (!res.ok) failed++;
        } catch(e) { failed++; }
    }
    if (failed > 0) alert('删除完成，' + failed + ' 篇删除失败');
    trashList = [];
    renderTrashList();
}

function viewDoc(uid) {
    var doc = trashList.find(function(d) { return d.uid === uid; });
    if (!doc) return;
    document.getElementById('viewDocTitle').textContent = doc.title || '无标题';
    document.getElementById('viewDocBody').innerHTML = renderBody(doc.body || '');
    document.getElementById('viewModal').style.display = 'flex';
}

function closeView() {
    document.getElementById('viewModal').style.display = 'none';
}

function renderTrashList() {
    var listEl = document.getElementById('trashList');
    var countEl = document.getElementById('trashCount');
    if (countEl) countEl.textContent = '废弃文档：' + trashList.length + ' 篇';
    if (!trashList || trashList.length === 0) {
        listEl.innerHTML = '<div class="trash-empty">废弃箱是空的</div>';
        return;
    }
    trashList.sort(function(a, b) {
        var ta = a.deletedAt ? new Date(a.deletedAt) : new Date(0);
        var tb = b.deletedAt ? new Date(b.deletedAt) : new Date(0);
        return tb - ta;
    });
    listEl.innerHTML = trashList.map(function(d) {
        var preview = stripHtml(d.body || '').substring(0, 80);
        if (preview.length >= 80) preview += '...';
        var escapedTitle = (d.title || '').replace(/'/g, "\\'");
        return '<div class="trash-card">' +
            '<div class="trash-info">' +
            '<div class="trash-title">' + (d.title || '无标题') + '</div>' +
            '<div class="trash-meta">删除于 ' + formatDate(d.deletedAt) + '</div>' +
            '<div class="trash-preview">' + preview + '</div>' +
            '</div>' +
            '<div class="trash-actions">' +
            '<button class="btn small" onclick="viewDoc(\'' + d.uid + '\')">查看</button>' +
            '<button class="btn small" onclick="restoreDoc(\'' + d.uid + '\', \'' + escapedTitle + '\')">还原</button>' +
            '<button class="btn small danger" onclick="deleteDoc(\'' + d.uid + '\', \'' + escapedTitle + '\')">彻底删除</button>' +
            '</div>' +
            '</div>';
    }).join('');
}

document.addEventListener('DOMContentLoaded', function() {
    var modal = document.getElementById('viewModal');
    modal.addEventListener('click', function(e) { if (e.target === modal) closeView(); });
    document.addEventListener('keydown', function(e) { if (e.key === 'Escape') closeView(); });
    loadTrashDocs();
});
