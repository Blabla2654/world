// API配置
var API="/api/docs/trash";

// 全局状态
var trashDocs=[];

// ── 初始化 ──────────────────────────────────────
function loadTrashDocs(){
    fetch(API).then(function(r){return r.ok?r.json():[]}).then(function(d){
        trashDocs=d;
        render();
    })["catch"](function(){
        trashDocs=[];
        render();
    });
}

function render(){
    renderStats();
    renderDocGrid();
}

function renderStats(){
    document.getElementById("stats").innerHTML=
        "<div class=stat-item><div class=stat-num>"+trashDocs.length+"</div><div class=stat-label>篇废弃文档</div></div>";
}

function stripHtml(html){if(!html)return"";return html.replace(/<[^>]*>/g,"").replace(/&nbsp;/g," ").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&amp;/g,"&").trim()}

function renderDocGrid(){
    if(trashDocs.length===0){
        document.getElementById("docGrid").innerHTML="";
        document.getElementById("emptyState").style.display="block";
        return;
    }
    document.getElementById("emptyState").style.display="none";
    var h="";
    trashDocs.forEach(function(d){
        var exc=stripHtml(d.body).substring(0,100)+(stripHtml(d.body).length>100?"…":"");
        var th=d.tags.map(function(t){return"<span class=doc-tag>"+t[0]+"<span class=sep> ‹ </span>"+t[1]+"</span>"}).join("");
        var delDate=d.deletedAt?"<span style='color:#ff6464'>删除于: "+d.deletedAt+"</span>":"";
        h+="<div class=doc-card data-uid="+d.uid+">"+
            "<div class=doc-card-header><div class=doc-title-row><div class=doc-title>"+d.title+"</div><div style='display:flex;gap:6px;align-items:center;flex-shrink:0'><div class=doc-uid>#"+d.uid+"</div></div></div>"+
            "<div class=doc-tags>"+th+"</div></div>"+
            "<div class=doc-excerpt>"+exc+"</div>"+
            "<div class=doc-meta><span>"+d.created+"</span><span>"+delDate+"</span></div>"+
            "<div style='margin-top:12px;display:flex;gap:8px'>"+
            "<button class='btn btn-ghost' style='flex:1' onclick='restoreDoc(\""+d.uid+"\")'>恢复</button>"+
            "<button class='btn btn-ghost' style='flex:1;color:#ff6464;border-color:rgba(255,100,100,0.3)' onclick='permanentDeleteDoc(\""+d.uid+"\")'>彻底删除</button>"+
            "</div>"+
            "</div>";
    });
    document.getElementById("docGrid").innerHTML=h;
}

// ── 恢复文档 ──────────────────────────────────────
function restoreDoc(uid){
    if(!confirm("确定恢复这篇文档？"))return;
    fetch("/api/docs/"+uid+"/restore",{method:"POST"}).then(function(r){return r.ok}).then(function(ok){
        if(ok){
            trashDocs=trashDocs.filter(function(d){return d.uid!==uid});
            render();
        }
    });
}

// ── 彻底删除 ──────────────────────────────────────
function permanentDeleteDoc(uid){
    if(!confirm("彻底删除后无法恢复，确定？"))return;
    fetch("/api/docs/"+uid,{
        method:"DELETE",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({permanent:true})
    }).then(function(r){return r.ok}).then(function(ok){
        if(ok){
            trashDocs=trashDocs.filter(function(d){return d.uid!==uid});
            render();
        }
    });
}

// ── 启动 ─────────────────────────────────────────
loadTrashDocs();
