// 废弃文档页
var API_BASE = '/api';

function loadTrash(){
    var list=document.getElementById('trashList');
    list.innerHTML='<p class="loading-tip">加载中...</p>';
    fetch(API_BASE+'/docs')
        .then(r=>r.json())
        .then(docs=>{
            docs=docs.filter(d=>d._trash);
            document.getElementById('trashCount').textContent='废弃文档：'+docs.length+' 篇';
            if(docs.length===0){
                list.innerHTML='<p class="empty-tip">没有废弃文档</p>';return;
            }
            docs.sort((a,b)=>new Date(b._trashedAt||b.created)-new Date(a._trashedAt||a.created));
            var html='';
            docs.forEach(d=>{
                var created=d.created||'?';
                var tags=(d.tags||[]).map(t=>`<span class="tag-chip">${t[0]}</span>`).join('');
                html+=`
    <div class="trash-card" data-uid="${d.uid}">
        <div class="trash-info">
            <h3>${d.title||'无标题'}</h3>
            <p class="trash-preview">${(d.body||'').substring(0,100)}...</p>
            <div class="trash-tags">${tags}</div>
            <p class="trash-date">放入时间：${created}</p>
        </div>
        <div class="trash-actions">
            <button class="btn small" onclick="restoreDoc('${d.uid}')">还原</button>
            <button class="btn danger small" onclick="deleteDoc('${d.uid}')">永久删除</button>
        </div>
    </div>`;
            });
            list.innerHTML=html;
        })
        .catch(()=>{ list.innerHTML='<p class="error-tip">加载失败</p>'; });
}

// 还原
function restoreDoc(uid){
    fetch(API_BASE+'/docs/'+uid,{
        method:'PATCH',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({_trash:false})
    })
    .then(r=>r.json())
    .then(d=>{
        if(d.ok){
            var card=document.querySelector(`[data-uid="${uid}"]`);
            if(card)card.remove();
            var left=document.querySelectorAll(".trash-card").length;
            document.getElementById("trashCount").textContent=`废弃文档：${left} 篇`;
            if(left===0)document.getElementById("trashList").innerHTML="<p class='empty-tip'>没有废弃文档</p>";
        }
    });
}

// 永久删除
function deleteDoc(uid){
    if(!confirm("确定要永久删除这篇文档吗？\n删除后无法恢复。"))return;
    fetch(API_BASE+'/docs/'+uid,{method:"DELETE"})
        .then(r=>r.json())
        .then(d=>{
            if(d.ok){
                var card=document.querySelector(`[data-uid="${uid}"]`);
                if(card)card.remove();
                var left=document.querySelectorAll(".trash-card").length;
                document.getElementById("trashCount").textContent=`废弃文档：${left} 篇`;
                if(left===0)document.getElementById("trashList").innerHTML="<p class='empty-tip'>没有废弃文档</p>";
            }
        });
}

// 全部删除
async function emptyTrash(){
    var cards=document.querySelectorAll(".trash-card");
    var count=cards.length;
    if(count===0){alert("没有废弃文档");return;}
    if(!confirm(`确定要永久删除全部 ${count} 篇废弃文档吗？\n此操作不可恢复！`))return;
    var btn=document.getElementById("emptyAllBtn");
    btn.disabled=true;
    btn.textContent="删除中...";
    var fail=0;
    for(var i=0;i<count;i++){
        var uid=cards[i].getAttribute("data-uid");
        try{
            var r=await fetch(API_BASE+'/docs/'+uid,{method:"DELETE"});
            var d=await r.json();
            if(d.ok){
                cards[i].style.opacity="0.3";
                cards[i].style.pointerEvents="none";
            }else{fail++}
        }catch(e){fail++}
    }
    setTimeout(function(){
        loadTrash();
        btn.disabled=false;
        btn.textContent="🗑️ 全部删除";
        if(fail>0)alert("完成，"+fail+" 篇删除失败");
    },300);
}

// 页面加载时读取
window.addEventListener('load',loadTrash);
