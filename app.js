const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const LS={get:(k,d)=>JSON.parse(localStorage.getItem(k)||JSON.stringify(d)),set:(k,v)=>localStorage.setItem(k,JSON.stringify(v))};
const fmt=v=>v==null?"—":"$"+v.toLocaleString(undefined,{maximumFractionDigits:v<100?2:0});
const pc=v=>v==null?'<span class="muted">n/a</span>':`<span class="${v>=0?'up':'dn'}">${v>0?'+':''}${v}%</span>`;
const CATS={all:"All",pokemon:"Pokémon",yugioh:"Yu-Gi-Oh",sports:"Sports",NFL:"NFL",NBA:"NBA",MLB:"MLB"};
const SPIKE={"1d":10,"7d":15,"30d":20}; // % threshold to flag a spike
let DATA={items:[],errors:[]},cat="all";
$$("nav button").forEach(b=>b.onclick=()=>{$$("nav button").forEach(x=>x.classList.toggle("on",x==b));$$(".tab").forEach(t=>t.classList.toggle("on",t.id=="t-"+b.dataset.t));scrollTo(0,0)});
// ---------- MARKETS ----------
fetch("data/prices.json?"+Date.now()).then(r=>r.json()).then(d=>{DATA=d;$("#upd").textContent="Prices "+new Date(d.updated).toLocaleString("en-US",{timeZone:"America/New_York",month:"short",day:"numeric",hour:"numeric",minute:"2-digit"})+" ET";renderMarket();fillCards()}).catch(()=>{$("#watch").innerHTML='<p class="dn">No price data yet (run scripts/fetch_prices.py).</p>'});
$("#catChips").innerHTML=Object.entries(CATS).map(([k,v])=>`<span class="chip ${k=='all'?'on':''}" data-c="${k}">${v}</span>`).join("");
$$("#catChips .chip").forEach(c=>c.onclick=()=>{cat=c.dataset.c;$$("#catChips .chip").forEach(x=>x.classList.toggle("on",x==c));renderMarket()});
$("#grade").onchange=$("#win").onchange=()=>renderMarket();
function items(){const local=LS.get("localWatch",[]).map(x=>({...x,local:true,prices:{},change:{}}));
 return [...DATA.items,...local].filter(i=>cat=="all"||i.cat==cat||i.sport==cat)}
function renderMarket(){const g=$("#grade").value,w=$("#win").value,its=items();
 const ch=i=>i.change?.[g]?.[w];
 const mv=its.filter(i=>ch(i)!=null).sort((a,b)=>Math.abs(ch(b))-Math.abs(ch(a))).slice(0,6);
 $("#movers").innerHTML=mv.length?mv.map(i=>`<a class="mv" href="${i.url}" target="_blank" style="text-decoration:none;color:inherit"><b>${i.name}</b><span class="muted small">${CATS[i.sport||i.cat]}</span><div class="big">${pc(ch(i))}</div>${fmt(i.prices[g])}${Math.abs(ch(i))>=SPIKE[w]?'<span class="spike">SPIKE</span>':''}</a>`).join(""):
  `<p class="muted">No ${w} change available yet for ${g}. ${w!="30d"?"1d/7d changes appear once the daily snapshot job has run for 1/7 days (first snapshot: "+(DATA.updated||"").slice(0,10)+").":""}</p>`;
 $("#watch").innerHTML=`<table><tr><th>Card</th><th>Raw</th><th>PSA 10</th><th>1d</th><th>7d</th><th>30d</th></tr>${its.map(i=>`<tr><td><a href="${i.url||'#'}" target="_blank">${i.name}</a> <span class="tag">${CATS[i.sport||i.cat]}</span>${i.local?' <span class="tag">pending</span>':''}${i.ygoprodeck?.tcgplayer?`<div class="muted small">TCGplayer ${fmt(i.ygoprodeck.tcgplayer)} (cheapest printing, YGOPRODeck)</div>`:''}</td><td>${fmt(i.prices?.Ungraded)}</td><td>${fmt(i.prices?.["PSA 10"])}</td><td>${pc(i.change?.[g]?.["1d"])}</td><td>${pc(i.change?.[g]?.["7d"])}</td><td>${pc(i.change?.[g]?.["30d"])}</td></tr>`).join("")}</table>`;
 $("#srcNote").innerHTML=`Changes shown for <b>${g}</b>. Sources: PriceCharting / SportsCardsPro (prices based on completed eBay sales) and YGOPRODeck (TCGplayer). 30d uses PriceCharting's monthly price history until 30 days of our own daily snapshots exist. Spike = move ≥ ${SPIKE[w]}% over ${w}.${DATA.errors?.length?` <span class="dn">${DATA.errors.length} fetch error(s) last run: ${DATA.errors.map(e=>e.item+" ("+e.source+")").join(", ")}</span>`:""}`}
$("#addBtn").onclick=()=>{const name=$("#addName").value.trim(),url=$("#addUrl").value.trim(),c=$("#addCat").value;
 const m=url.match(/\/game\/([^?#]+)/);if(!name||!m)return $("#addOut").textContent="Need a name and a pricecharting.com or sportscardspro.com /game/ URL.";
 const it={cat:c,name,path:decodeURIComponent(m[1]),url};const l=LS.get("localWatch",[]);l.push(it);LS.set("localWatch",l);renderMarket();
 $("#addOut").innerHTML=`Saved on this device. To track prices daily, add this line to watchlist.json:\n${JSON.stringify({cat:c,name,path:it.path})},\n<a target="_blank" href="${REPO_EDIT}">Open watchlist.json editor on GitHub</a>`};
const REPO_EDIT="https://github.com/tylerjlima-eng/tyler-dashboard/edit/main/data/watchlist.json";
// ---------- LISTING ----------
function fillCards(){$("#lCard").innerHTML+=DATA.items.map((i,n)=>`<option value="${n}">${i.name}</option>`).join("")}
const median=a=>{a=[...a].sort((x,y)=>x-y);const m=a.length>>1;return a.length?(a.length%2?a[m]:(a[m-1]+a[m])/2):null};
function comps(){const i=DATA.items[$("#lCard").value],graded=$("#lCond").value.startsWith("2750"),gr=$("#lGrade").value.trim();let html="",base=null;
 if(i){const key=graded?(gr=="10"?"PSA 10":gr?("Grade "+gr):"PSA 10"):"Ungraded";base=i.prices[key]??null;
  html+=`<div><b>${i.name}</b> — PriceCharting ${key}: <b>${fmt(base)}</b> <a href="${i.url}" target="_blank">source</a></div><div class="small muted">All grades: ${Object.entries(i.prices).map(([k,v])=>k+" "+fmt(v)).join(" · ")}</div>`;
  if(i.ygoprodeck)html+=`<div class="small">YGOPRODeck: ${Object.entries(i.ygoprodeck).map(([k,v])=>k+" "+fmt(v)).join(" · ")}</div>`}
 else html='<span class="muted">Pick a watchlist card for automatic comps, or paste sold prices below.</span>';
 const q=encodeURIComponent([$("#lPlayer").value,$("#lSet").value,graded?$("#lGrader").value+" "+gr:""].join(" ").trim());
 if(q)html+=`<div class="small">Check comps: <a target="_blank" href="https://www.ebay.com/sch/i.html?_nkw=${q}&LH_Sold=1&LH_Complete=1">eBay sold</a> · <a target="_blank" href="https://www.130point.com/sales/?q=${q}">130point</a> · <a target="_blank" href="https://www.pricecharting.com/search-products?type=prices&q=${q}">PriceCharting</a></div>`;
 $("#comps").innerHTML=html;
 const man=$("#lManual").value.split(/[\s,]+/).map(x=>parseFloat(x.replace("$",""))).filter(x=>x>0),mm=median(man);
 const s=mm??base;$("#suggest").innerHTML=s?`Suggested price: <b>${fmt(s)}</b> <span class="muted small">(${mm?"median of "+man.length+" comps you entered":"PriceCharting market value"}; Buy-It-Now start ~${fmt(+(s*1.1).toFixed(2))} if you'll take offers)</span>`:'<span class="muted">No suggestion yet: no comps.</span>';
 if(s&&!$("#lPrice").dataset.touched)$("#lPrice").value=s.toFixed(2)}
$("#lPrice").oninput=e=>e.target.dataset.touched=1;
["#lCard","#lCond","#lGrade","#lGrader","#lManual","#lPlayer","#lSet"].forEach(s=>$(s).addEventListener("input",comps));
$("#lCard").addEventListener("change",()=>{const i=DATA.items[$("#lCard").value];if(i){$("#lPlayer").value=i.name.replace(/\s*\(.*\)/,"");$("#lSet").value=(i.title||"").replace(i.name,"").replace(/Prices?/,"").trim()}comps()});
function draft(){const [cid,cl]=$("#lCond").value.split("|"),g=cid=="2750";return{player:$("#lPlayer").value,set:$("#lSet").value,conditionId:cid,condition:cl,grader:$("#lGrader").value,grade:$("#lGrade").value,raw:$("#lRaw").value,cert:$("#lCert").value,notes:$("#lNotes").value,price:$("#lPrice").value,title:$("#lTitle").value,description:$("#lDesc").value,graded:g}}
$("#gen").onclick=()=>{const d=draft();let t=[d.set,d.player,d.graded?d.grader+" "+d.grade:"",d.graded?"":"NM"].filter(Boolean).join(" ").replace(/\s+/g," ");
 if(t.length<70&&!d.graded)t+=" Raw Card";$("#lTitle").value=t.slice(0,80);$("#tLen").textContent=$("#lTitle").value.length;
 $("#lDesc").value=`${d.player}${d.set?" — "+d.set:""}\n\nCondition: ${d.graded?`Graded ${d.grader} ${d.grade}${d.cert?" (cert #"+d.cert+")":""}`:`Ungraded / raw — ${d.raw}`}\n${d.notes?"\nNotes: "+d.notes+"\n":""}\nWhat you see is what you get: please review all photos, which are of the exact card you'll receive.\n\nShipping: ${(+d.price||0)>=20?"Ships in penny sleeve + top loader + team bag in a bubble mailer with tracking.":"Ships in penny sleeve + top loader."} Ships within 1 business day.\nQuestions? Message me before buying. Thanks for checking out ya_mothers_garage!`};
$("#lTitle").oninput=()=>$("#tLen").textContent=$("#lTitle").value.length;
$("#saveDraft").onclick=()=>{const l=LS.get("drafts",[]);l.unshift({...draft(),saved:new Date().toISOString()});LS.set("drafts",l);renderDrafts()};
$("#copyDraft").onclick=()=>navigator.clipboard.writeText($("#lTitle").value+"\n\n"+$("#lDesc").value+"\n\nPrice: $"+$("#lPrice").value);
$("#payload").onclick=()=>{const d=draft();$("#payloadOut").textContent=JSON.stringify(EBAY.build({...d,description:d.description}),null,1)+"\n\n"+(EBAY.BACKEND_URL?"":"⚠ Not connected: publishing needs eBay API keys + backend (Setup tab).")};
function renderDrafts(){const l=LS.get("drafts",[]);$("#drafts").innerHTML=l.length?l.map((d,i)=>`<div class="ev"><b>${d.title||d.player||"(untitled)"}</b> — $${d.price||"?"}<div class="small muted">${new Date(d.saved).toLocaleString()} <a href="#" data-del="${i}">delete</a></div></div>`).join(""):'<p class="muted small">None yet.</p>';
 $$("[data-del]").forEach(a=>a.onclick=e=>{e.preventDefault();l.splice(a.dataset.del,1);LS.set("drafts",l);renderDrafts()})}
renderDrafts();comps();
// ---------- SCHEDULE ----------
let SEED=[],view=new Date(),sel=null,evcat=new Set(["pokemon","yugioh","sports","show","ebay","task"]);
const EVN={pokemon:"Pokémon",yugioh:"Yu-Gi-Oh",sports:"Sports releases",show:"Card shows",ebay:"eBay",task:"My tasks"};
fetch("data/events.json").then(r=>r.json()).then(d=>{SEED=d;renderCal()});
$("#evChips").innerHTML=Object.entries(EVN).map(([k,v])=>`<span class="chip on" data-e="${k}"><span class="dot c-${k}"></span>${v}</span>`).join("");
$$("#evChips .chip").forEach(c=>c.onclick=()=>{const k=c.dataset.e;evcat.has(k)?evcat.delete(k):evcat.add(k);c.classList.toggle("on");renderCal()});
const tasks=()=>LS.get("tasks",[]).map(t=>({...t,cat:"task"}));
const allEv=()=>[...SEED,...tasks()].filter(e=>evcat.has(e.cat)).sort((a,b)=>(a.date+(a.time||"")).localeCompare(b.date+(b.time||"")));
const iso=d=>d.toLocaleDateString("en-CA",{timeZone:"America/New_York"});
const on=(e,ds)=>ds>=e.date&&ds<=(e.end||e.date);
function renderCal(){const y=view.getFullYear(),m=view.getMonth(),first=new Date(y,m,1),n=new Date(y,m+1,0).getDate(),ev=allEv(),today=iso(new Date());
 $("#mLabel").textContent=first.toLocaleString("en-US",{month:"long",year:"numeric"});
 let h="SMTWTFS".split("").map(d=>`<div class="dow">${d}</div>`).join("")+"<div></div>".repeat(first.getDay()).replace(/<div>/g,'<div style="background:none">');
 for(let d=1;d<=n;d++){const ds=`${y}-${String(m+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;const es=ev.filter(e=>on(e,ds));
  h+=`<div data-d="${ds}" class="${ds==today?"today":""} ${ds==sel?"sel":""}">${d}<br>${es.slice(0,6).map(e=>`<span class="dot c-${e.cat}"></span>`).join("")}</div>`}
 $("#cal").innerHTML=h;$$("#cal [data-d]").forEach(c=>c.onclick=()=>{sel=sel==c.dataset.d?null:c.dataset.d;renderCal()});
 const list=sel?ev.filter(e=>on(e,sel)):ev.filter(e=>(e.end||e.date)>=today).slice(0,25);
 $("#dayLabel").textContent=sel?new Date(sel+"T12:00").toDateString():"Upcoming";
 $("#evList").innerHTML=list.length?list.map(e=>`<div class="ev" style="border-color:var(--c)"><span class="dot c-${e.cat}"></span> <b>${e.title}</b><div class="small muted">${e.date}${e.end?" → "+e.end:""}${e.time?" "+e.time:""} · ${EVN[e.cat]}${e.note?" · "+e.note:""}${e.url?` · <a href="${e.url}" target="_blank">source</a>`:""}${e.cat=="task"?` · <a href="#" data-tdel="${e.id}">delete</a>`:""}</div>${e.notes?`<div class="small">${e.notes}</div>`:""}</div>`).join(""):'<p class="muted">Nothing scheduled.</p>';
 $$("[data-tdel]").forEach(a=>a.onclick=ev=>{ev.preventDefault();LS.set("tasks",LS.get("tasks",[]).filter(t=>t.id!=a.dataset.tdel));renderCal()})}
$("#prevM").onclick=()=>{view=new Date(view.getFullYear(),view.getMonth()-1,1);renderCal()};$("#nextM").onclick=()=>{view=new Date(view.getFullYear(),view.getMonth()+1,1);renderCal()};
$("#tAdd").onclick=()=>{const t={id:"t"+Date.now(),title:$("#tTitle").value.trim(),date:$("#tDate").value,time:$("#tTime").value,notes:$("#tNote").value};if(!t.title||!t.date)return alert("Title and date needed");
 const l=LS.get("tasks",[]);l.push(t);LS.set("tasks",l);$("#tTitle").value=$("#tNote").value="";renderCal()};
function ics(evs){const esc=s=>(s||"").replace(/[\\,;]/g,m=>"\\"+m).replace(/\n/g,"\\n"),D=s=>s.replace(/-/g,"");
 const nx=s=>{const d=new Date(s+"T12:00");d.setDate(d.getDate()+1);return iso(d).replace(/-/g,"")};
 const L=["BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//Tyler Card Desk//EN","CALSCALE:GREGORIAN"];
 evs.forEach(e=>{L.push("BEGIN:VEVENT","UID:"+e.id+"@tyler-card-desk","DTSTAMP:"+new Date().toISOString().replace(/[-:]|\.\d+/g,""));
  if(e.time){L.push(`DTSTART;TZID=America/New_York:${D(e.date)}T${e.time.replace(":","")}00`,"BEGIN:VALARM","ACTION:DISPLAY","DESCRIPTION:"+esc(e.title),"TRIGGER:-PT30M","END:VALARM")}
  else L.push("DTSTART;VALUE=DATE:"+D(e.date),"DTEND;VALUE=DATE:"+nx(e.end||e.date));
  L.push("SUMMARY:"+esc(e.title),"DESCRIPTION:"+esc([e.notes,e.note,e.url].filter(Boolean).join("\n")));if(e.url)L.push("URL:"+e.url);L.push("END:VEVENT")});
 L.push("END:VCALENDAR");const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([L.join("\r\n")],{type:"text/calendar"}));a.download="card-desk.ics";a.click()}
$("#icsAll").onclick=()=>ics(allEv());$("#icsMine").onclick=()=>ics(tasks());
$("#notif").onclick=async()=>{if(!("Notification"in window))return alert("Notifications not supported here; use the .ics export.");const p=await Notification.requestPermission();alert(p=="granted"?"Reminders on while this page is open. For reliable phone alerts, export .ics to your calendar.":"Permission not granted.")};
setInterval(()=>{if(Notification?.permission!="granted")return;const now=new Date(),k=LS.get("notified",[]);tasks().forEach(t=>{if(!t.time||k.includes(t.id))return;const when=new Date(t.date+"T"+t.time);if(when-now<15*60e3&&when>now-60e3){new Notification("⏰ "+t.title);k.push(t.id);LS.set("notified",k)}})},60e3);
// ---------- SETUP ----------
fetch("SETUP.md").then(r=>r.text()).then(t=>{$("#setupDoc").innerHTML=t.split("\n").map(l=>l.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/`([^`]+)`/g,"<code>$1</code>").replace(/\*\*([^*]+)\*\*/g,"<b>$1</b>").replace(/\[([^\]]+)\]\(([^)]+)\)/g,'<a href="$2" target="_blank">$1</a>').replace(/(^|\s)(https?:\/\/\S+)/g,'$1<a href="$2" target="_blank">$2</a>')).map(l=>l.startsWith("### ")?`<h3>${l.slice(4)}</h3>`:l.startsWith("## ")?`<h2>${l.slice(3)}</h2>`:l.startsWith("# ")?`<h2>${l.slice(2)}</h2>`:l.match(/^\s*[-\d]/)?`<div style="margin-left:10px">${l}</div>`:l?`<p>${l}</p>`:"").join("")});
