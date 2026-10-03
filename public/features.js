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
    ["🔒","Lockdown","Lås tekstkanaler og åbn dem igen.","/lockdown /unlockdown"]
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
    host.innerHTML='<div class="card"><div class="empty">Henter Discord-servere…</div></div>';

    try{
      const guilds=await apiCall("/api/bot/guilds");
      if(!guilds.length){
        host.innerHTML='<div class="card"><div class="empty"><div style="font-size:34px;margin-bottom:10px">🤖</div><b>Ingen Discord-servere fundet</b><div style="margin-top:8px;font-size:12px;color:var(--muted)">Botten skal være online og være tilføjet til mindst én Discord-server.</div></div></div>';
        return;
      }

      if(!guilds.some(function(g){return String(g.id)===String(selectedGuild);})) selectedGuild=guilds[0].id;
      localStorage.setItem("shardnote_feature_guild",selectedGuild);

      host.innerHTML=
        '<div class="card">'+
          '<div class="section-title"><div><h2>Bot-funktioner</h2><span>Alt det, vi har bygget ind i botten, samlet ét sted.</span></div>'+
          '<select id="snFeatureGuild" class="feature-select" style="max-width:360px">'+guilds.map(function(g){return '<option value="'+esc(g.id)+'"'+(String(g.id)===String(selectedGuild)?" selected":"")+'>'+esc(g.name)+' · '+g.memberCount+' medlemmer</option>';}).join("")+'</select></div>'+
          '<div id="snFeatureSettings"></div>'+
        '</div>';

      document.getElementById("snFeatureGuild").addEventListener("change",function(){
        selectedGuild=this.value;
        localStorage.setItem("shardnote_feature_guild",selectedGuild);
        renderFeatureSettings(selectedGuild);
      });

      await renderFeatureSettings(selectedGuild);
    }catch(error){
      host.innerHTML='<div class="card"><div class="empty">'+esc(error.message)+'</div></div>';
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