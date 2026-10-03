const pages = ["dashboard","tickets","messages","commands","music","settings","logs","admin"];
const titles = {dashboard:"Dashboard",tickets:"Tickets",messages:"Beskeder",commands:"Commands",music:"Musik",settings:"Indstillinger",logs:"Logs",admin:"Admin-panel"};
let settings = {prefix:"!",maintenance:false,autoReply:true,welcomeMessages:true};

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
  const title=document.getElementById("pageTitle");
  if(title) title.textContent=titles[page] || page;
  if(page==="tickets") loadTickets();
  if(page==="messages") loadMessages();
  if(page==="commands") loadCommands();
  if(page==="settings") loadSettings();
  if(page==="logs") loadLogs();
  if(page==="admin") loadUsers();
}

async function api(url, options){
  const r=await fetch(url, options);
  const data=await r.json();
  if(!r.ok) throw new Error(data.error||"Request failed");
  return data;
}
function toast(msg){const el=document.getElementById("toast");el.textContent=msg;el.style.display="block";setTimeout(()=>el.style.display="none",2500)}
function escapeHtml(s){return String(s).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[m]))}

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
    const logs=await api("/api/logs");
    document.getElementById("dashLogs").innerHTML=logs.slice(0,5).map(l=>`<div class="activity-item"><div class="activity-icon">•</div><div><b>${escapeHtml(l.message)}</b><small>${new Date(l.time).toLocaleString("da-DK")}</small></div></div>`).join("")||'<div class="empty">Ingen aktivitet endnu.</div>';
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
async function loadSettings(){
  settings=await api("/api/settings");
  document.getElementById("prefix").value=settings.prefix;
  ["maintenance","autoReply","welcomeMessages"].forEach(k=>document.getElementById(k+"Switch").classList.toggle("on",!!settings[k]));
}
function toggleSetting(key){settings[key]=!settings[key];document.getElementById(key+"Switch").classList.toggle("on",settings[key])}
async function saveSettings(){
  settings.prefix=document.getElementById("prefix").value||"!";
  await api("/api/settings",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify(settings)});
  toast("Indstillinger gemt");loadLogs();
}
async function loadLogs(){
  const logs=await api("/api/logs");
  document.getElementById("logList").innerHTML=logs.length?`<table class="table"><thead><tr><th>Type</th><th>Hændelse</th><th>Tid</th></tr></thead><tbody>${logs.map(l=>`<tr><td><span class="badge ${l.type==="error"?"closed":l.type==="warning"?"pending":"open"}">${escapeHtml(l.type)}</span></td><td>${escapeHtml(l.message)}</td><td>${new Date(l.time).toLocaleString("da-DK")}</td></tr>`).join("")}</tbody></table>`:'<div class="empty">Ingen logs endnu.</div>';
}

async function loadUsers(){
  try{
    const users=await api("/api/admin/users");
    document.getElementById("userList").innerHTML=users.map(u=>`<div class="activity-item"><div class="activity-icon">${u.role==="admin"?"👑":"👤"}</div><div style="flex:1"><b>${escapeHtml(u.name)}</b><small>${escapeHtml(u.email)} · ${escapeHtml(u.role)}</small></div>${u.id!==currentUser?.id?`<button class="btn small danger" onclick="deleteUser(${u.id})">Slet</button>`:""}</div>`).join("")||'<div class="empty">Ingen brugere.</div>';
  }catch(e){toast(e.message)}
}
let currentUser=null;
async function checkLogin(){
  try{
    const r=await fetch("/api/me"); if(!r.ok) throw new Error();
    const data=await r.json(); currentUser=data.user; document.body.classList.remove("locked");
    if(currentUser.role!=="admin") document.querySelector('[data-page="admin"]')?.remove();
    loadStats();
  }catch(e){showLogin();}
}
function showLogin(){
  document.body.classList.add("locked");
  if(document.getElementById("loginScreen")) return;
  const box=document.createElement("div"); box.id="loginScreen";
  box.innerHTML=`<div class="login-card"><div class="brand" style="padding:0 0 20px"><div class="brand-mark">S</div><span>ShardNote</span></div><h1>Log ind</h1><p>Log ind på dit ShardNote-kontrolpanel.</p><form onsubmit="login(event)"><div class="field"><label>Email</label><input id="loginEmail" type="email" required autocomplete="username"></div><div class="field" style="margin-top:12px"><label>Adgangskode</label><input id="loginPassword" type="password" required autocomplete="current-password"></div><button class="btn primary" style="width:100%;margin-top:16px">Log ind</button><div id="loginError" style="color:var(--red);font-size:12px;margin-top:10px"></div></form></div>`;
  document.body.appendChild(box);
}
async function login(e){
  e.preventDefault();
  const error=document.getElementById("loginError");
  try{
    const r=await fetch("/api/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:document.getElementById("loginEmail").value,password:document.getElementById("loginPassword").value})});
    const data=await r.json(); if(!r.ok) throw new Error(data.error||"Login fejlede");
    currentUser=data.user; document.getElementById("loginScreen").remove(); document.body.classList.remove("locked");
    if(currentUser.role!=="admin") document.querySelector('[data-page="admin"]')?.remove();
    loadStats();
  }catch(err){error.textContent=err.message}
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
async function createUser(){
  try{
    await api("/api/admin/users",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name:document.getElementById("newUserName").value,email:document.getElementById("newUserEmail").value,password:document.getElementById("newUserPassword").value,role:document.getElementById("newUserRole").value})});
    document.getElementById("newUserName").value="";document.getElementById("newUserEmail").value="";document.getElementById("newUserPassword").value="";
    toast("Bruger oprettet");loadUsers();loadLogs();
  }catch(e){toast(e.message)}
}
async function deleteUser(id){if(!confirm("Slet denne bruger?"))return;try{await api("/api/admin/users/"+id,{method:"DELETE"});toast("Bruger slettet");loadUsers();loadLogs()}catch(e){toast(e.message)}}

checkLogin();
setInterval(()=>{if(currentUser)loadStats()},15000);