"use strict";
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const LS={get:(k,d)=>{try{return JSON.parse(localStorage.getItem(k))??d}catch{return d}},set:(k,v)=>localStorage.setItem(k,JSON.stringify(v))};
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const fmt=(v,cur="$")=>v==null||isNaN(v)?"—":cur+Number(v).toLocaleString("en-US",{maximumFractionDigits:v<100?2:0,minimumFractionDigits:v<100&&v%1?2:0});
const pill=v=>v==null?'<span class="pill na">—</span>':`<span class="pill ${v>=0?"up":"dn"}">${v>0?"▲":v<0?"▼":""}${Math.abs(v)}%</span>`;
const PH="data:image/svg+xml,"+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 63 88"><rect width="63" height="88" rx="6" fill="#e3e7f0"/><text x="31.5" y="50" font-size="22" text-anchor="middle" fill="#9aa3b5">🃏</text></svg>');
const img=(src,cls="thumb")=>`<img class="${cls}" loading="lazy" src="${esc(src||PH)}" onerror="this.onerror=null;this.src='${PH}'" alt="">`;
const CAT={all:"All",fav:"★ Starred",pokemon:"Pokémon",yugioh:"Yu-Gi-Oh",NBA:"NBA",NFL:"NFL",MLB:"MLB"};
const ck=i=>i.sport||i.cat, key=i=>i.path||i.q;
const FLN={SPIKE_ALERT:"SPIKE",SPIKE_WATCH:"WATCH",DROP_ALERT:"DROP",DROP_WATCH:"DIP"};
const REPO_EDIT="https://github.com/tylerjlima-eng/tyler-dashboard/edit/main/data/watchlist.json";
const GRADES=["Ungraded","Grade 7","Grade 8","Grade 9","Grade 9.5","PSA 10"];
let DATA={items:[],errors:[]},HIST={},cat="all",grade="Ungraded",win="30d";
// ---------- nav / sheet ----------
function go(t){$$("nav.bottom button").forEach(x=>x.classList.toggle("on",x.dataset.t==t));$$(".tab").forEach(s=>s.classList.toggle("on",s.id=="t-"+t));scrollTo(0,0);if(t=="inv")renderInv()}
$$("nav.bottom button").forEach(b=>b.onclick=()=>go(b.dataset.t));
function openSheet(html){$("#sheetC").innerHTML=html;$("#sheet").hidden=false;document.body.style.overflow="hidden"}
function closeSheet(){$("#sheet").hidden=true;document.body.style.overflow=""}
$("#sheet").addEventListener("click",e=>{if(e.target.closest("[data-close]"))closeSheet()});
// ---------- data ----------
Promise.all([fetch("data/prices.json?"+Date.now()).then(r=>r.json()),fetch("data/history.json?"+Date.now()).then(r=>r.json()).catch(()=>({}))]).then(([d,h])=>{
 DATA=d;HIST=h;$("#upd").textContent="Updated "+new Date(d.updated).toLocaleString("en-US",{timeZone:"America/New_York",month:"short",day:"numeric",hour:"numeric",minute:"2-digit"})+" ET";
 renderMarket();fillCards();renderInv()}).catch(()=>{$("#groups").innerHTML='<div class="empty">No price data yet.</div>'});
const favs=()=>new Set(LS.get("favs",[]));
function toggleFav(k){const f=favs();f.has(k)?f.delete(k):f.add(k);LS.set("favs",[...f]);renderMarket()}
const allItems=()=>[...DATA.items,...LS.get("localWatch",[]).map(x=>({...x,local:true,prices:{},change:{}}))];
const chg=i=>i.change?.[grade]?.[win];
// ---------- MARKETS ----------
$$("#gradeSeg button").forEach(b=>b.onclick=()=>{grade=b.dataset.v;$$("#gradeSeg button").forEach(x=>x.classList.toggle("on",x==b));renderMarket()});
$$("#winSeg button").forEach(b=>b.onclick=()=>{win=b.dataset.v;$$("#winSeg button").forEach(x=>x.classList.toggle("on",x==b));renderMarket()});
$("#q").oninput=$("#sort").onchange=()=>renderMarket();
function renderMarket(){const all=allItems(),f=favs(),q=$("#q").value.trim().toLowerCase();
 const counts={all:all.length,fav:all.filter(i=>f.has(key(i))).length};all.forEach(i=>counts[ck(i)]=(counts[ck(i)]||0)+1);
 $("#catTabs").innerHTML=Object.entries(CAT).filter(([k])=>k=="all"||counts[k]).map(([k,v])=>`<span class="c ${k==cat?"on":""}" data-c="${k}">${v}<span class="n">${counts[k]||0}</span></span>`).join("");
 $$("#catTabs .c").forEach(c=>c.onclick=()=>{cat=c.dataset.c;renderMarket()});
 let its=all.filter(i=>(cat=="all"||(cat=="fav"?f.has(key(i)):ck(i)==cat))&&(!q||(i.name+" "+(i.set||"")).toLowerCase().includes(q)));
 const s=$("#sort").value,P=i=>i.prices?.[grade]??-1;
 its.sort(s=="name"?(a,b)=>a.name.localeCompare(b.name):s=="price"?(a,b)=>P(b)-P(a):s=="up"?(a,b)=>(chg(b)??-1e9)-(chg(a)??-1e9):s=="down"?(a,b)=>(chg(a)??1e9)-(chg(b)??1e9):(a,b)=>Math.abs(chg(b)??0)-Math.abs(chg(a)??0));
 const sig=its.filter(i=>FLN[i.signal?.[grade]?.flag]).sort((a,b)=>Math.abs(b.signal[grade].pct)-Math.abs(a.signal[grade].pct));
 $("#sigWrap").hidden=!sig.length;$("#sigN").textContent=sig.length;
 $("#signals").innerHTML=sig.map(i=>{const g=i.signal[grade];return `<div class="tile" data-k="${esc(key(i))}"><span class="flag ${g.flag}">${FLN[g.flag]}</span>${img(i.img,"")}<div class="nm">${esc(i.name)}</div><span class="num">${fmt(i.prices[grade])}</span> ${pill(g.pct)}</div>`}).join("");
 const order=cat=="all"||cat=="fav"?["pokemon","yugioh","NBA","NFL","MLB"]:[cat];
 $("#groups").innerHTML=order.map(c=>{const g=its.filter(i=>ck(i)==c);if(!g.length)return"";
  return `<div class="grp"><h2><span class="dot" style="background:var(--${c})"></span>${CAT[c]} <span class="count">${g.length}</span></h2><div class="list">${g.map(row).join("")}</div></div>`}).join("")||'<div class="empty">No cards match.</div>';
 $$("[data-k]").forEach(el=>el.onclick=e=>{if(e.target.closest(".star"))return;detail(el.dataset.k)});
 $$(".star").forEach(b=>b.onclick=()=>toggleFav(b.dataset.fav));
 $("#srcNote").innerHTML=`Prices: PriceCharting / SportsCardsPro guide values (built from eBay sold listings), updated daily. Raw = ungraded. % change compares against our daily snapshots; 30D uses PriceCharting's monthly history until we have 30 days of our own.<br><b>Signals</b>: WATCH at +25%, SPIKE at +50%, DIP at −25%, DROP at −40%, measured against a baseline. A move only counts if it's at least $5 (or 10% of the baseline), cards with a baseline under $3 are skipped, and one-day jumps need the next day's price to confirm them. Check sold comps in Terapeak before acting.${DATA.errors?.length?`<br><span class="dn">${DATA.errors.length} fetch issue(s) on the last run.</span>`:""}`}
function row(i){const f=favs().has(key(i)),g=i.signal?.[grade];
 return `<div class="it" data-k="${esc(key(i))}">${img(i.img)}<div class="mid"><div class="nm">${esc(i.name)}</div><div class="sub">${esc(i.set||CAT[ck(i)])}${i.local?" · pending":""}${i.stale_since?" · stale":""}</div></div>
 <div class="rt"><span class="num">${fmt(i.prices?.[grade])}</span>${pill(chg(i))}${FLN[g?.flag]?`<span class="mini-flag flag ${g.flag}" style="position:static">${FLN[g.flag]}</span>`:""}</div><button class="star ${f?"on":""}" data-fav="${esc(key(i))}" aria-label="Star">★</button></div>`}
function series(i,g){const pts=[];(i.monthly?.[g]||[]).forEach(([t,v])=>pts.push([t*1000,v,"m"]));
 Object.entries(HIST[key(i)]||{}).forEach(([d,o])=>o[g]!=null&&pts.push([new Date(d+"T12:00").getTime(),o[g],"d"]));return pts.sort((a,b)=>a[0]-b[0])}
function spark(pts){if(pts.length<2)return'<div class="small muted">Not enough history yet.</div>';const W=600,H=120,p=8,xs=pts.map(x=>x[0]),ys=pts.map(x=>x[1]);
 const x0=Math.min(...xs),x1=Math.max(...xs),y0=Math.min(...ys),y1=Math.max(...ys),X=t=>p+(W-2*p)*(t-x0)/((x1-x0)||1),Y=v=>H-p-(H-2*p)*(v-y0)/((y1-y0)||1);
 const d=pts.map((q,k)=>(k?"L":"M")+X(q[0]).toFixed(1)+","+Y(q[1]).toFixed(1)).join(""),up=ys.at(-1)>=ys[0],col=up?"#00a352":"#e5133d";
 return `<svg class="spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"><path d="${d}L${X(x1)},${H}L${X(x0)},${H}Z" fill="${col}" opacity=".1"/><path d="${d}" fill="none" stroke="${col}" stroke-width="3" vector-effect="non-scaling-stroke"/>${pts.filter(q=>q[2]=="d").map(q=>`<circle cx="${X(q[0])}" cy="${Y(q[1])}" r="4" fill="${col}"/>`).join("")}</svg>
 <div class="row small muted"><span>${new Date(x0).toLocaleDateString("en-US",{month:"short",year:"numeric"})} · low ${fmt(y0)}</span><span style="text-align:right">high ${fmt(y1)} · ${new Date(x1).toLocaleDateString("en-US",{month:"short",day:"numeric"})}</span></div>`}
function detail(k,g2){const i=allItems().find(x=>key(x)==k);if(!i)return;const g=g2||grade,s=i.signal?.[g],f=favs().has(k),c=i.change?.[g]||{};
 const q=encodeURIComponent(i.name.replace(/[()]/g,"")+(g=="PSA 10"?" PSA 10":""));
 openSheet(`<div class="hero">${img(i.img_lg||i.img,"")}<div><h3>${esc(i.name)}</h3><div class="small muted">${esc(i.set||"")} · ${CAT[ck(i)]}</div><div class="big-num">${fmt(i.prices?.[g])}</div><div class="small muted">${g=="Ungraded"?"Raw":g}</div>
 <div style="margin-top:6px">1D ${pill(c["1d"])} 7D ${pill(c["7d"])} 30D ${pill(c["30d"])}</div></div></div>
 ${s&&FLN[s.flag]?`<div class="ev" style="margin-top:12px"><span class="flag ${s.flag}" style="position:static">${FLN[s.flag]}</span> <b>${s.pct>0?"+":""}${s.pct}%</b> vs baseline ${fmt(s.base)}<div class="small muted">${esc(s.basis)}${s.day_jump?" · day jump "+s.day_jump:""}</div></div>`:""}
 <div class="seg" style="margin-top:12px" id="dg">${["Ungraded","PSA 10"].map(x=>`<button data-v="${x}" class="${x==g?"on":""}">${x=="Ungraded"?"Raw":x}</button>`).join("")}</div>${spark(series(i,g))}
 <div class="grades">${GRADES.filter(x=>i.prices?.[x]).map(x=>`<div><span>${x=="Ungraded"?"Raw":x}</span><b>${fmt(i.prices[x])}</b></div>`).join("")}</div>
 ${i.ygoprodeck?.set_price?`<div class="small muted">YGOPRODeck lowest ask (${esc(i.ygoprodeck.set_code)}): ${fmt(i.ygoprodeck.set_price)}</div>`:""}
 <div class="row"><button class="btn" id="dFav">${f?"★ Starred":"☆ Star"}</button><button class="btn" id="dInv">＋ Inventory</button><button class="btn primary" id="dList">List it</button></div>
 <details class="more"><summary>Sources & comps</summary><div class="small"><a target="_blank" href="${esc(i.url)}">Price page</a> · <a target="_blank" href="https://www.ebay.com/sch/i.html?_nkw=${q}&LH_Sold=1&LH_Complete=1">eBay sold</a> · <a target="_blank" href="https://www.ebay.com/sh/research?marketplace=EBAY-US&keywords=${q}&tabName=SOLD">Terapeak</a> · <a target="_blank" href="https://www.130point.com/sales/?q=${q}">130point</a></div></details>`);
 $$("#dg button").forEach(b=>b.onclick=()=>detail(k,b.dataset.v));$("#dFav").onclick=()=>{toggleFav(k);detail(k,g)};
 $("#dInv").onclick=()=>invForm({name:i.name,set:i.set,cat:ck(i),path:i.path,img:i.img,grade:g=="PSA 10"?"PSA 10":"Ungraded"});
 $("#dList").onclick=()=>{closeSheet();go("list");const n=DATA.items.indexOf(i);if(n>=0){$("#lCard").value=n;$("#lCard").dispatchEvent(new Event("change"))}}}
$("#addBtn").onclick=()=>{const name=$("#addName").value.trim(),url=$("#addUrl").value.trim(),c=$("#addCat").value,m=url.match(/\/game\/([^?#]+)/);
 if(!name||!m)return $("#addOut").innerHTML='<span class="dn">Need a name and a PriceCharting/SportsCardsPro /game/ link.</span>';
 const it={cat:c,name,path:decodeURIComponent(m[1]),url};const l=LS.get("localWatch",[]);l.push(it);LS.set("localWatch",l);renderMarket();
 $("#addOut").innerHTML=`Added on this device. <a target="_blank" href="${REPO_EDIT}">Track daily →</a> paste:<pre>${esc(JSON.stringify({cat:c,name,path:it.path}))},</pre>`};
// ---------- INVENTORY (IndexedDB) ----------
const DB={db:null,open(){return this.db||(this.db=new Promise((ok,no)=>{const r=indexedDB.open("carddesk",1);r.onupgradeneeded=()=>r.result.createObjectStore("inv",{keyPath:"id"});r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error)}))},
 async tx(mode,fn){const db=await this.open();return new Promise((ok,no)=>{const t=db.transaction("inv",mode),s=t.objectStore("inv"),r=fn(s);t.oncomplete=()=>ok(r?.result);t.onerror=()=>no(t.error)})},
 all(){return this.tx("readonly",s=>s.getAll())},put(o){return this.tx("readwrite",s=>s.put(o))},del(id){return this.tx("readwrite",s=>s.delete(id))}};
const gk=g=>g=="Raw"?"Ungraded":g;
const gkey=it=>it.grade_key!=null&&it.grade_key!==undefined&&("grade_key" in it)?it.grade_key:gk(it.grade);
function curPrice(it){const fb=it.fallback?.price!=null?{...it.fallback,src:it.fallback.src+" · imported "+new Date(it.fallback.at).toLocaleDateString()}:null;if("grade_key" in it&&!it.grade_key)return fb||{price:null,cur:"$",src:"no comparable price for "+it.grade};const w=it.path&&DATA.items.find(x=>x.path==it.path);if(w){const p=w.prices?.[gkey(it)]??null;if(p!=null)return{price:p,cur:"$",src:"PriceCharting (daily)"}}
 return it.last?.price!=null?{...it.last,src:it.last.src+" ("+new Date(it.last.at).toLocaleDateString()+")"}:fb||{price:null,cur:"$",src:"no price yet"}}
async function livePrice(it){try{if(it.ygo_id){const d=(await (await fetch("https://db.ygoprodeck.com/api/v7/cardinfo.php?id="+it.ygo_id)).json()).data[0];
  const s=(d.card_sets||[]).filter(x=>!it.set_code||x.set_code==it.set_code).map(x=>+x.set_price).filter(x=>x>0);const p=s.length?Math.min(...s):+d.card_prices[0].tcgplayer_price||null;
  return p?{price:p,cur:"$",src:"YGOPRODeck lowest ask",at:Date.now()}:null}
 if(it.tcgdex){const d=await (await fetch("https://api.tcgdex.net/v2/en/cards/"+encodeURIComponent(it.tcgdex))).json(),tp=d.pricing?.tcgplayer,cm=d.pricing?.cardmarket;
  const v=tp&&Object.values(tp).find(x=>x&&typeof x=="object"&&x.marketPrice);if(v)return{price:v.marketPrice,cur:"$",src:"TCGplayer market via TCGdex",at:Date.now()};
  if(cm?.avg30)return{price:cm.avg30,cur:"€",src:"Cardmarket 30d avg via TCGdex",at:Date.now()}}}catch(e){}return null}
async function refreshInv(force){const items=await DB.all();for(const it of items){const w=it.path&&DATA.items.find(x=>x.path==it.path);if(w)continue;
 if(force||!it.last||Date.now()-it.last.at>12*3600e3){const p=await livePrice(it);if(p){it.last=p;await DB.put(it)}}}renderInv(true)}
let invRefreshed=false,icat="all";
const ICAT={all:"All",listed:"On eBay",check:"⚠ Check",pokemon:"Pokémon",yugioh:"Yu-Gi-Oh",NBA:"NBA",NFL:"NFL",MLB:"MLB",other:"Other"};
async function renderInv(skip){const items=await DB.all().catch(()=>[]);if(!skip&&!invRefreshed&&DATA.items.length){invRefreshed=true;refreshInv()}
 const q=$("#invQ").value.trim().toLowerCase(),s=$("#invSort").value;let tv=0,tc=0,n=0,gv=0,lv=0;
 const rows=items.map(it=>{const c=curPrice(it),qty=+it.qty||1,val=c.price!=null&&c.cur=="$"?c.price*qty:null,cost=(+it.cost||0)*qty;if(it.ebay_price)lv+=(+it.ebay_price)*qty;if(val!=null)tv+=val;if(val!=null&&it.cost!==""&&it.cost!=null){tc+=cost;gv+=val}n+=qty;return{it,c,qty,val,cost,gain:val!=null&&it.cost!==""&&it.cost!=null?val-cost:null}})
  .filter(r=>(!q||(r.it.name+" "+(r.it.set||"")+" "+(r.it.title||"")).toLowerCase().includes(q))&&(icat=="all"||(icat=="listed"?!!r.it.ebay_url:icat=="check"?(r.it.parse_confidence=="low"||r.it.match_confidence=="low"):(r.it.cat||"other")==icat)));
 rows.sort(s=="name"?(a,b)=>a.it.name.localeCompare(b.it.name):s=="gain"?(a,b)=>(b.gain??-1e9)-(a.gain??-1e9):s=="date"?(a,b)=>(b.it.date||"").localeCompare(a.it.date||""):(a,b)=>(b.val??-1)-(a.val??-1));
 const cc={all:items.length,listed:items.filter(i=>i.ebay_url).length,check:items.filter(i=>i.parse_confidence=="low"||i.match_confidence=="low").length};items.forEach(i=>cc[i.cat||"other"]=(cc[i.cat||"other"]||0)+1);
 $("#invCats").innerHTML=Object.entries(ICAT).filter(([k])=>k=="all"||cc[k]).map(([k,v])=>`<span class="c ${k==icat?"on":""}" data-ic="${k}">${v}<span class="n">${cc[k]||0}</span></span>`).join("");$$("#invCats .c").forEach(c=>c.onclick=()=>{icat=c.dataset.ic;renderInv(true)});
 $("#invVal").textContent=fmt(tv);$("#invCost").textContent=fmt(tc);const g=gv-tc;$("#invGain").textContent=(g>=0?"+":"−")+fmt(Math.abs(g));$("#invGain").className=g>=0?"up":"dn";$("#invN").textContent=fmt(lv);$("#invCnt").textContent=n+" items";
 $("#invList").innerHTML=rows.length?`<div class="list">${rows.map(r=>`<div class="it" data-inv="${r.it.id}">${img(r.it.photo||r.it.img)}<div class="mid"><div class="nm">${esc(r.it.name)}</div><div class="sub">${esc(r.it.grade=="Ungraded"?"Raw":r.it.grade)} · ×${r.qty}${r.it.cost?" · paid "+fmt(+r.it.cost):""}${r.it.parse_confidence=="low"||r.it.match_confidence=="low"?' · <span class="warn">check</span>':""}</div>${r.it.ebay_url?`<a class="ebay" href="${esc(r.it.ebay_url)}" target="_blank" onclick="event.stopPropagation()">eBay ${fmt(+r.it.ebay_price)}</a>`:""}</div>
  <div class="rt"><span class="num">${r.c.price!=null?fmt(r.c.price*r.qty,r.c.cur):"—"}</span>${r.gain!=null?`<span class="pill ${r.gain>=0?"up":"dn"}">${r.gain>=0?"+":"−"}${fmt(Math.abs(r.gain))}</span>`:""}</div></div>`).join("")}</div>`:'<div class="empty">No cards yet. Scan one or add it manually.</div>';
 $$("[data-inv]").forEach(el=>el.onclick=()=>{const it=items.find(x=>x.id==el.dataset.inv);invForm(it)})}
$("#invQ").oninput=$("#invSort").onchange=()=>renderInv(true);$("#refreshInv").onclick=()=>refreshInv(true);
$("#manualBtn").onclick=()=>pickCard("");
function resizePhoto(file,max=480){return new Promise(ok=>{const im=new Image();im.onload=()=>{const k=Math.min(1,max/Math.max(im.width,im.height)),c=document.createElement("canvas");c.width=im.width*k;c.height=im.height*k;c.getContext("2d").drawImage(im,0,0,c.width,c.height);ok({small:c.toDataURL("image/jpeg",.75),im})};im.src=URL.createObjectURL(file)})}
// candidate search: watchlist + YGOPRODeck + TCGdex
async function searchCards(text,codes=[]){const out=[],t=text.toLowerCase().replace(/[^a-z0-9#\/\- ]/g," ").replace(/\s+/g," ").trim(),words=t.split(" ").filter(w=>w.length>2);
 DATA.items.forEach(i=>{const hay=(i.name+" "+(i.set||"")+" "+i.path).toLowerCase();let sc=words.filter(w=>hay.includes(w)).length;codes.forEach(c=>{if(hay.includes(c.toLowerCase()))sc+=10});if(sc)out.push({sc,name:i.name,set:i.set,cat:ck(i),path:i.path,img:i.img,src:"Tracked"})});
 const jobs=[];
 for(const c of codes.filter(c=>/^[A-Z0-9]{2,5}-[A-Z]{0,2}\d{3}$/i.test(c)))jobs.push(fetch("https://db.ygoprodeck.com/api/v7/cardsetsinfo.php?setcode="+encodeURIComponent(c.toUpperCase())).then(r=>r.ok?r.json():null).then(d=>{if(d?.id)out.push({sc:9,name:`${d.name} ${d.set_code}`,set:d.set_name,cat:"yugioh",ygo_id:d.id,set_code:d.set_code,img:`https://images.ygoprodeck.com/images/cards_small/${d.id}.jpg`,src:"YGOPRODeck"})}).catch(()=>{}));
 const nm=words.filter(w=>!/\d/.test(w)).slice(0,4).join(" ");
 if(nm.length>2){jobs.push(fetch("https://db.ygoprodeck.com/api/v7/cardinfo.php?fname="+encodeURIComponent(nm)+"&num=6&offset=0").then(r=>r.ok?r.json():null).then(d=>(d?.data||[]).forEach(c=>out.push({sc:1+words.filter(w=>c.name.toLowerCase().includes(w)).length,name:c.name,set:c.card_sets?.[0]?.set_name,cat:"yugioh",ygo_id:c.id,img:`https://images.ygoprodeck.com/images/cards_small/${c.id}.jpg`,src:"YGOPRODeck"}))).catch(()=>{}));
  jobs.push(fetch("https://api.tcgdex.net/v2/en/cards?name="+encodeURIComponent(words.filter(w=>!/\d/.test(w)).slice(0,2).join(" "))+"&pagination:itemsPerPage=12").then(r=>r.ok?r.json():[]).then(d=>(d||[]).forEach(c=>{const num=codes.find(x=>/^\d+(\/\d+)?$/.test(x));let sc=1+words.filter(w=>c.name.toLowerCase().includes(w)).length;if(num&&c.localId==num.split("/")[0].replace(/^0+/,""))sc+=4;out.push({sc,name:`${c.name} #${c.localId}`,set:c.id.split("-")[0],cat:"pokemon",tcgdex:c.id,img:c.image?c.image+"/low.webp":null,src:"TCGdex"})})).catch(()=>{}))}
 await Promise.all(jobs);const seen=new Set();return out.sort((a,b)=>b.sc-a.sc).filter(c=>{const k=c.path||(c.ygo_id?c.ygo_id+"|"+(c.set_code||""):c.tcgdex);if(seen.has(k))return false;seen.add(k);return true}).slice(0,12)}
function candHTML(list){return list.length?list.map((c,n)=>`<div class="cand" data-cand="${n}">${img(c.img)}<div class="mid"><b>${esc(c.name)}</b><div class="small muted">${esc(c.set||"")} · ${esc(c.src)}</div></div></div>`).join(""):'<div class="small muted">No matches. Try different words.</div>'}
function pickCard(text,photo,ocrNote){openSheet(`<h3>${photo?"Scanned card":"Add a card"}</h3>${photo?`<img class="photo" src="${photo}">`:""}${ocrNote?`<div class="small muted">${ocrNote}</div>`:""}
 <input id="pkQ" type="search" placeholder="Card name, number or set code (e.g. Charizard 4/102, LOB-001)" value="${esc(text)}"><div id="pkRes"></div><button class="btn" id="pkBlank">Enter details by hand</button>`);
 let list=[];const run=async()=>{const v=$("#pkQ").value.trim();if(v.length<2){$("#pkRes").innerHTML="";return}$("#pkRes").innerHTML='<div class="small muted">Searching…</div>';
  list=await searchCards(v,extractCodes(v));$("#pkRes").innerHTML=candHTML(list);$$("[data-cand]").forEach(el=>el.onclick=()=>invForm({...list[el.dataset.cand],photo}))};
 let tm;$("#pkQ").oninput=()=>{clearTimeout(tm);tm=setTimeout(run,450)};$("#pkBlank").onclick=()=>invForm({name:$("#pkQ").value,photo});if(text)run()}
function extractCodes(t){const c=new Set();(t.match(/\b[A-Z0-9]{2,5}-[A-Z]{0,2}\d{3}\b/gi)||[]).forEach(x=>c.add(x.toUpperCase()));(t.match(/\b\d{1,3}\s?\/\s?\d{2,3}\b/g)||[]).forEach(x=>c.add(x.replace(/\s/g,"")));
 (t.match(/#\s?([A-Z]{0,4}\d{1,4})/gi)||[]).forEach(x=>c.add(x.replace(/[#\s]/g,"")));return[...c]}
let TESS=null;function loadTess(){return TESS||(TESS=new Promise((ok,no)=>{const s=document.createElement("script");s.src="https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js";s.onload=()=>ok(window.Tesseract);s.onerror=no;document.head.appendChild(s)}))}
$("#scanIn").onchange=async e=>{const f=e.target.files[0];if(!f)return;e.target.value="";const{small,im}=await resizePhoto(f);
 openSheet(`<h3>Reading card…</h3><img class="photo" src="${small}"><div class="small muted" id="ocrSt">Loading text reader (first time takes a few seconds)…</div>`);
 try{const T=await loadTess();const c=document.createElement("canvas"),k=Math.min(1,1600/Math.max(im.width,im.height));c.width=im.width*k;c.height=im.height*k;const x=c.getContext("2d");x.filter="grayscale(1) contrast(1.4)";x.drawImage(im,0,0,c.width,c.height);
  const r=await T.recognize(c,"eng",{logger:m=>{const s=$("#ocrSt");if(s&&m.status)s.textContent=m.status+(m.progress?` ${Math.round(m.progress*100)}%`:"")}});
  const lines=r.data.lines.filter(l=>l.confidence>45).map(l=>l.text.trim()).filter(l=>l.length>2);const txt=lines.join(" ");const codes=extractCodes(txt);
  const name=lines.slice(0,3).join(" ").replace(/\b(HP|STAGE|BASIC|LV\.?)\b.*$/i,"").replace(/\b[A-Z]{2,5}-[A-Z]{0,2}\d*\b/g," ").replace(/[^A-Za-z' \-]/g," ").replace(/\s+/g," ").trim().split(" ").slice(0,4).join(" ");
  pickCard([name,...codes].join(" ").trim(),small,`Read: “${esc(txt.slice(0,90))}${txt.length>90?"…":""}”. Fix the search box if needed.`)}
 catch(err){pickCard("",small,"Couldn't read the text automatically. Type the card name below.")}};
function invForm(o){const it={id:o.id||"i"+Date.now(),qty:1,grade:"Ungraded",date:new Date().toLocaleDateString("en-CA"),cost:"",...o};
 openSheet(`<div class="hero">${img(it.photo||it.img,"")}<div style="flex:1"><h3>${o.id?"Edit card":"Add to inventory"}</h3><input id="ivName" value="${esc(it.name)}" placeholder="Card name"><input id="ivSet" value="${esc(it.set||"")}" placeholder="Set / number"></div></div>
 <div class="row"><label>Grade<select id="ivGrade">${[...new Set([...(["Ungraded","Grade 7","Grade 8","Grade 9","Grade 9.5","PSA 10"].includes(gk(it.grade))?[]:[it.grade]),"Ungraded","Grade 7","Grade 8","Grade 9","Grade 9.5","PSA 10"])].map(g=>`<option ${g==gk(it.grade)?"selected":""} value="${esc(g)}">${g=="Ungraded"?"Raw":esc(g)}</option>`).join("")}</select></label><label>Qty<input id="ivQty" type="number" min="1" value="${esc(it.qty)}"></label></div>
 <div class="row"><label>Paid (each)<input id="ivCost" type="number" step="0.01" inputmode="decimal" value="${esc(it.cost)}"></label><label>Date<input id="ivDate" type="date" value="${esc(it.date)}"></label></div>
 <label>Photo<input id="ivPhoto" type="file" accept="image/*" capture="environment"></label>
 <div class="small muted" id="ivPrice"></div>${it.ebay_url?`<div class="ev small">Listed on eBay at <b>${fmt(+it.ebay_price)}</b> · <a href="${esc(it.ebay_url)}" target="_blank">view listing</a>${it.market_title?`<br>Matched: ${esc(it.market_title)} (${esc(it.match_confidence)} confidence)`:""}${it.flags?`<br><span class="warn">⚠ ${esc(it.flags)}</span>`:""}${it.title?`<br><span class="muted">${esc(it.title)}</span>`:""}</div>`:""}
 <button class="btn primary big" id="ivSave">Save</button>${o.id?'<div class="row"><button class="btn" id="ivDel">Delete</button><button class="btn" id="ivTrack">Track daily</button></div>':""}`);
 const show=()=>{const gv=$("#ivGrade").value,c=curPrice(gv==it.grade?it:{...it,grade:gv,grade_key:["Ungraded","Grade 7","Grade 8","Grade 9","Grade 9.5","PSA 10"].includes(gv)?gv:""});$("#ivPrice").innerHTML=c.price!=null?`Current value: <b>${fmt(c.price,c.cur)}</b> · ${esc(c.src)}`:(it.path||it.ygo_id||it.tcgdex?"Fetching price…":"No linked price. Link a tracked card to get automatic values.")};show();
 if(!it.path&&(it.ygo_id||it.tcgdex)&&!it.last)livePrice(it).then(p=>{if(p){it.last=p;show()}});$("#ivGrade").onchange=show;
 $("#ivPhoto").onchange=async e=>{const f=e.target.files[0];if(f){it.photo=(await resizePhoto(f)).small;$(".hero img").src=it.photo}};
 $("#ivSave").onclick=async()=>{const ng=$("#ivGrade").value;if(ng!=it.grade&&"grade_key" in it)it.grade_key=["Ungraded","Grade 7","Grade 8","Grade 9","Grade 9.5","PSA 10"].includes(ng)?ng:"";Object.assign(it,{name:$("#ivName").value.trim()||"Untitled card",set:$("#ivSet").value.trim(),grade:ng,qty:Math.max(1,+$("#ivQty").value||1),cost:$("#ivCost").value,date:$("#ivDate").value});
  await DB.put(it);closeSheet();go("inv");renderInv(true)};
 if(o.id){$("#ivDel").onclick=async()=>{if(confirm("Delete this card?")){await DB.del(it.id);closeSheet();renderInv(true)}};
  $("#ivTrack").onclick=()=>{const tracked=it.path&&DATA.items.some(x=>x.path==it.path),pc=it.path?{cat:["NBA","NFL","MLB"].includes(it.cat)?"sports":it.cat,...(["NBA","NFL","MLB"].includes(it.cat)?{sport:it.cat}:{}),name:it.name,path:it.path}:null;
   if(pc&&!tracked)return openSheet(`<h3>Track daily</h3><p class="small">Add this line to watchlist.json (it already has the price page path):</p><pre>${esc(JSON.stringify(pc))},</pre><a class="btn primary" target="_blank" href="${REPO_EDIT}">Open watchlist.json</a>`);const line=tracked;
   openSheet(`<h3>Track daily</h3>${line?`<p class="small">This card is already on the daily price list.</p>`:`<p class="small">Find the card on PriceCharting, copy its /game/ link, then add one line to watchlist.json.</p><a class="btn" target="_blank" href="https://www.pricecharting.com/search-products?type=prices&q=${encodeURIComponent(it.name+" "+(it.set||""))}">Find on PriceCharting</a><pre>{"cat":"${esc(it.cat||"pokemon")}","name":"${esc(it.name)}","path":"PASTE-PATH-AFTER-/game/"},</pre><a class="btn primary" target="_blank" href="${REPO_EDIT}">Open watchlist.json</a>`}`)}}}
const CSVH=["name","set","cat","grade","grade_key","qty","cost","date","year","number","grader","grade_num","img","ebay_item_id","ebay_url","ebay_price","market_price","market_src","market_url","market_title","market_at","path","ygo_id","set_code","tcgdex","match_confidence","parse_confidence","flags","title","source","rarity","notes"];
$("#csvOut").onclick=async()=>{const rows=await DB.all(),q=v=>`"${String(v??"").replace(/"/g,'""')}"`;
 const csv=[CSVH.join(","),...rows.map(r=>CSVH.map(h=>q(r[h])).join(","))].join("\n"),a=document.createElement("a");a.href=URL.createObjectURL(new Blob([csv],{type:"text/csv"}));a.download="card-inventory.csv";a.click()};
$("#csvIn").onchange=async e=>{const f=e.target.files[0];if(!f)return;const t=await f.text();const parse=s=>{const out=[];let row=[],cur="",q=false;for(let i=0;i<s.length;i++){const ch=s[i];if(q){if(ch=='"'&&s[i+1]=='"'){cur+='"';i++}else if(ch=='"')q=false;else cur+=ch}else if(ch=='"')q=true;else if(ch==","){row.push(cur);cur=""}else if(ch=="\n"||ch=="\r"){if(ch=="\r"&&s[i+1]=="\n")i++;row.push(cur);out.push(row);row=[];cur=""}else cur+=ch}if(cur||row.length){row.push(cur);out.push(row)}return out};
 const [h0,...rs]=parse(t),h=h0.map(x=>x.trim());let n=0;const byEbay={},byKey={};(await DB.all()).forEach(x=>{if(x.ebay_item_id)byEbay[x.ebay_item_id]=x;else byKey[[x.name,x.set,x.grade].join("|").toLowerCase()]=x});for(const r of rs){if(!r.join(""))continue;const o={id:"i"+Date.now()+"_"+n};h.forEach((k,j)=>o[k.trim()]=r[j]);if(o.ygo_id)o.ygo_id=+o.ygo_id;else delete o.ygo_id;if(!o.tcgdex)delete o.tcgdex;if(!o.path)delete o.path;o.qty=+o.qty||1;
  if(o.market_price!==""&&o.market_price!=null&&!isNaN(+o.market_price))o.fallback={price:+o.market_price,cur:"$",src:o.market_src||"import",at:Date.parse(o.market_at)||Date.now()};
  if(!h.includes("grade_key")||(!o.grade_key&&["Ungraded","Grade 7","Grade 8","Grade 9","Grade 9.5","PSA 10"].includes(gk(o.grade||"Ungraded"))))delete o.grade_key;const nk=x=>[x.name,x.set,x.grade].join("|").toLowerCase(),ex=o.ebay_item_id?byEbay[o.ebay_item_id]:byKey[nk(o)];if(ex){o.id=ex.id;o.cost=o.cost||ex.cost;o.date=o.date||ex.date;o.photo=ex.photo}await DB.put(o);n++}
 e.target.value="";alert(`Imported ${n} items (re-importing updates matching items instead of duplicating).`);renderInv(true)};
// ---------- LIST ----------
function fillCards(){$("#lCard").innerHTML='<option value="">Pick a tracked card…</option>'+DATA.items.map((i,n)=>`<option value="${n}">${esc(i.name)}</option>`).join("");$("#lImg").src=PH}
const median=a=>{a=[...a].sort((x,y)=>x-y);const m=a.length>>1;return a.length?(a.length%2?a[m]:(a[m-1]+a[m])/2):null};
function comps(){const i=DATA.items[$("#lCard").value],graded=$("#lCond").value.startsWith("2750"),gr=$("#lGrade").value.trim();let html="",base=null;$("#lImg").src=i?.img||PH;
 if(i){const k=graded?(gr=="10"?"PSA 10":gr?"Grade "+gr:"PSA 10"):"Ungraded";base=i.prices[k]??null;
  html=`<div class="row"><div><div class="small muted">Market · ${k=="Ungraded"?"Raw":k}</div><b class="num" style="font-size:22px">${fmt(base)}</b></div><div class="small" style="text-align:right"><a href="${esc(i.url)}" target="_blank">Source</a></div></div>`}
 else html='<span class="small muted">Pick a card for automatic comps.</span>';
 const q=encodeURIComponent([$("#lPlayer").value,$("#lSet").value,graded?$("#lGrader").value+" "+gr:""].join(" ").trim());
 if(q)html+=`<div class="small" style="margin-top:6px"><a target="_blank" href="https://www.ebay.com/sh/research?marketplace=EBAY-US&keywords=${q}&tabName=SOLD">Terapeak</a> · <a target="_blank" href="https://www.ebay.com/sch/i.html?_nkw=${q}&LH_Sold=1&LH_Complete=1">eBay sold</a> · <a target="_blank" href="https://www.130point.com/sales/?q=${q}">130point</a></div>`;
 $("#comps").innerHTML=html;const man=$("#lManual").value.split(/[\s,]+/).map(x=>parseFloat(x.replace("$",""))).filter(x=>x>0),mm=median(man),s=mm??base;
 $("#suggest").innerHTML=s?`<div class="small muted">Suggested price</div><b>${fmt(s)}</b> <span class="small muted">${mm?"median of your "+man.length+" comps":"market value"}</span>`:'<span class="small muted">No comps yet</span>';
 if(s&&!$("#lPrice").dataset.touched)$("#lPrice").value=s.toFixed(2)}
$("#lPrice").oninput=e=>e.target.dataset.touched=1;
["#lCond","#lGrade","#lGrader","#lManual","#lPlayer","#lSet"].forEach(s=>$(s).addEventListener("input",comps));
$("#lCard").addEventListener("change",()=>{const i=DATA.items[$("#lCard").value];if(i){const set=(i.set||"").replace(/^Pokemon |^YuGiOh /,"");let n=i.name.replace(/\s*\(.*\)/,"");if(set)n=n.replace(set,"").replace(/\s+/g," ").trim();$("#lPlayer").value=n;$("#lSet").value=set;delete $("#lPrice").dataset.touched}comps()});
function draft(){const[cid,cl]=$("#lCond").value.split("|");return{player:$("#lPlayer").value,set:$("#lSet").value,conditionId:cid,condition:cl,grader:$("#lGrader").value,grade:$("#lGrade").value,raw:$("#lRaw").value,cert:$("#lCert").value,notes:$("#lNotes").value,price:$("#lPrice").value,title:$("#lTitle").value,description:$("#lDesc").value,graded:cid=="2750",img:$("#lImg").src}}
$("#gen").onclick=()=>{const d=draft(),it=DATA.items[$("#lCard").value],pre=it?.cat=="pokemon"?"Pokemon":it?.cat=="yugioh"?"YuGiOh":"";
 let t=[pre,d.set,d.player,d.graded?d.grader+" "+d.grade:"NM"].filter(Boolean).join(" ").replace(/\s+/g," ");if(t.length<70&&!d.graded)t+=" Raw Card";$("#lTitle").value=t.slice(0,80);$("#tLen").textContent=$("#lTitle").value.length;
 $("#lDesc").value=`${d.player}${d.set?" — "+d.set:""}\n\nCondition: ${d.graded?`${d.grader} ${d.grade}${d.cert?" (cert #"+d.cert+")":""}`:`Raw — ${d.raw}`}\n${d.notes?"\nNotes: "+d.notes+"\n":""}\nPhotos show the exact card you'll receive.\n\nShips ${(+d.price||0)>=20?"in sleeve + top loader + team bag, bubble mailer with tracking":"in sleeve + top loader"} within 1 business day.\nThanks for shopping ya_mothers_garage!`};
$("#lTitle").oninput=()=>$("#tLen").textContent=$("#lTitle").value.length;
$("#saveDraft").onclick=()=>{const l=LS.get("drafts",[]);l.unshift({...draft(),saved:new Date().toISOString()});LS.set("drafts",l);renderDrafts()};
$("#copyDraft").onclick=()=>navigator.clipboard?.writeText($("#lTitle").value+"\n\n"+$("#lDesc").value+"\n\nPrice: $"+$("#lPrice").value);
$("#payload").onclick=()=>{$("#payloadOut").textContent=JSON.stringify(EBAY.build(draft()),null,1)};
function renderDrafts(){const l=LS.get("drafts",[]);$("#drafts").innerHTML=l.length?`<div class="list">${l.map((d,i)=>`<div class="it">${img(d.img&&!d.img.startsWith("data:image/svg")?d.img:null)}<div class="mid"><div class="nm">${esc(d.title||d.player||"Untitled")}</div><div class="sub">${new Date(d.saved).toLocaleDateString()}</div></div><div class="rt"><span class="num">$${esc(d.price||"?")}</span><a href="#" data-del="${i}" class="small">delete</a></div></div>`).join("")}</div>`:'<div class="small muted">No drafts yet.</div>';
 $$("[data-del]").forEach(a=>a.onclick=e=>{e.preventDefault();l.splice(a.dataset.del,1);LS.set("drafts",l);renderDrafts()})}
renderDrafts();comps();
// ---------- SCHEDULE ----------
let SEED=[],view=new Date(),sel=null;const evcat=new Set(["pokemon","yugioh","sports","show","ebay","task"]);
const EVN={pokemon:"Pokémon",yugioh:"Yu-Gi-Oh",sports:"Sports",show:"Shows",ebay:"eBay",task:"My tasks"};
fetch("data/events.json").then(r=>r.json()).then(d=>{SEED=d;renderCal()});
$("#evChips").innerHTML=Object.entries(EVN).map(([k,v])=>`<span class="c on" data-e="${k}"><span class="dot c-${k}"></span> ${v}</span>`).join("");
$$("#evChips .c").forEach(c=>c.onclick=()=>{const k=c.dataset.e;evcat.has(k)?evcat.delete(k):evcat.add(k);c.classList.toggle("on");renderCal()});
const tasks=()=>LS.get("tasks",[]).map(t=>({...t,cat:"task"}));
const allEv=()=>[...SEED,...tasks()].filter(e=>evcat.has(e.cat)).sort((a,b)=>(a.date+(a.time||"")).localeCompare(b.date+(b.time||"")));
const iso=d=>d.toLocaleDateString("en-CA",{timeZone:"America/New_York"}),on=(e,ds)=>ds>=e.date&&ds<=(e.end||e.date);
function renderCal(){const y=view.getFullYear(),m=view.getMonth(),first=new Date(y,m,1),n=new Date(y,m+1,0).getDate(),ev=allEv(),today=iso(new Date());
 $("#mLabel").textContent=first.toLocaleString("en-US",{month:"long",year:"numeric"});
 let h="SMTWTFS".split("").map(d=>`<div class="dow">${d}</div>`).join("")+'<div class="blank"></div>'.repeat(first.getDay());
 for(let d=1;d<=n;d++){const ds=`${y}-${String(m+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`,es=ev.filter(e=>on(e,ds));h+=`<div data-d="${ds}" class="${ds==today?"today":""} ${ds==sel?"sel":""}">${d}<br>${es.slice(0,5).map(e=>`<span class="dot c-${e.cat}"></span>`).join("")}</div>`}
 $("#cal").innerHTML=h;$$("#cal [data-d]").forEach(c=>c.onclick=()=>{sel=sel==c.dataset.d?null:c.dataset.d;renderCal()});
 const list=sel?ev.filter(e=>on(e,sel)):ev.filter(e=>(e.end||e.date)>=today).slice(0,20);
 $("#dayLabel").textContent=sel?new Date(sel+"T12:00").toLocaleDateString("en-US",{weekday:"short",month:"short",day:"numeric"}):"Upcoming";
 $("#evList").innerHTML=list.length?list.map(e=>`<div class="ev"><span class="dot c-${e.cat}"></span> <b>${esc(e.title)}</b><div class="small muted">${new Date(e.date+"T12:00").toLocaleDateString("en-US",{month:"short",day:"numeric"})}${e.end?"–"+new Date(e.end+"T12:00").toLocaleDateString("en-US",{month:"short",day:"numeric"}):""}${e.time?" "+e.time:""}${e.note?" · "+esc(e.note):""}${e.url?` · <a href="${esc(e.url)}" target="_blank">source</a>`:""}${e.cat=="task"?` · <a href="#" data-tdel="${e.id}">delete</a>`:""}</div>${e.notes?`<div class="small">${esc(e.notes)}</div>`:""}</div>`).join(""):'<div class="empty">Nothing scheduled.</div>';
 $$("[data-tdel]").forEach(a=>a.onclick=x=>{x.preventDefault();LS.set("tasks",LS.get("tasks",[]).filter(t=>t.id!=a.dataset.tdel));renderCal()})}
$("#prevM").onclick=()=>{view=new Date(view.getFullYear(),view.getMonth()-1,1);renderCal()};$("#nextM").onclick=()=>{view=new Date(view.getFullYear(),view.getMonth()+1,1);renderCal()};
$("#tAdd").onclick=()=>{const t={id:"t"+Date.now(),title:$("#tTitle").value.trim(),date:$("#tDate").value,time:$("#tTime").value,notes:$("#tNote").value};if(!t.title||!t.date)return alert("Title and date needed");
 const l=LS.get("tasks",[]);l.push(t);LS.set("tasks",l);$("#tTitle").value=$("#tNote").value="";sel=t.date;view=new Date(t.date+"T12:00");renderCal()};
function ics(evs){const E=s=>(s||"").replace(/[\\,;]/g,m=>"\\"+m).replace(/\n/g,"\\n"),D=s=>s.replace(/-/g,""),nx=s=>{const d=new Date(s+"T12:00");d.setDate(d.getDate()+1);return iso(d).replace(/-/g,"")};
 const L=["BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//Tyler Card Desk//EN","CALSCALE:GREGORIAN"];
 evs.forEach(e=>{L.push("BEGIN:VEVENT","UID:"+e.id+"@tyler-card-desk","DTSTAMP:"+new Date().toISOString().replace(/[-:]|\.\d+/g,""));
  if(e.time)L.push(`DTSTART;TZID=America/New_York:${D(e.date)}T${e.time.replace(":","")}00`,"DURATION:PT30M");else L.push("DTSTART;VALUE=DATE:"+D(e.date),"DTEND;VALUE=DATE:"+nx(e.end||e.date));
  L.push("SUMMARY:"+E(e.title));const ds=[e.notes,e.note,e.url].filter(Boolean).join("\n");if(ds)L.push("DESCRIPTION:"+E(ds));if(e.url)L.push("URL:"+e.url);
  if(e.time)L.push("BEGIN:VALARM","ACTION:DISPLAY","DESCRIPTION:"+E(e.title),"TRIGGER:-PT30M","END:VALARM");L.push("END:VEVENT")});
 L.push("END:VCALENDAR");const fold=l=>{let o="";while(l.length>74){o+=l.slice(0,74)+"\r\n ";l=l.slice(74)}return o+l};
 const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([L.map(fold).join("\r\n")],{type:"text/calendar"}));a.download="card-desk.ics";a.click()}
$("#icsAll").onclick=()=>ics(allEv());$("#icsMine").onclick=()=>ics(tasks());
$("#notif").onclick=async()=>{if(!("Notification"in window))return alert("Not supported here; use .ics export.");const p=await Notification.requestPermission();alert(p=="granted"?"Reminders on while the app is open. For reliable alerts, export .ics to your calendar.":"Permission not granted.")};
setInterval(()=>{if(!window.Notification||Notification.permission!="granted")return;const now=new Date(),k=LS.get("notified",[]);tasks().forEach(t=>{if(!t.time||k.includes(t.id))return;const w=new Date(t.date+"T"+t.time);if(w-now<15*60e3&&w>now-60e3){new Notification("⏰ "+t.title);k.push(t.id);LS.set("notified",k)}})},60e3);
// ---------- SETUP ----------
fetch("SETUP.md").then(r=>r.text()).then(t=>{const md=l=>esc(l).replace(/`([^`]+)`/g,"<code>$1</code>").replace(/\*\*([^*]+)\*\*/g,"<b>$1</b>").replace(/\[([^\]]+)\]\(([^)]+)\)/g,'<a href="$2" target="_blank">$1</a>').replace(/(^|[\s(])(https?:\/\/[^\s)<]+)/g,'$1<a href="$2" target="_blank">$2</a>');
 const secs=t.split(/\n(?=# )/);$("#setupDoc").innerHTML=secs.map((s,n)=>{const[h,...b]=s.split("\n");const body=b.map(l=>l.startsWith("### ")?`<h3>${md(l.slice(4))}</h3>`:l.match(/^\s*([-\d])/)?`<div>${md(l)}</div>`:l?`<p>${md(l)}</p>`:"").join("");
  return n==0?`<h2>${md(h.replace(/^# /,""))}</h2>${body}`:`<details class="more"><summary>${md(h.replace(/^# /,""))}</summary>${body}</details>`}).join("")});
if("serviceWorker"in navigator)navigator.serviceWorker.register("sw.js");
