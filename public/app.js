const pages = ["dashboard","tickets","messages","commands","music","settings","logs","admin"];
const titles = {dashboard:"Dashboard",tickets:"Tickets",messages:"Beskeder",commands:"Commands",music:"Musik",settings:"Indstillinger",logs:"Logs",admin:"Admin-panel"};
let settings = {
  prefix:"!",
  maintenance:false,
  autoReply:true,
  welcomeMessages:true,
  buttonLabels:{
    dashboard:"Dashboard",
    tickets:"Tickets",
    messages:"Beskeder",
    commands:"Commands",
    music:"Musik",
    settings:"Indstillinger",
    logs:"Logs",
    admin:"Admin"
  }
};


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
  pages.forEach(p=>{
    const el=document.getElementById("page-"+p);
    if(el) el.classList.toggle("active",p===page);
  });
  document.querySelectorAll(".nav button").forEach(b=>b.classList.toggle("active",b.dataset.page===page));
  applyButtonLabels();
  const title=document.getElementById("pageTitle");
  if(title) title.textContent=titles[page] || page;
  if(page==="tickets") loadTickets();
  if(page==="messages") loadMessages();
  if(page==="commands") loadCommands();
  if(page==="settings") loadSettings();
  if(page==="logs") loadLogs();
  if(page==="admin"){ loadUsers(); loadDatabaseSummary(); }
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

async function loadStats(){
  try{
    const s=await api("/api/stats");
    document.getElementById("statBot").textContent=s.botOnline?"Online":"Offline";
    document.getElementById("statServers").textContent=s.servers;
    document.getElementById("statUsers").textContent=s.users;
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
  document.getElementById("ticketList").innerHTML=tickets.length?`<table class="table"><thead><tr><th>ID</th><th>Titel</th><th>Bruger</th><th>Status</th><th>Prioritet</th><th>Handlinger</th></tr></thead><tbody>${tickets.map(t=>`<tr><td>#${t.id}</td><td>${escapeHtml(t.title)}</td><td>${escapeHtml(t.user)}</td><td><span class="badge ${t.status}">${t.status}</span></td><td>${t.priority}</td><td><button class="btn small" onclick="cycleTicket('${t.id}','${t.status}')">Skift status</button> <button class="btn small danger" onclick="deleteTicket('${t.id}')">Slet</button></td></tr>`).join("")}</tbody></table>`:'<div class="empty">Ingen tickets endnu.</div>';
}
async function newTicket(){
  const title=prompt("Ticket titel:");
  if(!title) return;
  await api("/api/tickets",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({title,user:"Dashboard user",priority:"normal"})});
  toast("Ticket oprettet");loadTickets();loadStats();
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

async function loadMessages(){
  const items=await api("/api/messages");
  document.getElementById("messageList").innerHTML=items.length?items.map(m=>`<div class="activity-item"><div class="activity-icon">✉</div><div><b>${escapeHtml(m.channel)}</b><small>${escapeHtml(m.content)} · ${new Date(m.time).toLocaleString("da-DK")}</small></div></div>`).join(""):'<div class="empty">Ingen beskeder endnu.</div>';
}
async function sendMessage(){
  const channel=document.getElementById("messageChannel").value;
  const content=document.getElementById("messageContent").value;
  try{await api("/api/messages",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({channel,content})});document.getElementById("messageContent").value="";toast("Besked gemt");loadMessages()}catch(e){toast(e.message)}
}

async function loadCommands(){
  const commands=await api("/api/commands");
  document.getElementById("commandCount").textContent=commands.length+" commands";
  document.getElementById("commandList").innerHTML=commands.map(c=>`<div class="activity-item"><div class="activity-icon">⌘</div><div><b>${escapeHtml(c.usage)}</b><small>${escapeHtml(c.description)}</small></div></div>`).join("");
}
async function runCommand(){
  const command=document.getElementById("commandInput").value;
  try{const r=await api("/api/commands",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({command})});document.getElementById("commandResult").textContent=r.message;loadLogs()}catch(e){toast(e.message)}
}
function musicAction(){toast("Musikmodulet er klar til Discord voice-integration.")}
function applyButtonLabels(){
  const labels=settings.buttonLabels || {};
  document.querySelectorAll(".nav button[data-page]").forEach(btn=>{
    const key=btn.dataset.page;
    const label=labels[key];
    if(label) {
      const span=btn.querySelector(".nav-label");
      if(span) span.textContent=label;
      titles[key]=label;
    }
  });
  const title=document.getElementById("pageTitle");
  const active=document.querySelector(".nav button.active")?.dataset.page;
  if(title && active) title.textContent=titles[active] || active;
}

const defaultButtonLabels={
  dashboard:"Dashboard",
  tickets:"Tickets",
  messages:"Beskeder",
  commands:"Commands",
  music:"Musik",
  settings:"Indstillinger",
  logs:"Logs",
  admin:"Admin"
};

function renderButtonLabelEditor(){
  const editor=document.getElementById("buttonLabelEditor");
  if(!editor) return;
  editor.innerHTML=Object.entries(defaultButtonLabels).map(([key, label])=>{
    const value=(settings.buttonLabels && settings.buttonLabels[key]) || label;
    return `<div class="field"><label>${escapeHtml(label)}</label><input data-button-label="${key}" maxlength="40" value="${escapeHtml(value)}"></div>`;
  }).join("");
}

async function loadSettings(){
  settings=await api("/api/settings");
  settings.buttonLabels=settings.buttonLabels||{...defaultButtonLabels};
  document.getElementById("prefix").value=settings.prefix;
  ["maintenance","autoReply","welcomeMessages"].forEach(k=>document.getElementById(k+"Switch").classList.toggle("on",!!settings[k]));
  applyButtonLabels();
  renderButtonLabelEditor();
}

async function saveButtonLabels(){
  const labels={};
  document.querySelectorAll("[data-button-label]").forEach(input=>{
    labels[input.dataset.buttonLabel]=input.value.trim() || defaultButtonLabels[input.dataset.buttonLabel];
  });
  settings.buttonLabels=labels;
  try{
    await api("/api/settings",{
      method:"PATCH",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({buttonLabels:labels})
    });
    applyButtonLabels();
    renderButtonLabelEditor();
    toast("Knapnavne gemt");
  }catch(e){toast(e.message)}
}

async function resetButtonLabels(){
  settings.buttonLabels={...defaultButtonLabels};
  try{
    await api("/api/settings",{
      method:"PATCH",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({buttonLabels:settings.buttonLabels})
    });
    applyButtonLabels();
    renderButtonLabelEditor();
    toast("Knapnavne nulstillet");
  }catch(e){toast(e.message)}
}
function toggleSetting(key){settings[key]=!settings[key];document.getElementById(key+"Switch").classList.toggle("on",settings[key])}
async function saveSettings(){
  settings.prefix=document.getElementById("prefix").value||"!";
  await api("/api/settings",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify(settings)});
  toast("Indstillinger gemt");loadLogs();
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
        ? `<div class="table-wrap"><table class="table"><thead><tr><th>Tid</th><th>Bruger</th><th>Resultat</th><th>IP</th><th>Sted</th><th>Browser/enhed</th></tr></thead><tbody>${items.map(item=>{
            const place=[item.city,item.country].filter(Boolean).join(", ")||"Ukendt";
            return `<tr><td>${new Date(item.createdAt).toLocaleString("da-DK")}</td><td>${escapeHtml(item.userName||item.userEmail||"Ukendt")}</td><td><span class="badge ${item.success?"open":"closed"}">${item.success?"Succes":"Fejlet"}</span></td><td>${escapeHtml(item.ipAddress||"Ukendt")}</td><td>${escapeHtml(place)}</td><td title="${escapeHtml(item.userAgent||"")}">${escapeHtml(item.userAgent||"Ukendt")}</td></tr>`;
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
    document.getElementById("userList").innerHTML=users.map(u=>{
      const roleButton=u.id!==currentUser?.id
        ? `<button class="btn small" onclick="toggleUserRole(${u.id},'${u.role}')">${u.role==="admin"?"Gør til member":"Gør til admin"}</button>`
        : "";
      const deleteButton=u.id!==currentUser?.id
        ? `<button class="btn small danger" onclick="deleteUser(${u.id})">Slet</button>`
        : "";
      return `<div class="activity-item"><div class="activity-icon">${u.role==="admin"?"👑":"👤"}</div><div style="flex:1"><b>${escapeHtml(u.name)}</b><small>${escapeHtml(u.email)} · ${escapeHtml(u.role)}</small></div>${roleButton} ${deleteButton}</div>`;
    }).join("")||'<div class="empty">Ingen brugere.</div>';
  }catch(e){toast(e.message)}
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
    const r=await fetch("/api/me"); if(!r.ok) throw new Error();
    const data=await r.json(); currentUser=data.user; document.body.classList.remove("locked");
    if(currentUser.role!=="admin"){
      document.querySelector('[data-page="admin"]')?.remove();
      document.querySelector('[data-page="logs"]')?.remove();
    }
    loadStats();
  }catch(e){showLogin();}
}
function showLogin(){
  document.body.classList.add("locked");
  if(document.getElementById("loginScreen")) return;

  const box=document.createElement("div");
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

function showRegister(){
  document.body.classList.add("locked");

  const box=document.getElementById("loginScreen") || document.createElement("div");
  box.id="loginScreen";
  box.innerHTML=`<div class="login-card">
    <div class="brand" style="padding:0 0 20px"><div class="brand-mark">S</div><span>ShardNote</span></div>
    <h1>Opret konto</h1>
    <p>Opret din egen ShardNote-konto. Nye konti oprettes som Member.</p>
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
    currentUser=data.user; document.getElementById("loginScreen").remove(); document.body.classList.remove("locked");
    if(currentUser.role!=="admin"){
      document.querySelector('[data-page="admin"]')?.remove();
      document.querySelector('[data-page="logs"]')?.remove();
    }
    loadStats();
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
    document.getElementById("loginScreen")?.remove();
    document.body.classList.remove("locked");
    if(currentUser.role!=="admin"){
      document.querySelector('[data-page="admin"]')?.remove();
      document.querySelector('[data-page="logs"]')?.remove();
    }

    toast("Konto oprettet");
    loadStats();
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
window.login=login;
window.register=register;
window.addBotToDiscord=addBotToDiscord;
window.unlockLogs=unlockLogs;
window.lockLogs=lockLogs;
window.loadLogCategory=loadLogCategory;
async function createUser(){
  try{
    await api("/api/admin/users",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name:document.getElementById("newUserName").value,email:document.getElementById("newUserEmail").value,password:document.getElementById("newUserPassword").value,role:document.getElementById("newUserRole").value})});
    document.getElementById("newUserName").value="";document.getElementById("newUserEmail").value="";document.getElementById("newUserPassword").value="";
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
async function deleteUser(id){if(!confirm("Slet denne bruger?"))return;try{await api("/api/admin/users/"+id,{method:"DELETE"});toast("Bruger slettet");loadUsers();loadLogs()}catch(e){toast(e.message)}}

checkLogin();
setInterval(()=>{if(currentUser)loadStats()},15000);