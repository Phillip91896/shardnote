const pages = ["dashboard","spot","tickets","messages","commands","features","templates","upgrades","store","activate","music","settings","logs","admin"];
const titles = {dashboard:"Dashboard",spot:"Mit spot",tickets:"Tickets",messages:"Beskeder",commands:"Commands",features:"Bot-funktioner",templates:"Discord-skitser",upgrades:"Opgraderinger",store:"Store",activate:"Aktivér key",music:"Musik",settings:"Indstillinger",logs:"Logs",admin:"Admin-panel"};
let settings = {prefix:"!",maintenance:false,autoReply:true,welcomeMessages:true,buttonLabels:{}};
let ticketCache = [];
let adminTicketCache = [];

async function addBotToDiscord(){
  try{
    const r=await fetch("/api/bot/invite");
    const data=await r.json();
    if(!r.ok) throw new Error(data.error || "The Discord bot is not online yet.");
    window.location.href=data.url;
  }catch(e){
    toast(e.message);
  }
}

document.addEventListener("click",function(event){
  const btn=event.target.closest(".nav button[data-page]");
  if(!btn) return;
  event.preventDefault();
  navigate(btn.dataset.page);
});

function navigate(page){
  if(!pages.includes(page)) return;
  if(page==="settings" && currentUser && currentUser.role!=="admin" && currentUser.plan!=="member_pro") return;
  pages.forEach(p=>{
    const el=document.getElementById("page-"+p);
    if(el) el.classList.toggle("active",p===page);
  });
  document.querySelectorAll(".nav button").forEach(b=>b.classList.toggle("active",b.dataset.page===page));
  const title=document.getElementById("pageTitle");
  if(title) title.textContent=titles[page] || page;
  if(page==="spot") setTimeout(renderSpotImage,0);
  if(page==="tickets") loadTickets();
  if(page==="messages") loadMessages();
  if(page==="upgrades") loadUpgradeIdeas();
  if(page==="store") loadStorePage();
  if(page==="activate") document.getElementById("licenseActivationKey")?.focus();
  if(page==="commands") loadCommands();
  if(page==="settings") loadSettings();
  if(page==="logs") loadLogs();
  if(page==="admin"){ loadAdminTickets(); loadUsers(); loadDatabaseSummary(); loadIpCenter(); loadSerialGuilds(); loadSerialKeysList(); }
}


function renderSpotImage(){
  const canvas=document.getElementById("spotCanvas");
  if(!canvas) return;
  const title=document.getElementById("spotTitle")?.value || "Shardnote Bot";
  const subtitle=document.getElementById("spotSubtitle")?.value || "";
  const width=Math.max(300,Math.min(2400,Number(document.getElementById("spotWidth")?.value||1200)));
  const height=Math.max(300,Math.min(1600,Number(document.getElementById("spotHeight")?.value||630)));
  const bg=document.getElementById("spotBackground")?.value || "#11111b";
  const textColor=document.getElementById("spotTextColor")?.value || "#ffffff";
  const accent=document.getElementById("spotAccent")?.value || "#6d28d9";
  const radius=Math.max(0,Number(document.getElementById("spotRadius")?.value||0));
  canvas.width=width; canvas.height=height;
  const ctx=canvas.getContext("2d");
  ctx.clearRect(0,0,width,height);

  function roundedRect(x,y,w,h,r){
    r=Math.min(r,w/2,h/2);
    ctx.beginPath();
    ctx.moveTo(x+r,y); ctx.arcTo(x+w,y,x+w,y+h,r); ctx.arcTo(x+w,y+h,x,y+h,r);
    ctx.arcTo(x,y+h,x,y,r); ctx.arcTo(x,y,x+w,y,r); ctx.closePath();
  }
  ctx.save();
  if(radius){roundedRect(0,0,width,height,radius);ctx.clip();}
  ctx.fillStyle=bg;ctx.fillRect(0,0,width,height);
  const grad=ctx.createLinearGradient(0,0,width,height);
  grad.addColorStop(0,accent);
  grad.addColorStop(1,"rgba(0,0,0,0)");
  ctx.globalAlpha=.34;ctx.fillStyle=grad;ctx.fillRect(0,0,width,height);
  ctx.globalAlpha=1;
  ctx.fillStyle=accent;ctx.fillRect(0,height-10,width,10);

  const pad=Math.round(width*.075);
  ctx.fillStyle=textColor;
  ctx.textAlign="left";
  ctx.textBaseline="middle";
  const titleSize=Math.max(34,Math.min(110,width*.075));
  ctx.font="800 "+titleSize+"px system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif";
  ctx.fillText(title,pad,height*.46);
  if(subtitle){
    const subSize=Math.max(18,Math.min(48,width*.032));
    ctx.font="500 "+subSize+"px system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif";
    ctx.globalAlpha=.82;
    ctx.fillText(subtitle,pad,height*.58);
    ctx.globalAlpha=1;
  }
  ctx.restore();
}
function downloadSpotImage(){
  renderSpotImage();
  const canvas=document.getElementById("spotCanvas");
  if(!canvas) return;
  const a=document.createElement("a");
  const safe=(document.getElementById("spotTitle")?.value||"Shardnote Bot").trim().replace(/[^a-z0-9-_]+/gi,"-").replace(/^-|-$/g,"").toLowerCase()||"Shardnote Bot";
  a.download=safe+".png";
  a.href=canvas.toDataURL("image/png");
  a.click();
  toast("✅ Billedet er hentet");
}

async function api(url, options){
  const r=await fetch(url, options);
  const data=await r.json();
  if(!r.ok) throw new Error(data.error||"Request failed");
  return data;
}
function toast(msg){const el=document.getElementById("toast");el.textContent=msg;el.style.display="block";setTimeout(()=>el.style.display="none",2500)}
function escapeHtml(s){return String(s).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[m]))}

function botInstallButton(){
  return '<button class="btn primary small" onclick="addBotToDiscord()">+ Add Bot to Discord</button>';
}

const DEFAULT_BUTTON_LABELS={dashboardSeeAll:"Se alle",ticketNew:"+ Ny ticket",messageSend:"Send besked",commandRun:"Kør command",musicExecute:"Udfør",settingsSave:"Gem ændringer",logsRefresh:"Opdater",logsLock:"🔒 Lås",logsUnlock:"🔓 Åbn logcenter",adminAddUser:"+ Tilføj bruger",adminRefresh:"Opdater"};
function getButtonLabel(key){const custom=settings.buttonLabels||{};return escapeHtml(String(custom[key]||DEFAULT_BUTTON_LABELS[key]||key));}
function applyButtonLabels(){Object.keys(DEFAULT_BUTTON_LABELS).forEach(key=>{const node=document.querySelector('[data-button-label="' + key + '"]');if(node)node.textContent=getButtonLabel(key);const input=document.getElementById("buttonLabel_"+key);if(input)input.value=String((settings.buttonLabels||{})[key]||DEFAULT_BUTTON_LABELS[key]);});}

async function loadStats(){
  try{
    const s=await api("/api/stats");
    document.getElementById("statBot").textContent=s.botOnline?"Online":"Offline";
    document.getElementById("statServers").textContent=s.servers;
    const usersCard=document.getElementById("statUsersCard");
    if(usersCard){
      usersCard.style.display="";
      document.getElementById("statUsers").textContent=s.users ?? 0;
    }
    document.getElementById("statTickets").textContent=s.tickets;
    document.getElementById("statusText").textContent=s.botOnline?"Discord connected":"Web mode";
    document.getElementById("statusDot").className="dot "+(s.botOnline?"online":"");
    const tickets=await api("/api/tickets");
    document.getElementById("dashTickets").innerHTML=tickets.slice(0,5).map(t=>`<div class="activity-item"><div class="activity-icon">🎫</div><div><b>#${t.id} — ${escapeHtml(t.title)}</b><small>${escapeHtml(t.user)} · <span class="badge ${t.status}">${t.status}</span></small></div></div>`).join("")||'<div class="empty">Ingen tickets endnu.</div>';
    document.getElementById("dashLogs").innerHTML='<div class="empty">Logs er beskyttet. Åbn Logs for at se aktivitet.</div>';
  }catch(e){toast(e.message)}
}

function ticketHandlerLabel(handler){
  return handler==="ai" ? "🤖 AI" : handler==="admins" ? "👑 Admins" : "🎫 Ticket";
}
function ticketStatusLabel(status){
  return status==="open" ? "Åben" : status==="pending" ? "Afventer" : status==="resolved" ? "Løst" : "Lukket";
}
function ticketPriorityLabel(priority){
  return priority==="high" ? "Høj" : priority==="low" ? "Lav" : "Normal";
}
function formatTicketResponseTime(minutes){
  if(minutes==null || !Number.isFinite(Number(minutes))) return "—";
  const value=Number(minutes);
  if(value<1) return "<1 min";
  if(value<60) return Math.round(value)+" min";
  const hours=Math.floor(value/60);
  const mins=Math.round(value%60);
  return hours+"t "+mins+"m";
}
function ticketFilterValues(prefix){
  const p=prefix==="admin" ? "adminTicket" : "ticket";
  return {
    search:(document.getElementById(p+"Search")?.value||"").trim().toLowerCase(),
    status:document.getElementById(p+"StatusFilter")?.value||"all",
    handler:document.getElementById(p+"HandlerFilter")?.value||"all",
    priority:document.getElementById(p+"PriorityFilter")?.value||"all"
  };
}
function filterTicketList(list,prefix){
  const f=ticketFilterValues(prefix);
  return list.filter(t=>{
    const hay=[t.id,t.title,t.user,t.description,t.category,t.handler,t.status,t.priority,(t.tags||[]).join(" ")].join(" ").toLowerCase();
    return (!f.search || hay.includes(f.search))
      && (f.status==="all" || t.status===f.status)
      && (f.handler==="all" || (t.handler||"admins")===f.handler)
      && (f.priority==="all" || (t.priority||"normal")===f.priority);
  });
}
function updateTicketFilterCount(list,prefix){
  const id=prefix==="admin" ? "adminTicketCounts" : "ticketCounts";
  const node=document.getElementById(id);
  if(!node) return;
  const open=list.filter(t=>t.status==="open").length;
  const pending=list.filter(t=>t.status==="pending").length;
  const resolved=list.filter(t=>t.status==="resolved").length;
  const closed=list.filter(t=>t.status==="closed").length;
  node.textContent=list.length+" tickets · "+open+" åbne · "+pending+" afventer · "+resolved+" løste · "+closed+" lukkede";
}
function bindTicketFilterEvents(prefix,loader){
  const ids=prefix==="admin"
    ? ["adminTicketSearch","adminTicketStatusFilter","adminTicketHandlerFilter","adminTicketPriorityFilter"]
    : ["ticketSearch","ticketStatusFilter","ticketHandlerFilter","ticketPriorityFilter"];
  ids.forEach(id=>{
    const el=document.getElementById(id);
    if(!el || el.dataset.bound==="1") return;
    el.dataset.bound="1";
    el.addEventListener(el.tagName==="INPUT"?"input":"change",loader);
  });
}
async function loadTicketOverview(){
  try{
    const data=await api("/api/tickets/overview");
    const set=(id,value)=>{const el=document.getElementById(id);if(el)el.textContent=value;};
    set("ticketMetricTotal",data.total||0);
    set("ticketMetricOpen",data.open||0);
    set("ticketMetricPending",data.pending||0);
    set("ticketMetricResponse",formatTicketResponseTime(data.avgResponseMinutes));
  }catch{}
}
function tagHtml(tags){
  return (Array.isArray(tags)?tags:[]).slice(0,4).map(tag=>'<span class="badge pending" style="margin:2px">'+escapeHtml(tag)+'</span>').join("");
}
function renderTicketTable(list,nodeId,isAdmin,prefix){
  const node=document.getElementById(nodeId);
  if(!node) return;
  const filtered=filterTicketList(list,prefix);
  updateTicketFilterCount(list,prefix);
  if(!filtered.length){
    node.innerHTML='<div class="empty">Ingen tickets matcher dine filtre.</div>';
    return;
  }
  node.innerHTML='<div class="table-wrap"><table class="table"><thead><tr>'+
    '<th>ID</th><th>Titel</th><th>Bruger</th><th>Behandler</th><th>Status</th><th>Prioritet</th><th>Ansvarlig</th><th>Handlinger</th>'+
    '</tr></thead><tbody>'+
    filtered.map(t=>{
      const handlerOptions='<select class="ticket-handler" data-ticket-handler="'+t.id+'">'+
        '<option value="ai" '+(t.handler==="ai"?"selected":"")+'>🤖 AI</option>'+
        '<option value="admins" '+((!t.handler||t.handler==="admins")?"selected":"")+'>👑 Admins</option>'+
        '<option value="ticket" '+(t.handler==="ticket"?"selected":"")+'>🎫 Ticket</option></select>';
      const statusActions=t.status==="closed"||t.status==="resolved"
        ? '<button class="btn small" onclick="reopenTicket('+t.id+')">Genåbn</button> '
        : '<button class="btn small" onclick="resolveTicket('+t.id+')">Løs</button> <button class="btn small" onclick="closeTicket('+t.id+')">Luk</button> ';
      return '<tr><td>#'+t.id+'</td><td><b>'+escapeHtml(t.title||"Ticket")+'</b><div>'+tagHtml(t.tags)+'</div></td><td>'+escapeHtml(t.user||"")+'</td><td>'+handlerOptions+'</td>'+
        '<td><span class="badge '+escapeHtml(t.status||"open")+'">'+escapeHtml(ticketStatusLabel(t.status||"open"))+'</span></td>'+
        '<td><span class="badge '+escapeHtml(t.priority||"normal")+'">'+escapeHtml(ticketPriorityLabel(t.priority||"normal"))+'</span></td>'+
        '<td>'+(t.claimedBy?'👤 '+escapeHtml(String(t.claimedBy)):'—')+'</td>'+
        '<td><button class="btn small" onclick="openTicketReply('+t.id+')">Åbn</button> '+
        (isAdmin?'<button class="btn small" onclick="claimTicket('+t.id+')">'+(t.claimedBy?"👤 Frigiv":"🙋 Claim")+'</button> '+statusActions+'<button class="btn small" onclick="downloadTicketTranscript('+t.id+')">📄</button> <button class="btn small" onclick="aiTicketReply('+t.id+',this)">🤖 AI</button> <button class="btn small danger ticket-delete" data-ticket-id="'+t.id+'">Slet</button>':'')+
        '</td></tr>';
    }).join("")+
    '</tbody></table></div>';
  node.querySelectorAll(".ticket-handler").forEach(el=>el.addEventListener("change",function(){setTicketHandler(this.dataset.ticketHandler,this.value);}));
  node.querySelectorAll(".ticket-delete").forEach(el=>el.addEventListener("click",function(){deleteTicket(this.dataset.ticketId);}));
}
async function loadTickets(){
  const node=document.getElementById("ticketList");
  if(!node) return;
  bindTicketFilterEvents("tickets","loadTickets");
  try{
    ticketCache=await api("/api/tickets");
    renderTicketTable(ticketCache,"ticketList",currentUser?.role==="admin","tickets");
    loadTicketOverview();
  }catch(e){node.innerHTML='<div class="empty">'+escapeHtml(e.message)+'</div>';}
}
async function patchTicketAction(id,action){
  try{
    await api("/api/tickets/"+id+"/"+action,{method:"POST"});
    toast(action==="claim"?"✅ Ticket claimed":action==="unclaim"?"✅ Ticket frigivet":action==="resolve"?"✅ Ticket markeret som løst":action==="close"?"🔒 Ticket lukket":"🔓 Ticket genåbnet");
    loadTickets();loadAdminTickets();loadTicketOverview();
  }catch(e){toast(e.message)}
}
function claimTicket(id){
  const current=ticketCache.find(t=>String(t.id)===String(id))||adminTicketCache.find(t=>String(t.id)===String(id));
  patchTicketAction(id,current?.claimedBy?"unclaim":"claim");
}
function resolveTicket(id){patchTicketAction(id,"resolve")}
function closeTicket(id){patchTicketAction(id,"close")}
function reopenTicket(id){patchTicketAction(id,"reopen")}
async function openTicketReply(id){
  try{
    const messages=await api("/api/tickets/"+id+"/messages");
    const ticket=(await api("/api/tickets")).find(t=>String(t.id)===String(id));
    const isAdmin=currentUser?.role==="admin";
    const modal=document.createElement("div");
    modal.id="ticketChatModal";
    modal.style.cssText="position:fixed;inset:0;background:rgba(0,0,0,.72);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px";
    modal.innerHTML='<div style="width:min(900px,100%);max-height:90vh;background:#11131b;border:1px solid var(--border);border-radius:16px;display:flex;flex-direction:column;overflow:hidden">'+
      '<div style="padding:16px 18px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;gap:12px"><div><b>🎫 Ticket #'+id+'</b><div style="color:var(--muted);font-size:12px">'+escapeHtml(ticket?.title||"Ticket")+' · '+ticketHandlerLabel(ticket?.handler)+'</div></div><button class="btn small" id="ticketChatClose">Luk</button></div>'+
      '<div id="ticketChatMessages" style="padding:18px;overflow:auto;min-height:320px;max-height:55vh"></div>'+
      '<div style="padding:14px 18px;border-top:1px solid var(--border)">'+
        (isAdmin ? '<div style="display:flex;gap:8px;align-items:center;margin-bottom:8px"><select id="ticketChatMode"><option value="reply">💬 Svar til kunde</option><option value="internal">🔒 Intern note</option></select><span style="color:var(--muted);font-size:12px">Interne noter kan kun ses af administratorer.</span></div>' : '')+
        '<textarea id="ticketChatInput" rows="3" placeholder="Skriv dit svar..." style="width:100%;resize:vertical;border:1px solid var(--border);background:#0b0b11;color:#fff;border-radius:10px;padding:12px;outline:none"></textarea>'+
        '<div style="display:flex;justify-content:flex-end;margin-top:10px"><button class="btn primary" id="ticketChatSend">Send svar</button></div>'+
      '</div>'+
    '</div>';
    document.body.appendChild(modal);
    const box=modal.querySelector("#ticketChatMessages");
    const render=items=>{
      box.innerHTML=items.length?items.map(m=>{
        const internal=m.authorRole==="internal";
        const mine=m.authorRole==="admin";
        const who=internal?"🔒 Intern note":m.authorRole==="admin"?"👑 Admin":m.authorRole==="ai"?"🤖 AI":"👤 Kunde";
        const bg=internal?"#2b2412":mine?"#252b3d":"#1a1d27";
        const border=internal?"rgba(255,196,76,.35)":"var(--border)";
        return '<div style="display:flex;justify-content:'+(mine?"flex-end":"flex-start")+';margin:8px 0"><div style="max-width:78%;padding:10px 12px;border-radius:12px;background:'+bg+';border:1px solid '+border+'"><div style="font-size:11px;color:var(--muted);margin-bottom:4px">'+who+' · '+escapeHtml(m.authorName||"")+'</div><div style="white-space:pre-wrap;word-break:break-word">'+escapeHtml(m.content||"")+'</div><div style="font-size:10px;color:var(--muted);margin-top:5px">'+new Date(m.createdAt).toLocaleString("da-DK")+'</div></div></div>';
      }).join(""):'<div class="empty">Ingen beskeder endnu.</div>';
      box.scrollTop=box.scrollHeight;
    };
    render(messages);
    modal.querySelector("#ticketChatClose").onclick=()=>modal.remove();
    modal.onclick=e=>{if(e.target===modal)modal.remove();};
    modal.querySelector("#ticketChatSend").onclick=async()=>{
      const input=modal.querySelector("#ticketChatInput");
      const content=input.value.trim();
      if(!content)return;
      input.disabled=true;
      modal.querySelector("#ticketChatSend").disabled=true;
      const mode=modal.querySelector("#ticketChatMode")?.value || "reply";

      let aiTyping=false;
      const showAiTyping=()=>{
        if(aiTyping || mode!=="reply") return;
        aiTyping=true;
        const typing=document.createElement("div");
        typing.id="ticketAiTyping";
        typing.style.cssText="display:flex;justify-content:flex-start;margin:8px 0";
        typing.innerHTML='<div style="max-width:78%;padding:10px 12px;border-radius:12px;background:#1a1d27;border:1px solid var(--border)"><div style="font-size:11px;color:var(--muted);margin-bottom:4px">🤖 AI · Shardnote Bot AI</div><div style="color:var(--muted)">AI skriver et svar…</div></div>';
        box.appendChild(typing);
        box.scrollTop=box.scrollHeight;
      };

      try{
        const currentTicket=(await api("/api/tickets")).find(t=>String(t.id)===String(id));
        if(currentTicket?.handler==="ai" && !isAdmin) showAiTyping();

        const endpoint=mode==="internal" ? "/api/tickets/"+id+"/internal-note" : "/api/tickets/"+id+"/reply";
        await api(endpoint,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({content})});

        input.value="";
        render(await api("/api/tickets/"+id+"/messages"));
        loadTickets();
        loadAdminTickets();
        toast(mode==="internal" ? "🔒 Intern note gemt" : "✅ Svar sendt");
      }catch(e){
        const typing=document.getElementById("ticketAiTyping");
        if(typing) typing.remove();
        toast(e.message);
      }finally{
        input.disabled=false;
        modal.querySelector("#ticketChatSend").disabled=false;
        input.focus();
      }
    };
    modal.querySelector("#ticketChatInput").focus();
  }catch(e){toast(e.message)}
}
async function aiTicketReply(id, button){
  if(button?.dataset.busy==="1") return;
  if(button){
    button.dataset.busy="1";
    button.disabled=true;
    button.dataset.originalText=button.textContent;
    button.textContent="🤖 AI arbejder…";
  }
  try{
    await api("/api/tickets/"+id+"/ai-reply",{method:"POST"});
    toast("🤖 AI-svar sendt");
    loadTickets();
    loadAdminTickets();
  }catch(e){toast(e.message)}
  finally{
    if(button){
      button.disabled=false;
      button.dataset.busy="0";
      button.textContent=button.dataset.originalText || "🤖 AI svar";
    }
  }
}
function closeNewTicketComposer(){
  const modal=document.getElementById("newTicketComposer");
  if(modal) modal.remove();
}

async function createTicketFromChat(){
  const modal=document.getElementById("newTicketComposer");
  const input=modal?.querySelector("#newTicketMessage");
  const content=String(input?.value||"").trim();
  const errorNode=modal?.querySelector("#newTicketError");
  if(!content){
    if(errorNode) errorNode.textContent="Skriv først, hvad du har brug for hjælp til.";
    return;
  }
  const send=modal.querySelector("#newTicketSend");
  send.disabled=true;
  send.textContent="Opretter…";
  if(errorNode) errorNode.textContent="";
  try{
    const title=content.split(/\r?\n/)[0].slice(0,80) || "Support ticket";
    const ticket=await api("/api/tickets",{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({
        title,
        user:currentUser?.name || currentUser?.email || "Dashboard user",
        description:content,
        priority:"normal",
        handler:document.getElementById("ticketHandlerDefault")?.value || "ai"
      })
    });
    closeNewTicketComposer();
    await loadTickets();
    await loadStats();
    await openTicketReply(ticket.id);
    toast("✅ Ticket oprettet");
  }catch(e){
    if(errorNode) errorNode.textContent=e.message;
    else toast(e.message);
  }finally{
    send.disabled=false;
    send.textContent="Send ticket";
  }
}

function newTicket(){
  closeNewTicketComposer();
  const modal=document.createElement("div");
  modal.id="newTicketComposer";
  modal.style.cssText="position:fixed;inset:0;background:rgba(0,0,0,.72);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px";
  modal.innerHTML=
    '<div style="width:min(760px,100%);background:#11131b;border:1px solid var(--border);border-radius:16px;box-shadow:0 24px 80px rgba(0,0,0,.45);overflow:hidden">'+
      '<div style="padding:18px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;gap:12px">'+
        '<div><b style="font-size:18px">🎫 Opret en ticket</b><div style="color:var(--muted);font-size:12px;margin-top:4px">Skriv direkte her. Du behøver ikke skrive navn eller ticket-titel.</div></div>'+
        '<button class="btn small" type="button" id="newTicketClose">Luk</button>'+
      '</div>'+
      '<div style="padding:18px">'+
        '<textarea id="newTicketMessage" rows="8" placeholder="Skriv hvad du har brug for hjælp til…" style="width:100%;resize:vertical;border:1px solid var(--border);background:#0b0b11;color:#fff;border-radius:12px;padding:14px;outline:none"></textarea>'+
        '<div id="newTicketError" style="min-height:20px;color:var(--red);font-size:12px;margin-top:9px"></div>'+
        '<div style="display:flex;justify-content:flex-end;gap:10px;margin-top:8px"><button class="btn" type="button" id="newTicketCancel">Annuller</button><button class="btn primary" type="button" id="newTicketSend">Send ticket</button></div>'+
      '</div>'+
    '</div>';
  document.body.appendChild(modal);
  modal.querySelector("#newTicketClose").onclick=closeNewTicketComposer;
  modal.querySelector("#newTicketCancel").onclick=closeNewTicketComposer;
  modal.onclick=function(e){if(e.target===modal)closeNewTicketComposer();};
  modal.querySelector("#newTicketSend").onclick=createTicketFromChat;
  const input=modal.querySelector("#newTicketMessage");
  input.addEventListener("keydown",function(e){
    if((e.ctrlKey||e.metaKey)&&e.key==="Enter") createTicketFromChat();
  });
  input.focus();
}

async function setTicketHandler(id,handler){
  try{
    await api("/api/tickets/"+id,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({handler})});
    toast(handler==="ai"?"🤖 AI valgt":handler==="admins"?"👑 Admins valgt":"🎫 Ticket valgt");
    loadTickets();
    loadAdminTickets();
  }catch(e){toast(e.message)}
}
async function cycleTicket(id,status){
  const next={open:"pending",pending:"closed",closed:"open"}[status];
  await api("/api/tickets/"+id,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({status:next})});
  loadTickets();loadStats();loadAdminTickets();
}
async function deleteTicket(id){
  if(!confirm("Slet denne ticket?")) return;
  await api("/api/tickets/"+id,{method:"DELETE"});toast("Ticket slettet");loadTickets();loadStats();loadAdminTickets();
}

async function submitUpgradeIdea(){
  const area=document.getElementById("upgradeArea")?.value || "Website / Bot";
  const title=document.getElementById("upgradeTitle")?.value.trim();
  const description=document.getElementById("upgradeDescription")?.value.trim();
  const result=document.getElementById("upgradeResult");
  if(!title){if(result)result.innerHTML='<div class="badge closed">Skriv en titel.</div>';return;}
  if(description.length<10){if(result)result.innerHTML='<div class="badge closed">Beskriv idéen lidt mere.</div>';return;}
  try{
    const ticket=await api("/api/upgrade-ideas",{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({area,title,description})
    });
    document.getElementById("upgradeTitle").value="";
    document.getElementById("upgradeDescription").value="";
    if(result)result.innerHTML='<div class="badge open">✅ Idé sendt som ticket #'+escapeHtml(String(ticket.id))+'</div>';
    loadStats();
    loadUpgradeIdeas();
  }catch(e){
    if(result)result.innerHTML='<div class="badge closed">'+escapeHtml(e.message)+'</div>';
  }
}
async function loadUpgradeIdeas(){
  try{
    const tickets=await api("/api/tickets");
    const upgrades=tickets.filter(t=>String(t.category||"") === "upgrade");
    const box=document.getElementById("upgradeIdeasList");
    if(box){
      box.innerHTML=upgrades.length
        ? upgrades.slice(0,10).map(t=>'<div class="activity-item"><div class="activity-icon">🚀</div><div><b>#'+escapeHtml(String(t.id))+' — '+escapeHtml(t.title)+'</b><small>'+escapeHtml(t.status)+' · '+new Date(t.createdAt).toLocaleString("da-DK")+'</small></div></div>').join("")
        : '<div class="empty">Du har ikke sendt nogen opgraderingsidéer endnu.</div>';
    }
  }catch(e){
    const box=document.getElementById("upgradeIdeasList");
    if(box)box.innerHTML='<div class="empty">'+escapeHtml(e.message)+'</div>';
  }
}

async function loadMessages(){
  const items=await api("/api/messages");
  document.getElementById("messageList").innerHTML=items.length?items.map(m=>`<div class="activity-item"><div class="activity-icon">✉</div><div><b>${escapeHtml(m.channel)}</b><small>${escapeHtml(m.content)} · ${new Date(m.time).toLocaleString("da-DK")}</small></div></div>`).join(""):'<div class="empty">Ingen beskeder endnu.</div>';
}
async function sendMessage(){
  const channel=document.getElementById("messageChannel").value;
  const content=document.getElementById("messageContent").value;
  try{await api("/api/messages",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({channel,content})});document.getElementById("messageContent").value="";toast("Besked gemt");loadMessages()}catch(e){toast(e.message)}
}

const DANISH_COMMAND_DESCRIPTIONS={
  ping:"Tjekker om Shardnote Bot er online.",
  help:"Viser alle tilgængelige Shardnote Bot-commands.",
  ticket:"Opretter en support-ticket.",
  serverinfo:"Viser oplysninger om denne Discord-server.",
  userinfo:"Viser oplysninger om et Discord-medlem.",
  "ticket-panel":"Sender et panel, hvor brugere kan oprette tickets.",
  "ticket-close":"Lukker den aktuelle ticket.",
  "ticket-claim":"Tager den aktuelle ticket.",
  "ticket-transcript":"Opretter en transcript af den aktuelle ticket.",
  warn:"Giver et medlem en advarsel.",
  warnings:"Viser advarsler for et medlem.",
  clearwarnings:"Sletter alle advarsler for et medlem.",
  kick:"Kicker et medlem fra serveren.",
  ban:"Banner et medlem fra serveren.",
  unban:"Fjerner et ban ved hjælp af Discord-brugerens ID.",
  timeout:"Sætter timeout på et medlem.",
  untimeout:"Fjerner timeout fra et medlem.",
  purge:"Sletter mellem 1 og 100 beskeder.",
  slowmode:"Indstiller slowmode i den aktuelle kanal.",
  lockdown:"Låser tekstkanaler.",
  unlockdown:"Låser tekstkanaler op igen.",
  announce:"Sender en announcement som embed.",
  poll:"Opretter en afstemning.",
  suggest:"Sender et forslag.",
  giveaway:"Starter en giveaway.",
  "role-panel":"Sender en knap til en selvvalgt rolle.",
  "verify-panel":"Sender et verification-panel.",
  "set-log-channel":"Vælger log-kanalen.",
  "set-welcome":"Indstiller velkomstbeskeder.",
  "set-leave":"Indstiller farvelbeskeder.",
  "set-autorole":"Vælger den rolle, nye medlemmer får automatisk.",
  "set-support-role":"Vælger support-rollen til tickets.",
  "set-ticket-category":"Vælger kategorien til tickets.",
  "set-verification-role":"Vælger verification-rollen.",
  "set-suggestion-channel":"Vælger kanalen til forslag.",
  "set-features":"Slår botfunktioner til eller fra.",
  balance:"Viser dine coins og dit level.",
  daily:"Henter din daglige belønning.",
  work:"Tjen coins ved at arbejde.",
  leaderboard:"Viser serverens leaderboard.",
  level:"Viser XP og level.",
  backup:"Opretter en server-backup som JSON.",
  restore:"Gendanner en Shardnote Bot-backup.",
  "music-join":"Får botten til at gå ind i din voice-kanal.",
  "music-leave":"Får botten til at forlade voice-kanalen."
};

async function loadCommands(){
  const commands=await api("/api/commands");
  const danish=localStorage.getItem("Shardnote Bot_language")==="da";
  const title=document.querySelector("#page-commands .section-title h2");
  const label=document.querySelector("#page-commands .field label");
  const available=document.querySelector("#page-commands .card:nth-child(2) .section-title h2");
  if(title) title.textContent=danish?"Kommandocenter":"Command Center";
  if(label) label.textContent=danish?"Kommando":"Command";
  if(available) available.textContent=danish?"Tilgængelige commands":"Available commands";
  document.getElementById("commandCount").textContent=commands.length+" "+(danish?"commands":"commands");
  document.getElementById("commandList").innerHTML=commands.map(c=>{
    const description=danish?(DANISH_COMMAND_DESCRIPTIONS[c.name]||c.description):c.description;
    return `<div class="activity-item"><div class="activity-icon">⌘</div><div><b>${escapeHtml(c.usage)}</b><small>${escapeHtml(description)}</small></div></div>`;
  }).join("");
}
async function runCommand(){
  const command=document.getElementById("commandInput").value;
  try{const r=await api("/api/commands",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({command})});document.getElementById("commandResult").textContent=r.message;loadLogs()}catch(e){toast(e.message)}
}
function musicAction(){toast("Musikmodulet er klar til Discord voice-integration.")}
async function loadSettings(){
  settings=await api("/api/settings");
  settings.buttonLabels=settings.buttonLabels||{};
  document.getElementById("prefix").value=settings.prefix;
  ["maintenance","autoReply","welcomeMessages"].forEach(k=>document.getElementById(k+"Switch").classList.toggle("on",!!settings[k]));
  applyButtonLabels();
}
function toggleSetting(key){settings[key]=!settings[key];document.getElementById(key+"Switch").classList.toggle("on",settings[key])}
async function saveSettings(){
  settings.prefix=document.getElementById("prefix").value||"!";
  settings.buttonLabels={};
  Object.keys(DEFAULT_BUTTON_LABELS).forEach(key=>{const input=document.getElementById("buttonLabel_"+key);if(input)settings.buttonLabels[key]=String(input.value||DEFAULT_BUTTON_LABELS[key]).trim().slice(0,80);});
  settings=await api("/api/settings",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify(settings)});
  applyButtonLabels();
  toast("Indstillinger gemt");
}
function renderLogLocked(){
  document.getElementById("logContent").style.display="none";
  document.getElementById("logLockPanel").style.display="block";
  document.getElementById("logCategoryList").innerHTML="";
  document.getElementById("logPassword").value="";
}

async function loadLogCategories(){
  const categories=await api("/api/logs/categories");
  const icons={login:"🔐",security:"🛡️",tickets:"🎫",messages:"✉️",commands:"⌘",settings:"⚙️",system:"✅",warnings:"⚠️",errors:"❌"};
  document.getElementById("logCategoryList").innerHTML=categories.map(c=>`
    <details class="log-category" data-category="${escapeHtml(c.key)}" ontoggle="loadLogCategory(this)">
      <summary><span>${icons[c.key]||"•"} ${escapeHtml(c.label)}</span><b>${c.count}</b></summary>
      <div class="log-category-body"><div class="empty">Åbner…</div></div>
    </details>
  `).join("");
  document.getElementById("logLockPanel").style.display="none";
  document.getElementById("logContent").style.display="block";
}

async function loadLogCategory(element){
  if(!element.open || element.dataset.loaded==="1") return;
  const category=element.dataset.category;
  const body=element.querySelector(".log-category-body");
  body.innerHTML='<div class="empty">Henter logs…</div>';
  try{
    const items=await api("/api/logs?category="+encodeURIComponent(category));
    if(category==="login"){
      body.innerHTML=items.length
        ? `<div class="table-wrap"><table class="table"><thead><tr><th>Tid</th><th>Bruger</th><th>Resultat</th><th>Sted</th><th>Browser/enhed</th></tr></thead><tbody>${items.map(item=>{
            const place=[item.city,item.country].filter(Boolean).join(", ")||"Ukendt";
            return `<tr><td>${new Date(item.createdAt).toLocaleString("da-DK")}</td><td>${escapeHtml(item.userName||item.userEmail||"Ukendt")}</td><td><span class="badge ${item.success?"open":"closed"}">${item.success?"Succes":"Fejlet"}</span></td><td>${escapeHtml(place)}</td><td title="${escapeHtml(item.userAgent||"")}">${escapeHtml(item.userAgent||"Ukendt")}</td></tr>`;
          }).join("")}</tbody></table></div>`
        : '<div class="empty">Ingen login-logs endnu.</div>';
    }else{
      body.innerHTML=items.length
        ? `<table class="table"><thead><tr><th>Type</th><th>Hændelse</th><th>Tid</th></tr></thead><tbody>${items.map(item=>`<tr><td><span class="badge ${item.type==="error"?"closed":item.type==="warning"?"pending":"open"}">${escapeHtml(item.type)}</span></td><td>${escapeHtml(item.message)}</td><td>${new Date(item.time).toLocaleString("da-DK")}</td></tr>`).join("")}</tbody></table>`
        : '<div class="empty">Ingen logs i denne kategori endnu.</div>';
    }
    element.dataset.loaded="1";
  }catch(e){
    body.innerHTML=`<div class="empty">${escapeHtml(e.message)}</div>`;
  }
}

async function unlockLogs(){
  const password=document.getElementById("logPassword").value;
  document.getElementById("logUnlockError").textContent="";
  try{
    await api("/api/logs/unlock",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({password})});
    document.getElementById("logLockPanel").style.display="none";
    document.getElementById("logContent").style.display="block";
    await loadLogCategories();
    toast("Logs er åbnet i 15 minutter");
  }catch(e){
    document.getElementById("logUnlockError").textContent=e.message;
  }
}

async function lockLogs(){
  try{await api("/api/logs/lock",{method:"POST"});}catch(e){}
  renderLogLocked();
  toast("Logs låst");
}

async function loadLogs(){
  try{
    await loadLogCategories();
  }catch(e){
    if(e.message.includes("Logs er låst")) renderLogLocked();
    else toast(e.message);
  }
}

async function loadAdminTickets(){
  const node=document.getElementById("adminTicketList");
  if(!node) return;
  bindTicketFilterEvents("admin","loadAdminTickets");
  try{
    adminTicketCache=await api("/api/tickets");
    renderTicketTable(adminTicketCache,"adminTicketList",true,"admin");
  }catch(e){
    node.innerHTML='<div class="empty">'+escapeHtml(e.message)+'</div>';
  }
}

async function loadUsers(){
  try{
    const users=await api("/api/admin/users");
    const planNames={member:"Member",member_plus:"Member Plus",member_pro:"Member Pro"};
    document.getElementById("userList").innerHTML=users.map(u=>{
      const roleButton=u.id!==currentUser?.id
        ? `<button class="btn small" onclick="toggleUserRole(${u.id},'${u.role}')">${u.role==="admin"?"Gør til member":"Gør til admin"}</button>`
        : "";

      const nextPlan={member:"member_plus",member_plus:"member_pro",member_pro:"member"}[u.plan||"member"] || "member";
      const planButton=u.role!=="admin"
        ? `<button class="btn small" onclick="toggleUserPlan(${u.id},'${nextPlan}')">${u.plan==="member_pro"?"Gør til Member":u.plan==="member_plus"?"Gør til Member Pro":"Gør til Member Plus"}</button>`
        : "";

      let moderationButtons="";
      if(u.id!==currentUser?.id){
        moderationButtons=u.banned
          ? `<button class="btn small" onclick="unbanUser(${u.id})">✅ Fjern ban</button>`
          : `<button class="btn small danger" onclick="banUser(${u.id},'normal')">🚫 Normal ban</button>`+
            `<button class="btn small danger" onclick="banUser(${u.id},'ip')">🌐 IP-ban</button>`;
      }

      const deleteButton=u.id!==currentUser?.id
        ? `<button class="btn small danger" onclick="deleteUser(${u.id})">Slet</button>`
        : "";

      const banStatus=u.banned
        ? `<span class="badge closed">${u.banType==="ip"?"IP-bannet":"Bannet"}</span>`
        : `<span class="badge open">Aktiv</span>`;

      return `<div class="activity-item">
        <div class="activity-icon">${u.role==="admin"?"👑":"👤"}</div>
        <div style="flex:1">
          <b>${escapeHtml(u.name)}</b>
          <small>${escapeHtml(u.email)} · ${escapeHtml(u.role)} · <b>${escapeHtml(planNames[u.plan]||"Member")}</b> · ${banStatus}</small>
        </div>
        ${roleButton} ${planButton} ${moderationButtons} ${deleteButton}
      </div>`;
    }).join("")||'<div class="empty">Ingen brugere.</div>';
  }catch(e){toast(e.message)}
}

async function banUser(id,type){
  const label=type==="ip"?"IP-ban":"normal ban";
  if(!confirm("Er du sikker på, at du vil bruge "+label+" på denne bruger?\n\nVed IP-ban bliver både brugerens email/konto og den senest registrerede IP-adresse bannet.")) return;
  try{
    const result=await api("/api/admin/users/"+id+"/ban",{
      method:"PATCH",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({type})
    });
    toast(type==="ip"?"✅ IP-ban oprettet":"✅ Bruger bannet");
    loadUsers();
    if(document.getElementById("ipContent")?.style.display==="block") loadIpOverview();
  }catch(e){toast(e.message)}
}

async function unbanUser(id){
  if(!confirm("Fjern bannet fra denne bruger?")) return;
  try{
    await api("/api/admin/users/"+id+"/unban",{method:"PATCH"});
    toast("✅ Ban fjernet");
    loadUsers();
  }catch(e){toast(e.message)}
}


function renderIpLocked(){
  const content=document.getElementById("ipContent");
  const panel=document.getElementById("ipLockPanel");
  if(content) content.style.display="none";
  if(panel) panel.style.display="block";
  const input=document.getElementById("ipPassword");
  if(input) input.value="";
  const error=document.getElementById("ipUnlockError");
  if(error) error.textContent="";
}

async function unlockIpCenter(){
  const password=document.getElementById("ipPassword").value;
  document.getElementById("ipUnlockError").textContent="";
  try{
    await api("/api/ip/unlock",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({password})});
    document.getElementById("ipLockPanel").style.display="none";
    document.getElementById("ipContent").style.display="block";
    await loadIpOverview();
    toast("IP-adresser er åbnet i 15 minutter");
  }catch(e){
    document.getElementById("ipUnlockError").textContent=e.message;
  }
}

async function lockIpCenter(){
  try{await api("/api/ip/lock",{method:"POST"});}catch(e){}
  renderIpLocked();
  toast("IP-adresser låst");
}

async function loadIpCenter(){
  try{
    await loadIpOverview();
  }catch(e){}
}

async function loadIpOverview(){
  try{
    const data=await api("/api/ip/overview");
    const loginRows=data.loginHistory||[];
    const banRows=data.bannedIps||[];
    const distinct=data.distinctIps||[];

    const distinctNode=document.getElementById("ipDistinctList");
    if(distinctNode){
      distinctNode.innerHTML=distinct.length
        ? distinct.map(function(ip){return '<span class="badge open" style="margin:3px">'+escapeHtml(ip)+'</span>';}).join("")
        : '<div class="empty">Ingen gemte IP-adresser endnu.</div>';
    }

    const loginNode=document.getElementById("ipLoginList");
    if(loginNode){
      loginNode.innerHTML=loginRows.length
        ? '<div class="table-wrap"><table class="table"><thead><tr><th>Tid</th><th>Bruger</th><th>Resultat</th><th>IP-adresse</th><th>Browser/enhed</th></tr></thead><tbody>'+
          loginRows.map(function(item){
            return '<tr><td>'+new Date(item.createdAt).toLocaleString("da-DK")+
              '</td><td>'+escapeHtml(item.userName||item.userEmail||"Ukendt")+
              '</td><td><span class="badge '+(item.success?"open":"closed")+'">'+(item.success?"Succes":"Fejlet")+
              '</span></td><td><code>'+escapeHtml(item.ipAddress||"Ukendt")+
              '</code></td><td title="'+escapeHtml(item.userAgent||"")+'">'+escapeHtml(item.userAgent||"Ukendt")+
              '</td></tr>';
          }).join("")+
          '</tbody></table></div>'
        : '<div class="empty">Ingen login-IP\'er endnu.</div>';
    }

    const banNode=document.getElementById("ipBanList");
    if(banNode){
      banNode.innerHTML=banRows.length
        ? '<div class="table-wrap"><table class="table"><thead><tr><th>Bruger</th><th>Email</th><th>IP-adresse</th><th>Bannet</th></tr></thead><tbody>'+
          banRows.map(function(item){
            return '<tr><td>'+escapeHtml(item.name||"Ukendt")+
              '</td><td>'+escapeHtml(item.email||"Ukendt")+
              '</td><td><code>'+escapeHtml(item.ipAddress||"Ukendt")+
              '</code></td><td>'+(item.bannedAt?new Date(item.bannedAt).toLocaleString("da-DK"):"Ukendt")+
              '</td></tr>';
          }).join("")+
          '</tbody></table></div>'
        : '<div class="empty">Ingen aktive IP-bans.</div>';
    }

    const panel=document.getElementById("ipLockPanel");
    const content=document.getElementById("ipContent");
    if(panel) panel.style.display="none";
    if(content) content.style.display="block";
  }catch(e){
    if(e.message.includes("IP-adressecenteret er låst")) renderIpLocked();
    else toast(e.message);
  }
}


async function loadStorePage(){
  const result=document.getElementById("storePurchaseResult");
  if(result) result.textContent="";
}

async function activateLicenseKey(){
  const result=document.getElementById("licenseActivationResult");
  const input=document.getElementById("licenseActivationKey");
  if(result) result.textContent="";
  const key=input?.value.trim();
  if(!key){if(result)result.innerHTML='<span class="badge closed">Indtast en license key.</span>';return;}
  try{
    const data=await api("/api/license/redeem",{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({key})
    });
    if(result) result.innerHTML='<span class="badge open">✅ License aktiveret · '+escapeHtml(data.productName||data.plan)+'</span>';
    toast("✅ License aktiveret");
    if(input)input.value="";
    try{const me=await fetch("/api/me");if(me.ok){const meData=await me.json();if(meData.user)currentUser=meData.user;}}catch(_){}
    loadStats();
  }catch(e){
    if(result) result.innerHTML='<span class="badge closed">'+escapeHtml(e.message)+'</span>';
  }
}

let currentUser=null;
async function checkLogin(){
  try{
    const r=await fetch("/api/me");
    if(!r.ok) throw new Error();
    const data=await r.json();
    currentUser=data.user;
    if(!currentUser.hasPaidAccess && currentUser.role!=="admin"){
      showPaywall();
      return;
    }
    unlockDashboard();
  }catch(e){
    showLanding();
  }
}

function unlockDashboard(){
  document.getElementById("loginScreen")?.remove();
  document.body.classList.remove("locked");
  if(currentUser?.role!=="admin"){
    document.querySelector('[data-page="admin"]')?.remove();
    document.querySelector('[data-page="logs"]')?.remove();
    if(currentUser?.role!=="admin" && currentUser?.plan!=="member_pro"){
      document.querySelector('[data-page="settings"]')?.remove();
      document.getElementById("page-settings")?.remove();
    }
    if(currentUser?.plan!=="member_plus" && currentUser?.plan!=="member_pro" && currentUser?.role!=="admin"){
      document.querySelector('[data-page="features"]')?.remove();
      document.getElementById("page-features")?.remove();
      document.querySelector('[data-page="templates"]')?.remove();
      document.getElementById("page-templates")?.remove();
    }
  }
  loadStats();
  const query=new URLSearchParams(window.location.search);
  if(query.get("activate")==="1") setTimeout(()=>navigate("activate"),100);
}

async function buySelectedPeriod(plan, selectId){
  const select=document.getElementById(selectId);
  const months=Number(select?.value||1);
  await startSubscription(plan, months);
}

async function startSubscription(plan="member",months=1){
  try{
    const selectedMonths=[1,3,12].includes(Number(months)) ? Number(months) : 1;
    const r=await fetch("/api/billing/create-checkout",{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({plan,months:selectedMonths})
    });
    const data=await r.json();
    if(!r.ok) throw new Error(data.error||"Betalingssiden kunne ikke åbnes.");
    window.location.href=data.url;
  }catch(error){
    const el=document.getElementById("paymentError");
    if(el) el.textContent=error.message;
    else toast(error.message);
  }
}

async function checkBillingStatus(){
  try{
    const r=await fetch("/api/billing/status");
    const data=await r.json();
    if(!r.ok) throw new Error(data.error||"Betalingsstatus kunne ikke hentes.");
    if(data.hasPaidAccess){
      try{
        const me=await fetch("/api/me");
        if(me.ok){
          const meData=await me.json();
          if(meData.user) currentUser=meData.user;
        }
      }catch(_){}
      window.history.replaceState({},document.title,"/");
      unlockDashboard();
      navigate("store");
      toast("Betaling godkendt — din adgang er låst op. Din license key håndteres via Aktiver key.");
      return true;
    }
    return false;
  }catch(error){
    const el=document.getElementById("paymentError");
    if(el) el.textContent=error.message;
    return false;
  }
}

function watchPayment(){
  const query=new URLSearchParams(window.location.search);
  if(query.get("activate")==="1" && currentUser) setTimeout(()=>navigate("activate"),100);
  if(query.get("payment")!=="success") return;
  let attempts=0;
  const timer=setInterval(async()=>{
    attempts+=1;
    const done=await checkBillingStatus();
    if(done || attempts>=15) clearInterval(timer);
  },2000);
}

function beginPurchase(plan="member"){
  const allowedPlans=["member","member_plus","member_pro"];
  const selectedPlan=allowedPlans.includes(plan)?plan:"member";
  const months=Number(document.getElementById("landingBillingMonths")?.value||1);
  const selectedMonths=[1,3,12].includes(months)?months:1;
  window.shardnoteBotPreferredPlan=selectedPlan;
  window.shardnoteBotPreferredMonths=selectedMonths;
  localStorage.setItem("shardnote_preferred_plan",selectedPlan);
  localStorage.setItem("shardnote_preferred_months",String(selectedMonths));
  showRegister(selectedPlan);
}

function showLanding(){
  document.body.classList.add("locked");

  window.closePlanDetails=function(){
    const modal=document.getElementById("planDetailsModal");
    if(modal) modal.remove();
  };

  window.showPlanDetails=function(plan){
    const plans={
      member:{
        name:"Shardnote Bot Member",
        price:"2,67 €",
        summary:"Grundpakken til mindre Discord-servere.",
        included:[
          "Dashboard og egne kontodata",
          "Tickets og support-håndtering",
          "Commands og grundlæggende botstyring",
          "Standard moderation",
          "Welcome / Leave",
          "Autorole",
          "Suggestions og Polls",
          "Levels / XP og Economy",
          "Verification og Role panel",
          "Voice-funktioner"
        ],
        excluded:[
          "Avancerede Member Plus-funktioner",
          "AI-assistent",
          "Logs",
          "Admin-panel"
        ]
      },
      member_plus:{
        name:"Shardnote Bot Member Plus",
        price:"4,68 €",
        summary:"Flere bot- og serverfunktioner oven på Member.",
        included:[
          "Alt fra Member",
          "AutoMod",
          "Invite filter",
          "Anti-raid",
          "Giveaways",
          "Backups og restore",
          "Lockdown",
          "Udvidede bot- og serverindstillinger",
          "Discord-skitser / templates"
        ],
        excluded:[
          "AI-assistent",
          "Logs",
          "Admin-panel"
        ]
      },
      member_pro:{
        name:"Shardnote Bot Member Pro",
        price:"6,99 €",
        summary:"Den fulde medlems-pakke med AI.",
        included:[
          "Alt fra Member Plus",
          "Alle øvrige bot- og serverfunktioner",
          "AI-assistent i udvalgte Discord-kanaler",
          "Avancerede serverindstillinger",
          "AI-kanaler kan vælges og gemmes fra dashboardet"
        ],
        excluded:[
          "Logs",
          "Admin-panel"
        ]
      }
    };

    const data=plans[plan];
    if(!data) return;
    closePlanDetails();

    const modal=document.createElement("div");
    modal.id="planDetailsModal";
    modal.style.cssText="position:fixed;inset:0;z-index:1000;background:rgba(0,0,0,.72);display:flex;align-items:center;justify-content:center;padding:20px;";
    modal.innerHTML=
      '<div style="width:min(720px,100%);max-height:82vh;overflow:auto;background:#11111a;border:1px solid rgba(255,255,255,.12);border-radius:18px;box-shadow:0 24px 80px rgba(0,0,0,.5);padding:22px">'+
        '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:16px">'+
          '<div><div style="font-size:13px;color:var(--muted)">Shardnote Bot-pakke</div><h2 style="margin:4px 0;font-size:26px">'+data.name+'</h2><div style="font-weight:800;color:var(--accent2);font-size:18px">'+data.price+' <span style="font-size:13px;color:var(--muted);font-weight:600">/ måned</span></div></div>'+
          '<button class="btn small" type="button" onclick="closePlanDetails()">Luk</button>'+
        '</div>'+
        '<p style="color:var(--muted);line-height:1.6;margin:14px 0 18px">'+data.summary+'</p>'+
        '<div style="font-weight:800;margin-bottom:9px">✅ Inkluderet</div>'+
        '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:8px">'+
          data.included.map(function(item){return '<div style="background:#171722;border:1px solid rgba(66,211,146,.18);border-radius:10px;padding:10px;font-size:13px">✓ '+item+'</div>';}).join("")+
        '</div>'+
        '<div style="font-weight:800;margin:20px 0 9px">⛔ Ikke inkluderet</div>'+
        '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:8px">'+
          data.excluded.map(function(item){return '<div style="background:#171722;border:1px solid rgba(255,255,255,.08);border-radius:10px;padding:10px;font-size:13px;color:var(--muted)">— '+item+'</div>';}).join("")+
        '</div>'+
        '<div class="actions" style="justify-content:flex-end;margin-top:20px"><button class="btn primary" type="button" onclick="closePlanDetails();beginPurchase(\''+plan+'\')">Fortsæt med denne pakke →</button></div>'+
      '</div>';

    modal.addEventListener("click",function(event){
      if(event.target===modal) closePlanDetails();
    });
    document.body.appendChild(modal);
  };

  const box=document.getElementById("loginScreen") || document.createElement("div");
  box.id="loginScreen";
  box.innerHTML=`<div class="login-card" style="width:min(980px,100%);text-align:center;max-height:calc(100vh - 36px);overflow:auto">
    <div style="display:flex;justify-content:flex-end;margin-bottom:8px">
      <select id="snLandingLanguagePicker" aria-label="Language" style="border:1px solid var(--border);background:#171722;color:#fff;border-radius:10px;padding:8px 10px;font-size:12px;outline:none;cursor:pointer">
        <option value="da">🇩🇰 Dansk</option>
        <option value="en">🇬🇧 English</option>
        <option value="de">🇩🇪 Deutsch</option>
        <option value="fr">🇫🇷 Français</option>
        <option value="es">🇪🇸 Español</option>
        <option value="it">🇮🇹 Italiano</option>
        <option value="nl">🇳🇱 Nederlands</option>
        <option value="pt">🇵🇹 Português</option>
        <option value="sv">🇸🇪 Svenska</option>
        <option value="no">🇳🇴 Norsk</option>
        <option value="fi">🇫🇮 Suomi</option>
        <option value="pl">🇵🇱 Polski</option>
        <option value="tr">🇹🇷 Türkçe</option>
        <option value="ru">🇷🇺 Русский</option>
        <option value="uk">🇺🇦 Українська</option>
        <option value="ja">🇯🇵 日本語</option>
        <option value="ko">🇰🇷 한국어</option>
        <option value="zh">🇨🇳 中文</option>
      </select>
    </div><div class="brand" style="justify-content:center;padding:0 0 10px"><div class="brand-mark">S</div><span>Shardnote Bot</span></div>
    <div style="font-size:12px;color:var(--accent2);font-weight:800;text-transform:uppercase;letter-spacing:.12em">Discord Control Center</div>
    <h1 style="font-size:34px;margin:10px 0 8px">Få adgang til Shardnote Bot</h1>
    <p style="max-width:700px;margin:0 auto;color:var(--muted);font-size:14px;line-height:1.55">Vælg en pakke, se alle funktionerne, og vælg derefter om du vil betale hver 1., 3. eller 12. måned.</p>
    <div style="max-width:700px;margin:16px auto 0;padding:14px 16px;border:1px solid rgba(109,93,252,.28);background:rgba(109,93,252,.08);border-radius:14px;text-align:left">
      <div style="font-weight:900;font-size:13px;margin-bottom:8px">💳 Sådan fungerer betalingen</div>
      <div style="display:grid;grid-template-columns:minmax(180px,240px) 1fr;gap:10px;align-items:center">
        <select id="landingBillingMonths" aria-label="Betalingsperiode" style="width:100%;border:1px solid var(--border);background:#0b0b11;color:#fff;border-radius:10px;padding:11px 12px;outline:none">
          <option value="1">1 måned</option>
          <option value="3">3 måneder</option>
          <option value="12">12 måneder</option>
        </select>
        <div style="font-size:12px;color:var(--muted);line-height:1.5">Du får <b style="color:#fff">10 dage gratis</b>. Første betaling sker efter prøveperioden, og derefter gentages betalingen efter den valgte periode.</div>
      </div>
    </div>

    <div style="max-width:920px;margin:22px auto 18px;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;text-align:left">
      <button type="button" class="card" style="border-color:rgba(109,93,252,.45);text-align:left;cursor:pointer;padding:16px" onclick="showPlanDetails('member')">
        <div style="font-size:12px;color:var(--muted)">Shardnote Bot</div>
        <div style="font-size:21px;font-weight:900;margin:3px 0">Member</div>
        <div style="font-size:25px;font-weight:900">2,67 € <span style="font-size:12px;font-weight:600;color:var(--muted)">/ måned</span></div>
        <div style="color:var(--accent2);font-size:11px;font-weight:800;margin-top:5px">10 dage gratis</div>
        <div style="font-size:12px;color:var(--muted);margin-top:10px">Grundpakken</div>
        <div style="font-size:12px;color:var(--accent2);margin-top:12px;font-weight:800">Se alle funktioner →</div>
      </button>

      <button type="button" class="card" style="border-color:rgba(66,211,146,.35);text-align:left;cursor:pointer;padding:16px" onclick="showPlanDetails('member_plus')">
        <div style="font-size:12px;color:var(--muted)">Shardnote Bot</div>
        <div style="font-size:21px;font-weight:900;margin:3px 0">Member Plus</div>
        <div style="font-size:25px;font-weight:900">4,68 € <span style="font-size:12px;font-weight:600;color:var(--muted)">/ måned</span></div>
        <div style="color:var(--accent2);font-size:11px;font-weight:800;margin-top:5px">10 dage gratis</div>
        <div style="font-size:12px;color:var(--muted);margin-top:10px">Flere bot- og serverfunktioner</div>
        <div style="font-size:12px;color:var(--accent2);margin-top:12px;font-weight:800">Se alle funktioner →</div>
      </button>

      <button type="button" class="card" style="border-color:rgba(245,201,94,.45);text-align:left;cursor:pointer;padding:16px" onclick="showPlanDetails('member_pro')">
        <div style="font-size:12px;color:var(--muted)">Shardnote Bot</div>
        <div style="font-size:21px;font-weight:900;margin:3px 0">Member Pro</div>
        <div style="font-size:25px;font-weight:900">6,99 € <span style="font-size:12px;font-weight:600;color:var(--muted)">/ måned</span></div>
        <div style="color:var(--accent2);font-size:11px;font-weight:800;margin-top:5px">10 dage gratis</div>
        <div style="font-size:12px;color:var(--muted);margin-top:10px">Alle funktioner + AI</div>
        <div style="font-size:12px;color:var(--accent2);margin-top:12px;font-weight:800">Se alle funktioner →</div>
      </button>
    </div>

    <div style="font-size:12px;color:var(--muted);margin:16px auto 18px;max-width:760px">Tryk på en pakke ovenfor for at se alle funktionerne og fortsætte til oprettelse og betaling. Har du allerede en konto, kan du logge ind nedenfor.</div>

    <div class="actions" style="justify-content:center">
      <button class="btn" type="button" onclick="showRegister()">Opret konto</button>
      <button class="btn" type="button" onclick="showLogin()">Jeg har allerede en konto</button>
    </div>
  </div>`;
  if(!box.parentElement) document.body.appendChild(box);
  const landingPicker=document.getElementById("snLandingLanguagePicker");
  if(landingPicker){
    const savedLanguage=localStorage.getItem("Shardnote Bot_language");
    if(savedLanguage && landingPicker.querySelector('option[value="'+savedLanguage+'"]')) landingPicker.value=savedLanguage;
    landingPicker.addEventListener("change",function(){
      localStorage.setItem("Shardnote Bot_language",this.value);
      window.location.reload();
    });
  }
}

function showPaywall(){
  document.body.classList.add("locked");
  const preferredMonths=Number(window.shardnoteBotPreferredMonths || localStorage.getItem("shardnote_preferred_months") || 1);
  const selectedMonths=[1,3,12].includes(preferredMonths)?preferredMonths:1;
  const preferredPlan=window.shardnoteBotPreferredPlan || localStorage.getItem("shardnote_preferred_plan") || "member";
  const box=document.getElementById("loginScreen") || document.createElement("div");
  box.id="loginScreen";
  box.innerHTML=`<div class="login-card" style="text-align:center">
    <div class="brand" style="justify-content:center;padding:0 0 16px"><div class="brand-mark">S</div><span>Shardnote Bot</span></div>
    <h1>Vælg din Shardnote Bot-pakke</h1>
    <p>Du får <b>10 dage gratis</b>. Vælg din pakke og om du vil betale hver 1., 3. eller 12. måned.</p>
    <div style="font-size:12px;color:var(--muted);margin-top:-4px;margin-bottom:10px">Valgt pakke fra forsiden: <b style="color:#fff">${preferredPlan}</b></div>
    <div class="field" style="text-align:left;margin-top:14px">
      <label>Abonnementsperiode</label>
      <select id="billingMonths" style="width:100%;border:1px solid var(--border);background:#0b0b11;color:#fff;border-radius:10px;padding:11px 12px;outline:none">
        <option value="1"${selectedMonths===1?' selected':''}>1 måned — Member 2,67 € · Plus 4,68 € · Pro 6,99 €</option>
        <option value="3"${selectedMonths===3?' selected':''}>3 måneder — Member 8,01 € · Plus 14,04 € · Pro 20,97 €</option>
        <option value="12"${selectedMonths===12?' selected':''}>12 måneder — Member 32,04 € · Plus 56,16 € · Pro 83,88 €</option>
      </select>
    </div>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:12px">
      <button class="btn primary" onclick="startSubscription('member',Number(document.getElementById('billingMonths').value))">Member</button>
      <button class="btn primary" onclick="startSubscription('member_plus',Number(document.getElementById('billingMonths').value))">Member Plus</button>
      <button class="btn primary" onclick="startSubscription('member_pro',Number(document.getElementById('billingMonths').value))">Member Pro</button>
    </div>
    <div style="font-size:12px;color:var(--muted);margin-top:12px">Betalingen gentages efter den valgte periode: hver 1., 3. eller 12. måned.</div>
    <button class="btn small" style="margin-top:18px" onclick="logout()">Log ud</button>
    <div id="paymentError" style="color:var(--red);font-size:12px;margin-top:12px"></div>
  </div>`;
  if(!box.parentElement) document.body.appendChild(box);
  updateBillingDurationLabels();
  watchPayment();
}
function showLogin(){
  document.body.classList.add("locked");

  const box=document.getElementById("loginScreen") || document.createElement("div");
  box.id="loginScreen";
  box.innerHTML=`<div class="login-card">
    <div class="brand" style="padding:0 0 20px"><div class="brand-mark">S</div><span>Shardnote Bot</span></div>
    <h1>Log ind</h1>
    <p>Log ind på dit Shardnote Bot-kontrolpanel.</p>
    <form onsubmit="login(event)">
      <div class="field"><label>Email</label><input id="loginEmail" type="email" required autocomplete="username" placeholder="din@email.dk"></div>
      <div class="field" style="margin-top:12px"><label>Adgangskode</label><input id="loginPassword" type="password" required autocomplete="current-password" placeholder="Din adgangskode"></div>
      <button class="btn primary" style="width:100%;margin-top:16px">Log ind</button>
      <div id="loginError" style="color:var(--red);font-size:12px;margin-top:10px"></div>
    </form>
    <div style="text-align:center;margin-top:18px;color:var(--muted);font-size:12px">
      Har du ikke en konto?
      <button type="button" class="btn small" style="margin-left:6px" onclick="showRegister()">Opret konto</button>
    </div>
  </div>`;
  document.body.appendChild(box);
}

function showRegister(preferredPlan="member"){
  document.body.classList.add("locked");
  window.shardnoteBotPreferredPlan=preferredPlan;

  const box=document.getElementById("loginScreen") || document.createElement("div");
  box.id="loginScreen";
  box.innerHTML=`<div class="login-card">
    <div class="brand" style="padding:0 0 20px"><div class="brand-mark">S</div><span>Shardnote Bot</span></div>
    <h1>Opret konto</h1>
    <p>Opret først din konto. Når kontoen er oprettet, vælger du 1, 3 eller 12 måneder og fortsætter til betaling.</p>
    <form onsubmit="register(event)">
      <div class="field"><label>Navn</label><input id="registerName" required maxlength="80" autocomplete="name" placeholder="Dit navn"></div>
      <div class="field" style="margin-top:12px"><label>Email</label><input id="registerEmail" type="email" required autocomplete="email" placeholder="din@email.dk"></div>
      <div class="field" style="margin-top:12px"><label>Adgangskode</label><input id="registerPassword" type="password" required minlength="8" autocomplete="new-password" placeholder="Mindst 8 tegn"></div>
      <button class="btn primary" style="width:100%;margin-top:16px">Opret konto</button>
      <div id="registerError" style="color:var(--red);font-size:12px;margin-top:10px"></div>
    </form>
    <div style="text-align:center;margin-top:18px;color:var(--muted);font-size:12px">
      Har du allerede en konto?
      <button type="button" class="btn small" style="margin-left:6px" onclick="showLogin()">Log ind</button>
    </div>
  </div>`;

  if(!box.parentElement) document.body.appendChild(box);
}

async function login(e){
  e.preventDefault();
  const error=document.getElementById("loginError");
  try{
    const r=await fetch("/api/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:document.getElementById("loginEmail").value,password:document.getElementById("loginPassword").value})});
    const data=await r.json(); if(!r.ok) throw new Error(data.error||"Login fejlede");
    currentUser=data.user;
    if(currentUser.hasPaidAccess || currentUser.role==="admin") unlockDashboard();
    else showPaywall();
  }catch(err){error.textContent=err.message}
}
async function register(e){
  e.preventDefault();

  const error=document.getElementById("registerError");
  error.textContent="";

  try{
    const r=await fetch("/api/register",{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({
        name:document.getElementById("registerName").value,
        email:document.getElementById("registerEmail").value,
        password:document.getElementById("registerPassword").value
      })
    });

    const data=await r.json();
    if(!r.ok) throw new Error(data.error||"Kunne ikke oprette konto.");

    currentUser=data.user;
    toast("✅ Konto oprettet");
    if(currentUser.hasPaidAccess || currentUser.role==="admin") unlockDashboard();
    else showPaywall();
  }catch(err){
    error.textContent=err.message;
  }
}

async function logout(){
  try{
    await fetch("/api/logout",{method:"POST",credentials:"same-origin"});
  }finally{
    window.location.href="/";
  }
}
window.navigate=navigate;
window.logout=logout;
window.showLogin=showLogin;
window.showRegister=showRegister;
window.showLanding=showLanding;
window.showPaywall=showPaywall;
window.beginPurchase=beginPurchase;
window.closeNewTicketComposer=closeNewTicketComposer;
window.startSubscription=startSubscription;
window.checkBillingStatus=checkBillingStatus;
window.login=login;
window.register=register;
window.addBotToDiscord=addBotToDiscord;
window.renderSpotImage=renderSpotImage;
window.downloadSpotImage=downloadSpotImage;
window.unlockLogs=unlockLogs;
window.lockLogs=lockLogs;
window.loadLogCategory=loadLogCategory;
async function createUser(){
  try{
    await api("/api/admin/users",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name:document.getElementById("newUserName").value,email:document.getElementById("newUserEmail").value,password:document.getElementById("newUserPassword").value,role:document.getElementById("newUserRole").value,plan:document.getElementById("newUserPlan")?.value||"member"})});
    document.getElementById("newUserName").value="";document.getElementById("newUserEmail").value="";document.getElementById("newUserPassword").value="";if(document.getElementById("newUserPlan"))document.getElementById("newUserPlan").value="member";
    toast("Bruger oprettet");loadUsers();loadLogs();
  }catch(e){toast(e.message)}
}
async function toggleUserRole(id,currentRole){
  const nextRole=currentRole==="admin"?"member":"admin";
  const label=nextRole==="admin"?"give denne bruger admin-adgang":"fjerne admin-adgang fra denne bruger";
  if(!confirm(`Vil du ${label}?`)) return;
  try{
    await api("/api/admin/users/"+id+"/role",{
      method:"PATCH",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({role:nextRole})
    });
    toast(nextRole==="admin"?"Admin-adgang givet":"Admin-adgang fjernet");
    loadUsers();
    loadLogs();
  }catch(e){toast(e.message)}
}
async function toggleUserPlan(id,nextPlan){
  try{
    await api("/api/admin/users/"+id+"/plan",{
      method:"PATCH",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({plan:nextPlan})
    });
    toast(nextPlan==="member_pro"?"Member Pro givet":nextPlan==="member_plus"?"Member Plus givet":"Member givet");
    loadUsers();
  }catch(e){toast(e.message)}
}
async function deleteUser(id){if(!confirm("Slet denne bruger?"))return;try{await api("/api/admin/users/"+id,{method:"DELETE"});toast("Bruger slettet");loadUsers();loadLogs()}catch(e){toast(e.message)}}

checkLogin();
setInterval(()=>{if(currentUser)loadStats()},15000);


/* Shardnote Bot multilingual UI */
(function(){
  const LANGS = {
    da:{name:"Dansk",flag:"🇩🇰"}, en:{name:"English",flag:"🇬🇧"}, de:{name:"Deutsch",flag:"🇩🇪"},
    fr:{name:"Français",flag:"🇫🇷"}, es:{name:"Español",flag:"🇪🇸"}, it:{name:"Italiano",flag:"🇮🇹"},
    nl:{name:"Nederlands",flag:"🇳🇱"}, pt:{name:"Português",flag:"🇵🇹"}, sv:{name:"Svenska",flag:"🇸🇪"},
    no:{name:"Norsk",flag:"🇳🇴"}, fi:{name:"Suomi",flag:"🇫🇮"}, pl:{name:"Polski",flag:"🇵🇱"},
    tr:{name:"Türkçe",flag:"🇹🇷"}, ru:{name:"Русский",flag:"🇷🇺"}, uk:{name:"Українська",flag:"🇺🇦"},
    ja:{name:"日本語",flag:"🇯🇵"}, ko:{name:"한국어",flag:"🇰🇷"}, zh:{name:"中文",flag:"🇨🇳"}
  };

  const P = {
    "Dashboard":["Dashboard","Dashboard","Dashboard","Tableau de bord","Panel","Bacheca","Dashboard","Painel","Instrumentpanel","Dashbord","Hallintapaneeli","Panel","Gösterge Paneli","Панель","Панель","ダッシュボード","대시보드","仪表板"],
    "Tickets":["Tickets","Tickets","Tickets","Tickets","Tickets","Ticket","Tickets","Tickets","Tickets","Billetter","Tiketit","Tickety","Biletler","Тикеты","Тікети","チケット","티켓","工单"],
    "Beskeder":["Beskeder","Messages","Nachrichten","Messages","Mensajes","Messaggi","Berichten","Mensagens","Meddelanden","Meldinger","Viestit","Wiadomości","Mesajlar","Сообщения","Повідомлення","メッセージ","메시지","消息"],
    "Commands":["Commands","Commands","Befehle","Commandes","Comandos","Comandi","Commando's","Comandos","Kommandon","Kommandoer","Komennot","Komendy","Komutlar","Команды","Команди","コマンド","명령어","命令"],
    "Musik":["Musik","Music","Musik","Musique","Música","Musica","Muziek","Música","Musik","Musikk","Musiikki","Muzyka","Müzik","Музыка","Музика","音楽","음악","音乐"],
    "Indstillinger":["Indstillinger","Settings","Einstellungen","Paramètres","Configuración","Impostazioni","Instellingen","Definições","Inställningar","Innstillinger","Asetukset","Ustawienia","Ayarlar","Настройки","Налаштування","設定","설정","设置"],
    "Logs":["Logs","Logs","Protokolle","Journaux","Registros","Log","Logboeken","Logs","Loggar","Logger","Lokit","Logi","Kayıtlar","Логи","Журнали","ログ","로그","日志"],
    "Admin-panel":["Admin-panel","Admin panel","Admin-Panel","Panneau admin","Panel de admin","Pannello admin","Adminpaneel","Painel de admin","Adminpanel","Adminpanel","Admin-paneeli","Panel administratora","Yönetici paneli","Панель администратора","Панель адміністратора","管理パネル","관리자 패널","管理面板"],
    "Discord Control Center":["Discord Control Center","Discord Control Center","Discord Kontrollzentrum","Centre de contrôle Discord","Centro de control de Discord","Centro di controllo Discord","Discord Controlecentrum","Centro de controlo do Discord","Discord-kontrollcenter","Discord-kontrollsenter","Discord-ohjauskeskus","Centrum sterowania Discord","Discord Kontrol Merkezi","Центр управления Discord","Центр керування Discord","Discordコントロールセンター","Discord 제어 센터","Discord 控制中心"],
    "Connecting…":["Forbinder…","Connecting…","Verbindung…","Connexion…","Conectando…","Connessione…","Verbinden…","A ligar…","Ansluter…","Kobler til…","Yhdistetään…","Łączenie…","Bağlanıyor…","Подключение…","Підключення…","接続中…","연결 중…","连接中…"],
    "Discord connected":["Discord forbundet","Discord connected","Discord verbunden","Discord connecté","Discord conectado","Discord connesso","Discord verbonden","Discord ligado","Discord ansluten","Discord tilkoblet","Discord yhdistetty","Discord połączony","Discord bağlı","Discord подключён","Discord підключено","Discord接続済み","Discord 연결됨","Discord 已连接"],
    "Web mode":["Webtilstand","Web mode","Webmodus","Mode web","Modo web","Modalità web","Webmodus","Modo web","Webbläge","Webmodus","Web-tila","Tryb webowy","Web modu","Веб-режим","Веб-режим","ウェブモード","웹 모드","网页模式"],
    "Online":["Online","Online","Online","En ligne","En línea","Online","Online","Online","Online","På nett","Online","Online","Çevrimiçi","Онлайн","Онлайн","オンライン","온라인","在线"],
    "Offline":["Offline","Offline","Offline","Hors ligne","Desconectado","Offline","Offline","Offline","Offline","Frakoblet","Offline","Offline","Çevrimdışı","Офлайн","Офлайн","オフライン","오프라인","离线"],
    "SERVERE":["SERVERE","SERVERS","SERVER","SERVEURS","SERVIDORES","SERVER","SERVERS","SERVIDORES","SERVRAR","SERVERE","PALVELIMET","SERWERY","SUNUCULAR","СЕРВЕРЫ","СЕРВЕРИ","サーバー","서버","服务器"],
    "BRUGERE":["BRUGERE","USERS","BENUTZER","UTILISATEURS","USUARIOS","UTENTI","GEBRUIKERS","UTILIZADORES","ANVÄNDARE","BRUKERE","KÄYTTÄJÄT","UŻYTKOWNICY","KULLANICILAR","ПОЛЬЗОВАТЕЛИ","КОРИСТУВАЧІ","ユーザー","사용자","用户"],
    "ÅBNE TICKETS":["ÅBNE TICKETS","OPEN TICKETS","OFFENE TICKETS","TICKETS OUVERTS","TICKETS ABIERTOS","TICKET APERTI","OPEN TICKETS","TICKETS ABERTOS","ÖPPNA ÄRENDEN","ÅPNE TICKETS","AVOIMET TIKETIT","OTWARTE TICKETY","AÇIK BİLETLER","ОТКРЫТЫЕ ТИКЕТЫ","ВІДКРИТІ ТІКЕТИ","未処理チケット","열린 티켓","未关闭工单"],
    "Live connection":["Live forbindelse","Live connection","Live-Verbindung","Connexion en direct","Conexión en vivo","Connessione live","Live verbinding","Ligação em direto","Liveanslutning","Direkte tilkobling","Live-yhteys","Połączenie na żywo","Canlı bağlantı","Живое соединение","Живе з'єднання","ライブ接続","실시간 연결","实时连接"],
    "Seneste tickets":["Seneste tickets","Latest tickets","Neueste Tickets","Derniers tickets","Últimos tickets","Ultimi ticket","Laatste tickets","Tickets recentes","Senaste ärenden","Siste tickets","Viimeisimmät tiketit","Najnowsze tickety","Son biletler","Последние тикеты","Останні тікети","最新チケット","최근 티켓","最新工单"],
    "Se alle":["Se alle","See all","Alle anzeigen","Voir tout","Ver todo","Vedi tutto","Alles bekijken","Ver tudo","Visa alla","Se alle","Näytä kaikki","Zobacz wszystkie","Tümünü gör","Показать все","Показати все","すべて表示","모두 보기","查看全部"],
    "Aktivitet":["Aktivitet","Activity","Aktivität","Activité","Actividad","Attività","Activiteit","Atividade","Aktivitet","Aktivitet","Toiminta","Aktywność","Etkinlik","Активность","Активність","アクティビティ","활동","活动"],
    "Alle logs":["Alle logs","All logs","Alle Protokolle","Tous les journaux","Todos los registros","Tutti i log","Alle logboeken","Todos os logs","Alla loggar","Alle logger","Kaikki lokit","Wszystkie logi","Tüm kayıtlar","Все логи","Усі журнали","すべてのログ","모든 로그","所有日志"],
    "Ingen tickets endnu.":["Ingen tickets endnu.","No tickets yet.","Noch keine Tickets.","Aucun ticket pour le moment.","Aún no hay tickets.","Nessun ticket.","Nog geen tickets.","Ainda não há tickets.","Inga ärenden ännu.","Ingen tickets ennå.","Ei tikettejä vielä.","Brak ticketów.","Henüz bilet yok.","Тикетов пока нет.","Тікетів поки немає.","まだチケットはありません。","아직 티켓이 없습니다.","暂无工单。"],
    "Ticket-system":["Ticket-system","Ticket system","Ticket-System","Système de tickets","Sistema de tickets","Sistema ticket","Ticketsysteem","Sistema de tickets","Ärendesystem","Ticketsystem","Tiketointijärjestelmä","System ticketów","Bilet sistemi","Система тикетов","Система тікетів","チケットシステム","티켓 시스템","工单系统"],
    "+ Ny ticket":["+ Ny ticket","+ New ticket","+ Neues Ticket","+ Nouveau ticket","+ Nuevo ticket","+ Nuovo ticket","+ Nieuw ticket","+ Novo ticket","+ Nytt ärende","+ Ny ticket","+ Uusi tiketti","+ Nowy ticket","+ Yeni bilet","+ Новый тикет","+ Новий тікет","+ 新規チケット","+ 새 티켓","+ 新工单"],
    "Skift status":["Skift status","Change status","Status ändern","Changer le statut","Cambiar estado","Cambia stato","Status wijzigen","Alterar estado","Ändra status","Endre status","Vaihda tila","Zmień status","Durumu değiştir","Изменить статус","Змінити статус","ステータス変更","상태 변경","更改状态"],
    "Send besked":["Send besked","Send message","Nachricht senden","Envoyer un message","Enviar mensaje","Invia messaggio","Bericht verzenden","Enviar mensagem","Skicka meddelande","Send melding","Lähetä viesti","Wyślij wiadomość","Mesaj gönder","Отправить сообщение","Надіслати повідомлення","メッセージ送信","메시지 보내기","发送消息"],
    "Kør command":["Kør command","Run command","Befehl ausführen","Exécuter la commande","Ejecutar comando","Esegui comando","Commando uitvoeren","Executar comando","Kör kommando","Kjør kommando","Suorita komento","Uruchom komendę","Komutu çalıştır","Выполнить команду","Виконати команду","コマンド実行","명령 실행","运行命令"],
    "Gem ændringer":["Gem ændringer","Save changes","Änderungen speichern","Enregistrer les modifications","Guardar cambios","Salva modifiche","Wijzigingen opslaan","Guardar alterações","Spara ändringar","Lagre endringer","Tallenna muutokset","Zapisz zmiany","Değişiklikleri kaydet","Сохранить изменения","Зберегти зміни","変更を保存","변경 사항 저장","保存更改"],
    "Udfør":["Udfør","Execute","Ausführen","Exécuter","Ejecutar","Esegui","Uitvoeren","Executar","Utför","Utfør","Suorita","Wykonaj","Uygula","Выполнить","Виконати","実行","실행","执行"],
    "Opdater":["Opdater","Refresh","Aktualisieren","Actualiser","Actualizar","Aggiorna","Vernieuwen","Atualizar","Uppdatera","Oppdater","Päivitä","Odśwież","Yenile","Обновить","Оновити","更新","새로고침","刷新"],
    "Lås":["Lås","Lock","Sperren","Verrouiller","Bloquear","Blocca","Vergrendelen","Bloquear","Lås","Lås","Lukitse","Zablokuj","Kilitle","Заблокировать","Заблокувати","ロック","잠금","锁定"],
    "Åbn logcenter":["Åbn logcenter","Open log center","Logcenter öffnen","Ouvrir le centre des logs","Abrir centro de registros","Apri centro log","Logcentrum openen","Abrir centro de logs","Öppna loggcenter","Åpne logsenter","Avaa lokikeskus","Otwórz centrum logów","Log merkezini aç","Открыть центр логов","Відкрити центр журналів","ログセンターを開く","로그 센터 열기","打开日志中心"],
    "Indtast din admin-adgangskode for at åbne logcenteret.":["Indtast din admin-adgangskode for at åbne logcenteret.","Enter your admin password to open the log center.","Gib dein Admin-Passwort ein, um das Logcenter zu öffnen.","Entrez votre mot de passe admin pour ouvrir le centre des logs.","Introduce tu contraseña de administrador para abrir el centro de registros.","Inserisci la password admin per aprire il centro log.","Voer je admin-wachtwoord in om het logcentrum te openen.","Digite sua senha de administrador para abrir o centro de logs.","Ange ditt adminlösenord för att öppna loggcentret.","Skriv inn admin-passordet for å åpne logsenteret.","Anna ylläpitäjän salasana avataksesi lokikeskuksen.","Wpisz hasło administratora, aby otworzyć centrum logów.","Log merkezini açmak için yönetici şifrenizi girin.","Введите пароль администратора, чтобы открыть центр логов.","Введіть пароль адміністратора, щоб відкрити центр журналів.","ログセンターを開くには管理者パスワードを入力してください。","로그 센터를 열려면 관리자 비밀번호를 입력하세요.","输入管理员密码以打开日志中心。"],
    "Database-overblik":["Database-overblik","Database overview","Datenbankübersicht","Aperçu de la base de données","Resumen de base de datos","Panoramica database","Database-overzicht","Visão geral da base de dados","Databasöversikt","Databaseoversikt","Tietokannan yleiskatsaus","Przegląd bazy danych","Veritabanı özeti","Обзор базы данных","Огляд бази даних","データベース概要","데이터베이스 개요","数据库概览"],
    "Brugere":["Brugere","Users","Benutzer","Utilisateurs","Usuarios","Utenti","Gebruikers","Utilizadores","Användare","Brukere","Käyttäjät","Użytkownicy","Kullanıcılar","Пользователи","Користувачі","ユーザー","사용자","用户"],
    "Email":["Email","Email","E-Mail","E-mail","Correo electrónico","Email","E-mail","E-mail","E-post","E-post","Sähköposti","Email","E-posta","Электронная почта","Електронна пошта","メール","이메일","电子邮件"],
    "Adgangskode":["Adgangskode","Password","Passwort","Mot de passe","Contraseña","Password","Wachtwoord","Palavra-passe","Lösenord","Passord","Salasana","Hasło","Şifre","Пароль","Пароль","パスワード","비밀번호","密码"],
    "Rolle":["Rolle","Role","Rolle","Rôle","Rol","Ruolo","Rol","Função","Roll","Rolle","Rooli","Rola","Rol","Роль","Роль","ロール","역할","角色"],
    "Member":["Member","Member","Mitglied","Membre","Miembro","Membro","Lid","Membro","Medlem","Medlem","Jäsen","Członek","Üye","Участник","Учасник","メンバー","멤버","成员"],
    "Administrator":["Administrator","Administrator","Administrator","Administrateur","Administrador","Amministratore","Beheerder","Administrador","Administratör","Administrator","Ylläpitäjä","Administrator","Yönetici","Администратор","Адміністратор","管理者","관리자","管理员"],
    "+ Tilføj bruger":["+ Tilføj bruger","+ Add user","+ Benutzer hinzufügen","+ Ajouter un utilisateur","+ Añadir usuario","+ Aggiungi utente","+ Gebruiker toevoegen","+ Adicionar utilizador","+ Lägg till användare","+ Legg til bruker","+ Lisää käyttäjä","+ Dodaj użytkownika","+ Kullanıcı ekle","+ Добавить пользователя","+ Додати користувача","+ ユーザー追加","+ 사용자 추가","+ 添加用户"],
    "Login logs":["Login logs","Login logs","Login-Protokolle","Journaux de connexion","Registros de inicio de sesión","Log di accesso","Inloglogs","Logs de login","Inloggningsloggar","Innloggingslogger","Kirjautumislogit","Logi logowania","Giriş kayıtları","Логи входов","Журнали входу","ログインログ","로그인 로그","登录日志"],
    "Log ind":["Log ind","Log in","Anmelden","Se connecter","Iniciar sesión","Accedi","Inloggen","Iniciar sessão","Logga in","Logg inn","Kirjaudu","Zaloguj się","Giriş yap","Войти","Увійти","ログイン","로그인","登录"],
    "Opret konto":["Opret konto","Create account","Konto erstellen","Créer un compte","Crear cuenta","Crea account","Account aanmaken","Criar conta","Skapa konto","Opprett konto","Luo tili","Utwórz konto","Hesap oluştur","Создать аккаунт","Створити обліковий запис","アカウント作成","계정 만들기","创建账户"],
    "Log ind på dit Shardnote Bot-kontrolpanel.":["Log ind på dit Shardnote Bot-kontrolpanel.","Log in to your Shardnote Bot control panel.","Melde dich im Shardnote Bot-Kontrollzentrum an.","Connectez-vous à votre panneau de contrôle Shardnote Bot.","Inicia sesión en tu panel de control de Shardnote Bot.","Accedi al pannello di controllo Shardnote Bot.","Log in op je Shardnote Bot-controlepaneel.","Inicie sessão no painel de controlo Shardnote Bot.","Logga in på din Shardnote Bot-kontrollpanel.","Logg inn på Shardnote Bot-kontrollpanelet.","Kirjaudu Shardnote Bot-ohjauspaneeliin.","Zaloguj się do panelu Shardnote Bot.","Shardnote Bot kontrol panelinize giriş yapın.","Войдите в панель управления Shardnote Bot.","Увійдіть до панелі керування Shardnote Bot.","Shardnote Botコントロールパネルにログインしてください。","Shardnote Bot 제어판에 로그인하세요.","登录 Shardnote Bot 控制面板。"],
    "Har du ikke en konto?":["Har du ikke en konto?","Don't have an account?","Noch kein Konto?","Pas encore de compte ?","¿No tienes una cuenta?","Non hai un account?","Nog geen account?","Ainda não tem uma conta?","Har du inget konto?","Har du ingen konto?","Eikö sinulla ole tiliä?","Nie masz konta?","Hesabınız yok mu?","Нет аккаунта?","Немає облікового запису?","アカウントをお持ちでないですか？","계정이 없나요?","还没有账户？"],
    "Har du allerede en konto?":["Har du allerede en konto?","Already have an account?","Schon ein Konto?","Vous avez déjà un compte ?","¿Ya tienes una cuenta?","Hai già un account?","Heb je al een account?","Já tem uma conta?","Har du redan ett konto?","Har du allerede en konto?","Onko sinulla jo tili?","Masz już konto?","Zaten hesabınız var mı?","Уже есть аккаунт?","Вже маєте обліковий запис?","すでにアカウントをお持ちですか？","이미 계정이 있나요?","已有账户？"],
    "Navn":["Navn","Name","Name","Nom","Nombre","Nome","Naam","Nome","Namn","Navn","Nimi","Nazwa","Ad","Имя","Ім'я","名前","이름","姓名"],
    "Velkomstbeskeder":["Velkomstbeskeder","Welcome messages","Willkommensnachrichten","Messages de bienvenue","Mensajes de bienvenida","Messaggi di benvenuto","Welkomstberichten","Mensagens de boas-vindas","Välkomstmeddelanden","Velkomstmeldinger","Tervetuloviestit","Wiadomości powitalne","Hoş geldin mesajları","Приветственные сообщения","Вітальні повідомлення","ウェルカムメッセージ","환영 메시지","欢迎消息"]
  };

  const keys = Object.keys(P);
  const dict = {};
  Object.keys(LANGS).forEach((lang, index)=>{
    dict[lang]={};
    keys.forEach(key=>{ dict[lang][key]=P[key][index] || P[key][0]; });
  });

  const EXTRA_TRANSLATIONS = {
    "DANISH_ONLY":["Vælg din Shardnote Bot-pakke","Vælg først hvor længe abonnementet skal løbe.","Abonnementsperiode","1 måned","3 måneder","12 måneder","Betalingen gentages efter den valgte periode: hver 1., 3. eller 12. måned.","Log ud","Din adgangskode","Dit navn","Mindst 8 tegn","Serial key","Aktivér key og opret konto","Har du allerede en konto?","Har du ikke en konto?","Opret konto","Log ind","Log ind på dit Shardnote Bot-kontrolpanel.","Indtast serial key'en du fik efter købet. Key'en aktiverer din pakke med det samme.","Jeg har en serial key","Jeg har allerede en konto","Grundpakken","Se alle funktioner →","10 dage gratis","Alle funktioner + AI","Tickets og support-håndtering","Commands og grundlæggende botstyring","Standard moderation","Velkomstbeskeder","Forslag og Polls","Verification og Role panel","Flere bot- og serverfunktioner","Avancerede serverindstillinger","AI-kanaler kan vælges og gemmes fra dashboardet","Aktivitet","Send besked","Kør command","Gem ændringer","Opdater","Lås","Slet","Ingen beskeder endnu.","Ingen tickets endnu.","Skift status","Slet denne ticket?","Ticket titel:","Besked gemt","Ticket slettet","Bruger oprettet","Bruger slettet","Admin-adgang givet","Admin-adgang fjernet","Member Pro givet","Member Plus givet","Member givet","Tilbagekald","Tilbagekaldt","Udløbet","Brugt op","Aktiv","Ingen serial keys endnu.","Ingen aktive IP-bans.","Ingen gemte IP-adresser endnu.","Database-overblik","Supabase forbundet","Midlertidig hukommelse","Oprettet","Type","Hændelse","Tid","Bruger","Resultat","Browser/enhed","Succes","Fejlet","Ukendt","Henter logs…","Åbner…","Ingen logs i denne kategori endnu.","Ingen login-logs endnu.","Køb først en Shardnote Bot-pakke, få din serial key, og brug den ved oprettelsen af din konto for at få adgang.","Jeg har købt denne pakke","Vælg server","Vælg rolle","Ikke nødvendig for konto-key","Vælg en server","Produktnavn","Antal keys","Brug pr. key","Udløbsdato (valgfri)","Generér serial keys","Redeem key","Server-ID","Discord bruger-ID"],
    "EN":["Choose your Shardnote Bot plan","First choose how long the subscription should run.","Subscription period","1 month","3 months","12 months","Payment repeats after the selected period: every 1, 3, or 12 months.","Log out","Your password","Your name","At least 8 characters","Serial key","Activate key and create account","Already have an account?","Don't have an account?","Create account","Log in","Log in to your Shardnote Bot control panel.","Enter the serial key you received after purchase. The key activates your package immediately.","I have a serial key","I already have an account","The basic package","See all features →","10 days free","All features + AI","Tickets and support handling","Commands and basic bot control","Standard moderation","Welcome messages","Suggestions and Polls","Verification and Role panel","More bot and server features","Advanced server settings","AI channels can be selected and saved from the dashboard","Activity","Send message","Run command","Save changes","Refresh","Lock","Delete","No messages yet.","No tickets yet.","Change status","Ticket title:","Message saved","Ticket deleted","User created","User deleted","Admin access granted","Admin access removed","Member Pro granted","Member Plus granted","Member granted","Revoke","Revoked","Expired","Used up","Active","No serial keys yet.","No active IP bans.","No stored IP addresses yet.","Database overview","Supabase connected","Temporary memory","Created","Type","Event","Time","User","Result","Browser/device","Success","Failed","Unknown","Loading logs…","Opening…","No logs in this category yet.","No login logs yet.","Buy a Shardnote Bot package first, receive your serial key, and use it when creating your account to get access.","I bought this package","Select server","Select role","Not required for account key","Select a server","Product name","Number of keys","Uses per key","Expiration date (optional)","Generate serial keys","Redeem key","Server ID","Discord user ID"]
  };
  Object.entries(EXTRA_TRANSLATIONS.DANISH_ONLY).forEach((da,i)=>{
    const en=EXTRA_TRANSLATIONS.EN[i];
    if(en){ dict.da[en]=da; dict.en[da]=en; }
  });

  const styles = document.createElement("style");
  styles.textContent = `
    .sn-language-picker{display:flex;align-items:center;gap:7px;margin-right:4px}
    .sn-language-picker select{border:1px solid var(--border);background:#171722;color:#fff;border-radius:10px;padding:8px 10px;font-size:12px;outline:none;cursor:pointer}
    .sn-language-picker select:focus{border-color:var(--accent)}
    @media(max-width:760px){.sn-language-picker select{max-width:120px}}
  `;
  document.head.appendChild(styles);

  let current = localStorage.getItem("Shardnote Bot_language");
  if(!current || !LANGS[current]){
    const browser = (navigator.language || "da").slice(0,2).toLowerCase();
    current = LANGS[browser] ? browser : "da";
  }

  const originalText = new WeakMap();
  const originalAttrs = new WeakMap();

  function translateValue(value){
    const text = String(value || "").trim();
    if(!text) return value;
    return dict[current]?.[text] || text;
  }

  function translateNode(node){
    if(node.nodeType !== Node.TEXT_NODE) return;
    const raw = node.nodeValue.trim();
    if(!raw) return;
    let base = originalText.get(node);
    if(!base || raw === dict[current]?.[base]) base = originalText.get(node) || raw;
    originalText.set(node, base);
    const translated = translateValue(base);
    if(node.nodeValue !== node.nodeValue.replace(base, translated)){
      node.nodeValue = node.nodeValue.replace(base, translated);
    }
  }

  function translateAttributes(root=document){
    root.querySelectorAll("input,textarea,select").forEach(el=>{
      const attrs=["placeholder","aria-label","title"];
      const saved=originalAttrs.get(el)||{};
      attrs.forEach(attr=>{
        const val=el.getAttribute(attr);
        if(!val) return;
        if(!saved[attr] || val===dict[current]?.[saved[attr]]) saved[attr]=val;
        el.setAttribute(attr,translateValue(saved[attr]));
      });
      originalAttrs.set(el,saved);
    });
  }

  function translatePage(){
    document.querySelectorAll(".nav button span:last-child").forEach(el=>{
      const key=el.textContent.trim();
      if(P[key]) el.textContent=translateValue(key);
    });
    document.querySelectorAll(".nav button[data-page]").forEach(btn=>{
      const page=btn.dataset.page;
      if(titles[page]) {
        const label=btn.querySelector("span:last-child");
        if(label) label.textContent=translateValue(titles[page]==="Admin-panel"?"Admin-panel":titles[page]);
      }
    });
    const activePage=[...document.querySelectorAll(".page.active")][0];
    const pageKey=activePage?.id?.replace("page-","");
    const title=document.getElementById("pageTitle");
    if(title && titles[pageKey]) title.textContent=translateValue(titles[pageKey]==="Admin-panel"?"Admin-panel":titles[pageKey]);
    document.querySelectorAll("body *").forEach(el=>{
      if(["SCRIPT","STYLE"].includes(el.tagName)) return;
      [...el.childNodes].forEach(translateNode);
    });
    translateAttributes(document);
    document.title="Shardnote Bot — "+translateValue("Discord Control Center");
  }

  function updateBillingDurationLabels(){
    const select=document.getElementById("billingMonths");
    if(!select) return;
    const english=current==="en";
    const labels=english
      ? ["1 month — Member €2.67 · Plus €4.68 · Pro €6.99","3 months — Member €8.01 · Plus €14.04 · Pro €20.97","12 months — Member €32.04 · Plus €56.16 · Pro €83.88"]
      : ["1 måned — Member 2,67 € · Plus 4,68 € · Pro 6,99 €","3 måneder — Member 8,01 € · Plus 14,04 € · Pro 20,97 €","12 måneder — Member 32,04 € · Plus 56,16 € · Pro 83,88 €"];
    [...select.options].forEach((opt,i)=>{if(labels[i]) opt.textContent=labels[i];});
  }

  function installPicker(){
    if(document.getElementById("snLanguagePicker")) return;
    const host=document.querySelector(".topbar > div:last-child");
    if(!host) return;
    const wrap=document.createElement("div");
    wrap.id="snLanguagePicker";
    wrap.className="sn-language-picker";
    const select=document.createElement("select");
    select.setAttribute("aria-label","Language");
    Object.entries(LANGS).forEach(([code,data])=>{
      const opt=document.createElement("option");
      opt.value=code;
      opt.textContent=data.flag+" "+data.name;
      select.appendChild(opt);
    });
    select.value=current;
    select.addEventListener("change",()=>{
      current=select.value;
      localStorage.setItem("Shardnote Bot_language",current);
      translatePage();
      updateBillingDurationLabels();
      if(typeof loadCommands==="function") setTimeout(()=>{try{loadCommands()}catch(e){}},0);
      if(typeof loadSettings==="function") setTimeout(()=>{try{applyButtonLabels();translatePage()}catch(e){}},0);
    });
    wrap.appendChild(select);
    host.insertBefore(wrap,host.firstChild);
  }

  const originalNavigate=window.navigate;
  window.navigate=function(page){
    const result=originalNavigate(page);
    setTimeout(translatePage,0);
    return result;
  };

  let translating=false;
  let translationQueued=false;
  const observer=new MutationObserver((mutations)=>{
    if(translating || translationQueued) return;
    for(const m of mutations){
      if(m.type==="childList" || m.type==="characterData" || m.type==="attributes"){
        translationQueued=true;
        requestAnimationFrame(()=>{
          translationQueued=false;
          if(translating) return;
          translating=true;
          try{translatePage();}finally{translating=false;}
        });
        break;
      }
    }
  });

  function start(){
    installPicker();
    translatePage();
    observer.observe(document.body,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:["placeholder","title","aria-label"]});
  }

  if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",start,{once:true});
  else start();
})();

