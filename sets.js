"use strict";
// Set Values tab: total raw market value of every card in each set (data/set_index.json, refreshed daily).
(()=>{let SV=null,svCat="all",svWin="chg7",PATH=[];
const GM={pokemon:"Pokémon",yugioh:"Yu-Gi-Oh",disney:"Disney",baseball:"Baseball",basketball:"Basketball",football:"Football"};
const CATS=[["all","All"],["tcg","TCG"],["sports","Sports"],["nonsport","Non-sport"]];
const lv=s=>[s.type,s.year||"?",...(s.type=="Pokémon"?[]:[s.maker||"?"])];const LVN=["Type","Year","Maker","Set"];
const big=v=>v==null?"—":v>=1e6?"$"+(v/1e6).toFixed(2)+"M":v>=1e4?"$"+(v/1e3).toFixed(1)+"K":fmt(v);
const spark=(a,up)=>{if(!a||a.length<2)return'<svg class="sv-spark" viewBox="0 0 100 28"><line x1="0" y1="20" x2="100" y2="20" stroke="#e3e7f0" stroke-width="2" stroke-dasharray="3 3"/><text x="50" y="14" font-size="8" text-anchor="middle" fill="#9aa3b5" font-family="Inter" font-weight="700">trend building</text></svg>';
 const mn=Math.min(...a),mx=Math.max(...a),r=mx-mn||1,p=a.map((v,i)=>`${(i/(a.length-1)*100).toFixed(1)},${(25-(v-mn)/r*22).toFixed(1)}`).join(" "),c=up?"#00a352":"#e5133d";
 return`<svg class="sv-spark" viewBox="0 0 100 28" preserveAspectRatio="none"><polyline points="${p}" fill="none" stroke="${c}" stroke-width="2.4" stroke-linejoin="round" vector-effect="non-scaling-stroke"/></svg>`};
let TH={};const im=u=>u&&u.startsWith("ygo:")?TH[u.slice(4)]:u;const pic=s=>im(s.logo||s.key_img);
function list(){const q=($("#svQ").value||"").toLowerCase(),so=$("#svSort").value;
 let a=SV.sets.filter(s=>(svCat=="all"||s.cat==svCat)&&(q?s.name.toLowerCase().includes(q):PATH.every((p,i)=>lv(s)[i]==p)));
 const n=v=>v??-Infinity;a.sort(so=="name"?(x,y)=>x.name.localeCompare(y.name):(x,y)=>n(y[so])-n(x[so]));return a}
function groupTiles(a){const d=PATH.length,m={};a.forEach(s=>{const k=lv(s)[d];(m[k]=m[k]||[]).push(s)});
 const R=Object.fromEntries((SV.rollups||[]).map(r=>[r.path.join(">"),r])),so=$("#svSort").value;
 let g=Object.entries(m).map(([k,xs])=>{const r=R[[...PATH,k].join(">")]||{},ok=xs.filter(s=>s.total!=null);return{k,xs,total:ok.length?ok.reduce((t,s)=>t+s.total,0):null,ok:ok.length,chg7:r.chg7??null,chg30:r.chg30??null,cards:ok.reduce((t,s)=>t+(s.priced||0),0),img:(ok.sort((x,y)=>y.total-x.total)[0]||xs[0]).logo||(ok[0]||xs[0]).key_img,game:xs[0].game}});
 const n=v=>v??-Infinity;g.sort(so=="name"?(x,y)=>String(x.k).localeCompare(y.k):LVN[d]=="Year"&&so=="total"?(x,y)=>String(y.k).localeCompare(x.k):(x,y)=>n(y[so])-n(x[so]));
 return g.map(x=>`<div class="sv-t sv-g g-${x.game}" data-go="${esc(x.k)}"><div class="sv-im"><span class="sv-tag">${LVN[d]}</span><span class="sv-gl">${esc(x.k)}</span></div><div class="sv-b"><div class="sv-n" style="height:auto">${x.xs.length} set${x.xs.length>1?"s":""} · ${x.ok} valued</div><div class="sv-v">${x.total==null?'<span style="font-size:17px;color:#aab3c8">Pending data</span>':big(x.total)}</div><div class="sv-row">${pill(x[svWin])}<span class="small">${x.cards.toLocaleString()} cards</span></div></div></div>`).join("")}
function crumb(){$("#svCrumb").innerHTML=[`<a data-lv="0" class="${PATH.length?"":"cur"}">All</a>`,...PATH.map((p,i)=>`<i>›</i><a data-lv="${i+1}" class="${i==PATH.length-1?"cur":""}">${esc(p)}</a>`)].join("")}
function render(){if(!SV)return;const a=list(),q=$("#svQ").value;crumb();hero(a);
 const leaf=q||(PATH.length&&PATH.length==(PATH[0]=="Pokémon"?2:3));
 if(!leaf){$("#svCats").innerHTML=CATS.map(([k,l])=>`<span class="c ${k==svCat?"on":""}" data-k="${k}">${l}<span class="n">${SV.sets.filter(s=>k=="all"||s.cat==k).length}</span></span>`).join("");$("#svGrid").innerHTML=groupTiles(a)||'<div class="empty">No sets match.</div>';return}
  $("#svGrid").innerHTML=a.map(s=>{const c=s[svWin],ok=s.total!=null;
  return`<div class="sv-t g-${s.game} ${ok?"":"pending"}" data-id="${esc(s.id)}"><div class="sv-im"><span class="sv-tag">${GM[s.game]}</span>${img(pic(s),"")}</div>
  <div class="sv-b"><div class="sv-n">${esc(s.name)}</div>${ok?`<div class="sv-v">${big(s.total)}</div><div class="sv-row">${pill(c)}<span class="small">${s.priced}/${s.cards} cards</span></div>${spark(s.spark,(c??0)>=0)}`:`<div class="sv-pend">Pending data</div><div class="small muted">${esc(s.note||(s.source=="none"?"No allowed bulk price source yet":"Source returned no prices"))}</div>`}</div></div>`}).join("")||'<div class="empty">No sets match.</div>'}
function board(){const v=SV.sets.filter(s=>s[svWin]!=null),lb=(arr,el)=>{$(el).innerHTML=arr.length?arr.map((s,i)=>`<div class="sv-lb" data-id="${esc(s.id)}"><span class="r">${i+1}</span><span class="n">${esc(s.name.replace(/^(Pokémon|Yu-Gi-Oh!) /,""))}</span>${pill(s[svWin])}</div>`).join(""):`<div class="small" style="opacity:.75;padding:4px 0 8px">Builds as daily snapshots accrue (7D needs a week of history).</div>`};
 const up=[...v].sort((a,b)=>b[svWin]-a[svWin]),dn=[...v].sort((a,b)=>a[svWin]-b[svWin]);lb(up.slice(0,5).filter(s=>s[svWin]>0),"#svHot");lb(dn.slice(0,5).filter(s=>s[svWin]<0),"#svCold")}
function hero(all){all=all||SV.sets;const ok=all.filter(s=>s.total!=null),t=ok.reduce((x,s)=>x+s.total,0),r=(SV.rollups||[]).find(r=>r.path.join(">")==PATH.join(">"));
 $("#svTotal").innerHTML=big(t)+(r?" "+pill(r[svWin]):"");$("#svSub").textContent=`${PATH.length?PATH.join(" › ")+" · ":"All sets · "}${ok.length} valued · ${all.length-ok.length} pending · raw · as of ${SV.date}`;
 $("#svNote").innerHTML="Raw (ungraded) value = sum of every priced card in the set. Sources: "+Object.values(SV.sources).map(esc).join(" · ")+". PSA 10 totals appear only where an allowed source provides graded prices (none yet). Sports and Disney sets stay 'pending data' until a licensed/allowed source exists. Change badges and sparklines fill in as daily snapshots build up. Nothing is estimated."}
function open(id){const s=SV.sets.find(x=>x.id==id);if(!s)return;
 openSheet(`<div class="hero">${img(pic(s),"")}<div><h3>${esc(s.name)}</h3><div class="big-num">${big(s.total)}</div>${s.total!=null?`<div class="small"><b>Raw</b> ${big(s.total)} · <b>PSA 10</b> ${s.psa10_total!=null?big(s.psa10_total):'<span class="muted">n/a from source</span>'}</div>`:""}<div>${pill(s.chg7)} <span class="small muted">7D</span> ${pill(s.chg30)} <span class="small muted">30D</span></div>
 <div class="small muted">${s.total!=null?`${s.priced} of ${s.cards} cards priced · ${esc(s.source_label)} · ${esc(s.as_of||"")}${s.status=="stale"?" (stale – last fetch failed)":""}`:"Pending: "+esc(s.error||"no data yet")}</div></div></div>
 ${spark(s.spark,(s.chg30??s.chg7??0)>=0).replace('class="sv-spark"','class="sv-spark" style="height:56px;margin:10px 0"')}
 <h3>Top cards by share of set value</h3>${(s.top5||[]).map((c,i)=>`<div class="sv-top"><span class="rk">${i+1}</span>${img(im(c.img))}<div class="mid" style="flex:1;min-width:0">${c.url?`<a href="${esc(c.url)}" target="_blank" rel="noopener"><b>${esc(c.name)}</b></a>`:`<b>${esc(c.name)}</b>`}<div class="sv-bar"><i style="width:${Math.min(100,c.share)}%"></i></div></div><div style="text-align:right"><b class="num">${c.share}%</b>${c.price!=null?`<div class="small muted">${fmt(c.price)}</div>`:""}</div></div>`).join("")||'<div class="empty">No card data yet.</div>'}`)}
document.addEventListener("click",e=>{const t=e.target.closest("#t-sets [data-id]:not([data-go])");if(t)open(t.dataset.id);const c=e.target.closest("#svCats .c");if(c){svCat=c.dataset.k;PATH=[];render()}
 const g=e.target.closest("[data-go]");if(g){PATH.push(g.dataset.go);render();$("#svCrumb").scrollIntoView({block:"nearest"})}
 const b=e.target.closest("#svCrumb a");if(b){PATH=PATH.slice(0,+b.dataset.lv);render()}
 const w=e.target.closest("#svWin button");if(w){svWin=w.dataset.v;$$("#svWin button").forEach(b=>b.classList.toggle("on",b==w));board();render()}});
$("#svQ").oninput=render;window.svOpen=open;if(location.hash.startsWith("#sets")){go("sets");PATH=location.hash.split("/").slice(1).map(decodeURIComponent)};$("#svSort").onchange=render;
fetch("data/ygo_thumbs.json?"+Date.now()).then(r=>r.json()).then(t=>{TH=t;SV&&render()}).catch(()=>{});
fetch("data/set_index.json?"+Date.now()).then(r=>r.json()).then(d=>{SV=d;board();render()}).catch(()=>{$("#svSub").textContent="Set data not available yet."})})();
