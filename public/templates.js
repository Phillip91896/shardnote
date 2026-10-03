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
    if(!confirm("F5 VIP-skitsen opretter manglende roller, kategorier og kanaler og konfigurerer ShardNote. Eksisterende ting med samme navn slettes ikke. Fortsæt?")) return;

    button.disabled=true;
    button.textContent="⏳ Sætter serveren op…";
    if(result) result.innerHTML="";

    try{
      const response=await apiCall("/api/bot/guilds/"+encodeURIComponent(guildId)+"/templates/f5-vip",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:"{}"
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
          '<div style="margin-top:15px;color:var(--muted);font-size:13px;line-height:1.8">'+
            '<b style="color:#fff">Roller</b><br>'+
            '👑 F5 Ejer · 🛡️ F5 Admin · 🔨 F5 Moderator · 🎫 F5 Support<br>'+
            '⭐ F5 VIP · ✅ F5 Medlem · 🔇 F5 Muted<br><br>'+
            '<b style="color:#fff">Områder</b><br>'+
            '📌 Information · 💬 Community · 🎫 Support · 🎟️ Tickets<br>'+
            '⭐ VIP · 🔒 Staff · 🔊 Voice'+
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