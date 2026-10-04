const pages = ["dashboard","tickets","messages","commands","features","templates","upgrades","store","music","settings","logs","admin"];
const titles = {dashboard:"Dashboard",tickets:"Tickets",messages:"Beskeder",commands:"Commands",features:"Bot-funktioner",templates:"Discord-skitser",upgrades:"Opgraderinger",store:"Store",music:"Musik",settings:"Indstillinger",logs:"Logs",admin:"Admin-panel"};
let settings = {prefix:"!",maintenance:false,autoReply:true,welcomeMessages:true,buttonLabels:{}};

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

document.querySelectorAll(".nav button").forEach(btn=>{
  btn.onclick = function(event){
    event.preventDefault();
    navigate(this.dataset.page);
    return false;
  };
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
  if(page==="tickets") loadTickets();
  if(page==="messages") loadMessages();
  if(page==="upgrades") loadUpgradeIdeas();
  if(page==="store") loadStorePage();
  if(page==="commands") loadCommands();
  if(page==="settings") loadSettings();
  if(page==="logs") loadLogs();
  if(page==="admin"){ loadUsers(); loadDatabaseSummary(); loadIpCenter(); loadSerialGuilds(); loadSerialKeysList(); }
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
      const isAdmin=currentUser?.role==="admin";
      usersCard.style.display=isAdmin?"":"none";
      if(isAdmin) document.getElementById("statUsers").textContent=s.users ?? 0;
    }
    document.getElementById("statTickets").textContent=s.tickets;
    document.getElementById("statusText").textContent=s.botOnline?"Discord connected":"Web mode";
    document.getElementById("statusDot").className="dot "+(s.botOnline?"online":"");
    const tickets=await api("/api/tickets");
    document.getElementById("dashTickets").innerHTML=tickets.slice(0,5).map(t=>`<div class="activity-item"><div class="activity-icon">🎫</div><div><b>#${t.id} — ${escapeHtml(t.title)}</b><small>${escapeHtml(t.user)} · <span class="badge ${t.status}">${t.status}</span></small></div></div>`).join("")||'<div class="empty">Ingen tickets endnu.</div>';
    document.getElementById("dashLogs").innerHTML='<div class="empty">Logs er beskyttet. Åbn Logs for at se aktivitet.</div>';
  }catch(e){toast(e.message)}
}

async function loadTickets(){
  const tickets=await api("/api/tickets");
  document.getElementById("ticketList").innerHTML=tickets.length?
    '<table class="table"><thead><tr><th>ID</th><th>Titel</th><th>Bruger</th><th>Behandler</th><th>Status</th><th>Prioritet</th><th>Handlinger</th></tr></thead><tbody>'+
    tickets.map(function(t){
      return '<tr><td>#'+t.id+'</td><td>'+escapeHtml(t.title)+'</td><td>'+escapeHtml(t.user)+'</td><td>'+
        '<select class="ticket-handler" data-ticket-handler="'+t.id+'">'+
          '<option value="ticket" '+(t.handler==="ticket"?"selected":"")+'>🎫 Ticket</option>'+
          '<option value="ai" '+(t.handler==="ai"?"selected":"")+'>🤖 AI</option>'+
          '<option value="admins" '+((!t.handler||t.handler==="admins")?"selected":"")+'>👑 Admins</option>'+
        '</select></td><td><span class="badge '+t.status+'">'+t.status+'</span></td><td>'+t.priority+'</td><td>'+
        '<button class="btn small ticket-cycle" data-ticket-id="'+t.id+'" data-ticket-status="'+t.status+'">Skift status</button> '+
        '<button class="btn small danger ticket-delete" data-ticket-id="'+t.id+'">Slet</button>'+
      '</td></tr>';
    }).join("")+
    '</tbody></table>' : '<div class="empty">Ingen tickets endnu.</div>';
  document.querySelectorAll(".ticket-handler").forEach(function(el){el.addEventListener("change",function(){setTicketHandler(this.dataset.ticketHandler,this.value);});});
  document.querySelectorAll(".ticket-cycle").forEach(function(el){el.addEventListener("click",function(){cycleTicket(this.dataset.ticketId,this.dataset.ticketStatus);});});
  document.querySelectorAll(".ticket-delete").forEach(function(el){el.addEventListener("click",function(){deleteTicket(this.dataset.ticketId);});});
}
async function newTicket(){
  const title=prompt("Ticket titel:");
  if(!title) return;
  const handler=document.getElementById("ticketHandlerDefault")?.value || "admins";
  await api("/api/tickets",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({title,user:"Dashboard user",priority:"normal",handler})});
  toast(handler==="ai"?"🤖 Ticket oprettet til AI":handler==="admins"?"👑 Ticket oprettet til Admins":"🎫 Ticket oprettet");
  loadTickets();loadStats();
}
async function setTicketHandler(id,handler){
  try{
    await api("/api/tickets/"+id,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({handler})});
    toast(handler==="ai"?"🤖 AI valgt":handler==="admins"?"👑 Admins valgt":"🎫 Ticket valgt");
    loadTickets();
  }catch(e){toast(e.message)}
}
async function cycleTicket(id,status){
  const next={open:"pending",pending:"closed",closed:"open"}[status];
  await api("/api/tickets/"+id,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({status:next})});
  loadTickets();loadStats();
}
async function deleteTicket(id){
  if(!confirm("Slet denne ticket?")) return;
  await api("/api/tickets/"+id,{method:"DELETE"});toast("Ticket slettet");loadTickets();loadStats();
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
  ping:"Tjekker om ShardNote er online.",
  help:"Viser alle tilgængelige ShardNote-commands.",
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
  restore:"Gendanner en ShardNote-backup.",
  "music-join":"Får botten til at gå ind i din voice-kanal.",
  "music-leave":"Får botten til at forlade voice-kanalen."
};

async function loadCommands(){
  const commands=await api("/api/commands");
  const danish=localStorage.getItem("shardnote_language")==="da";
  const title=document.querySelector("#page-commands .section-title h2");
  const label=document.querySelector("#page-commands .field label");
  const available=document.querySelector("#page-commands .card:nth-child(2) .section-title h2");
  if(title) title.textContent=danish?"Kommandocenter":"Command Center";
  if(label) label.textContent=danish?"Kommando":"Command";
  if(available) available.textContent=danish?"Tilgængelige commands":"Tilgængelige commands";
  document.getElementById("commandCount").textContent=(danish?commands.length+" commands":commands.length+" commands");
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

async function loadUsers(){
  try{
    const users=await api("/api/admin/users");
    const planNames={member:"Member",member_plus:"Member Plus",member_pro:"Member Pro",member_premium:"Member Premium"};
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
  const result=document.getElementById("storeRedeemResult");
  if(result) result.textContent="";
}

async function redeemStoreSerialKey(){
  const result=document.getElementById("storeRedeemResult");
  if(result) result.textContent="";
  try{
    const data=await api("/api/serial-keys/redeem",{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({
        key:document.getElementById("storeRedeemKey").value.trim(),
        guildId:document.getElementById("storeRedeemGuildId").value.trim(),
        discordUserId:document.getElementById("storeRedeemDiscordUserId").value.trim()
      })
    });
    if(result) result.innerHTML='<span class="badge open">✅ '+escapeHtml(data.productName)+' · '+escapeHtml(data.roleName)+' · '+escapeHtml(data.guildName)+'</span>';
    toast("✅ Rolle givet");
  }catch(e){
    if(result) result.innerHTML='<span class="badge closed">'+escapeHtml(e.message)+'</span>';
  }
}

async function redeemSerialKey(){
  const result=document.getElementById("redeemResult");
  if(result) result.textContent="";
  try{
    const data=await api("/api/serial-keys/redeem",{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({
        key:document.getElementById("redeemKey").value.trim(),
        guildId:document.getElementById("redeemGuildId").value.trim(),
        discordUserId:document.getElementById("redeemDiscordUserId").value.trim()
      })
    });
    if(result) result.innerHTML='<span class="badge open">✅ '+escapeHtml(data.productName)+' · '+escapeHtml(data.roleName)+'</span>';
    toast("✅ Rolle givet");
  }catch(e){
    if(result) result.innerHTML='<span class="badge closed">'+escapeHtml(e.message)+'</span>';
  }
}

function toggleSerialType(){
  const type=document.getElementById("serialType")?.value || "account";
  const isAccount=type==="account";
  const plan=document.getElementById("serialAccessPlan");
  const guild=document.getElementById("serialGuild");
  const role=document.getElementById("serialRole");
  if(plan) plan.disabled=!isAccount;
  if(guild) guild.disabled=isAccount;
  if(role) role.disabled=isAccount;
  if(isAccount){
    if(guild) guild.value="";
    if(role) role.innerHTML='<option value="">Ikke nødvendig for konto-key</option>';
  }
}

async function loadSerialGuilds(){
  try{
    const guilds=await api("/api/bot/guilds");
    const select=document.getElementById("serialGuild");
    if(!select) return;
    select.innerHTML='<option value="">Vælg server</option>'+guilds.map(g=>'<option value="'+escapeHtml(g.id)+'">'+escapeHtml(g.name)+'</option>').join("");
    toggleSerialType();
    await loadSerialRoles();
  }catch(e){toast(e.message);}
}

async function loadSerialRoles(){
  const guildId=document.getElementById("serialGuild")?.value;
  const select=document.getElementById("serialRole");
  if(!select) return;
  if(!guildId){
    select.innerHTML='<option value="">Vælg rolle</option>';
    return;
  }
  try{
    const data=await api("/api/bot/guilds/"+encodeURIComponent(guildId)+"/settings");
    const roles=(data.roles||[]).filter(r=>!r.managed);
    select.innerHTML='<option value="">Vælg rolle</option>'+roles.map(r=>'<option value="'+escapeHtml(r.id)+'">'+escapeHtml(r.name)+'</option>').join("");
  }catch(e){toast(e.message);}
}

async function generateSerialKeys(){
  try{
    const data=await api("/api/admin/serial-keys/generate",{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({
        guildId:document.getElementById("serialGuild").value,
        roleId:document.getElementById("serialRole").value,
        accessPlan:document.getElementById("serialType").value==="account" ? document.getElementById("serialAccessPlan").value : "",
        productName:document.getElementById("serialProduct").value,
        quantity:Number(document.getElementById("serialQuantity").value||1),
        maxUses:Number(document.getElementById("serialMaxUses").value||1),
        expiresAt:document.getElementById("serialExpiresAt").value||""
      })
    });
    const node=document.getElementById("serialGenerated");
    node.style.display="block";
    node.textContent=data.keys.join("\n");
    await loadSerialKeysList();
    toast("✅ "+data.keys.length+" serial key(s) genereret");
  }catch(e){toast(e.message);}
}

async function loadSerialKeysList(){
  const host=document.getElementById("serialKeyList");
  if(!host) return;
  try{
    const rows=await api("/api/admin/serial-keys");
    host.innerHTML=rows.length
      ? '<div class="table-wrap"><table class="table"><thead><tr><th>Produkt</th><th>Type</th><th>Key</th><th>Brug</th><th>Status</th><th>Oprettet</th><th></th></tr></thead><tbody>'+
        rows.map(function(row){
          const used=Number(row.uses||0);
          const max=Number(row.maxUses||1);
          const expired=row.expiresAt && new Date(row.expiresAt).getTime()<=Date.now();
          const status=row.revoked?"Tilbagekaldt":(expired?"Udløbet":(used>=max?"Brugt op":"Aktiv"));
          const typeLabel=row.accessPlan ? "Website · "+({member:"Member",member_plus:"Member Plus",member_pro:"Member Pro",member_premium:"Member Premium"}[row.accessPlan]||row.accessPlan) : "Discord role";
          return '<tr><td>'+escapeHtml(row.productName||"")+
            '</td><td>'+escapeHtml(typeLabel)+
            '</td><td><code>…'+escapeHtml(row.keyLast4||"")+
            '</code></td><td>'+used+'/'+max+
            '</td><td><span class="badge '+(status==="Aktiv"?"open":"closed")+'">'+status+
            '</span></td><td>'+new Date(row.createdAt).toLocaleString("da-DK")+
            '</td><td>'+(!row.revoked&&used<max&&!expired?'<button class="btn small danger" onclick="revokeSerialKey('+row.id+')">Tilbagekald</button>':"")+
            '</td></tr>';
        }).join("")+
        '</tbody></table></div>'
      : '<div class="empty">Ingen serial keys endnu.</div>';
  }catch(e){toast(e.message);}
}

async function revokeSerialKey(id){
  if(!confirm("Tilbagekald denne serial key? Den kan derefter ikke bruges.")) return;
  try{
    await api("/api/admin/serial-keys/"+id+"/revoke",{method:"PATCH"});
    await loadSerialKeysList();
    toast("✅ Serial key tilbagekaldt");
  }catch(e){toast(e.message);}
}

async function loadDatabaseSummary(){
  try{
    const data=await api("/api/admin/database-summary");
    document.getElementById("databaseStatus").textContent=data.connected?"Supabase forbundet":"Midlertidig hukommelse";
    document.getElementById("databaseStatus").className="badge "+(data.connected?"open":"pending");
    document.getElementById("databaseTables").innerHTML=data.tables.map(t=>`<div class="activity-item"><div class="activity-icon">▦</div><div><b>${escapeHtml(t.name)}</b><small>${t.rows} rækker</small></div></div>`).join("");
  }catch(e){toast(e.message)}
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
}

async function startSubscription(plan="member"){
  try{
    const r=await fetch("/api/billing/create-checkout",{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({plan})
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
      currentUser.hasPaidAccess=true;
      window.history.replaceState({},document.title,"/");
      unlockDashboard();
      toast("Betaling godkendt — adgang låst op.");
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
  if(query.get("payment")!=="success") return;
  let attempts=0;
  const timer=setInterval(async()=>{
    attempts+=1;
    const done=await checkBillingStatus();
    if(done || attempts>=15) clearInterval(timer);
  },2000);
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
        name:"ShardNote Member",
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
        name:"ShardNote Member Plus",
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
        name:"ShardNote Member Pro",
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
          '<div><div style="font-size:13px;color:var(--muted)">ShardNote-pakke</div><h2 style="margin:4px 0;font-size:26px">'+data.name+'</h2><div style="font-weight:800;color:var(--accent2);font-size:18px">'+data.price+' <span style="font-size:13px;color:var(--muted);font-weight:600">/ måned</span></div></div>'+
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
        '<div class="actions" style="justify-content:flex-end;margin-top:20px"><button class="btn primary" type="button" onclick="closePlanDetails();showRegister(\''+plan+'\')">Vælg '+data.name.replace("ShardNote ","")+'</button></div>'+
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
    </div><div class="brand" style="justify-content:center;padding:0 0 10px"><div class="brand-mark">S</div><span>ShardNote</span></div>
    <div style="font-size:12px;color:var(--accent2);font-weight:800;text-transform:uppercase;letter-spacing:.12em">Discord Control Center</div>
    <h1 style="font-size:34px;margin:10px 0 8px">Få adgang til ShardNote</h1>
    <p style="max-width:620px;margin:0 auto;color:var(--muted);font-size:14px;line-height:1.55">Vælg en pakke. Tryk på en pakke for at se præcis, hvad der er inkluderet.</p>

    <div style="max-width:920px;margin:22px auto 18px;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;text-align:left">
      <button type="button" class="card" style="border-color:rgba(109,93,252,.45);text-align:left;cursor:pointer;padding:16px" onclick="showPlanDetails('member')">
        <div style="font-size:12px;color:var(--muted)">ShardNote</div>
        <div style="font-size:21px;font-weight:900;margin:3px 0">Member</div>
        <div style="font-size:25px;font-weight:900">2,67 € <span style="font-size:12px;font-weight:600;color:var(--muted)">/ måned</span></div>
        <div style="color:var(--accent2);font-size:11px;font-weight:800;margin-top:5px">10 dage gratis</div>
        <div style="font-size:12px;color:var(--muted);margin-top:10px">Grundpakken</div>
        <div style="font-size:12px;color:var(--accent2);margin-top:12px;font-weight:800">Se alle funktioner →</div>
      </button>

      <button type="button" class="card" style="border-color:rgba(66,211,146,.35);text-align:left;cursor:pointer;padding:16px" onclick="showPlanDetails('member_plus')">
        <div style="font-size:12px;color:var(--muted)">ShardNote</div>
        <div style="font-size:21px;font-weight:900;margin:3px 0">Member Plus</div>
        <div style="font-size:25px;font-weight:900">4,68 € <span style="font-size:12px;font-weight:600;color:var(--muted)">/ måned</span></div>
        <div style="color:var(--accent2);font-size:11px;font-weight:800;margin-top:5px">10 dage gratis</div>
        <div style="font-size:12px;color:var(--muted);margin-top:10px">Flere bot- og serverfunktioner</div>
        <div style="font-size:12px;color:var(--accent2);margin-top:12px;font-weight:800">Se alle funktioner →</div>
      </button>

      <button type="button" class="card" style="border-color:rgba(245,201,94,.45);text-align:left;cursor:pointer;padding:16px" onclick="showPlanDetails('member_pro')">
        <div style="font-size:12px;color:var(--muted)">ShardNote</div>
        <div style="font-size:21px;font-weight:900;margin:3px 0">Member Pro</div>
        <div style="font-size:25px;font-weight:900">6,99 € <span style="font-size:12px;font-weight:600;color:var(--muted)">/ måned</span></div>
        <div style="color:var(--accent2);font-size:11px;font-weight:800;margin-top:5px">10 dage gratis</div>
        <div style="font-size:12px;color:var(--muted);margin-top:10px">Alle funktioner + AI</div>
        <div style="font-size:12px;color:var(--accent2);margin-top:12px;font-weight:800">Se alle funktioner →</div>
      </button>
    </div>

    <div style="font-size:12px;color:var(--muted);margin:6px auto 18px">Køb først en ShardNote-pakke, få din serial key, og brug den ved oprettelsen af din konto for at få adgang.</div>

    <div class="actions" style="justify-content:center">
      <button class="btn primary" type="button" onclick="showRegister()">Opret konto og betal</button>
      <button class="btn" type="button" onclick="showLogin()">Jeg har allerede en konto</button>
    </div>
  </div>`;
  if(!box.parentElement) document.body.appendChild(box);
  const landingPicker=document.getElementById("snLandingLanguagePicker");
  if(landingPicker){
    const savedLanguage=localStorage.getItem("shardnote_language");
    if(savedLanguage && landingPicker.querySelector('option[value="'+savedLanguage+'"]')) landingPicker.value=savedLanguage;
    landingPicker.addEventListener("change",function(){
      localStorage.setItem("shardnote_language",this.value);
      window.location.reload();
    });
  }
}

function showPaywall(){
  document.body.classList.add("locked");
  const box=document.getElementById("loginScreen") || document.createElement("div");
  box.id="loginScreen";
  box.innerHTML=`<div class="login-card" style="text-align:center">
    <div class="brand" style="justify-content:center;padding:0 0 16px"><div class="brand-mark">S</div><span>ShardNote</span></div>
    <h1>Vælg din ShardNote-pakke</h1>
    <p>Du får <b>10 dage gratis</b>. Vælg Member til <b>2,67 €</b> eller Member Plus til <b>4,68 € pr. måned</b>.</p>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:12px">
      <button class="btn primary" onclick="startSubscription('member')">Member · 2,67 €</button>
      <button class="btn primary" onclick="startSubscription('member_plus')">Member Plus · 4,68 €</button>
      <button class="btn primary" onclick="startSubscription('member_pro')">Member Pro · 6,99 €</button>
    </div>
    <div style="font-size:12px;color:var(--muted);margin-top:12px">Når betalingen er godkendt, gemmes din pakke automatisk på kontoen. Næste gang du logger ind, går du direkte ind på dashboardet.</div>
    <button class="btn small" style="margin-top:18px" onclick="logout()">Log ud</button>
    <div id="paymentError" style="color:var(--red);font-size:12px;margin-top:12px"></div>
  </div>`;
  if(!box.parentElement) document.body.appendChild(box);
  watchPayment();
}
function showLogin(){
  document.body.classList.add("locked");

  const box=document.getElementById("loginScreen") || document.createElement("div");
  box.id="loginScreen";
  box.innerHTML=`<div class="login-card">
    <div class="brand" style="padding:0 0 20px"><div class="brand-mark">S</div><span>ShardNote</span></div>
    <h1>Log ind</h1>
    <p>Log ind på dit ShardNote-kontrolpanel.</p>
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
  window.shardnotePreferredPlan=preferredPlan;

  const box=document.getElementById("loginScreen") || document.createElement("div");
  box.id="loginScreen";
  box.innerHTML=`<div class="login-card">
    <div class="brand" style="padding:0 0 20px"><div class="brand-mark">S</div><span>ShardNote</span></div>
    <h1>Opret konto</h1>
    <p>Har du købt ShardNote? Indtast serial key'en du fik efter købet. Key'en aktiverer din pakke med det samme.</p>
    <form onsubmit="register(event)">
      <div class="field"><label>Navn</label><input id="registerName" required maxlength="80" autocomplete="name" placeholder="Dit navn"></div>
      <div class="field" style="margin-top:12px"><label>Email</label><input id="registerEmail" type="email" required autocomplete="email" placeholder="din@email.dk"></div>
      <div class="field" style="margin-top:12px"><label>Adgangskode</label><input id="registerPassword" type="password" required minlength="8" autocomplete="new-password" placeholder="Mindst 8 tegn"></div>
      <div class="field" style="margin-top:12px"><label>Serial key</label><input id="registerSerialKey" required autocomplete="off" placeholder="SN-XXXXXX-XXXXXX-XXXXXX"></div>
      <button class="btn primary" style="width:100%;margin-top:16px">Aktivér key og opret konto</button>
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
        password:document.getElementById("registerPassword").value,
        serialKey:document.getElementById("registerSerialKey").value
      })
    });

    const data=await r.json();
    if(!r.ok) throw new Error(data.error||"Kunne ikke oprette konto.");

    currentUser=data.user;
    toast("✅ Key aktiveret — konto oprettet");
    unlockDashboard();
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
window.startSubscription=startSubscription;
window.checkBillingStatus=checkBillingStatus;
window.login=login;
window.register=register;
window.addBotToDiscord=addBotToDiscord;
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


/* ShardNote multilingual UI */
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
    "Log ind på dit ShardNote-kontrolpanel.":["Log ind på dit ShardNote-kontrolpanel.","Log in to your ShardNote control panel.","Melde dich im ShardNote-Kontrollzentrum an.","Connectez-vous à votre panneau de contrôle ShardNote.","Inicia sesión en tu panel de control de ShardNote.","Accedi al pannello di controllo ShardNote.","Log in op je ShardNote-controlepaneel.","Inicie sessão no painel de controlo ShardNote.","Logga in på din ShardNote-kontrollpanel.","Logg inn på ShardNote-kontrollpanelet.","Kirjaudu ShardNote-ohjauspaneeliin.","Zaloguj się do panelu ShardNote.","ShardNote kontrol panelinize giriş yapın.","Войдите в панель управления ShardNote.","Увійдіть до панелі керування ShardNote.","ShardNoteコントロールパネルにログインしてください。","ShardNote 제어판에 로그인하세요.","登录 ShardNote 控制面板。"],
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

  const styles = document.createElement("style");
  styles.textContent = `
    .sn-language-picker{display:flex;align-items:center;gap:7px;margin-right:4px}
    .sn-language-picker select{border:1px solid var(--border);background:#171722;color:#fff;border-radius:10px;padding:8px 10px;font-size:12px;outline:none;cursor:pointer}
    .sn-language-picker select:focus{border-color:var(--accent)}
    @media(max-width:760px){.sn-language-picker select{max-width:120px}}
  `;
  document.head.appendChild(styles);

  let current = localStorage.getItem("shardnote_language");
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
      if(["SCRIPT","STYLE","SELECT","OPTION"].includes(el.tagName)) return;
      [...el.childNodes].forEach(translateNode);
    });
    translateAttributes(document);
    document.title="ShardNote — "+translateValue("Discord Control Center");
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
      localStorage.setItem("shardnote_language",current);
      translatePage();
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

  const observer=new MutationObserver((mutations)=>{
    let should=false;
    for(const m of mutations){
      if(m.type==="childList" || m.type==="characterData" || m.type==="attributes"){should=true;break;}
    }
    if(should) requestAnimationFrame(translatePage);
  });

  function start(){
    installPicker();
    translatePage();
    observer.observe(document.body,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:["placeholder","title","aria-label"]});
  }

  if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",start,{once:true});
  else start();
})();

