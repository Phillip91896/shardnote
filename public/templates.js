(function(){
  const TEMPLATE_PAGE="templates";
  const TEMPLATE_TITLE="Discord-skitser";
  let selectedGuild=localStorage.getItem("shardnote_template_guild") || "";

  function esc(value){
    return String(value == null ? "" : value).replace(/[&<>"']/g,function(m){
      return {"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[m];
    });
  }

  function apiCall(url,options){
    return fetch(url,options||{}).then(function(response){
      return response.json().then(function(data){
        if(!response.ok) throw new Error(data.error||"Request failed");
        return data;
      });
    });
  }

  function showPage(){
    document.querySelectorAll(".page").forEach(function(page){
      page.classList.toggle("active",page.id==="page-"+TEMPLATE_PAGE);
    });
    document.querySelectorAll(".nav button").forEach(function(button){
      button.classList.toggle("active",button.dataset.page===TEMPLATE_PAGE);
    });
    const title=document.getElementById("pageTitle");
    if(title) title.textContent=TEMPLATE_TITLE;
  }

  async function applyTemplate(){
    const guildId=document.getElementById("snTemplatePageGuild")?.value;
    const result=document.getElementById("snTemplatePageResult");
    const button=document.getElementById("snTemplatePageApply");
    if(!guildId){
      if(result) result.innerHTML='<div class="badge pending">Vælg en Discord-server først.</div>';
      return;
    }
    const prefixRoles=[...document.querySelectorAll("[data-prefix-role]:checked")].map(function(el){return el.getAttribute("data-prefix-role");});
    const prefixChannels=[...document.querySelectorAll("[data-prefix-channel]:checked")].map(function(el){return el.getAttribute("data-prefix-channel");});

    if(!confirm("F5 VIP-skitsen opretter manglende roller, kategorier og kanaler. F5 sættes kun foran de roller og kanaler, du har valgt. Fortsæt?")) return;

    button.disabled=true;
    button.textContent="⏳ Sætter serveren op…";
    if(result) result.innerHTML="";

    try{
      const response=await apiCall("/api/bot/guilds/"+encodeURIComponent(guildId)+"/templates/f5-vip",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({prefixRoles:prefixRoles,prefixChannels:prefixChannels})
      });
      const r=response.result||{};
      if(result){
        result.innerHTML='<div class="badge open">✅ F5 VIP-skitsen er sat op</div>'+
          '<div style="color:var(--muted);font-size:12px;margin-top:8px">'+
          esc(String(r.createdRoles||0))+' nye roller · '+
          esc(String((r.channels||[]).length))+' kanaler behandlet'+
          '</div>';
      }
    }catch(error){
      if(result) result.innerHTML='<div class="badge closed">'+esc(error.message)+'</div>';
    }finally{
      button.disabled=false;
      button.textContent="🚀 Opsæt F5 VIP på serveren";
    }
  }

  async function renderPage(){
    showPage();
    const host=document.getElementById("discordTemplatesPage");
    if(!host) return;

    host.innerHTML=
      '<div class="card" style="margin-bottom:18px">'+
        '<div class="section-title"><div><h2>Discord-skitser</h2><span>Færdige serveropsætninger til Member Plus.</span></div><div class="badge open">Member Plus</div></div>'+
        '<p style="color:var(--muted);line-height:1.6;margin:0">Vælg en skitse, vælg serveren og tryk på opsæt. ShardNote opretter manglende roller, kategorier, kanaler, rettigheder og bot-opsætning. Eksisterende ting bliver ikke slettet.</p>'+
      '</div>'+
      '<div class="grid two">'+
        '<div class="card">'+
          '<div class="section-title"><div><h2>⭐ F5 VIP</h2><span>Komplet F5/VIP Discord-startopsætning</span></div><div class="badge pending">Skitse</div></div>'+
          '<div class="field"><label>Discord-server</label><select id="snTemplatePageGuild"></select></div>'+
          '<div style="margin-top:15px;color:var(--muted);font-size:13px">Vælg selv, hvilke roller og kanaler der skal have <b>F5</b> foran navnet.</div>'+
          '<div class="grid two" style="margin-top:15px">'+
            '<div class="card" style="padding:14px;background:#0c0c13">'+
              '<b>F5 foran roller</b>'+
              '<div class="field" style="margin-top:10px"><label><input type="checkbox" data-prefix-role="owner"> 👑 Ejer</label></div>'+
              '<div class="field"><label><input type="checkbox" data-prefix-role="admin"> 🛡️ Admin</label></div>'+
              '<div class="field"><label><input type="checkbox" data-prefix-role="moderator"> 🔨 Moderator</label></div>'+
              '<div class="field"><label><input type="checkbox" data-prefix-role="support"> 🎫 Support</label></div>'+
              '<div class="field"><label><input type="checkbox" data-prefix-role="vip"> ⭐ VIP</label></div>'+
              '<div class="field"><label><input type="checkbox" data-prefix-role="member"> ✅ Medlem</label></div>'+
              '<div class="field"><label><input type="checkbox" data-prefix-role="muted"> 🔇 Muted</label></div>'+
            '</div>'+
            '<div class="card" style="padding:14px;background:#0c0c13">'+
              '<b>F5 foran kanaler</b>'+
              '<div class="field" style="margin-top:10px"><label><input type="checkbox" data-prefix-channel="welcome"> velkommen</label></div>'+
              '<div class="field"><label><input type="checkbox" data-prefix-channel="rules"> regler</label></div>'+
              '<div class="field"><label><input type="checkbox" data-prefix-channel="verification"> verification</label></div>'+
              '<div class="field"><label><input type="checkbox" data-prefix-channel="announcements"> annonceringer</label></div>'+
              '<div class="field"><label><input type="checkbox" data-prefix-channel="chat"> chat</label></div>'+
              '<div class="field"><label><input type="checkbox" data-prefix-channel="suggestions"> forslag</label></div>'+
              '<div class="field"><label><input type="checkbox" data-prefix-channel="support"> support</label></div>'+
              '<div class="field"><label><input type="checkbox" data-prefix-channel="ticketPanel"> ticket-panel</label></div>'+
              '<div class="field"><label><input type="checkbox" data-prefix-channel="vipChat"> vip-chat</label></div>'+
              '<div class="field"><label><input type="checkbox" data-prefix-channel="staffChat"> staff-chat</label></div>'+
              '<div class="field"><label><input type="checkbox" data-prefix-channel="logs"> logs</label></div>'+
              '<div class="field"><label><input type="checkbox" data-prefix-channel="generalVoice"> Fælles</label></div>'+
              '<div class="field"><label><input type="checkbox" data-prefix-channel="vipVoice"> VIP Lounge</label></div>'+
            '</div>'+
          '</div>'+
          '<div class="actions" style="margin-top:18px"><button type="button" class="btn primary" id="snTemplatePageApply">🚀 Opsæt F5 VIP på serveren</button></div>'+
          '<div id="snTemplatePageResult" style="margin-top:12px"></div>'+
        '</div>'+
        '<div class="card">'+
          '<div class="section-title"><div><h2>Det bliver automatisk sat op</h2><span>Alt samlet i én handling</span></div></div>'+
          '<div class="activity">'+
            '<div class="activity-item"><div class="activity-icon">🔐</div><div><b>Rolle- og kanalrettigheder</b><small>Verification, community, VIP, staff og private tickets.</small></div></div>'+
            '<div class="activity-item"><div class="activity-icon">🎫</div><div><b>Tickets</b><small>Ticket-kategori og færdigt ticket-panel.</small></div></div>'+
            '<div class="activity-item"><div class="activity-icon">🛡️</div><div><b>Bot-funktioner</b><small>AutoMod, invite filter, anti-raid, levels og economy.</small></div></div>'+
            '<div class="activity-item"><div class="activity-icon">✅</div><div><b>Verification</b><small>F5 Medlem-rollen og færdigt verification-panel.</small></div></div>'+
          '</div>'+
        '</div>'+
      '</div>';

    try{
      const guilds=await apiCall("/api/bot/guilds");
      const select=document.getElementById("snTemplatePageGuild");
      if(!guilds.length){
        select.innerHTML='<option value="">Ingen Discord-servere</option>';
        document.getElementById("snTemplatePageApply").disabled=true;
        return;
      }

      if(!guilds.some(function(g){return String(g.id)===String(selectedGuild);})) selectedGuild=guilds[0].id;
      localStorage.setItem("shardnote_template_guild",selectedGuild);

      select.innerHTML=guilds.map(function(g){
        return '<option value="'+esc(g.id)+'"'+(String(g.id)===String(selectedGuild)?" selected":"")+'>'+esc(g.name)+' · '+g.memberCount+' medlemmer</option>';
      }).join("");

      select.addEventListener("change",function(){
        selectedGuild=this.value;
        localStorage.setItem("shardnote_template_guild",selectedGuild);
        document.getElementById("snTemplatePageResult").innerHTML="";
      });

      document.getElementById("snTemplatePageApply").addEventListener("click",applyTemplate);
    }catch(error){
      document.getElementById("snTemplatePageResult").innerHTML='<div class="badge closed">'+esc(error.message)+'</div>';
    }
  }

  const oldNavigate=window.navigate;
  window.navigate=function(page){
    if(page===TEMPLATE_PAGE){
      renderPage();
      return;
    }
    return oldNavigate(page);
  };

  document.addEventListener("DOMContentLoaded",function(){
    const button=document.querySelector('.nav button[data-page="templates"]');
    if(button){
      button.addEventListener("click",function(event){
        event.preventDefault();
        window.navigate(TEMPLATE_PAGE);
      });
    }
  });

  if(document.readyState!=="loading"){
    const button=document.querySelector('.nav button[data-page="templates"]');
    if(button){
      button.addEventListener("click",function(event){
        event.preventDefault();
        window.navigate(TEMPLATE_PAGE);
      });
    }
  }
})();