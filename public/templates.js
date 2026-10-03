(function(){
  const TEMPLATE_PAGE="templates";
  const TEMPLATE_TITLE="Discord-skitser";
  let selectedGuild=localStorage.getItem("shardnote_template_guild") || "";
  let selectedTemplate=localStorage.getItem("shardnote_selected_template") || "f5-vip";

  const TEMPLATES=[
    {key:"f5-vip",icon:"⭐",name:"F5 VIP",desc:"VIP/F5-server med staff, VIP, tickets og community.",features:["AutoMod","Invite filter","Levels / XP","Economy","Anti-raid"]},
    {key:"fivem-vip",icon:"🚓",name:"FiveM VIP",desc:"FiveM VIP-server med VIP-område, tickets, staff og gaming.",features:["AutoMod","Invite filter","Levels / XP","Economy","Anti-raid"]},
    {key:"fivem-esx",icon:"🚔",name:"FiveM ESX",desc:"ESX-server med jobs, whitelist, Politi, EMS og staff.",features:["AutoMod","Invite filter","Anti-raid","Tickets"]},
    {key:"fivem-rp",icon:"🎭",name:"FiveM RP",desc:"Roleplay-server med RP-info, fraktioner og support.",features:["AutoMod","Invite filter","Levels / XP","Anti-raid"]},
    {key:"rust",icon:"⛏️",name:"Rust",desc:"Rust-server med wipe, raid, team, trade og VIP.",features:["AutoMod","Invite filter","Levels / XP","Economy","Anti-raid"]},
    {key:"vennegruppe",icon:"👥",name:"Vennegruppe",desc:"Privat server til venner med spil, memes og voice.",features:["AutoMod","Levels / XP","Economy"]},
    {key:"gaming",icon:"🎮",name:"Gaming Community",desc:"Generel gaming-server med events, clips og spil.",features:["AutoMod","Invite filter","Levels / XP","Economy"]},
    {key:"clan",icon:"🏆",name:"Clan / E-sport",desc:"Clan med spillere, tryouts, scrims og staff.",features:["AutoMod","Invite filter","Levels / XP","Anti-raid"]},
    {key:"streamer",icon:"📺",name:"Streamer / Creator",desc:"Streamer-server med live, clips, fan-art og community.",features:["AutoMod","Invite filter","Levels / XP","Economy"]},
    {key:"community",icon:"🌐",name:"Community",desc:"Stor almindelig Discord-community med tickets og events.",features:["AutoMod","Invite filter","Levels / XP","Economy","Anti-raid"]},
    {key:"support",icon:"🎫",name:"Support Server",desc:"Supportserver med FAQ, tickets, status og logs.",features:["AutoMod","Invite filter","Anti-raid","Tickets"]},
    {key:"shop",icon:"🛒",name:"Shop / Marketplace",desc:"Shop-server med produkter, bestillinger, support og anmeldelser.",features:["AutoMod","Invite filter","Economy","Anti-raid","Tickets"]},
    {key:"creator",icon:"🎨",name:"Creator Community",desc:"Creator-server med showcase, feedback og samarbejde.",features:["AutoMod","Invite filter","Levels / XP","Economy"]},
    {key:"custom",icon:"🧰",name:"Byg selv",desc:"Vælg selv funktionerne og få en grundstruktur genereret.",features:["Vælg selv"]}
  ];

  const FEATURE_KEYS=[
    ["automod_enabled","AutoMod","Stop spam og dårlig opførsel automatisk."],
    ["invite_filter","Invite filter","Bloker Discord-invites i chatten."],
    ["levels_enabled","Levels / XP","XP, levels og leaderboard."],
    ["economy_enabled","Economy","Coins, daily og work."],
    ["anti_raid_enabled","Anti-raid","Beskyt mod hurtige joins."]
  ];

  function esc(value){
    return String(value==null?"":value).replace(/[&<>"']/g,function(m){return {"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[m];});
  }
  function apiCall(url,options){
    const request=Object.assign({credentials:"include",cache:"no-store"},options||{});
    return fetch(url,request).then(function(r){
      return r.json().then(function(d){
        if(!r.ok) throw new Error(d.error||"Request failed");
        return d;
      });
    });
  }
  function showPage(){
    document.querySelectorAll(".page").forEach(function(p){p.classList.toggle("active",p.id==="page-"+TEMPLATE_PAGE);});
    document.querySelectorAll(".nav button").forEach(function(b){b.classList.toggle("active",b.dataset.page===TEMPLATE_PAGE);});
    const title=document.getElementById("pageTitle");if(title)title.textContent=TEMPLATE_TITLE;
  }
  function selectTemplate(key){
    selectedTemplate=key;
    localStorage.setItem("shardnote_selected_template",key);
    document.querySelectorAll("[data-template-key]").forEach(function(card){
      const active=card.dataset.templateKey===key;
      card.style.borderColor=active?"rgba(109,93,252,.9)":"";
      card.style.boxShadow=active?"0 0 0 2px rgba(109,93,252,.18)":"";
      card.setAttribute("aria-pressed",active?"true":"false");
    });
    const cfg=TEMPLATES.find(function(x){return x.key===key;});
    const title=document.getElementById("selectedTemplateTitle");
    const desc=document.getElementById("selectedTemplateDesc");
    const apply=document.getElementById("snTemplatePageApply");
    const f5=document.getElementById("f5Options");
    if(title) title.textContent=(cfg?cfg.icon+" ":"")+((cfg&&cfg.name)||key);
    if(desc) desc.textContent=(cfg&&cfg.desc)||"";
    if(apply) apply.textContent="🚀 Opsæt "+((cfg&&cfg.name)||"denne skitse");
    const custom=document.getElementById("customFeatures");
    if(custom) custom.style.display=key==="custom"?"block":"none";
    if(f5) f5.style.display=key==="f5-vip"?"block":"none";
    const result=document.getElementById("snTemplatePageResult");
    if(result) result.innerHTML="";
  }
  window.selectDiscordTemplate=selectTemplate;
  async function applyTemplate(){
    const guildId=document.getElementById("snTemplatePageGuild")?.value;
    const result=document.getElementById("snTemplatePageResult");
    const button=document.getElementById("snTemplatePageApply");
    if(!guildId){if(result)result.innerHTML='<div class="badge pending">Vælg en Discord-server først.</div>';return;}
    const prefixRoles=[...document.querySelectorAll("[data-prefix-role]:checked")].map(function(el){return el.getAttribute("data-prefix-role");});
    const prefixChannels=[...document.querySelectorAll("[data-prefix-channel]:checked")].map(function(el){return el.getAttribute("data-prefix-channel");});
    const features={};
    FEATURE_KEYS.forEach(function(item){
      const el=document.getElementById("tpl_"+item[0]);
      features[item[0]]=!!el?.checked;
    });
    if(!confirm("Opsæt "+((TEMPLATES.find(x=>x.key===selectedTemplate)||{}).name||selectedTemplate)+" på serveren? Eksisterende ting slettes ikke."))return;
    button.disabled=true;button.textContent="⏳ Sætter serveren op…";if(result)result.innerHTML="";
    try{
      const response=await apiCall("/api/bot/guilds/"+encodeURIComponent(guildId)+"/templates/"+encodeURIComponent(selectedTemplate),{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({prefixRoles,prefixChannels,features})
      });
      const r=response.result||{};
      if(result)result.innerHTML='<div class="badge open">✅ '+esc(r.name||selectedTemplate)+' er sat op</div>'+
        '<div style="color:var(--muted);font-size:12px;margin-top:8px">'+esc(String(r.createdRoles||0))+' nye roller · '+esc(String((r.channels||[]).length))+' kanaler behandlet</div>';
    }catch(error){if(result)result.innerHTML='<div class="badge closed">'+esc(error.message)+'</div>';}
    finally{button.disabled=false;button.textContent="🚀 Opsæt denne skitse";}
  }
  async function renderPage(){
    showPage();
    const host=document.getElementById("discordTemplatesPage");if(!host)return;
    const cards=TEMPLATES.map(function(t){
      return '<div role="button" tabindex="0" aria-pressed="false" class="card template-card" data-template-key="'+esc(t.key)+'" style="text-align:left;cursor:pointer;border:1px solid var(--border);padding:16px;transition:.15s">'+
        '<div style="font-size:25px">'+t.icon+'</div><h3 style="margin:8px 0 5px">'+esc(t.name)+'</h3>'+
        '<p style="margin:0;color:var(--muted);font-size:12px;line-height:1.5">'+esc(t.desc)+'</p>'+
        '<div style="margin-top:10px;color:var(--accent2);font-size:11px;font-weight:700">'+esc(t.features.join(" · "))+'</div>'+
      '</div>';
    }).join("");
    const customChecks=FEATURE_KEYS.map(function(item){
      return '<label class="field" style="display:block;margin-top:9px"><input type="checkbox" id="tpl_'+item[0]+'" checked> <b>'+esc(item[1])+'</b><br><span style="color:var(--muted);font-size:11px">'+esc(item[2])+'</span></label>';
    }).join("");
    host.innerHTML=
      '<div class="card" style="margin-bottom:18px">'+
        '<div class="section-title"><div><h2>Discord-skitser</h2><span>Tryk på en færdig skitse, så vælger ShardNote automatisk funktionerne.</span></div><div class="badge open">Member Plus</div></div>'+
        '<p style="color:var(--muted);line-height:1.6;margin:0">Du får en stor liste med færdige servertyper. Nederst kan du vælge <b>Byg selv</b> og selv bestemme funktionerne.</p>'+
      '</div>'+
      '<div class="feature-grid">'+cards+'</div>'+
      '<div class="card" style="margin-top:18px">'+
        '<div class="section-title"><div><h2 id="selectedTemplateTitle">⭐ F5 VIP</h2><span id="selectedTemplateDesc">Vælg en skitse ovenfor.</span></div><div class="badge open">Valgt skitse</div></div>'+
        '<div class="field"><label>Discord-server</label><select id="snTemplatePageGuild"></select></div>'+
        '<div id="customFeatures" style="display:none;margin-top:16px"><h3 style="margin-bottom:4px">🧰 Vælg funktioner</h3>'+customChecks+'</div>'+
        '<div id="f5Options" style="margin-top:16px">'+
          '<div style="color:var(--muted);font-size:12px;margin-bottom:8px"><b>F5 VIP:</b> vælg selv hvilke roller og kanaler der skal have <b>F5</b> foran navnet.</div>'+
          '<div class="grid two">'+
            '<div><b>Roller</b>'+
              '<div><label><input type="checkbox" data-prefix-role="owner"> Ejer</label></div>'+
              '<div><label><input type="checkbox" data-prefix-role="admin"> Admin</label></div>'+
              '<div><label><input type="checkbox" data-prefix-role="moderator"> Moderator</label></div>'+
              '<div><label><input type="checkbox" data-prefix-role="support"> Support</label></div>'+
              '<div><label><input type="checkbox" data-prefix-role="vip"> VIP</label></div>'+
              '<div><label><input type="checkbox" data-prefix-role="member"> Medlem</label></div>'+
              '<div><label><input type="checkbox" data-prefix-role="muted"> Muted</label></div>'+
            '</div>'+
            '<div><b>Kanaler</b>'+
              '<div><label><input type="checkbox" data-prefix-channel="velkommen"> velkommen</label></div>'+
              '<div><label><input type="checkbox" data-prefix-channel="regler"> regler</label></div>'+
              '<div><label><input type="checkbox" data-prefix-channel="verification"> verification</label></div>'+
              '<div><label><input type="checkbox" data-prefix-channel="chat"> chat</label></div>'+
              '<div><label><input type="checkbox" data-prefix-channel="support"> support</label></div>'+
              '<div><label><input type="checkbox" data-prefix-channel="logs"> logs</label></div>'+
              '<div><label><input type="checkbox" data-prefix-channel="vipchat"> vip-chat</label></div>'+
              '<div><label><input type="checkbox" data-prefix-channel="staffchat"> staff-chat</label></div>'+
            '</div>'+
          '</div>'+
        '</div>'+
        '<div class="actions" style="margin-top:18px"><button type="button" class="btn primary" id="snTemplatePageApply">🚀 Opsæt denne skitse</button></div>'+
        '<div id="snTemplatePageResult" style="margin-top:12px"></div>'+
      '</div>';

    document.querySelectorAll("[data-template-key]").forEach(function(card){
      card.addEventListener("click",function(){
        selectTemplate(card.dataset.templateKey);
        document.getElementById("selectedTemplateTitle")?.scrollIntoView({behavior:"smooth",block:"center"});
      });
      card.addEventListener("keydown",function(event){
        if(event.key==="Enter"||event.key===" "){
          event.preventDefault();
          selectTemplate(card.dataset.templateKey);
          document.getElementById("selectedTemplateTitle")?.scrollIntoView({behavior:"smooth",block:"center"});
        }
      });
    });
    selectTemplate(selectedTemplate);

    try{
      const guilds=await apiCall("/api/bot/guilds");
      const select=document.getElementById("snTemplatePageGuild");
      if(!guilds.length){select.innerHTML='<option value="">Ingen Discord-servere</option>';document.getElementById("snTemplatePageApply").disabled=true;return;}
      if(!guilds.some(function(g){return String(g.id)===String(selectedGuild);}))selectedGuild=guilds[0].id;
      localStorage.setItem("shardnote_template_guild",selectedGuild);
      select.innerHTML=guilds.map(function(g){return '<option value="'+esc(g.id)+'"'+(String(g.id)===String(selectedGuild)?" selected":"")+'>'+esc(g.name)+' · '+g.memberCount+' medlemmer</option>';}).join("");
      select.addEventListener("change",function(){selectedGuild=this.value;localStorage.setItem("shardnote_template_guild",selectedGuild);});
      document.getElementById("snTemplatePageApply").addEventListener("click",applyTemplate);
    }catch(error){document.getElementById("snTemplatePageResult").innerHTML='<div class="badge closed">'+esc(error.message)+'</div>';}
  }
  const oldNavigate=window.navigate;
  window.navigate=function(page){if(page===TEMPLATE_PAGE){renderPage();return;}return oldNavigate(page);};
  document.addEventListener("DOMContentLoaded",function(){const b=document.querySelector('.nav button[data-page="templates"]');if(b)b.addEventListener("click",function(e){e.preventDefault();window.navigate(TEMPLATE_PAGE);});});
  if(document.readyState!=="loading"){const b=document.querySelector('.nav button[data-page="templates"]');if(b)b.addEventListener("click",function(e){e.preventDefault();window.navigate(TEMPLATE_PAGE);});}
})();