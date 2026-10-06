(function(){
  const TEMPLATE_PAGE="templates";
  const TEMPLATE_TITLE="Discord Templates";
  let selectedGuild=localStorage.getItem("shardnote_template_guild") || "";
  let selectedTemplate=localStorage.getItem("shardnote_selected_template") || "fivem-vip";
  let selectedLanguage=localStorage.getItem("shardnote_template_language") || "en";

  const TEMPLATE_LANGUAGES=[
    ["da","🇩🇰 Dansk"],["en","🇬🇧 English"],["de","🇩🇪 Deutsch"],["fr","🇫🇷 Français"],
    ["es","🇪🇸 Español"],["it","🇮🇹 Italiano"],["nl","🇳🇱 Nederlands"],["pt","🇵🇹 Português"],
    ["sv","🇸🇪 Svenska"],["no","🇳🇴 Norsk"],["fi","🇫🇮 Suomi"],["pl","🇵🇱 Polski"],
    ["tr","🇹🇷 Türkçe"],["ru","🇷🇺 Русский"],["uk","🇺🇦 Українська"],["ja","🇯🇵 日本語"],
    ["ko","🇰🇷 한국어"],["zh","🇨🇳 中文"]
  ];

  const TEMPLATES=[
    {key:"fivem-vip",icon:"🚓",name:"FiveM VIP",desc:"FiveM VIP server with VIP areas, support, tickets and staff.",features:["AutoMod","Invite filter","Levels / XP","Economy","Anti-raid"]},
    {key:"fivem-esx",icon:"🚔",name:"FiveM ESX",desc:"ESX roleplay server with jobs, whitelist, police, EMS and support.",features:["AutoMod","Invite filter","Anti-raid","Tickets"]},
    {key:"fivem-rp",icon:"🎭",name:"FiveM RP",desc:"Roleplay server with RP information, factions, support and applications.",features:["AutoMod","Invite filter","Levels / XP","Anti-raid"]},
    {key:"rust",icon:"⛏️",name:"Rust",desc:"Rust community with wipes, raids, teams, trading and VIP.",features:["AutoMod","Invite filter","Levels / XP","Economy","Anti-raid"]},
    {key:"vennegruppe",icon:"👥",name:"Friends Server",desc:"Private server for friends with games, memes and voice channels.",features:["AutoMod","Levels / XP","Economy"]},
    {key:"gaming",icon:"🎮",name:"Gaming Community",desc:"General gaming community with events, clips, support and voice.",features:["AutoMod","Invite filter","Levels / XP","Economy"]},
    {key:"clan",icon:"🏆",name:"Clan / E-sports",desc:"Competitive community with players, tryouts, scrims, support and staff.",features:["AutoMod","Invite filter","Levels / XP","Anti-raid"]},
    {key:"streamer",icon:"📺",name:"Streamer / Creator",desc:"Creator community with live updates, clips, fan art and support.",features:["AutoMod","Invite filter","Levels / XP","Economy"]},
    {key:"community",icon:"🌐",name:"Community",desc:"Full Discord community with announcements, events, tickets and support.",features:["AutoMod","Invite filter","Levels / XP","Economy","Anti-raid"]},
    {key:"support",icon:"🎫",name:"Support Server",desc:"Support-focused server with ticket intake, waiting queue, support rooms and staff tools.",features:["AutoMod","Invite filter","Anti-raid","Tickets","Support rooms"]},
    {key:"shop",icon:"🛒",name:"Shop / Marketplace",desc:"Marketplace server with products, orders, reviews and support.",features:["AutoMod","Invite filter","Economy","Anti-raid","Tickets"]},
    {key:"creator",icon:"🎨",name:"Creator Community",desc:"Creator server with showcases, feedback, collaboration and support.",features:["AutoMod","Invite filter","Levels / XP","Economy"]},
    {key:"custom",icon:"🧰",name:"Build Your Own",desc:"Start from a secure base and choose the features you want to enable.",features:["Choose features"]}
  ];

  const DISCORD_ROLES=[
    ["👑","Owner"],["⚙️","Developer"],["🛡️","Administrator"],["🔨","Moderator"],
    ["🎫","Support Manager"],["🎧","Support Lead"],["⭐","Senior Support"],["🧰","Supporter"],
    ["🕐","Trial Support"],["🤝","Partner"],["💎","Premium"],["✅","Verified"],
    ["👤","Member"],["🤖","Shardnote Bot"]
  ];

  const SUPPORT_VOICE_ROOMS=[
    {name:"Waiting for Support",note:"Join here when you need a support agent."},
    {name:"Support Room 1",note:"Private support call room."},
    {name:"Support Room 2",note:"Private support call room."},
    {name:"Support Room 3",note:"Private support call room."},
    {name:"Support Room 4",note:"Private support call room."},
    {name:"Support Room 5",note:"Private support call room."}
  ];

  const DISCORD_CHANNEL_GROUPS=[
    {name:"INFORMATION",icon:"📌",channels:["welcome","rules","announcements","changelog","status"]},
    {name:"COMMUNITY",icon:"💬",channels:["general","suggestions","bug-reports","showcase","partners"]},
    {name:"SUPPORT",icon:"🎫",channels:["create-ticket","support-info","faq","known-issues","waiting-for-support"]},
    {name:"STAFF",icon:"🔒",channels:["staff-chat","ticket-logs","mod-logs","server-logs","reports"]},
    {name:"VOICE",icon:"🔊",channels:["Support Lounge","Waiting for Support","Support Room 1","Support Room 2","Support Room 3","Support Room 4","Support Room 5"]}
  ];

  const FEATURE_KEYS=[
    ["automod_enabled","AutoMod","Automatically reduce spam and abusive behavior."],
    ["invite_filter","Invite filter","Block Discord invite links in chat."],
    ["levels_enabled","Levels / XP","XP, levels and leaderboards."],
    ["economy_enabled","Economy","Coins, daily rewards and work commands."],
    ["anti_raid_enabled","Anti-raid","Protect the server against rapid join raids."]
  ];

  function esc(value){
    return String(value==null?"":value).replace(/[&<>"']/g,function(m){return {"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[m];});
  }
  function apiCall(url,options){
    const request=Object.assign({credentials:"include",cache:"no-store"},options||{});
    return fetch(url,request).then(function(r){
      return r.json().then(function(d){
        if(r.status===401 && typeof window.showLogin==="function"){
          window.showLogin();
        }
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
    if(!TEMPLATES.some(function(item){return item.key===key;})) key="fivem-vip";
    selectedTemplate=key;
    localStorage.setItem("shardnote_selected_template",key);
    document.querySelectorAll("[data-template-key]").forEach(function(card){
      const active=card.dataset.templateKey===key;
      card.style.borderColor=active?"rgba(109,93,252,.9)":"";
      card.style.boxShadow=active?"0 0 0 2px rgba(109,93,252,.18)":"";
      card.setAttribute("aria-pressed",active?"true":"");
    });
    const cfg=TEMPLATES.find(function(x){return x.key===key;});
    const title=document.getElementById("selectedTemplateTitle");
    const desc=document.getElementById("selectedTemplateDesc");
    const apply=document.getElementById("snTemplatePageApply");
    if(title) title.textContent=(cfg?cfg.icon+" ":"")+((cfg&&cfg.name)||key);
    if(desc) desc.textContent=(cfg&&cfg.desc)||"";
    if(apply) apply.textContent="🚀 Deploy "+((cfg&&cfg.name)||"this template");
    const custom=document.getElementById("customFeatures");
    if(custom) custom.style.display=key==="custom"?"block":"none";
    const result=document.getElementById("snTemplatePageResult");
    if(result) result.innerHTML="";
    renderDiscordPreview(cfg);
  }
  function renderDiscordPreview(cfg){
    const host=document.getElementById("snDiscordBlueprintPreview");
    if(!host)return;
    const channelsHtml=DISCORD_CHANNEL_GROUPS.map(group=>{
      const channels=group.channels.map(name=>{
        const isVoice=["Support Lounge","Waiting for Support","Support Room 1","Support Room 2","Support Room 3","Support Room 4","Support Room 5"].includes(name);
        return '<div style="display:flex;align-items:center;gap:7px;padding:5px 8px;border-radius:6px;color:'+(isVoice?'#cfd0d7':'#9b9da8')+';font-size:12px">'+
          '<span style="width:16px;text-align:center">'+(isVoice?'🔊':'#')+'</span><span>'+esc(name)+'</span>'+
          (name==="Waiting for Support"?' <span style="margin-left:auto;font-size:10px;color:#8b8d98">queue</span>':'')+
        '</div>';
      }).join("");
      return '<div style="margin-top:12px"><div style="font-size:10px;font-weight:900;letter-spacing:.08em;color:#7f8190;padding:0 8px 5px">'+group.icon+' '+esc(group.name)+'</div>'+channels+'</div>';
    }).join("");

    const rolesHtml=DISCORD_ROLES.map(role=>{
      return '<div style="display:flex;align-items:center;gap:8px;padding:7px 0;border-bottom:1px solid rgba(255,255,255,.05)">'+
        '<span style="font-size:14px;width:18px;text-align:center">'+role[0]+'</span><span style="font-size:12px;color:#e7e8ec">'+esc(role[1])+'</span>'+
      '</div>';
    }).join("");

    const voiceHtml=SUPPORT_VOICE_ROOMS.map(room=>{
      return '<div style="display:flex;align-items:center;gap:9px;background:#171820;border:1px solid rgba(255,255,255,.06);border-radius:10px;padding:10px 12px">'+
        '<span style="font-size:16px">🔊</span><div><div style="font-size:12px;font-weight:800;color:#f2f3f5">'+esc(room.name)+'</div><div style="font-size:10px;color:#8b8d98;margin-top:2px">'+esc(room.note)+'</div></div>'+
        '<span style="margin-left:auto;font-size:10px;color:#57d99c;font-weight:800">JOIN</span>'+
      '</div>';
    }).join("");

    host.innerHTML=
      '<div style="border:1px solid rgba(255,255,255,.10);border-radius:18px;overflow:hidden;background:#0f1015;box-shadow:0 18px 50px rgba(0,0,0,.24)">'+
        '<div style="display:flex;align-items:center;justify-content:space-between;padding:14px 16px;border-bottom:1px solid rgba(255,255,255,.07);background:#12131a">'+
          '<div><div style="font-size:11px;color:#8f91a0;letter-spacing:.08em;text-transform:uppercase">Discord Server Preview</div><div style="font-size:18px;font-weight:900;color:#fff;margin-top:3px">'+esc((cfg?.name||"Shardnote Server"))+'</div></div>'+
          '<div style="display:flex;gap:7px;align-items:center"><span class="badge open">Preview only</span><span class="badge pending">No existing channels removed</span></div>'+
        '</div>'+
        '<div style="display:grid;grid-template-columns:minmax(210px,240px) minmax(0,1fr) minmax(210px,250px);min-height:640px">'+
          '<aside style="background:#111217;padding:14px;border-right:1px solid rgba(255,255,255,.06);overflow:auto">'+
            '<div style="font-size:12px;font-weight:900;color:#f2f3f5;padding:8px 8px 12px">Shardnote | Official</div>'+
            channelsHtml+
          '</aside>'+
          '<section style="padding:18px;background:#171820;overflow:auto">'+
            '<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:18px"><div><div style="font-size:20px;font-weight:900;color:#fff"># create-ticket</div><div style="font-size:11px;color:#8f91a0;margin-top:3px">Private support intake for members.</div></div><span class="badge open">Support online</span></div>'+
            '<div style="background:#111217;border:1px solid rgba(255,255,255,.07);border-radius:14px;padding:18px">'+
              '<div style="font-size:16px;font-weight:900;color:#fff">🎫 Need help?</div>'+
              '<div style="font-size:12px;color:#a7a9b4;line-height:1.6;margin-top:7px">Create a ticket for technical support, billing, setup questions, bug reports or account help.</div>'+
              '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:14px"><span class="badge open">Create Ticket</span><span class="badge pending">AI First Response</span><span class="badge pending">Staff Escalation</span></div>'+
            '</div>'+
            '<div style="margin-top:18px;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px">'+
              '<div style="background:#111217;border:1px solid rgba(255,255,255,.07);border-radius:12px;padding:12px"><div style="font-size:10px;color:#8f91a0">WAITING</div><div style="font-size:20px;font-weight:900;color:#fff;margin-top:4px">Support</div></div>'+
              '<div style="background:#111217;border:1px solid rgba(255,255,255,.07);border-radius:12px;padding:12px"><div style="font-size:10px;color:#8f91a0">TICKETS</div><div style="font-size:20px;font-weight:900;color:#fff;margin-top:4px">Private</div></div>'+
              '<div style="background:#111217;border:1px solid rgba(255,255,255,.07);border-radius:12px;padding:12px"><div style="font-size:10px;color:#8f91a0">VOICE</div><div style="font-size:20px;font-weight:900;color:#fff;margin-top:4px">6 Rooms</div></div>'+
            '</div>'+
            '<div style="margin-top:18px"><div style="font-size:12px;font-weight:900;color:#fff;margin-bottom:10px">Joinable Support Rooms</div><div style="display:grid;gap:8px">'+voiceHtml+'</div></div>'+
          '</section>'+
          '<aside style="background:#111217;padding:14px;border-left:1px solid rgba(255,255,255,.06);overflow:auto">'+
            '<div style="font-size:11px;font-weight:900;letter-spacing:.08em;color:#8f91a0;padding:8px 0 6px">ROLES</div>'+
            rolesHtml+
          '</aside>'+
        '</div>'+
      '</div>';
  }

  window.selectDiscordTemplate=selectTemplate;
  window.shardnoteDeployOfficial=deployOfficialServer;
  async function deployOfficialServer(){
    const result=document.getElementById("snOfficialAdminResult") || document.getElementById("snTemplatePageResult");
    const button=document.getElementById("snOfficialAdminDeploy") || document.getElementById("snOfficialDeploy");
    if(!button)return;
    const language=document.getElementById("snOfficialAdminLanguage")?.value || document.getElementById("snTemplateLanguage")?.value || selectedLanguage;
    if(!confirm("Deploy the selected support template to the official Shardnote Discord? Existing channels and roles will not be deleted."))return;
    button.disabled=true;
    button.textContent="⏳ Deploying official server…";
    try{
      const response=await apiCall("/api/bot/official-template",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({templateKey:"support",language})
      });
      const r=response.result||{};
      if(result) result.innerHTML='<div class="badge open">✅ Official Shardnote server is ready</div>'+
        '<div style="color:var(--muted);font-size:12px;margin-top:8px">'+esc(String(r.createdRoles||0))+' roles · '+esc(String((r.channels||[]).length))+' channels · language: '+esc(String(r.languageName||language))+'</div>';
    }catch(error){
      if(result) result.innerHTML='<div class="badge closed">'+esc(error.message)+'</div>';
    }finally{
      button.disabled=false;
      button.textContent="🚀 Deploy official Shardnote server";
    }
  }

  async function applyTemplate(){
    const guildId=document.getElementById("snTemplatePageGuild")?.value;
    const result=document.getElementById("snTemplatePageResult");
    const button=document.getElementById("snTemplatePageApply");
    if(!guildId){if(result)result.innerHTML='<div class="badge pending">Select a Discord server first.</div>';return;}
    const prefixRoles=[];
    const prefixChannels=[];
    const features={};
    selectedLanguage=document.getElementById("snTemplateLanguage")?.value || selectedLanguage;
    localStorage.setItem("shardnote_template_language",selectedLanguage);
    FEATURE_KEYS.forEach(function(item){
      const el=document.getElementById("tpl_"+item[0]);
      features[item[0]]=!!el?.checked;
    });
    if(!confirm("Deploy "+((TEMPLATES.find(x=>x.key===selectedTemplate)||{}).name||selectedTemplate)+" to this server? Existing channels and roles will not be deleted."))return;
    button.disabled=true;button.textContent="⏳ Deploying template…";if(result)result.innerHTML="";
    try{
      const response=await apiCall("/api/bot/guilds/"+encodeURIComponent(guildId)+"/templates/"+encodeURIComponent(selectedTemplate),{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({prefixRoles,prefixChannels,features,language:selectedLanguage})
      });
      const r=response.result||{};
      if(result)result.innerHTML='<div class="badge open">✅ '+esc(r.name||selectedTemplate)+' is ready</div>'+
        '<div style="color:var(--muted);font-size:12px;margin-top:8px">'+esc(String(r.createdRoles||0))+' new roles · '+esc(String((r.channels||[]).length))+' channels processed · language: '+esc(String(r.languageName||selectedLanguage))+'</div>';
    }catch(error){
      if(result){
        const permissionError=String(error.message||"").includes("mangler rettighederne");
        result.innerHTML='<div class="badge closed">'+esc(error.message)+'</div>'+
          (permissionError ? '<div style="margin-top:10px"><button type="button" class="btn small" onclick="addBotToDiscord()">🔐 Update bot permissions</button></div>' : '');
      }
    }
    finally{button.disabled=false;button.textContent="🚀 Deploy this template";}
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
        '<div class="section-title"><div><h2>Discord Templates</h2><span>Preview the full server structure before you deploy it.</span></div><div class="badge open">Member Plus</div></div>'+
        '<p style="color:var(--muted);line-height:1.6;margin:0">Every blueprint includes the complete support setup, a waiting queue, joinable support voice rooms and the core role structure. Existing server content is not deleted.</p>'+
      '</div>'+
      '<div class="feature-grid">'+cards+'</div>'+
      '<div id="snDiscordBlueprintPreview" style="margin-top:18px"></div>'+
      '<div class="card" style="margin-top:18px">'+
        '<div class="section-title"><div><h2 id="selectedTemplateTitle">🚓 FiveM VIP</h2><span id="selectedTemplateDesc">Choose a template to configure and deploy.</span></div><div class="badge open">Selected template</div></div>'+
        '<div class="grid two">'+
          '<div class="field"><label>Discord Server</label><select id="snTemplatePageGuild"></select></div>'+
          '<div class="field"><label>Server language</label><select id="snTemplateLanguage">'+TEMPLATE_LANGUAGES.map(function(item){return '<option value="'+item[0]+'">'+item[1]+'</option>';}).join("")+'</select></div>'+
        '</div>'+
        '<div id="customFeatures" style="display:none;margin-top:16px"><h3 style="margin-bottom:4px">🧰 Choose features</h3>'+customChecks+'</div>'+
        '<div class="actions" style="margin-top:18px"><button type="button" class="btn primary" id="snTemplatePageApply">🚀 Deploy this template</button></div>'+
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
      select.innerHTML=guilds.map(function(g){return '<option value="'+esc(g.id)+'"'+(String(g.id)===String(selectedGuild)?" selected":"")+'>'+esc(g.name)+' · '+g.memberCount+' members</option>';}).join("");
      const languageSelect=document.getElementById("snTemplateLanguage");
      if(languageSelect){
        if(!TEMPLATE_LANGUAGES.some(function(item){return item[0]===selectedLanguage;})) selectedLanguage="en";
        languageSelect.value=selectedLanguage;
        languageSelect.addEventListener("change",function(){
          selectedLanguage=this.value;
          localStorage.setItem("shardnote_template_language",selectedLanguage);
        });
      }
      select.addEventListener("change",function(){selectedGuild=this.value;localStorage.setItem("shardnote_template_guild",selectedGuild);});
      document.getElementById("snTemplatePageApply").addEventListener("click",applyTemplate);

    }catch(error){document.getElementById("snTemplatePageResult").innerHTML='<div class="badge closed">'+esc(error.message)+'</div>';}
  }
  async function installOfficialAdminCard(){
    try{
      const me=await apiCall("/api/me");
      const card=document.getElementById("snOfficialAdminCard");
      if(card && me?.user?.isOwner){
        card.style.display="block";
        const language=document.getElementById("snOfficialAdminLanguage");
        if(language) language.value=selectedLanguage;
      }
    }catch(error){
      console.warn("Official admin setup visibility could not be loaded:",error);
    }
  }
  if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",installOfficialAdminCard,{once:true});
  else installOfficialAdminCard();

  const oldNavigate=window.navigate;
  window.navigate=function(page){if(page===TEMPLATE_PAGE){renderPage();return;}return oldNavigate(page);};
  document.addEventListener("DOMContentLoaded",function(){const b=document.querySelector('.nav button[data-page="templates"]');if(b)b.addEventListener("click",function(e){e.preventDefault();window.navigate(TEMPLATE_PAGE);});});
  if(document.readyState!=="loading"){const b=document.querySelector('.nav button[data-page="templates"]');if(b)b.addEventListener("click",function(e){e.preventDefault();window.navigate(TEMPLATE_PAGE);});}
})();