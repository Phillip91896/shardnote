(function(){
  const FEATURE_PAGE = "features";
  const FEATURE_TITLE = "Bot-funktioner";
  let selectedGuild = localStorage.getItem("shardnote_feature_guild") || "";

  const FEATURE_LIST = [
    ["🛡️","Moderation","Warnings, kick, ban, timeout, purge og slowmode.","/warn /ban /timeout"],
    ["🎫","Tickets","Private ticket-kanaler med claim, close og transcript.","/ticket /ticket-panel"],
    ["🤖","AutoMod","Spam-beskyttelse og automatisk moderering.","/set-features"],
    ["🔗","Invite filter","Bloker Discord-invites i chatten.","invite_filter"],
    ["🚨","Anti-raid","Beskyt mod hurtige joins.","anti_raid"],
    ["👋","Welcome / Leave","Velkomst- og farvelbeskeder.","/set-welcome /set-leave"],
    ["🎭","Autorole","Giv nye medlemmer en rolle automatisk.","/set-autorole"],
    ["💡","Suggestions","Send forslag til en bestemt kanal.","/suggest"],
    ["🎉","Giveaways","Giveaways med deltagelsesknap og vindertrækning.","/giveaway"],
    ["📊","Polls","Afstemninger med interaktive knapper.","/poll"],
    ["📈","Levels / XP","XP, levels og leaderboard.","/level /leaderboard"],
    ["💰","Economy","Coins, daily og work-system.","/balance /daily /work"],
    ["🎭","Role panel","Interaktive selv-roller.","/role-panel"],
    ["✅","Verification","Verification-panel med valgt rolle.","/verify-panel"],
    ["💾","Backups","Backup og restore af roller og kanaler.","/backup /restore"],
    ["🎵","Voice","Join og leave voice-kanaler.","/music-join /music-leave"],
    ["📝","Logs","Send botlogs til en valgt Discord-kanal.","/set-log-channel"],
    ["🔒","Lockdown","Lås tekstkanaler og åbn dem igen.","/lockdown /unlockdown"],
    ["✨","AI-funktioner","AI-assistent og automatisering til ShardNote.","Planlagt"],
    ["⭐","Premium","Premium-planer og betalingsfunktioner.","Planlagt"],
    ["🎧","Musikafspilning","Rigtig musikafspilning via en lydkilde.","Planlagt"]
  ];

  function esc(value){
    return String(value == null ? "" : value).replace(/[&<>"']/g, function(m){
      return {"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[m];
    });
  }

  function apiCall(url, options){
    return fetch(url, options || {}).then(function(response){
      return response.json().then(function(data){
        if(!response.ok) throw new Error(data.error || "Request failed");
        return data;
      });
    });
  }

  function showPage(){
    document.querySelectorAll(".page").forEach(function(page){
      page.classList.toggle("active", page.id === "page-"+FEATURE_PAGE);
    });
    document.querySelectorAll(".nav button").forEach(function(button){
      button.classList.toggle("active", button.dataset.page === FEATURE_PAGE);
    });
    const title=document.getElementById("pageTitle");
    if(title) title.textContent=FEATURE_TITLE;
  }

  function optionList(items, selected, label){
    const html=['<option value="">'+esc(label || "Ingen")+"</option>"];
    (items || []).forEach(function(item){
      html.push('<option value="'+esc(item.id)+'"'+(String(item.id)===String(selected || "")?" selected":"")+'>'+esc(item.name)+"</option>");
    });
    return html.join("");
  }

  function switchRow(key, title, description, enabled){
    return '<div class="switch-row"><div><b>'+esc(title)+'</b><div style="color:var(--muted);font-size:12px">'+esc(description)+'</div></div>'+
      '<button type="button" id="snFeature_'+key+'" class="switch '+(enabled?"on":"")+'" data-feature-key="'+key+'"><i></i></button></div>';
  }

  async function renderFeatureSettings(guildId){
    const body=document.getElementById("snFeatureSettings");
    if(!body) return;
    body.innerHTML='<div class="empty">Henter serverindstillinger…</div>';

    try{
      const data=await apiCall("/api/bot/guilds/"+encodeURIComponent(guildId)+"/settings");
      const s=data.settings || {};

      const cards=FEATURE_LIST.map(function(item){
        return '<div class="feature-card"><div style="font-size:22px;margin-bottom:7px">'+item[0]+'</div><h3>'+esc(item[1])+'</h3><p>'+esc(item[2])+'</p><span class="feature-command">'+esc(item[3])+'</span></div>';
      }).join("");

      body.innerHTML=
        '<div class="feature-grid" style="margin-bottom:18px">'+cards+"</div>"+
        '<div class="grid two">'+
          '<div class="card"><div class="section-title"><div><h2>Funktioner</h2><span>Slå serverfunktioner til eller fra.</span></div></div>'+
            switchRow("automod_enabled","AutoMod","Spam og moderering.",!!s.automod_enabled)+
            switchRow("invite_filter","Invite filter","Bloker Discord-invites.",!!s.invite_filter)+
            switchRow("levels_enabled","Levels / XP","Giv XP og levels.",!!s.levels_enabled)+
            switchRow("economy_enabled","Economy","Coins, daily og work.",!!s.economy_enabled)+
            switchRow("anti_raid_enabled","Anti-raid","Beskyt mod join-spikes.",!!s.anti_raid_enabled)+
            switchRow("lockdown","Lockdown","Lås alle tekstkanaler.",!!s.lockdown)+
          '</div>'+
          '<div class="card"><div class="section-title"><div><h2>Serveropsætning</h2><span>Kanaler, roller og beskeder som botten bruger.</span></div></div>'+
            '<div class="form-grid">'+
              '<div class="field"><label>Log-kanal</label><select id="snFeature_log">'+optionList(data.channels,s.log_channel_id,"Ingen log-kanal")+'</select></div>'+
              '<div class="field"><label>Welcome-kanal</label><select id="snFeature_welcome_channel">'+optionList(data.channels,s.welcome_channel_id,"Ingen welcome-kanal")+'</select></div>'+
              '<div class="field"><label>Leave-kanal</label><select id="snFeature_leave_channel">'+optionList(data.channels,s.leave_channel_id,"Ingen leave-kanal")+'</select></div>'+
              '<div class="field"><label>Suggestion-kanal</label><select id="snFeature_suggestion_channel">'+optionList(data.channels,s.suggestion_channel_id,"Ingen suggestion-kanal")+'</select></div>'+
              '<div class="field"><label>Autorole</label><select id="snFeature_autorole">'+optionList(data.roles,s.autorole_id,"Ingen autorole")+'</select></div>'+
              '<div class="field"><label>Support-rolle</label><select id="snFeature_support">'+optionList(data.roles,s.support_role_id,"Ingen support-rolle")+'</select></div>'+
              '<div class="field"><label>Ticket-kategori</label><select id="snFeature_ticket">'+optionList(data.categories,s.ticket_category_id,"Ingen kategori")+'</select></div>'+
              '<div class="field"><label>Verification-rolle</label><select id="snFeature_verify">'+optionList(data.roles,s.verification_role_id,"Ingen verification-rolle")+'</select></div>'+
            '</div>'+
            '<div class="field" style="margin-top:14px"><label>Welcome-besked</label><textarea id="snFeature_welcome_msg" placeholder="Velkommen {user} til {server}!"></textarea></div>'+
            '<div class="field" style="margin-top:14px"><label>Leave-besked</label><textarea id="snFeature_leave_msg" placeholder="{user} har forladt {server}."></textarea></div>'+
            '<div class="actions" style="position:sticky;bottom:10px;z-index:2"><button type="button" class="btn primary" id="snFeatureSave">Gem bot-indstillinger</button><button type="button" class="btn" id="snFeatureReload">Genindlæs</button></div>'+
          '</div>'+
        '</div>';

      document.getElementById("snFeature_welcome_msg").value=s.welcome_message || "";
      document.getElementById("snFeature_leave_msg").value=s.leave_message || "";

      document.querySelectorAll("#snFeatureSettings [data-feature-key]").forEach(function(button){
        button.addEventListener("click",function(){
          button.classList.toggle("on");
        });
      });

      document.getElementById("snFeatureSave").addEventListener("click",saveSettings);
      document.getElementById("snFeatureReload").addEventListener("click",function(){renderFeatureSettings(selectedGuild);});
    }catch(error){
      body.innerHTML='<div class="empty">'+esc(error.message)+'</div>';
    }
  }

  async function saveSettings(){
    try{
      const payload={
        log_channel_id:document.getElementById("snFeature_log").value || null,
        welcome_channel_id:document.getElementById("snFeature_welcome_channel").value || null,
        welcome_message:document.getElementById("snFeature_welcome_msg").value,
        leave_channel_id:document.getElementById("snFeature_leave_channel").value || null,
        leave_message:document.getElementById("snFeature_leave_msg").value,
        suggestion_channel_id:document.getElementById("snFeature_suggestion_channel").value || null,
        autorole_id:document.getElementById("snFeature_autorole").value || null,
        support_role_id:document.getElementById("snFeature_support").value || null,
        ticket_category_id:document.getElementById("snFeature_ticket").value || null,
        verification_role_id:document.getElementById("snFeature_verify").value || null,
        automod_enabled:document.getElementById("snFeature_automod_enabled").classList.contains("on"),
        invite_filter:document.getElementById("snFeature_invite_filter").classList.contains("on"),
        levels_enabled:document.getElementById("snFeature_levels_enabled").classList.contains("on"),
        economy_enabled:document.getElementById("snFeature_economy_enabled").classList.contains("on"),
        anti_raid_enabled:document.getElementById("snFeature_anti_raid_enabled").classList.contains("on"),
        lockdown:document.getElementById("snFeature_lockdown").classList.contains("on")
      };
      await apiCall("/api/bot/guilds/"+encodeURIComponent(selectedGuild)+"/settings",{
        method:"PATCH",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify(payload)
      });
      if(typeof window.toast==="function") window.toast("Bot-indstillinger gemt");
      await renderFeatureSettings(selectedGuild);
    }catch(error){
      if(typeof window.toast==="function") window.toast(error.message);
    }
  }

  async function renderPage(){
    showPage();
    const host=document.getElementById("botFeaturesPage");
    if(!host) return;

    const cards=FEATURE_LIST.map(function(item){
      return '<div class="feature-card"><div style="font-size:24px;margin-bottom:8px">'+item[0]+'</div><h3>'+esc(item[1])+'</h3><p>'+esc(item[2])+'</p><span class="feature-command">'+esc(item[3])+'</span></div>';
    }).join("");

    host.innerHTML=
      '<div class="card" style="margin-bottom:18px">'+
        '<div class="section-title"><div><h2>Alle bot-funktioner</h2><span>Her kan du se alt, ShardNote-botten kan. Dette er bot-funktionerne – ikke selve Discord-serveren.</span></div><div class="badge open">'+FEATURE_LIST.length+' funktioner</div></div>'+
        '<div class="feature-grid">'+cards+'</div>'+
      '</div>'+
      '<div class="card" style="margin-bottom:18px;border-color:rgba(155,89,182,.35)">'+
        '<div class="section-title"><div><h2>🧩 Discord-skitser</h2><span>Member Plus kan sætte en færdig Discord-struktur op med roller, kanaler, rettigheder og bot-funktioner.</span></div><div class="badge open">Member Plus</div></div>'+
        '<div class="grid two">'+
          '<div>'+
            '<div class="field"><label>Discord-server</label><select id="snTemplateGuild"></select></div>'+
            '<div style="margin-top:12px;color:var(--muted);font-size:13px;line-height:1.6">F5 VIP-skitsen opretter eller finder blandt andet <b>F5 Ejer, F5 Admin, F5 Moderator, F5 Support, F5 VIP, F5 Medlem og F5 Muted</b> samt information-, community-, support-, ticket-, VIP-, staff- og voice-områder.</div>'+
          '</div>'+
          '<div class="card" style="padding:14px;background:#0c0c13">'+
            '<div style="font-weight:800;margin-bottom:8px">F5 VIP-skitsen sætter også op</div>'+
            '<div style="color:var(--muted);font-size:12px;line-height:1.8">✓ Verification-panel<br>✓ Ticket-panel<br>✓ Log-kanal<br>✓ Welcome / leave<br>✓ Suggestions<br>✓ AutoMod + invite filter<br>✓ Anti-raid<br>✓ Levels / XP<br>✓ Economy</div>'+
          '</div>'+
        '</div>'+
        '<div class="actions" style="margin-top:16px"><button type="button" class="btn primary" id="snApplyF5Template">🚀 Opsæt F5 VIP på serveren</button></div>'+
        '<div id="snTemplateResult" style="margin-top:12px"></div>'+
      '</div>'+
      '<div class="card">'+
        '<div class="section-title"><div><h2>Bot-indstillinger pr. server</h2><span>Vælg en Discord-server herunder, hvis du vil konfigurere funktionerne.</span></div><div id="snFeatureGuildWrap" style="min-width:260px"></div></div>'+
        '<div id="snFeatureSettings"><div class="empty">Henter Discord-servere…</div></div>'+
      '</div>';

    try{
      const guilds=await apiCall("/api/bot/guilds");
      if(!guilds.length){
        document.getElementById("snFeatureGuildWrap").innerHTML='<span class="badge pending">Ingen server valgt</span>';
        const templateGuild=document.getElementById("snTemplateGuild");
        if(templateGuild) templateGuild.innerHTML='<option value="">Ingen server</option>';
        const templateButton=document.getElementById("snApplyF5Template");
        if(templateButton) templateButton.disabled=true;
        document.getElementById("snFeatureSettings").innerHTML='<div class="empty">Botten skal være tilføjet til mindst én Discord-server for at kunne konfigurere funktionerne. Selve funktionslisten ovenfor er stadig tilgængelig.</div>';
        return;
      }

      if(!guilds.some(function(g){return String(g.id)===String(selectedGuild);})) selectedGuild=guilds[0].id;
      localStorage.setItem("shardnote_feature_guild",selectedGuild);

      document.getElementById("snFeatureGuildWrap").innerHTML=
        '<select id="snFeatureGuild" class="feature-select" style="max-width:360px">'+guilds.map(function(g){return '<option value="'+esc(g.id)+'"'+(String(g.id)===String(selectedGuild)?" selected":"")+'>'+esc(g.name)+' · '+g.memberCount+' medlemmer</option>';}).join("")+'</select>';

      document.getElementById("snTemplateGuild").innerHTML=
        guilds.map(function(g){return '<option value="'+esc(g.id)+'"'+(String(g.id)===String(selectedGuild)?" selected":"")+'>'+esc(g.name)+' · '+g.memberCount+' medlemmer</option>';}).join("");

      document.getElementById("snFeatureGuild").addEventListener("change",function(){
        selectedGuild=this.value;
        document.getElementById("snTemplateGuild").value=selectedGuild;
        localStorage.setItem("shardnote_feature_guild",selectedGuild);
        renderFeatureSettings(selectedGuild);
      });

      document.getElementById("snTemplateGuild").addEventListener("change",function(){
        selectedGuild=this.value;
        document.getElementById("snFeatureGuild").value=selectedGuild;
        localStorage.setItem("shardnote_feature_guild",selectedGuild);
        renderFeatureSettings(selectedGuild);
      });

      document.getElementById("snApplyF5Template").addEventListener("click",async function(){
        const guildId=document.getElementById("snTemplateGuild").value;
        const resultEl=document.getElementById("snTemplateResult");
        if(!guildId){
          if(resultEl) resultEl.innerHTML='<span class="badge pending">Vælg en Discord-server først.</span>';
          return;
        }
        if(!confirm("F5 VIP-skitsen opretter manglende roller, kategorier og kanaler og konfigurerer ShardNote. Eksisterende ting med samme navn slettes ikke. Fortsæt?")) return;
        const button=this;
        button.disabled=true;
        button.textContent="⏳ Sætter Discord-serveren op…";
        if(resultEl) resultEl.innerHTML="";
        try{
          const response=await apiCall("/api/bot/guilds/"+encodeURIComponent(guildId)+"/templates/f5-vip",{method:"POST",headers:{"Content-Type":"application/json"},body:"{}"});
          const r=response.result || {};
          if(resultEl){
            resultEl.innerHTML='<div class="badge open">✅ F5 VIP er sat op</div><div style="color:var(--muted);font-size:12px;margin-top:7px">'+
              esc(String(r.createdRoles || 0))+' nye roller · '+esc(String((r.channels||[]).length))+' skabelonkanaler behandlet</div>';
          }
          await renderFeatureSettings(guildId);
        }catch(error){
          if(resultEl) resultEl.innerHTML='<div class="badge closed">'+esc(error.message)+'</div>';
        }finally{
          button.disabled=false;
          button.textContent="🚀 Opsæt F5 VIP på serveren";
        }
      });

      await renderFeatureSettings(selectedGuild);
    }catch(error){
      document.getElementById("snFeatureGuildWrap").innerHTML='<span class="badge pending">Kunne ikke hente servere</span>';
      document.getElementById("snFeatureSettings").innerHTML='<div class="empty">'+esc(error.message)+'</div>';
    }
  }

  const oldNavigate=window.navigate;
  window.navigate=function(page){
    if(page===FEATURE_PAGE){
      renderPage();
      return;
    }
    return oldNavigate(page);
  };

  document.addEventListener("DOMContentLoaded",function(){
    const button=document.querySelector('.nav button[data-page="features"]');
    if(button){
      button.addEventListener("click",function(event){
        event.preventDefault();
        window.navigate(FEATURE_PAGE);
      });
    }
  });

  if(document.readyState !== "loading"){
    const button=document.querySelector('.nav button[data-page="features"]');
    if(button){
      button.addEventListener("click",function(event){
        event.preventDefault();
        window.navigate(FEATURE_PAGE);
      });
    }
  }
})();