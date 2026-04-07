// API配置
var API="/api/docs";
var TAGS_API="/api/tags";

// 全局状态
var docs=[];
var activePrimary=null,activeSecondary=null,currentViewUid=null;
var editTagPairs=[],editAnnotationsArr=[],pendingSelection=null;
var ALL_PRIMARY_TAGS=[];
var TAG_CHILDREN={};
var DEFAULT_TAGS={primary:[],children:{}};

// 编辑状态
var editMemory={title:"",body:"",tags:[],annotations:[]};
var editBodyText="";
var editBackupTimer=null;

// ── 初始化 ──────────────────────────────────────
function loadTags(){
    fetch(TAGS_API).then(function(r){return r.ok?r.json():null})["catch"](function(){return null}).then(function(t){
        if(t&&t.primary&&t.primary.length>0){
            ALL_PRIMARY_TAGS=t.primary||[];
            TAG_CHILDREN=t.children||{};
        }else{
            ALL_PRIMARY_TAGS=DEFAULT_TAGS.primary.slice();
            TAG_CHILDREN=JSON.parse(JSON.stringify(DEFAULT_TAGS.children));
            saveTags();
        }
        buildTagOptions();
        loadDocs();
    });
}

function saveTags(){
    fetch(TAGS_API,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({primary:ALL_PRIMARY_TAGS,children:TAG_CHILDREN})})["catch"](function(){});
}

function loadDocs(){
    fetch(API).then(function(r){return r.ok?r.json():getInitialDocs()}).then(function(d){
        docs=d;
        render();
    })["catch"](function(){
        docs=getInitialDocs();
        render();
    });
}

function getInitialDocs(){return []}

function saveDocs(){
    fetch(API,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(docs)})["catch"](function(){});
}

function generateUID(){return Math.random().toString(36).substring(2,10)}

// ── 渲染 ─────────────────────────────────────────
function render(){renderStats();renderTagBar();renderDocGrid()}

function renderStats(){
    var pc={};
    docs.forEach(function(d){d.tags.forEach(function(t){pc[t[0]]=(pc[t[0]]||0)+1})});
    document.getElementById("stats").innerHTML=
        "<div class=stat-item><div class=stat-num>"+docs.length+"</div><div class=stat-label>篇文档</div></div>"+
        "<div class=stat-item><div class=stat-num>"+Object.keys(pc).length+"</div><div class=stat-label>个分类</div></div>";
}

function renderTagBar(){
    var pc={},so={};
    docs.forEach(function(d){d.tags.forEach(function(t){
        pc[t[0]]=(pc[t[0]]||0)+1;
        if(!so[t[0]])so[t[0]]=[];
        so[t[0]].push(t[1]);
    })});
    var h="<span class='tag-primary "+(activePrimary?"":"active")+"' onclick=selectPrimary(null)>全部</span>";
    ALL_PRIMARY_TAGS.filter(function(p){return pc[p]}).forEach(function(p){
        h+="<span class='tag-primary "+(activePrimary===p?"active":"")+"' onclick='selectPrimary(\""+p+"\")'>"+p+" ("+pc[p]+")</span>";
    });
    document.getElementById("primaryTagRow").innerHTML=h;
    if(activePrimary&&so[activePrimary]){
        document.getElementById("secondaryLabel").style.display="block";
        var sh="<span class='tag-secondary "+(activeSecondary?"":"active")+"' onclick=selectSecondary(null)>全部 "+activePrimary+"</span>";
        so[activePrimary].sort().forEach(function(c){
            sh+="<span class='tag-secondary "+(activeSecondary===c?"active":"")+"' onclick='selectSecondary(\""+c+"\")'>"+c+"</span>";
        });
        document.getElementById("secondaryTagRow").innerHTML=sh;
    }else{
        document.getElementById("secondaryLabel").style.display="none";
        document.getElementById("secondaryTagRow").innerHTML="";
    }
}

function renderDocGrid(){
    var list=docs;
    var q=document.getElementById("searchInput").value.toLowerCase();
    if(q)list=list.filter(function(d){return d.title.toLowerCase().indexOf(q)>-1||d.body.toLowerCase().indexOf(q)>-1});
    if(activePrimary)list=list.filter(function(d){return d.tags.some(function(t){return t[0]===activePrimary&&(!activeSecondary||t[1]===activeSecondary)})});
    if(list.length===0){
        document.getElementById("docGrid").innerHTML="";
        document.getElementById("emptyState").style.display="block";
        return;
    }
    document.getElementById("emptyState").style.display="none";
    var h="";
    list.forEach(function(d){
        var exc=stripHtml(d.body).substring(0,100)+(stripHtml(d.body).length>100?"…":"");
        var th=d.tags.map(function(t){return"<span class=doc-tag>"+t[0]+"<span class=sep> ‹ </span>"+t[1]+"</span>"}).join("");
        var ac=d.annotations?d.annotations.length:0;
        var badge=ac>0?"<span style='color:#ffc832;font-size:0.75em'>📌 "+ac+"</span>":"";
        h+="<div class=doc-card data-uid="+d.uid+">"+
            "<div class=doc-card-header><div class=doc-title-row><div class=doc-title>"+d.title+"</div><div style='display:flex;gap:6px;align-items:center;flex-shrink:0'>"+badge+"<div class=doc-uid>#"+d.uid+"</div></div></div>"+
            "<div class=doc-tags>"+th+"</div></div>"+
            "<div class=doc-excerpt>"+exc+"</div>"+
            "<div class=doc-meta><span>"+d.created+"</span></div>"+
            "</div>";
    });
    document.getElementById("docGrid").innerHTML=h;
}

function filterDocs(){renderDocGrid()}

// ── 标签过滤 ─────────────────────────────────────
function selectPrimary(p){activePrimary=p;if(!p)activeSecondary=null;render()}
function selectSecondary(c){activeSecondary=c;render()}
function resetFilter(){activePrimary=null;activeSecondary=null;document.getElementById("searchInput").value="";render()}

// ── 工具函数 ─────────────────────────────────────
function stripHtml(html){if(!html)return"";return html.replace(/<[^>]*>/g,"").replace(/&nbsp;/g," ").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&amp;/g,"&").trim()}
function escapeHtml(s){return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")}

// ── 查看文档 ─────────────────────────────────────
function viewDoc(uid){
    var d=docs.find(function(x){return x.uid===uid});
    if(!d)return;
    currentViewUid=uid;
    closeAnnoPopup();
    [].slice.call(document.querySelectorAll(".modal-overlay")).forEach(function(m){m.classList.remove("open")});
    document.getElementById("viewTitle").textContent=d.title;
    document.getElementById("viewUid").textContent="文献编号: "+d.uid;
    document.getElementById("viewBody").innerHTML=renderViewBody(d.body,d.annotations);
    var ac=d.annotations?d.annotations.length:0;
    document.getElementById("viewAnnoCount").innerHTML=ac>0?"<span style='color:#ffc832;font-size:0.82em'>📌 "+ac+" 处标注</span>":"";
    document.getElementById("viewTags").innerHTML=d.tags.map(function(t){return"<span class=doc-tag>"+t[0]+"<span class=sep> ‹ </span>"+t[1]+"</span>"}).join("");
    openModal("viewModal");
}

function isHtmlContent(body){return/<(img|br|table|ul|ol|div|span)[^>]*>/i.test(body)}

function renderViewBody(body,annotations){
    if(!body)return"";
    if(isHtmlContent(body)){return renderBodyWithImages(body)}
    return renderAnnotatedBody(body,annotations);
}

function renderAnnotatedBody(body,annotations){
    // 正确顺序：先提取 [IMG:] 标记，再 HTML 转义，最后还原 <img>
    var _imgSrcs=[];var _imgIdx=0;
    var _body2=body.replace(/\[IMG:([^\]]+)\]\/g,function(m,src){_imgSrcs.push(src);return '\x1bIMG\x1b'+(_imgSrcs.length-1)+'\x1b';});
    var plain=escapeHtml(_body2).replace(/\n/g,"<br>");
    plain=plain.replace(/\x1bIMG\x1b(\d+)\x1b/g,function(m,idx){
        return '<img src="'+_imgSrcs[parseInt(idx)]+'" style="max-width:100%;height:auto;border-radius:6px;margin:8px 0" loading="lazy">';
    });
    if(!annotations||annotations.length===0)return renderBodyWithImages(plain);
    var sorted=annotations.slice().sort(function(a,b){return a.start-b.start});
    var r="",lastEnd=0;
    sorted.forEach(function(a){
        if(a.start>=a.end||a.start<lastEnd||a.end>body.length)return;
        r+=plain.substring(lastEnd,a.start);
        r+="<span class=doc-anno data-id="+a.id+" onclick=\"showAnnoPopup('"+a.id+"',event)\">"+escapeHtml(body.substring(a.start,a.end))+"</span>";
        lastEnd=a.end;
    });
    return renderBodyWithImages(r+plain.substring(lastEnd));
}

function renderBodyWithImages(html){
    return html.replace(/<img([^>]*)>/gi,function(match,attrs){
        if(attrs.includes('style='))attrs=attrs.replace(/style="[^"]*"/,'style="max-width:100%;height:auto;border-radius:6px;margin:8px 0"');
        else attrs+=' style="max-width:100%;height:auto;border-radius:6px;margin:8px 0"';
        return'<img'+attrs+'>';
    });
}

// ── 标注弹窗 ─────────────────────────────────────
function showAnnoPopup(annoId,event){
    var d=docs.find(function(x){return x.uid===currentViewUid});
    if(!d||!d.annotations)return;
    var a=d.annotations.find(function(x){return x.id===annoId});
    if(!a)return;
    document.getElementById("annoPopupTitle").textContent="📌 "+a.text;
    document.getElementById("annoPopupBody").textContent=a.note;
    var pop=document.getElementById("annoPopup");
    pop.classList.add("open");
    var rect=event.target.getBoundingClientRect();
    var vw=window.innerWidth,vh=window.innerHeight;
    var pw=pop.offsetWidth||320,ph=pop.offsetHeight||150;
    var top=rect.bottom+8;
    var left=rect.left-30;
    if(top+ph>vh)top=rect.top-ph-8;
    if(left+pw>vw)left=vw-pw-10;
    if(left<10)left=10;
    pop.style.top=top+"px";
    pop.style.left=left+"px";
    event.stopPropagation();
}

function closeAnnoPopup(){document.getElementById("annoPopup").classList.remove("open")}

// ── 弹窗控制 ─────────────────────────────────────
function openModal(id){var el=document.getElementById(id);if(el)el.classList.add("open")}
function closeModal(id){var el=document.getElementById(id);if(el){el.classList.remove("open");if(id==="viewModal")closeAnnoPopup();if(id==="editModal")stopEditBackup()}}

// ── 编辑：标签 ──────────────────────────────────
function buildTagOptions(){
    var s1=document.getElementById("editTagParentSelect");
    var s2=document.getElementById("newSecondaryParent");
    s1.innerHTML=ALL_PRIMARY_TAGS.map(function(t){return"<option value="+t+">"+t+"</option>"}).join("");
    s2.innerHTML=ALL_PRIMARY_TAGS.map(function(t){return"<option value="+t+">"+t+"</option>"}).join("");
    updateChildOptions();
}

function updateChildOptions(){
    var p=document.getElementById("editTagParentSelect").value;
    var cs=TAG_CHILDREN[p]||[];
    document.getElementById("editTagChildSelect").innerHTML=cs.map(function(t){return"<option value="+t+">"+t+"</option>"}).join("");
}

function addTagPair(){
    var p=document.getElementById("editTagParentSelect").value;
    var c=document.getElementById("editTagChildSelect").value;
    if(!editTagPairs.some(function(t){return t[0]===p&&t[1]===c})){
        editTagPairs.push([p,c]);
        renderEditTagSelects();
    }
}

function removeTagPair(i){editTagPairs.splice(i,1);renderEditTagSelects()}

function renderEditTagSelects(){
    document.getElementById("editSelectedTags").innerHTML=editTagPairs.map(function(t,i){
        return"<span class=selected-tag onclick=removeTagPair("+i+")>"+t[0]+" ‹ "+t[1]+" ×</span>"
    }).join("");
}

function addNewPrimaryTag(){
    var v=document.getElementById("newPrimaryTag").value.trim();
    if(!v)return;
    syncEditMemory();
    if(ALL_PRIMARY_TAGS.indexOf(v)===-1){ALL_PRIMARY_TAGS.push(v);TAG_CHILDREN[v]=[]}
    saveTags();
    buildTagOptions();
    renderTagBar();
    restoreEditMemory();
    renderEditAnnoList();
    document.getElementById("newPrimaryTag").value="";
}

function addNewSecondaryTag(){
    var p=document.getElementById("newSecondaryParent").value;
    var v=document.getElementById("newSecondaryTag").value.trim();
    if(!p||!v)return;
    syncEditMemory();
    if(!TAG_CHILDREN[p])TAG_CHILDREN[p]=[];
    if(TAG_CHILDREN[p].indexOf(v)===-1)TAG_CHILDREN[p].push(v);
    saveTags();
    buildTagOptions();
    renderTagBar();
    restoreEditMemory();
    renderEditAnnoList();
    document.getElementById("newSecondaryTag").value="";
}

// ── 编辑：备份 ──────────────────────────────────
function syncEditMemory(){
    editMemory.title=document.getElementById("editTitle").value.trim();
    // 使用innerText获取视觉文本（含嵌套div产生的换行），转为\n标准格式
    // 注意：innerText将<br>和div边界都转为\n，与syncAnnoSelection的marker法(textContent)不同
    // 为保持一致，标注位置计算用textContent基准，存储用innerText基准
    var rawText=document.getElementById("editBodyWrap").innerText||"";
    editBodyText=rawText.replace(/\r?\n/g,"\n");
    editMemory.body=editBodyText;
    editMemory.tags=editTagPairs.slice();
    editMemory.annotations=editAnnotationsArr.slice();
}

function restoreEditMemory(){
    if(editMemory.title){document.getElementById("editTitle").value=editMemory.title}
    if(editMemory.body){
        // editMemory.body 存的是纯文本（\n格式），转回 <br> 再写入
        var body2=editMemory.body.replace(/&lt;IMG:([^&]+)&gt;/g,function(m,src){return "[IMG:"+src+"]";}).replace(/&amp;/g,"&").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/\[IMG:([^\]]+)\]\/g,function(m,src){return '<img src="'+src+'" style="max-width:100%;height:auto;border-radius:6px;margin:8px 0" loading="lazy">';});
        document.getElementById("editBodyWrap").innerHTML=body2.replace(/\n/g,"<br>");
        editBodyText=editMemory.body;
    }
    editTagPairs=editMemory.tags.slice();
    editAnnotationsArr=editMemory.annotations.slice();
}

function getEditBody(){return editBodyText||document.getElementById("editBodyWrap").textContent||""}

function startEditBackup(){stopEditBackup();editBackupTimer=setInterval(syncEditMemory,2000)}
function stopEditBackup(){if(editBackupTimer){clearInterval(editBackupTimer);editBackupTimer=null}}
function backupNow(){syncEditMemory()}

// ── 编辑：新建/打开 ─────────────────────────────
function openNewDoc(){
    document.getElementById("docMode").value="new";
    document.getElementById("docModalTitle").textContent="新建文档";
    document.getElementById("deleteDocBtn").style.display="none";
    document.getElementById("editUid").value="";
    document.getElementById("editTitle").value="";
    editTagPairs=[];
    editAnnotationsArr=[];
    editBodyText="";
    buildTagOptions();
    renderEditTagSelects();
    document.getElementById("editBodyWrap").innerHTML="";
    renderEditAnnoList();
    cancelAddAnnotation();
    openModal("editModal");
    startEditBackup();
}

function openEditFromView(){
    var d=docs.find(function(x){return x.uid===currentViewUid});
    if(!d)return;
    document.getElementById("docMode").value="edit";
    document.getElementById("docModalTitle").textContent="编辑文档";
    document.getElementById("deleteDocBtn").style.display="flex";
    document.getElementById("editUid").value=d.uid;
    document.getElementById("editTitle").value=d.title;
    editTagPairs=(d.tags||[]).map(function(t){return t.slice()});
    editAnnotationsArr=(d.annotations||[]).map(function(a){return Object.assign({},a)});
    buildTagOptions();
    renderEditTagSelects();
    renderEditBodyWithAnnotations(stripHtml(d.body),editAnnotationsArr);
    renderEditAnnoList();
    pendingSelection=null;
    var btn=document.getElementById("annoFloatBtn");
    if(btn)btn.style.display="none";
    window.getSelection().removeAllRanges();
    closeModal("viewModal");
    openModal("editModal");
    startEditBackup();
}

// ── 编辑：正文 ──────────────────────────────────
function renderEditBodyWithAnnotations(body,annotations){
    var div=document.getElementById("editBodyWrap");
    editBodyText=body;
    // 处理图片标记 [IMG:src] → <img src="src">
    // 正确顺序：先提取 [IMG:] 标记，再 HTML 转义，最后还原 <img>
    var _imgSrcs=[];
    var _bodyForImg=body.replace(/\[IMG:([^\]]+)\]\/g,function(m,src){_imgSrcs.push(src);return '\x1bIMG\x1b'+(_imgSrcs.length-1)+'\x1b';});
    var plain=_bodyForImg.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\n/g,"<br>");
    var displayHtml=plain.replace(/\x1bIMG\x1b(\d+)\x1b/g,function(m,idx){
        return '<img src="'+_imgSrcs[parseInt(idx)]+'" style="max-width:100%;height:auto;border-radius:6px;margin:8px 0" loading="lazy">';
    });
    if(!annotations||annotations.length===0){div.innerHTML=displayHtml;return}
    var sorted=annotations.slice().sort(function(a,b){return a.start-b.start});
    var html="",lastEnd=0;
    sorted.forEach(function(a){
        if(a.start>=a.end||a.start<lastEnd||a.end>body.length)return;
        html+=escapeHtml(body.substring(lastEnd,a.start));
        html+="<span class='doc-anno editable-anno' data-id="+a.id+" title="+escapeHtml(a.note)+" onclick=\"focusAnnotation('"+a.id+"')\">"+escapeHtml(body.substring(a.start,a.end))+"</span>";
        lastEnd=a.end;
    });
    html+=escapeHtml(body.substring(lastEnd));
    // 同理：先提取 [IMG:] 再转义最后还原 <img>
    html=html.replace(/\[IMG:([^\]]+)\]\/g,function(m,src){_imgSrcs.push(src);return '\x1bIMG\x1b'+(_imgSrcs.length-1)+'\x1b';});
    html=html.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\n/g,"<br>");
    html=html.replace(/\x1bIMG\x1b(\d+)\x1b/g,function(m,idx){
        return '<img src="'+_imgSrcs[parseInt(idx)]+'" style="max-width:100%;height:auto;border-radius:6px;margin:8px 0" loading="lazy">';
    });
    div.innerHTML=html;
}

function focusAnnotation(id){
    [].slice.call(document.querySelectorAll(".doc-anno.anno-active")).forEach(function(el){el.classList.remove("anno-active")});
    var span=document.querySelector("#editBodyWrap .doc-anno[data-id="+id+"]");
    if(span){span.classList.add("anno-active");span.scrollIntoView({behavior:"smooth",block:"center"})}
}

// ── 编辑：标注 ──────────────────────────────────
function syncAnnoSelection(){
    var sel=window.getSelection();
    if(!sel||sel.rangeCount===0||sel.isCollapsed){
        // 仅清除浮层按钮，不清除 cursor
        var btn=document.getElementById("annoFloatBtn");
        if(btn)btn.style.display="none";
        pendingSelection=null;
        return;
    }
    var range=sel.getRangeAt(0);
    var div=document.getElementById("editBodyWrap");
    if(!div||!div.contains(range.commonAncestorContainer)){
        cancelAddAnnotation();
        return;
    }
    var text=sel.toString().trim();
    if(!text){
        cancelAddAnnotation();
        return;
    }
    // 计算选中文本在 div.textContent 中的字符偏移量
    // 思路: 在range起点插入临时节点，读取其在textContent中的位置后移除
    var marker=document.createElement("span");
    marker.style.display="none";
    marker.textContent="\u0000";
    var range2=range.cloneRange();
    range2.collapse(true);
    range2.insertNode(marker);
    var fullText=div.textContent||"";
    var markerOffset=fullText.indexOf("\u0000");
    marker.parentNode.removeChild(marker);
    // 恢复原始选区
    window.getSelection().removeAllRanges();
    window.getSelection().addRange(range);
    pendingSelection={text:text,start:markerOffset,end:markerOffset+text.length};
    // 按钮显示在选中区域下方
    var selRect=range.getBoundingClientRect();
    var btn=document.getElementById("annoFloatBtn");
    var btnH=36,btnW=110;
    var top=selRect.bottom+8;
    var left=selRect.left;
    if(top+btnH>window.innerHeight)top=selRect.top-btnH-8;
    if(left+btnW>window.innerWidth)left=window.innerWidth-btnW-10;
    if(left<10)left=10;
    btn.style.top=top+window.scrollY+"px";
    btn.style.left=left+window.scrollX+"px";
    btn.style.display="block";
}

function confirmAddAnnotation(){
    if(!pendingSelection){return}
    var note=prompt("输入备注内容：");
    if(!note||!note.trim()){cancelAddAnnotation();return}
    editAnnotationsArr.push({id:"anno_"+Date.now(),text:pendingSelection.text,start:pendingSelection.start,end:pendingSelection.end,note:note.trim()});
    window.getSelection().removeAllRanges();
    cancelAddAnnotation();
    renderEditBodyWithAnnotations(getEditBody(),editAnnotationsArr);
    renderEditAnnoList();
}

function cancelAddAnnotation(){
    pendingSelection=null;
    var btn=document.getElementById("annoFloatBtn");
    if(btn)btn.style.display="none";
    // 不再清除 window.selection，保留 cursor 位置
}

function removeEditAnnotation(id){
    backupNow();
    var div=document.getElementById("editBodyWrap");
    var span=div.querySelector('.doc-anno[data-id="'+id+'"]');
    if(span){
        var textNode=document.createTextNode(span.textContent);
        span.parentNode.replaceChild(textNode,span);
    }
    editAnnotationsArr=editAnnotationsArr.filter(function(a){return a.id!==id});
    recalcAnnotationPositions();
    // 规范化newlines
    div.innerHTML=div.innerHTML.replace(/<br\s*\/?>/gi,"\n");
    editBodyText=div.textContent;
    renderEditBodyWithAnnotations(editBodyText,editAnnotationsArr);
    renderEditAnnoList();
}

function editAnnoNote2(id){
    backupNow();
    var a=editAnnotationsArr.find(function(x){return x.id===id});
    if(!a)return;
    var n=prompt("修改标注内容：",a.note);
    if(n!==null&&n.trim())a.note=n.trim();
    renderEditBodyWithAnnotations(getEditBody(),editAnnotationsArr);
    renderEditAnnoList();
}

function renderEditAnnoList(){
    document.getElementById("editAnnoCount").textContent=editAnnotationsArr.length;
    if(editAnnotationsArr.length===0){
        document.getElementById("editAnnoList").innerHTML="<div style='color:var(--text-dim);font-size:0.85em;text-align:center;padding:20px'>暂无标注<br><span style='font-size:0.85em'>在正文中选中文字后添加</span></div>";
        return;
    }
    document.getElementById("editAnnoList").innerHTML=editAnnotationsArr.map(function(a){
        return"<div style='margin-bottom:8px;padding:10px 14px;background:var(--bg);border-radius:8px;border:1px solid var(--border);cursor:pointer' onclick=focusAnnotation(\""+a.id+"\")>"+
            "<div style='display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px'>"+
            "<span style='color:#ffc832;font-size:0.9em;font-weight:bold'>'"+a.text+"'</span>"+
            "<div style='display:flex;gap:6px;flex-shrink:0' onclick=event.stopPropagation()>"+
            "<button class='btn btn-ghost' style='padding:3px 10px;font-size:0.75em' onclick=editAnnoNote2(\""+a.id+"\")>编辑</button>"+
            "<button class='btn btn-ghost' style='padding:3px 10px;font-size:0.75em;color:#ff6464' onclick=removeEditAnnotation(\""+a.id+"\")>删除</button>"+
            "</div></div>"+
            "<div style='color:var(--text-dim);font-size:0.85em;line-height:1.6'>"+a.note+"</div>"+
            "</div>";
    }).join("");
}

// ── 编辑：图片 ──────────────────────────────────
function handleImageUpload(input){
    if(!input.files||!input.files[0])return;
    var file=input.files[0];
    if(!file.type.startsWith("image/")){alert("请选择图片文件");return}
    document.getElementById("imgUploadStatus").textContent="上传中...";
    var formData=new FormData();
    formData.append("file",file);
    fetch("/api/upload",{method:"POST",body:formData}).then(function(r){return r.json()}).then(function(result){
        document.getElementById("imgUploadStatus").textContent="";
        if(result.error){alert(result.error);return}
        insertImageAtCursor(result.url);
        input.value="";
    })["catch"](function(err){
        document.getElementById("imgUploadStatus").textContent="";
        alert("上传失败: "+err);
    });
}

function insertImageAtCursor(url){
    var div=document.getElementById("editBodyWrap");
    var img='<img src="'+url+'" style="max-width:100%;height:auto;border-radius:6px;margin:8px 0" loading="lazy">';
    div.focus();
    var sel=window.getSelection();
    if(sel&&sel.rangeCount>0){
        var range=sel.getRangeAt(0);
        range.collapse(false);
        var dummy=document.createElement("span");
        dummy.innerHTML=img;
        range.insertNode(dummy);
        range.setStartAfter(dummy);
        range.setEndAfter(dummy);
        range.collapse(false);
        sel.removeAllRanges();
        sel.addRange(range);
    }else{
        var needsBreak=div.textContent.length>0&&!div.innerHTML.endsWith("<br>");
        if(needsBreak)div.innerHTML+="<br>";
        div.innerHTML+=img+"<br>";
    }
    syncEditMemory();
}

// ── 编辑：保存/删除 ─────────────────────────────
async function saveDoc(){
    var mode=document.getElementById("docMode").value;
    var title=document.getElementById("editTitle").value.trim();
    var bodyDiv=document.getElementById("editBodyWrap");
    // 使用innerText获取视觉文本（含正确换行），避免嵌套div导致的innerHTML顺序错乱
    // 图片：读取innerHTML中的<img>标签，追加[IMG:src]标记
    var imgs=bodyDiv.querySelectorAll("img");
    var imgMap=[];
    imgs.forEach(function(img){imgMap.push(img.getAttribute("src")||"")});
    var body=(bodyDiv.innerText||"").replace(/\r?\n/g,"\n").replace(/\n{3,}/g,"\n\n");
    imgMap.forEach(function(src){
        if(src)body+="\n[IMG:"+src+"]";
    });
    body=body.replace(/\n+$/,"");
    if(!title){alert("请输入标题");return}
    stopEditBackup();
    // 重新计算标注位置
    recalcAnnotationPositions();
    if(mode==="new"){
        var doc={uid:generateUID(),title:title,body:body||"\n",tags:editTagPairs.slice(),annotations:editAnnotationsArr.slice(),created:new Date().toISOString().split("T")[0]};
        docs.unshift(doc);
    }else{
        var uid=document.getElementById("editUid").value;
        var idx=docs.findIndex(function(x){return x.uid===uid});
        if(idx!==-1){
            docs[idx]={uid:uid,title:title,body:body,tags:editTagPairs.slice(),annotations:editAnnotationsArr.slice(),created:docs[idx].created};
        }
    }
    await saveDocs();
    closeModal("editModal");
    buildTagOptions();
    render();
    if(mode==="edit"&&currentViewUid){
        viewDoc(currentViewUid);
        openModal("viewModal");
    }
}

function recalcAnnotationPositions(){
    var div=document.getElementById("editBodyWrap");
    var spans=div.querySelectorAll(".doc-anno");
    spans.forEach(function(span){
        var id=span.getAttribute("data-id");
        var anno=editAnnotationsArr.find(function(a){return a.id===id});
        if(anno){
            var pre=document.createRange();
            pre.selectNodeContents(div);
            pre.setEnd(span,0);
            anno.start=pre.toString().length;
            anno.end=anno.start+span.textContent.length;
        }
    });
}

async function deleteDoc(){
    if(!confirm("确定删除这篇文档？"))return;
    stopEditBackup();
    var uid=document.getElementById("editUid").value;
    await fetch("/api/docs/"+uid,{method:"DELETE",headers:{"Content-Type":"application/json"},body:JSON.stringify({})});
    docs=docs.filter(function(x){return x.uid!==uid});
    closeModal("editModal");
    currentViewUid=null;
    buildTagOptions();
    render();
}

// ── 事件监听 ─────────────────────────────────────
document.addEventListener("keydown",function(e){
    if(e.key==="Escape"){
        document.querySelectorAll(".modal-overlay").forEach(function(m){m.classList.remove("open")});
        closeAnnoPopup();
    }
});

document.addEventListener("click",function(e){
    if(e.target.classList.contains("modal-overlay"))e.target.classList.remove("open");
    var card=e.target.closest(".doc-card");
    if(card){
        var uid=card.getAttribute("data-uid");
        if(uid)viewDoc(uid);
    }
});

document.addEventListener("scroll",function(){
    if(document.getElementById("editModal").classList.contains("open")){
        // 仅隐藏浮层，不清除 cursor
        var btn=document.getElementById("annoFloatBtn");
        if(btn)btn.style.display="none";
        pendingSelection=null;
    }
},{passive:true});

document.getElementById("editTagParentSelect").addEventListener("change",updateChildOptions);
document.getElementById("newSecondaryParent").addEventListener("change",updateChildOptions);

// ── 启动 ─────────────────────────────────────────
loadTags();

// ── 推送到 Git ───────────────────────────────────
var _pushing = false;
async function pushToGit() {
    if (_pushing) return;
    _pushing = true;
    var btn = document.querySelector('button[onclick="pushToGit()"]');
    var oldText = btn ? btn.textContent : '';
    if (btn) { btn.textContent = '⬆ 推送中...'; btn.disabled = true; }
    try {
        var res = await fetch('/api/git/push', { method: 'POST' });
        var data = await res.json();
        if (data.ok) {
            alert('✅ ' + data.message);
        } else {
            alert('❌ 推送失败：' + (data.error || '未知错误'));
        }
    } catch(e) {
        alert('❌ 推送失败：' + e.message);
    } finally {
        if (btn) { btn.textContent = oldText; btn.disabled = false; }
        _pushing = false;
    }
}
