const {
  Client,
  GatewayIntentBits,
  PermissionFlagsBits,
  ChannelType,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  AttachmentBuilder
} = require("discord.js");
const { joinVoiceChannel, getVoiceConnection } = require("@discordjs/voice");

const commands = [
  {
    name: "ping",
    description: "Check if ShardNote is online."
  },
  {
    name: "help",
    description: "Show the available ShardNote commands."
  },
  {
    name: "ticket",
    description: "Create a support ticket.",
    options: [
      {
        type: 3,
        name: "title",
        description: "What do you need help with?",
        required: true
      }
    ]
  },
  {
    name: "serverinfo",
    description: "Show information about this Discord server."
  },
  {
    name: "userinfo",
    description: "Show information about a Discord member.",
    options: [
      { type: 6, name: "user", description: "Discord member", required: false }
    ]
  },
  { name: "ticket-panel", description: "Post a ticket creation panel." },
  { name: "ticket-close", description: "Close the current ticket." },
  { name: "ticket-claim", description: "Claim the current ticket." },
  { name: "ticket-transcript", description: "Create a transcript of the current ticket." },
  {
    name: "warn",
    description: "Warn a member.",
    options: [
      { type: 6, name: "user", description: "Member", required: true },
      { type: 3, name: "reason", description: "Reason", required: true }
    ]
  },
  {
    name: "warnings",
    description: "Show warnings for a member.",
    options: [{ type: 6, name: "user", description: "Member", required: true }]
  },
  {
    name: "clearwarnings",
    description: "Clear all warnings for a member.",
    options: [{ type: 6, name: "user", description: "Member", required: true }]
  },
  {
    name: "kick",
    description: "Kick a member.",
    options: [
      { type: 6, name: "user", description: "Member", required: true },
      { type: 3, name: "reason", description: "Reason", required: false }
    ]
  },
  {
    name: "ban",
    description: "Ban a member.",
    options: [
      { type: 6, name: "user", description: "Member", required: true },
      { type: 3, name: "reason", description: "Reason", required: false },
      { type: 4, name: "delete_days", description: "Delete 0-7 days of messages", required: false, min_value: 0, max_value: 7 }
    ]
  },
  {
    name: "unban",
    description: "Unban by Discord user ID.",
    options: [{ type: 3, name: "user_id", description: "Discord user ID", required: true }]
  },
  {
    name: "timeout",
    description: "Timeout a member.",
    options: [
      { type: 6, name: "user", description: "Member", required: true },
      { type: 3, name: "duration", description: "Example: 10m, 2h, 1d", required: true },
      { type: 3, name: "reason", description: "Reason", required: false }
    ]
  },
  {
    name: "untimeout",
    description: "Remove a timeout.",
    options: [{ type: 6, name: "user", description: "Member", required: true }]
  },
  {
    name: "purge",
    description: "Delete 1-100 messages.",
    options: [{ type: 4, name: "amount", description: "Amount", required: true, min_value: 1, max_value: 100 }]
  },
  {
    name: "slowmode",
    description: "Set slowmode in the current channel.",
    options: [{ type: 4, name: "seconds", description: "0-21600 seconds", required: true, min_value: 0, max_value: 21600 }]
  },
  { name: "lockdown", description: "Lock text channels." },
  { name: "unlockdown", description: "Unlock text channels." },
  {
    name: "announce",
    description: "Send an announcement embed.",
    options: [
      { type: 3, name: "title", description: "Title", required: true },
      { type: 3, name: "message", description: "Message", required: true },
      { type: 7, name: "channel", description: "Channel", required: false }
    ]
  },
  {
    name: "poll",
    description: "Create a poll.",
    options: [
      { type: 3, name: "question", description: "Question", required: true },
      { type: 3, name: "option1", description: "Option 1", required: true },
      { type: 3, name: "option2", description: "Option 2", required: true },
      { type: 3, name: "option3", description: "Optional option 3", required: false }
    ]
  },
  {
    name: "suggest",
    description: "Send a suggestion.",
    options: [{ type: 3, name: "text", description: "Suggestion text", required: true }]
  },
  {
    name: "giveaway",
    description: "Start a giveaway.",
    options: [
      { type: 3, name: "duration", description: "Example: 10m, 2h, 1d", required: true },
      { type: 3, name: "prize", description: "Prize", required: true },
      { type: 4, name: "winners", description: "Number of winners", required: false, min_value: 1, max_value: 20 }
    ]
  },
  {
    name: "role-panel",
    description: "Post a self-role button.",
    options: [
      { type: 8, name: "role", description: "Role", required: true },
      { type: 3, name: "label", description: "Button text", required: true }
    ]
  },
  { name: "verify-panel", description: "Post a verification panel." },
  {
    name: "set-log-channel",
    description: "Set the log channel.",
    options: [{ type: 7, name: "channel", description: "Text channel", required: true, channel_types: [0] }]
  },
  {
    name: "set-welcome",
    description: "Set welcome messages.",
    options: [
      { type: 7, name: "channel", description: "Text channel", required: true, channel_types: [0] },
      { type: 3, name: "message", description: "Use {user} and {server}", required: false }
    ]
  },
  {
    name: "set-leave",
    description: "Set leave messages.",
    options: [
      { type: 7, name: "channel", description: "Text channel", required: true, channel_types: [0] },
      { type: 3, name: "message", description: "Use {user} and {server}", required: false }
    ]
  },
  {
    name: "set-autorole",
    description: "Set automatic join role.",
    options: [{ type: 8, name: "role", description: "Role", required: true }]
  },
  {
    name: "set-support-role",
    description: "Set the ticket support role.",
    options: [{ type: 8, name: "role", description: "Role", required: true }]
  },
  {
    name: "set-ticket-category",
    description: "Set the ticket category.",
    options: [{ type: 7, name: "category", description: "Category", required: true, channel_types: [4] }]
  },
  {
    name: "set-verification-role",
    description: "Set the verification role.",
    options: [{ type: 8, name: "role", description: "Role", required: true }]
  },
  {
    name: "set-suggestion-channel",
    description: "Set the suggestion channel.",
    options: [{ type: 7, name: "channel", description: "Text channel", required: true, channel_types: [0] }]
  },
  {
    name: "set-features",
    description: "Enable or disable bot features.",
    options: [
      { type: 5, name: "automod", description: "AutoMod", required: true },
      { type: 5, name: "invite_filter", description: "Invite filter", required: true },
      { type: 5, name: "levels", description: "XP levels", required: true },
      { type: 5, name: "economy", description: "Economy", required: true },
      { type: 5, name: "anti_raid", description: "Anti-raid detection", required: true }
    ]
  },
  { name: "balance", description: "Show your coins and level." },
  { name: "daily", description: "Claim your daily reward." },
  { name: "work", description: "Earn coins from work." },
  { name: "leaderboard", description: "Show the server leaderboard." },
  {
    name: "level",
    description: "Show XP and level.",
    options: [{ type: 6, name: "user", description: "Member", required: false }]
  },
  { name: "backup", description: "Create a server backup JSON." },
  {
    name: "restore",
    description: "Restore a ShardNote backup.",
    options: [{ type: 11, name: "file", description: "Backup JSON", required: true }]
  },
  { name: "music-join", description: "Join your current voice channel." },
  { name: "music-leave", description: "Leave the current voice channel." }
];

function createBot({ state, db, log, createTicket, setReady }) {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent
    ]
  });

  async function registerGuildCommands(guild) {
    try {
      await guild.commands.set(commands);
      console.log(`[ShardNote] Commands registered in ${guild.name} (${guild.id}).`);
      log("success", `Slash commands registered in Discord server ${guild.name}`);
      return true;
    } catch (error) {
      console.error(`[ShardNote] Command registration failed in ${guild.name}:`, error);
      log("error", `Command registration failed in ${guild.name}: ${error.message}`);
      return false;
    }
  }

  const guildSettingsCache = new Map();
  const spamBuckets = new Map();
  const raidBuckets = new Map();
  const polls = new Map();
  const giveaways = new Map();
  const giveawayEntries = new Map();

  function parseDuration(value) {
    const match = String(value || "").trim().toLowerCase().match(/^(\\d+)\\s*(s|m|h|d)$/);
    if (!match) return null;
    const multiplier = { s: 1000, m: 60000, h: 3600000, d: 86400000 }[match[2]];
    const ms = Number(match[1]) * multiplier;
    return Number.isFinite(ms) && ms >= 1000 && ms <= 28 * 86400000 ? ms : null;
  }

  function formatDuration(ms) {
    const total = Math.floor(ms / 1000);
    if (total >= 86400) return Math.floor(total / 86400) + "d";
    if (total >= 3600) return Math.floor(total / 3600) + "h";
    if (total >= 60) return Math.floor(total / 60) + "m";
    return total + "s";
  }

  async function getGuildSettings(guildId) {
    const cached = guildSettingsCache.get(guildId);
    if (cached && cached.expiresAt > Date.now()) return cached.value;
    const defaults = {
      log_channel_id: null, welcome_channel_id: null,
      welcome_message: "Velkommen {user} til {server}! 👋",
      leave_channel_id: null, leave_message: "{user} har forladt {server}.",
      autorole_id: null, support_role_id: null, ticket_category_id: null,
      verification_role_id: null, suggestion_channel_id: null,
      automod_enabled: true, invite_filter: false, levels_enabled: true,
      economy_enabled: true, anti_raid_enabled: true, lockdown: false
    };
    if (!db) return defaults;
    try {
      await db.query("INSERT INTO public.guild_settings (guild_id) VALUES ($1) ON CONFLICT (guild_id) DO NOTHING", [guildId]);
      const result = await db.query("SELECT * FROM public.guild_settings WHERE guild_id = $1 LIMIT 1", [guildId]);
      const value = Object.assign(defaults, result.rows[0] || {});
      guildSettingsCache.set(guildId, { value, expiresAt: Date.now() + 30000 });
      return value;
    } catch (error) {
      log("error", "Guild settings error: " + error.message);
      return defaults;
    }
  }

  async function setGuildSetting(guildId, key, value) {
    const allowed = ["log_channel_id","welcome_channel_id","welcome_message","leave_channel_id","leave_message","autorole_id","support_role_id","ticket_category_id","verification_role_id","suggestion_channel_id","automod_enabled","invite_filter","levels_enabled","economy_enabled","anti_raid_enabled","lockdown"];
    if (!allowed.includes(key)) throw new Error("Invalid guild setting.");
    if (db) await db.query("UPDATE public.guild_settings SET " + key + " = $1, updated_at = NOW() WHERE guild_id = $2", [value, guildId]);
    guildSettingsCache.delete(guildId);
    return getGuildSettings(guildId);
  }


  async function applyDiscordTemplate(guildId, templateKey, options = {}) {
    const guild = client.guilds.cache.get(String(guildId));
    if (!guild) throw new Error("Discord serveren blev ikke fundet.");

    const templates = {
      "f5-vip": {
        name: "F5 VIP",
        roles: ["Ejer","Admin","Moderator","Support","VIP","Medlem"],
        categories: ["📌 INFORMATION","💬 COMMUNITY","🎫 SUPPORT","🎟️ TICKETS","⭐ VIP","🔒 STAFF","🔊 VOICE"],
        channels: ["velkommen","regler","verification","annonceringer","chat","forslag","support","ticket-panel","vip-chat","staff-chat","logs","Fælles","VIP Lounge"],
        features: { automod_enabled:true, invite_filter:true, levels_enabled:true, economy_enabled:true, anti_raid_enabled:true, lockdown:false },
        prefixRoles:["owner","admin","moderator","support","vip","member"],
        prefixChannels:["velkommen","regler","verification","annonceringer","chat","forslag","support","ticketpanel","vipchat","staffchat","logs","faelles","viplounge"]
      },
      "fivem-vip": {
        name: "FiveM VIP",
        roles: ["Ejer","Admin","Moderator","Support","VIP","Medlem"],
        extraRoles: ["Support Lead","Supporter","Trial Supporter","Whitelist Team","Application Team","Event Team","Content Creator","Server Tester","Whitelisted","Business Owner"],
        categories: ["📌 INFORMATION","🚓 FIVEM","📝 APPLICATIONS","🎫 SUPPORT","🎟️ TICKETS","⭐ VIP","🔒 STAFF","🔊 VOICE"],
        channels: ["velkommen","regler","server-info","how-to-join","whitelist","application-status","support","ticket-panel","bug-reports","player-reports","ban-appeals","waiting-for-support","support-room-1","support-room-2","support-room-3","vip-chat","staff-chat","logs","clips","Fælles","VIP Lounge"],
        features: { automod_enabled:true, invite_filter:true, levels_enabled:true, economy_enabled:true, anti_raid_enabled:true, lockdown:false }
      },
      "fivem-esx": {
        name: "FiveM ESX",
        roles: ["Ejer","Admin","Developer","Moderator","Support","Politi","EMS","Medlem"],
        extraRoles: ["Support Lead","Supporter","Trial Supporter","Whitelist Team","Application Team","Staff Interview Team","Event Team","Content Creator","Server Tester","Whitelisted","Civilian","Business Owner","Gang Leader","Gang Member"],
        departments: [
          { key:"police", name:"🚓 POLICE", roles:["Cadet","Officer","Senior Officer","Sergeant","Lieutenant","Captain","Assistant Chief","Chief"], channels:["police-info","police-announcements","police-chat","police-duty","police-training"] },
          { key:"ems", name:"🚑 EMS", roles:["Trainee","Paramedic","Senior Paramedic","Supervisor","Chief"], channels:["ems-info","ems-announcements","ems-chat","ems-duty","ems-training"] },
          { key:"doj", name:"⚖️ DOJ", roles:["Lawyer","Judge","Chief Justice"], channels:["doj-info","court-cases","doj-chat","legal-help"] },
          { key:"mechanic", name:"🔧 MECHANIC", roles:["Trainee Mechanic","Mechanic","Senior Mechanic","Shop Manager"], channels:["mechanic-info","mechanic-chat","mechanic-jobs","mechanic-announcements"] }
        ],
        categories: ["📌 INFORMATION","🚓 FIVEM","📝 APPLICATIONS","👮 JOBS","🎫 SUPPORT","🎟️ TICKETS","🔒 STAFF","🔊 VOICE"],
        channels: ["velkommen","regler","server-info","how-to-join","whitelist","whitelist-application","application-status","job-info","support","ticket-panel","bug-reports","player-reports","ban-appeals","waiting-for-support","support-room-1","support-room-2","support-room-3","forslag","logs","Fælles","Staff"],
        features: { automod_enabled:true, invite_filter:true, levels_enabled:false, economy_enabled:false, anti_raid_enabled:true, lockdown:false }
      },
      "fivem-rp": {
        name: "FiveM RP",
        roles: ["Ejer","Admin","Moderator","Support","Kriminel","Civil","Medlem"],
        extraRoles: ["Support Lead","Supporter","Trial Supporter","Whitelist Team","Application Team","Event Team","Content Creator","Business Owner","Gang Leader","Gang Member","Whitelisted"],
        categories: ["📌 INFORMATION","🚓 RP","📝 APPLICATIONS","💬 COMMUNITY","🎫 SUPPORT","🎟️ TICKETS","🔒 STAFF","🔊 VOICE"],
        channels: ["velkommen","regler","server-info","how-to-join","whitelist-application","application-status","rp-info","fraktioner","chat","support","ticket-panel","bug-reports","player-reports","ban-appeals","waiting-for-support","support-room-1","support-room-2","support-room-3","forslag","logs","Fælles","RP Voice"],
        features: { automod_enabled:true, invite_filter:true, levels_enabled:true, economy_enabled:false, anti_raid_enabled:true, lockdown:false }
      },
      "rust": {
        name: "Rust",
        roles: ["Ejer","Admin","Moderator","Support","VIP","Medlem"],
        categories: ["📌 INFORMATION","⛏️ RUST","💬 COMMUNITY","🎫 SUPPORT","🎟️ TICKETS","🔒 STAFF","🔊 VOICE"],
        channels: ["velkommen","regler","server-info","wipe-info","raid-info","team-finder","chat","support","ticket-panel","trade","logs","Fælles","Rust Voice"],
        features: { automod_enabled:true, invite_filter:true, levels_enabled:true, economy_enabled:true, anti_raid_enabled:true, lockdown:false }
      },
      "vennegruppe": {
        name: "Vennegruppe",
        roles: ["Ejer","Admin","Moderator","Ven"],
        categories: ["👋 INFORMATION","💬 CHAT","🎮 SPIL","🔊 VOICE"],
        channels: ["velkommen","regler","chat","memes","clips","game-chat","find-et-game","bot-commands","Fælles","Gaming","Chill"],
        features: { automod_enabled:true, invite_filter:false, levels_enabled:true, economy_enabled:true, anti_raid_enabled:false, lockdown:false }
      },
      "gaming": {
        name: "Gaming Community",
        roles: ["Ejer","Admin","Moderator","Support","VIP","Medlem"],
        categories: ["📌 INFORMATION","💬 COMMUNITY","🎮 GAMING","🎫 SUPPORT","🔒 STAFF","🔊 VOICE"],
        channels: ["velkommen","regler","chat","game-chat","find-spillere","clips","events","support","logs","Fælles","Gaming","Chill"],
        features: { automod_enabled:true, invite_filter:true, levels_enabled:true, economy_enabled:true, anti_raid_enabled:false, lockdown:false }
      },
      "clan": {
        name: "Clan / E-sport",
        roles: ["Ejer","Admin","Coach","Moderator","Spiller","Trial"],
        categories: ["📌 INFORMATION","🏆 CLAN","🎮 GAMING","🔒 STAFF","🔊 VOICE"],
        channels: ["velkommen","regler","announcements","team-chat","scrims","results","tryouts","clips","staff-chat","logs","Team VC","Scrim VC"],
        features: { automod_enabled:true, invite_filter:true, levels_enabled:true, economy_enabled:false, anti_raid_enabled:true, lockdown:false }
      },
      "streamer": {
        name: "Streamer / Creator",
        roles: ["Ejer","Admin","Moderator","Subscriber","VIP","Medlem"],
        categories: ["📌 INFORMATION","📺 STREAM","💬 COMMUNITY","🎫 SUPPORT","🔊 VOICE"],
        channels: ["velkommen","regler","stream-live","stream-info","chat","clips","fan-art","support","suggestions","Fælles","Chill","Gaming"],
        features: { automod_enabled:true, invite_filter:true, levels_enabled:true, economy_enabled:true, anti_raid_enabled:false, lockdown:false }
      },
      "community": {
        name: "Community",
        roles: ["Ejer","Admin","Moderator","Support","VIP","Medlem"],
        categories: ["📌 INFORMATION","💬 COMMUNITY","🎫 SUPPORT","🎟️ TICKETS","🔒 STAFF","🔊 VOICE"],
        channels: ["velkommen","regler","annonceringer","chat","suggestions","events","support","ticket-panel","logs","Fælles","Chill"],
        features: { automod_enabled:true, invite_filter:true, levels_enabled:true, economy_enabled:true, anti_raid_enabled:true, lockdown:false }
      },
      "support": {
        name: "Support Server",
        roles: ["Ejer","Admin","Support","Moderator","Medlem"],
        categories: ["📌 INFORMATION","🎫 SUPPORT","🎟️ TICKETS","🔒 STAFF","🔊 VOICE"],
        channels: ["velkommen","regler","support","ticket-panel","faq","status","logs","Fælles","Support VC"],
        features: { automod_enabled:true, invite_filter:true, levels_enabled:false, economy_enabled:false, anti_raid_enabled:true, lockdown:false }
      },
      "shop": {
        name: "Shop / Marketplace",
        roles: ["Ejer","Admin","Moderator","Support","Kunde","VIP"],
        categories: ["📌 INFORMATION","🛒 SHOP","🎫 SUPPORT","🎟️ TICKETS","🔒 STAFF","🔊 VOICE"],
        channels: ["velkommen","regler","shop-info","produkter","tilbud","bestillinger","support","ticket-panel","anmeldelser","logs","Fælles","Support VC"],
        features: { automod_enabled:true, invite_filter:true, levels_enabled:false, economy_enabled:true, anti_raid_enabled:true, lockdown:false }
      },
      "creator": {
        name: "Creator Community",
        roles: ["Ejer","Admin","Moderator","Support","Creator","VIP","Medlem"],
        categories: ["📌 INFORMATION","🎨 CREATOR","💬 COMMUNITY","🎫 SUPPORT","🔊 VOICE"],
        channels: ["velkommen","regler","annonceringer","showcase","feedback","samarbejde","chat","support","logs","Fælles","Creator VC"],
        features: { automod_enabled:true, invite_filter:true, levels_enabled:true, economy_enabled:true, anti_raid_enabled:false, lockdown:false }
      }
    };

    let config = templates[templateKey];
    if (templateKey === "custom") {
      config = {
        name: "Min egen skitse",
        roles: ["Ejer","Admin","Moderator","Support","VIP","Medlem"],
        categories: ["📌 INFORMATION","💬 COMMUNITY","🎫 SUPPORT","🎟️ TICKETS","🔒 STAFF","🔊 VOICE"],
        channels: ["velkommen","regler","annonceringer","chat","support","ticket-panel","logs","Fælles","Chill"],
        features: {
          automod_enabled: !!options.features?.automod_enabled,
          invite_filter: !!options.features?.invite_filter,
          levels_enabled: !!options.features?.levels_enabled,
          economy_enabled: !!options.features?.economy_enabled,
          anti_raid_enabled: !!options.features?.anti_raid_enabled,
          lockdown: false
        }
      };
    }
    if (!config) throw new Error("Ukendt Discord-skitse.");

    const me = guild.members.me || await guild.members.fetchMe().catch(() => null);
    const required = [PermissionFlagsBits.ManageRoles, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.SendMessages];
    if (!me || !me.permissions.has(required)) {
      throw new Error("ShardNote mangler rettighederne Manage Roles, Manage Channels eller Send Messages på serveren.");
    }

    const prefixRoles = new Set(Array.isArray(options.prefixRoles) ? options.prefixRoles.map(String) : (config.prefixRoles || []));
    const prefixChannels = new Set(Array.isArray(options.prefixChannels) ? options.prefixChannels.map(String) : (config.prefixChannels || []));
    const roleKeys = ["owner","admin","moderator","support","vip","member","developer","police","ems","criminal","civil","friend","coach","player","trial","subscriber","customer","creator"];
    const roleKey = base => {
      const norm = String(base).toLowerCase();
      const map = {
        "ejer":"owner","admin":"admin","moderator":"moderator","support":"support","vip":"vip","medlem":"member",
        "developer":"developer","politi":"police","ems":"ems","kriminel":"criminal","civil":"civil","ven":"friend","coach":"coach",
        "spiller":"player","trial":"trial","subscriber":"subscriber","kunde":"customer","creator":"creator"
      };
      return map[norm] || roleKeys.find(k => norm.includes(k)) || norm;
    };
    const selectedPrefixRole = base => prefixRoles.has(roleKey(base)) ? "F5 " + base : base;

    function permissionsForRole(key) {
      const basic = [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.Connect,
        PermissionFlagsBits.Speak
      ];
      if (key === "owner") return [PermissionFlagsBits.Administrator];
      if (key === "admin") return [
        PermissionFlagsBits.ManageGuild,
        PermissionFlagsBits.ManageChannels,
        PermissionFlagsBits.ManageRoles,
        PermissionFlagsBits.ManageMessages,
        PermissionFlagsBits.KickMembers,
        PermissionFlagsBits.BanMembers,
        PermissionFlagsBits.ModerateMembers,
        PermissionFlagsBits.ViewAuditLog
      ];
      if (key === "developer") return [
        PermissionFlagsBits.ManageGuild,
        PermissionFlagsBits.ManageChannels,
        PermissionFlagsBits.ManageRoles,
        PermissionFlagsBits.ManageMessages,
        PermissionFlagsBits.ViewAuditLog
      ];
      if (key === "moderator") return [
        PermissionFlagsBits.ManageMessages,
        PermissionFlagsBits.ModerateMembers,
        PermissionFlagsBits.KickMembers,
        PermissionFlagsBits.ViewAuditLog
      ];
      if (key === "coach") return [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.Connect,
        PermissionFlagsBits.Speak,
        PermissionFlagsBits.ManageMessages
      ];
      if (key === "support") return [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.AttachFiles,
        PermissionFlagsBits.EmbedLinks,
        PermissionFlagsBits.Connect,
        PermissionFlagsBits.Speak
      ];
      return basic;
    }

    const roleSpecs = config.roles.map((base,index) => ({
      key: roleKey(base),
      name: selectedPrefixRole(base),
      color: [0xf1c40f,0xe74c3c,0xe67e22,0x3498db,0x9b59b6,0x2ecc71,0x7f8c8d,0x1abc9c][index % 8],
      hoist: index < Math.min(5, config.roles.length),
      permissions: permissionsForRole(roleKey(base))
    }));

    const extraRoleSpecs = (config.extraRoles || []).map((base,index) => ({
      key: roleKey(base),
      name: selectedPrefixRole(base),
      color: [0x1abc9c,0x2ecc71,0x3498db,0x9b59b6,0xe67e22,0x95a5a6][index % 6],
      hoist: false,
      permissions: permissionsForRole(roleKey(base))
    }));

    const roles = {};
    let createdRoles = 0;
    let existingRoles = 0;
    for (const spec of roleSpecs) {
      let role = guild.roles.cache.find(r => r.name === spec.name);
      if (!role) {
        role = await guild.roles.create({
          name: spec.name,
          color: spec.color,
          hoist: spec.hoist,
          mentionable: false,
          permissions: spec.permissions,
          reason: "ShardNote Discord-skitse: " + config.name
        });
        createdRoles++;
      } else {
        existingRoles++;
      }
      roles[spec.key] = role;
    }

    for (const spec of extraRoleSpecs) {
      let role = guild.roles.cache.find(r => r.name === spec.name);
      if (!role) {
        role = await guild.roles.create({
          name: spec.name,
          color: spec.color,
          hoist: spec.hoist,
          mentionable: false,
          permissions: spec.permissions,
          reason: "ShardNote Discord-skitse supportgruppe: " + config.name
        });
        createdRoles++;
      } else {
        existingRoles++;
      }
      roles[spec.key] = role;
    }

    const departmentRoleSets = {};
    for (const department of (config.departments || [])) {
      departmentRoleSets[department.key] = [];
      for (const base of department.roles) {
        const key = department.key + "_" + roleKey(base);
        let role = guild.roles.cache.find(r => r.name === base);
        if (!role) {
          role = await guild.roles.create({
            name: base,
            color: 0x5865f2,
            hoist: false,
            mentionable: false,
            permissions: permissionsForRole(roleKey(base)),
            reason: "ShardNote Discord-skitse department: " + department.name
          });
          createdRoles++;
        } else {
          existingRoles++;
        }
        roles[key] = role;
        departmentRoleSets[department.key].push(role);
      }
    }

    const roleList = Object.values(roles);
    const ownerRole = roles.owner;
    const adminRole = roles.admin;
    const staffRoleIds = roleSpecs
      .filter(r => ["owner","admin","developer","moderator","support","coach"].includes(r.key))
      .map(r => roles[r.key]?.id)
      .filter(Boolean);
    const memberRoleIds = roleList.map(r=>r.id);
    const departmentStaffIds = [...new Set([
      ...staffRoleIds,
      ...Object.values(departmentRoleSets).flat().map(list => list.map(r => r.id)).flat()
    ])];

    async function ensureDepartmentSection(department) {
      const allowedIds = [
        ...staffRoleIds,
        ...(departmentRoleSets[department.key] || []).map(r => r.id)
      ];
      const deptOverwrites = [
        overwrite(guild.roles.everyone.id, [], [PermissionFlagsBits.ViewChannel]),
        ...allowedIds.map(id => overwrite(id, [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.SendMessages
        ])),
        overwrite(botId, [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ManageChannels,
          PermissionFlagsBits.ManageMessages
        ])
      ];
      const category = await ensureCategory(department.name, deptOverwrites);
      const channels = [];
      for (const base of department.channels || []) {
        channels.push(await ensureText(
          department.key + "_" + base.toLowerCase().replace(/[^a-z0-9]+/g,""),
          base,
          category,
          deptOverwrites
        ));
      }
      return { category, channels };
    }

    const botId = guild.client.user.id;
    const overwrite = (id, allow = [], deny = []) => ({ id, allow, deny });

    const publicOverwrites = [
      overwrite(guild.roles.everyone.id,[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.ReadMessageHistory,PermissionFlagsBits.SendMessages]),
      overwrite(botId,[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.ReadMessageHistory,PermissionFlagsBits.SendMessages,PermissionFlagsBits.ManageChannels,PermissionFlagsBits.ManageMessages])
    ];
    const privateOverwrites = [
      overwrite(guild.roles.everyone.id,[],[PermissionFlagsBits.ViewChannel]),
      ...staffRoleIds.map(id=>overwrite(id,[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.ReadMessageHistory,PermissionFlagsBits.SendMessages])),
      overwrite(botId,[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.ReadMessageHistory,PermissionFlagsBits.SendMessages,PermissionFlagsBits.ManageChannels,PermissionFlagsBits.ManageMessages])
    ];
    const communityOverwrites = [
      overwrite(guild.roles.everyone.id,[],[PermissionFlagsBits.ViewChannel]),
      ...memberRoleIds.map(id=>overwrite(id,[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.ReadMessageHistory,PermissionFlagsBits.SendMessages])),
      overwrite(botId,[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.ReadMessageHistory,PermissionFlagsBits.SendMessages,PermissionFlagsBits.ManageChannels,PermissionFlagsBits.ManageMessages])
    ];
    const voiceOverwrites = [
      overwrite(guild.roles.everyone.id,[],[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.Connect]),
      ...memberRoleIds.map(id=>overwrite(id,[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.Connect])),
      overwrite(botId,[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.Connect,PermissionFlagsBits.Speak,PermissionFlagsBits.ManageChannels])
    ];

    function channelName(key,name) {
      return prefixChannels.has(key) ? "F5 " + name : name;
    }

    async function ensureCategory(name, overwrites) {
      let c=guild.channels.cache.find(x=>x.type===ChannelType.GuildCategory&&x.name===name);
      if(!c) c=await guild.channels.create({name,type:ChannelType.GuildCategory,permissionOverwrites:overwrites,reason:"ShardNote skitse: "+config.name});
      else if(overwrites?.length) await c.permissionOverwrites.set(overwrites,"ShardNote skitse: "+config.name).catch(()=>{});
      return c;
    }

    async function ensureText(key,name,parent,overwrites=null) {
      const target=channelName(key,name);
      let c=guild.channels.cache.find(x=>x.type===ChannelType.GuildText&&x.name===target&&x.parentId===parent.id);
      if(!c){
        const plain=guild.channels.cache.find(x=>x.type===ChannelType.GuildText&&x.name===name&&x.parentId===parent.id);
        const pref=guild.channels.cache.find(x=>x.type===ChannelType.GuildText&&x.name==="F5 "+name&&x.parentId===parent.id);
        c=plain||pref;
        if(c&&c.name!==target) await c.setName(target,"ShardNote F5 prefix").catch(()=>{});
      }
      if(!c) c=await guild.channels.create({name:target,type:ChannelType.GuildText,parent:parent.id,...(overwrites?{permissionOverwrites:overwrites}:{}),reason:"ShardNote skitse: "+config.name});
      else if(overwrites?.length) await c.permissionOverwrites.set(overwrites,"ShardNote skitse: "+config.name).catch(()=>{});
      return c;
    }

    async function ensureVoice(key,name,parent,overwrites) {
      const target=channelName(key,name);
      let c=guild.channels.cache.find(x=>x.type===ChannelType.GuildVoice&&x.name===target&&x.parentId===parent.id);
      if(!c){
        const plain=guild.channels.cache.find(x=>x.type===ChannelType.GuildVoice&&x.name===name&&x.parentId===parent.id);
        const pref=guild.channels.cache.find(x=>x.type===ChannelType.GuildVoice&&x.name==="F5 "+name&&x.parentId===parent.id);
        c=plain||pref;
        if(c&&c.name!==target) await c.setName(target,"ShardNote F5 prefix").catch(()=>{});
      }
      if(!c) c=await guild.channels.create({name:target,type:ChannelType.GuildVoice,parent:parent.id,permissionOverwrites:overwrites,reason:"ShardNote skitse: "+config.name});
      else if(overwrites?.length) await c.permissionOverwrites.set(overwrites,"ShardNote skitse: "+config.name).catch(()=>{});
      return c;
    }

    const categories=[];
    for(let i=0;i<config.categories.length;i++) {
      const name=config.categories[i];
      const overwrites = /SUPPORT|COMMUNITY|INFORMATION|FIVEM|RUST|GAMING|STREAM|CLAN|CREATOR|SHOP|CHAT|SPIL|RP|JOBS|VOICE/i.test(name) ? publicOverwrites : privateOverwrites;
      categories.push(await ensureCategory(name,overwrites));
    }

    const findCategory = (patterns, fallbackIndex=0) => categories.find(c=>patterns.some(p=>c.name.toLowerCase().includes(p))) || categories[fallbackIndex] || categories[0];

    let textIndex=0;
    const textChannels=[];
    for (const base of config.channels) {
      if(base === "Fælles" || base.endsWith(" VC") || base.includes("Voice") || base.includes("Lounge")) continue;
      const key=base.toLowerCase().replace(/[^a-z0-9]+/g,"");
      const parent=findCategory(
        [base.includes("support")||base.includes("ticket")?"support":null, base.includes("log")||base.includes("staff")?"staff":null, base.includes("vip")?"vip":null, base.includes("game")||base.includes("chat")||base.includes("clips")?"community":null].filter(Boolean),
        0
      );
      textChannels.push(await ensureText(key,base,parent));
    }
    const voiceNames=config.channels.filter(x=>x==="Fælles"||x.includes("VC")||x.includes("Voice")||x.includes("Lounge"));
    for(const v of voiceNames){
      const parent=findCategory(["voice","spil","gaming","community"],categories.length-1);
      textChannels.push(await ensureVoice(v.toLowerCase().replace(/[^a-z0-9]+/g,""),v,parent,voiceOverwrites));
    }

    const departmentSections = [];
    for (const department of (config.departments || [])) {
      departmentSections.push(await ensureDepartmentSection(department));
    }

    const byBase = name => textChannels.find(c=>c.name.replace(/^F5 /,"")===name);
    const welcome = byBase("velkommen") || textChannels[0];
    const logs = byBase("logs") || textChannels.find(c=>c.name.includes("log")) || textChannels[0];
    const support = byBase("support");
    const ticketPanel = byBase("ticket-panel");
    const suggestions = byBase("forslag") || byBase("suggestions");
    const verification = byBase("verification");

    async function hasPanel(channel, needle) {
      if(!channel?.isTextBased?.()) return false;
      const messages = await channel.messages.fetch({limit:20}).catch(()=>null);
      return Boolean(messages?.some(m => String(m.content||"").includes(needle) || m.embeds?.some(e => String(e.title||"").includes(needle))));
    }

    if(welcome && !(await hasPanel(welcome, config.name+" server"))) {
      await welcome.send({embeds:[new EmbedBuilder().setTitle("👋 "+config.name+" server").setDescription("Serveren er sat op af ShardNote.").setColor(0x6d5dfc)]}).catch(()=>{});
    }
    if(config.features?.automod_enabled && logs && !(await hasPanel(logs, "AutoMod er aktiveret"))) {
      await logs.send({content:"✅ ShardNote AutoMod er aktiveret via "+config.name+"-skitsen."}).catch(()=>{});
    }
    if(suggestions && config.features?.levels_enabled && !(await hasPanel(suggestions, "Forslag og community"))) {
      await suggestions.send({content:"💡 Forslag og community-funktioner er klar."}).catch(()=>{});
    }
    if(verification){
      const memberRole=roles.member || roleList[roleList.length-1];
      if(memberRole && !(await hasPanel(verification, "Verification"))) {
        await verification.send({embeds:[new EmbedBuilder().setTitle("✅ Verification").setDescription("Tryk for at få "+memberRole+"-rollen.").setColor(0x42d392)],components:[new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("verify").setLabel("✅ Verificer mig").setStyle(ButtonStyle.Success))]}).catch(()=>{});
      }
    }
    if(ticketPanel && !(await hasPanel(ticketPanel, "ShardNote Ticket"))){
      await ticketPanel.send({embeds:[new EmbedBuilder().setTitle("🎫 ShardNote Ticket").setDescription("Tryk på knappen for at oprette en privat support-ticket.").setColor(0x6d5dfc)],components:[new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("ticket_create").setLabel("🎫 Opret ticket").setStyle(ButtonStyle.Primary))]}).catch(()=>{});
    }

    const current = await getGuildSettings(guild.id);
    const updates = {
      welcome_channel_id: welcome?.id || null,
      welcome_message: "Velkommen {user} til {server}! 👋",
      leave_channel_id: welcome?.id || null,
      leave_message: "{user} har forladt {server}.",
      log_channel_id: logs?.id || null,
      suggestion_channel_id: suggestions?.id || null,
      support_role_id: roles.support?.id || null,
      ticket_category_id: categories.find(c=>c.name.includes("TICKETS"))?.id || categories.find(c=>c.name.includes("SUPPORT"))?.id || null,
      verification_role_id: roles.member?.id || roleList[roleList.length-1]?.id || null,
      ...config.features
    };
    for(const [key,value] of Object.entries(updates)){
      if(value !== undefined && current[key] !== value) await setGuildSetting(guild.id,key,value);
    }

    return {
      template: templateKey,
      name: config.name,
      createdRoles,
      existingRoles,
      roles: [...roleSpecs, ...extraRoleSpecs, ...Object.values(departmentRoleSets).flat().map(r=>({name:r.name}))].map(r=>r.name),
      categories: categories.map(c=>c.name),
      channels: textChannels.map(c=>c.name),
      features: config.features
    };
  }

  async function sendGuildLog(guild, title, message, type) {
    log(type === "error" ? "error" : type === "security" ? "security" : type === "warning" ? "warning" : "system", guild.name + ": " + title + " — " + message);
    const settings = await getGuildSettings(guild.id);
    const channel = settings.log_channel_id ? guild.channels.cache.get(settings.log_channel_id) : null;
    if (channel && channel.isTextBased()) {
      await channel.send({ content: "**" + title + "**\n" + message }).catch(() => {});
    }
  }

  async function getMember(guild, userId) {
    return guild.members.fetch(userId).catch(() => null);
  }

  async function ensureStats(guildId, userId) {
    if (!db) return;
    await db.query("INSERT INTO public.user_stats (guild_id, user_id) VALUES ($1, $2) ON CONFLICT (guild_id, user_id) DO NOTHING", [guildId, userId]);
  }

  function levelForXp(xp) {
    return Math.floor(Math.sqrt(Math.max(0, xp) / 100));
  }

  async function addXp(guild, user) {
    if (!db) return;
    const settings = await getGuildSettings(guild.id);
    if (!settings.levels_enabled) return;
    await ensureStats(guild.id, user.id);
    const previous = await db.query("SELECT xp, level FROM public.user_stats WHERE guild_id = $1 AND user_id = $2", [guild.id, user.id]);
    const old = previous.rows[0] || { xp: 0, level: 0 };
    const xp = Number(old.xp || 0) + 8 + Math.floor(Math.random() * 9);
    const level = levelForXp(xp);
    await db.query("UPDATE public.user_stats SET xp = $1, level = $2 WHERE guild_id = $3 AND user_id = $4", [xp, level, guild.id, user.id]);
    if (level > Number(old.level || 0)) {
      const channel = guild.systemChannel || guild.channels.cache.find(c => c.isTextBased() && c.viewable);
      if (channel) await channel.send("🎉 " + user + " er steget til **level " + level + "**!").catch(() => {});
      await sendGuildLog(guild, "Level up", user.tag + " nåede level " + level + ".", "success");
    }
  }

  async function createTicketChannel(guild, user, title) {
    const settings = await getGuildSettings(guild.id);
    const permissions = [
      { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
      { id: user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles] },
      { id: guild.client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ManageMessages] }
    ];
    if (settings.support_role_id) {
      permissions.push({ id: settings.support_role_id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] });
    }
    const safe = String(title || "support").toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 32) || "support";
    return guild.channels.create({
      name: "ticket-" + safe,
      type: ChannelType.GuildText,
      parent: settings.ticket_category_id || undefined,
      permissionOverwrites: permissions,
      reason: "ShardNote ticket"
    });
  }

  async function setLockdown(guild, locked) {
    for (const channel of guild.channels.cache.filter(c => c.isTextBased() && !c.isThread()).values()) {
      await channel.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: locked ? false : null }, { reason: "ShardNote lockdown" }).catch(() => {});
    }
    if (db) await setGuildSetting(guild.id, "lockdown", locked);
  }

  async function transcript(channel) {
    const messages = await channel.messages.fetch({ limit: 100 });
    return Array.from(messages.values()).sort((a,b) => a.createdTimestamp - b.createdTimestamp)
      .map(m => "[" + new Date(m.createdTimestamp).toISOString() + "] " + m.author.tag + ": " + String(m.content || "").replace(/\n/g, " "))
      .join("\n");
  }

  async function runAutoMod(message) {
    if (!message.guild || !message.member || message.author.bot) return false;
    const settings = await getGuildSettings(message.guild.id);
    if (!settings.automod_enabled) return false;

    const now = Date.now();
    const key = message.guild.id + ":" + message.author.id;
    const times = (spamBuckets.get(key) || []).filter(ts => now - ts < 8000);
    times.push(now);
    spamBuckets.set(key, times);

    const invite = /discord(?:\.gg\/|(?:app)?\.com\/invite\/)/i.test(message.content || "");
    const blockedWords = String(process.env.AUTOMOD_WORDS || "").split(",").map(v => v.trim().toLowerCase()).filter(Boolean);
    const blockedWord = blockedWords.some(word => word && String(message.content || "").toLowerCase().includes(word));
    const spam = times.length >= 6;

    if (spam || (settings.invite_filter && invite) || blockedWord) {
      await message.delete().catch(() => {});
      if (spam && message.member.moderatable) await message.member.timeout(30000, "ShardNote AutoMod spam").catch(() => {});
      await sendGuildLog(message.guild, "AutoMod", message.author.tag + " blev stoppet.", "security");
      return true;
    }
    return false;
  }

  function pollEmbed(data) {
    return new EmbedBuilder()
      .setTitle("📊 " + data.question)
      .setDescription(data.options.map((option, index) => "**" + (index + 1) + ". " + option.label + "** — " + option.votes).join("\n"))
      .setColor(0x6d5dfc);
  }

  function pollButtons(id, options) {
    return new ActionRowBuilder().addComponents(
      options.map((option, index) =>
        new ButtonBuilder()
          .setCustomId("poll:" + id + ":" + index)
          .setLabel((index + 1) + ". " + option.label)
          .setStyle(index === 0 ? ButtonStyle.Primary : index === 1 ? ButtonStyle.Success : ButtonStyle.Secondary)
      )
    );
  }

  async function handleFeatureButton(interaction) {
    if (!interaction.guild) return interaction.reply({ content: "Denne knap virker kun i en server.", ephemeral: true });

    if (interaction.customId === "ticket_create") {
      const channel = await createTicketChannel(interaction.guild, interaction.user, "support");
      const ticket = createTicket
        ? await createTicket({ title: "Support", user: interaction.user.tag, status: "open", priority: "normal", guildId: interaction.guild.id })
        : { id: Date.now() };
      if (db) {
        await db.query(
          "UPDATE public.tickets SET guild_id=$1, user_id=$2, channel_id=$3 WHERE id=$4",
          [interaction.guild.id, interaction.user.id, channel.id, ticket.id]
        ).catch(() => {});
      }
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("ticket_claim:" + ticket.id).setLabel("Claim").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId("ticket_close:" + ticket.id).setLabel("Luk ticket").setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId("ticket_transcript:" + ticket.id).setLabel("Transcript").setStyle(ButtonStyle.Primary)
      );
      await channel.send({
        embeds: [new EmbedBuilder().setTitle("🎫 Ticket #" + ticket.id).setDescription("Hej <@" + interaction.user.id + "> — skriv her, så hjælper supporten dig.").setColor(0x6d5dfc)],
        components: [row]
      });
      return interaction.reply({ content: "✅ Ticket oprettet: " + channel, ephemeral: true });
    }

    if (interaction.customId.startsWith("ticket_close:")) {
      if (!interaction.memberPermissions.has(PermissionFlagsBits.ManageChannels)) return interaction.reply({ content: "Du mangler Manage Channels.", ephemeral: true });
      const id = interaction.customId.split(":")[1];
      if (db) await db.query("UPDATE public.tickets SET status='closed' WHERE id=$1", [id]).catch(() => {});
      await interaction.channel.setName("closed-" + interaction.channel.name).catch(() => {});
      return interaction.reply("🔒 Ticket lukket.");
    }

    if (interaction.customId.startsWith("ticket_claim:")) {
      if (!interaction.memberPermissions.has(PermissionFlagsBits.ManageMessages)) return interaction.reply({ content: "Du mangler Manage Messages.", ephemeral: true });
      const id = interaction.customId.split(":")[1];
      if (db) await db.query("UPDATE public.tickets SET claimed_by=$1 WHERE id=$2", [interaction.user.id, id]).catch(() => {});
      return interaction.reply("✅ Ticket claimed af " + interaction.user + ".");
    }

    if (interaction.customId.startsWith("ticket_transcript:")) {
      if (!interaction.memberPermissions.has(PermissionFlagsBits.ManageMessages)) return interaction.reply({ content: "Du mangler Manage Messages.", ephemeral: true });
      await interaction.deferReply({ ephemeral: true });
      const text = await transcript(interaction.channel);
      return interaction.editReply({
        content: "📄 Transcript klar.",
        files: [new AttachmentBuilder(Buffer.from(text || "Ingen beskeder."), { name: "ticket-transcript.txt" })]
      });
    }

    if (interaction.customId.startsWith("role:")) {
      const role = interaction.guild.roles.cache.get(interaction.customId.split(":")[1]);
      const member = await getMember(interaction.guild, interaction.user.id);
      if (!role || !member || !role.editable) return interaction.reply({ content: "Rollen kan ikke ændres.", ephemeral: true });
      if (member.roles.cache.has(role.id)) {
        await member.roles.remove(role);
        return interaction.reply({ content: "➖ Rolle fjernet.", ephemeral: true });
      }
      await member.roles.add(role);
      return interaction.reply({ content: "➕ Rolle givet.", ephemeral: true });
    }

    if (interaction.customId === "verify") {
      const settings = await getGuildSettings(interaction.guild.id);
      const role = settings.verification_role_id ? interaction.guild.roles.cache.get(settings.verification_role_id) : null;
      const member = await getMember(interaction.guild, interaction.user.id);
      if (!role || !member || !role.editable) return interaction.reply({ content: "Verification-rollen er ikke korrekt sat op.", ephemeral: true });
      await member.roles.add(role, "ShardNote verification");
      return interaction.reply({ content: "✅ Du er verificeret.", ephemeral: true });
    }

    if (interaction.customId.startsWith("poll:")) {
      const parts = interaction.customId.split(":");
      const poll = polls.get(parts[1]);
      const index = Number(parts[2]);
      if (!poll || !poll.options[index]) return interaction.reply({ content: "Denne poll er udløbet.", ephemeral: true });
      if (poll.voters.has(interaction.user.id)) return interaction.reply({ content: "Du har allerede stemt.", ephemeral: true });
      poll.voters.set(interaction.user.id, index);
      poll.options[index].votes += 1;
      return interaction.update({ embeds: [pollEmbed(poll)], components: [pollButtons(parts[1], poll.options)] });
    }

    if (interaction.customId.startsWith("giveaway:")) {
      const id = interaction.customId.split(":")[1];
      const set = giveawayEntries.get(id) || new Set();
      if (set.has(interaction.user.id)) return interaction.reply({ content: "Du er allerede med.", ephemeral: true });
      set.add(interaction.user.id);
      giveawayEntries.set(id, set);
      if (db && /^\d+$/.test(id)) {
        await db.query(
          "CREATE TABLE IF NOT EXISTS public.giveaway_entries (giveaway_id BIGINT NOT NULL, user_id VARCHAR(32) NOT NULL, PRIMARY KEY (giveaway_id, user_id))"
        ).catch(() => {});
        await db.query(
          "INSERT INTO public.giveaway_entries (giveaway_id,user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING",
          [id, interaction.user.id]
        ).catch(() => {});
      }
      return interaction.reply({ content: "🎉 Du er med i giveawayen!", ephemeral: true });
    }

    return interaction.reply({ content: "Ukendt knap.", ephemeral: true });
  }

  async function handleAdditionalCommand(interaction) {
    if (!interaction.guild) return false;
    const command = interaction.commandName;
    const requirePermission = (permission) => {
      if (!interaction.memberPermissions?.has(permission)) {
        interaction.reply({ content: "Du har ikke de nødvendige rettigheder.", ephemeral: true });
        return false;
      }
      return true;
    };

    if (command === "ticket-panel") {
      if (!requirePermission(PermissionFlagsBits.ManageGuild)) return true;
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("ticket_create").setLabel("🎫 Opret ticket").setStyle(ButtonStyle.Primary)
      );
      await interaction.channel.send({
        embeds: [new EmbedBuilder().setTitle("🎫 Support").setDescription("Tryk på knappen for at åbne en privat support-ticket.").setColor(0x6d5dfc)],
        components: [row]
      });
      await interaction.reply({ content: "✅ Ticket-panel sendt.", ephemeral: true });
      return true;
    }

    if (command === "ticket-close") {
      if (!interaction.channel?.name?.startsWith("ticket-")) {
        await interaction.reply({ content: "Dette er ikke en ticket-kanal.", ephemeral: true });
        return true;
      }
      if (!requirePermission(PermissionFlagsBits.ManageChannels)) return true;
      const ticketId = interaction.channel.name.match(/ticket-(\d+)/)?.[1];
      if (db && ticketId) await db.query("UPDATE public.tickets SET status='closed' WHERE id=$1", [ticketId]).catch(() => {});
      await interaction.channel.setName("closed-" + interaction.channel.name).catch(() => {});
      await interaction.reply("🔒 Ticket lukket.");
      return true;
    }

    if (command === "ticket-claim") {
      if (!interaction.channel?.name?.startsWith("ticket-")) {
        await interaction.reply({ content: "Dette er ikke en ticket-kanal.", ephemeral: true });
        return true;
      }
      if (!requirePermission(PermissionFlagsBits.ManageMessages)) return true;
      const ticketId = interaction.channel.name.match(/ticket-(\d+)/)?.[1];
      if (db && ticketId) await db.query("UPDATE public.tickets SET claimed_by=$1 WHERE id=$2", [interaction.user.id, ticketId]).catch(() => {});
      await interaction.reply("✅ Ticket claimed af " + interaction.user + ".");
      return true;
    }

    if (command === "ticket-transcript") {
      if (!interaction.channel?.name?.startsWith("ticket-")) {
        await interaction.reply({ content: "Dette er ikke en ticket-kanal.", ephemeral: true });
        return true;
      }
      if (!requirePermission(PermissionFlagsBits.ManageMessages)) return true;
      await interaction.deferReply({ ephemeral: true });
      const text = await transcript(interaction.channel);
      await interaction.editReply({
        content: "📄 Transcript klar.",
        files: [new AttachmentBuilder(Buffer.from(text || "Ingen beskeder."), { name: "ticket-transcript.txt" })]
      });
      return true;
    }

    if (command === "warn") {
      if (!requirePermission(PermissionFlagsBits.ModerateMembers)) return true;
      const user = interaction.options.getUser("user", true);
      const reason = interaction.options.getString("reason", true).slice(0, 500);
      let caseId = null;
      if (db) {
        const result = await db.query(
          "INSERT INTO public.warnings (guild_id,user_id,moderator_id,reason) VALUES ($1,$2,$3,$4) RETURNING id",
          [interaction.guild.id, user.id, interaction.user.id, reason]
        );
        caseId = result.rows[0]?.id;
      }
      const member = await getMember(interaction.guild, user.id);
      if (member) await member.send("⚠️ Du har fået en advarsel i " + interaction.guild.name + ". Grund: " + reason).catch(() => {});
      await sendGuildLog(interaction.guild, "Advarsel", interaction.user.tag + " warned " + user.tag + ": " + reason, "security");
      await interaction.reply("⚠️ " + user.tag + " er blevet advaret" + (caseId ? " (case #" + caseId + ")" : "") + ".");
      return true;
    }

    if (command === "warnings") {
      if (!requirePermission(PermissionFlagsBits.ModerateMembers)) return true;
      const user = interaction.options.getUser("user", true);
      if (!db) {
        await interaction.reply({ content: "Database kræves for warnings.", ephemeral: true });
        return true;
      }
      const result = await db.query(
        "SELECT reason,created_at FROM public.warnings WHERE guild_id=$1 AND user_id=$2 ORDER BY created_at DESC LIMIT 20",
        [interaction.guild.id, user.id]
      );
      const text = result.rows.length ? result.rows.map((row, index) => (index + 1) + ". " + row.reason).join("\n") : "Ingen advarsler.";
      await interaction.reply({ content: "**Advarsler for " + user.tag + "**\n" + text, ephemeral: true });
      return true;
    }

    if (command === "clearwarnings") {
      if (!requirePermission(PermissionFlagsBits.ModerateMembers)) return true;
      const user = interaction.options.getUser("user", true);
      if (db) await db.query("DELETE FROM public.warnings WHERE guild_id=$1 AND user_id=$2", [interaction.guild.id, user.id]);
      await interaction.reply("✅ Advarsler slettet for " + user.tag + ".");
      return true;
    }

    if (command === "kick") {
      if (!requirePermission(PermissionFlagsBits.KickMembers)) return true;
      const user = interaction.options.getUser("user", true);
      const member = await getMember(interaction.guild, user.id);
      if (!member?.kickable) {
        await interaction.reply({ content: "Jeg kan ikke kicke den bruger.", ephemeral: true });
        return true;
      }
      await member.kick(interaction.options.getString("reason") || "ShardNote kick");
      await sendGuildLog(interaction.guild, "Kick", interaction.user.tag + " kickede " + user.tag, "security");
      await interaction.reply("👢 " + user.tag + " er blevet kicked.");
      return true;
    }

    if (command === "ban") {
      if (!requirePermission(PermissionFlagsBits.BanMembers)) return true;
      const user = interaction.options.getUser("user", true);
      const days = interaction.options.getInteger("delete_days") || 0;
      await interaction.guild.members.ban(user.id, {
        deleteMessageSeconds: days * 86400,
        reason: interaction.options.getString("reason") || "ShardNote ban"
      });
      await sendGuildLog(interaction.guild, "Ban", interaction.user.tag + " bannede " + user.tag, "security");
      await interaction.reply("🔨 " + user.tag + " er blevet bannet.");
      return true;
    }

    if (command === "unban") {
      if (!requirePermission(PermissionFlagsBits.BanMembers)) return true;
      await interaction.guild.members.unban(interaction.options.getString("user_id", true));
      await interaction.reply("✅ Bruger unbannet.");
      return true;
    }

    if (command === "timeout") {
      if (!requirePermission(PermissionFlagsBits.ModerateMembers)) return true;
      const raw = interaction.options.getString("duration", true).trim().toLowerCase();
      const match = raw.match(/^(\d+)\s*(s|m|h|d)$/);
      if (!match) {
        await interaction.reply({ content: "Brug fx 10m, 2h eller 1d.", ephemeral: true });
        return true;
      }
      const multiplier = { s: 1000, m: 60000, h: 3600000, d: 86400000 }[match[2]];
      const duration = Number(match[1]) * multiplier;
      const member = await getMember(interaction.guild, interaction.options.getUser("user", true).id);
      if (!Number.isFinite(duration) || duration > 28 * 86400000 || !member?.moderatable) {
        await interaction.reply({ content: "Timeout kunne ikke udføres.", ephemeral: true });
        return true;
      }
      await member.timeout(duration, interaction.options.getString("reason") || "ShardNote timeout");
      await interaction.reply("⏳ Timeout sat i " + formatDuration(duration) + ".");
      return true;
    }

    if (command === "untimeout") {
      if (!requirePermission(PermissionFlagsBits.ModerateMembers)) return true;
      const member = await getMember(interaction.guild, interaction.options.getUser("user", true).id);
      if (!member?.moderatable) {
        await interaction.reply({ content: "Jeg kan ikke fjerne timeout.", ephemeral: true });
        return true;
      }
      await member.timeout(null, "ShardNote untimeout");
      await interaction.reply("✅ Timeout fjernet.");
      return true;
    }

    if (command === "purge") {
      if (!requirePermission(PermissionFlagsBits.ManageMessages)) return true;
      const amount = interaction.options.getInteger("amount", true);
      const deleted = await interaction.channel.bulkDelete(amount, true);
      await interaction.reply({ content: "🧹 Slettede " + deleted.size + " beskeder.", ephemeral: true });
      return true;
    }

    if (command === "slowmode") {
      if (!requirePermission(PermissionFlagsBits.ManageChannels)) return true;
      const seconds = interaction.options.getInteger("seconds", true);
      await interaction.channel.setRateLimitPerUser(seconds, "ShardNote slowmode");
      await interaction.reply("🐢 Slowmode sat til " + seconds + " sekunder.");
      return true;
    }

    if (command === "lockdown" || command === "unlockdown") {
      if (!requirePermission(PermissionFlagsBits.Administrator)) return true;
      await setLockdown(interaction.guild, command === "lockdown");
      await interaction.reply(command === "lockdown" ? "🔒 Serveren er låst ned." : "🔓 Serveren er åben igen.");
      return true;
    }

    if (command === "announce") {
      if (!requirePermission(PermissionFlagsBits.ManageGuild)) return true;
      const channel = interaction.options.getChannel("channel") || interaction.channel;
      if (!channel?.isTextBased()) {
        await interaction.reply({ content: "Kanalen kan ikke modtage beskeder.", ephemeral: true });
        return true;
      }
      await channel.send({
        embeds: [
          new EmbedBuilder()
            .setTitle(interaction.options.getString("title", true).slice(0, 200))
            .setDescription(interaction.options.getString("message", true).slice(0, 2000))
            .setColor(0x6d5dfc)
            .setFooter({ text: "ShardNote • " + interaction.guild.name })
        ]
      });
      await interaction.reply({ content: "✅ Announcement sendt.", ephemeral: true });
      return true;
    }

    if (command === "poll") {
      const poll = {
        question: interaction.options.getString("question", true).slice(0, 250),
        options: [
          { label: interaction.options.getString("option1", true).slice(0, 60), votes: 0 },
          { label: interaction.options.getString("option2", true).slice(0, 60), votes: 0 }
        ],
        voters: new Map()
      };
      const option3 = interaction.options.getString("option3");
      if (option3) poll.options.push({ label: option3.slice(0, 60), votes: 0 });
      const message = await interaction.channel.send({ embeds: [pollEmbed(poll)], components: [pollButtons(interaction.id, poll.options)] });
      polls.set(interaction.id, poll);
      await interaction.reply({ content: "✅ Poll oprettet: " + message.url, ephemeral: true });
      return true;
    }

    if (command === "suggest") {
      const settings = await getGuildSettings(interaction.guild.id);
      const channel = settings.suggestion_channel_id ? interaction.guild.channels.cache.get(settings.suggestion_channel_id) : interaction.channel;
      const text = interaction.options.getString("text", true).slice(0, 1800);
      if (!channel?.isTextBased()) {
        await interaction.reply({ content: "Suggestion-kanalen er ikke tilgængelig.", ephemeral: true });
        return true;
      }
      const message = await channel.send({
        embeds: [
          new EmbedBuilder().setTitle("💡 Nyt forslag").setDescription(text)
            .addFields({ name: "Fra", value: interaction.user.tag, inline: true }, { name: "Status", value: "Pending", inline: true })
            .setColor(0x42d392)
        ]
      });
      if (db) await db.query(
        "INSERT INTO public.suggestions (guild_id,user_id,content,channel_id,message_id) VALUES ($1,$2,$3,$4,$5)",
        [interaction.guild.id, interaction.user.id, text, channel.id, message.id]
      );
      await interaction.reply({ content: "✅ Forslag sendt.", ephemeral: true });
      return true;
    }

    if (command === "role-panel") {
      if (!requirePermission(PermissionFlagsBits.ManageRoles)) return true;
      const role = interaction.options.getRole("role", true);
      if (!role.editable) {
        await interaction.reply({ content: "Bot-rollen skal stå over den valgte rolle.", ephemeral: true });
        return true;
      }
      await interaction.channel.send({
        embeds: [new EmbedBuilder().setTitle("🎭 Rollepanel").setDescription("Tryk for at få eller fjerne " + role + ".").setColor(0x6d5dfc)],
        components: [
          new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId("role:" + role.id).setLabel(interaction.options.getString("label", true).slice(0, 80)).setStyle(ButtonStyle.Primary)
          )
        ]
      });
      await interaction.reply({ content: "✅ Rollepanel sendt.", ephemeral: true });
      return true;
    }

    if (command === "verify-panel") {
      if (!requirePermission(PermissionFlagsBits.ManageGuild)) return true;
      const settings = await getGuildSettings(interaction.guild.id);
      if (!settings.verification_role_id) {
        await interaction.reply({ content: "Sæt først verification-role.", ephemeral: true });
        return true;
      }
      await interaction.channel.send({
        embeds: [new EmbedBuilder().setTitle("✅ Verification").setDescription("Tryk for at blive verificeret.").setColor(0x42d392)],
        components: [
          new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId("verify").setLabel("✅ Verificer mig").setStyle(ButtonStyle.Success)
          )
        ]
      });
      await interaction.reply({ content: "✅ Verification-panel sendt.", ephemeral: true });
      return true;
    }

    const settingMap = {
      "set-log-channel": ["log_channel_id", "channel"],
      "set-autorole": ["autorole_id", "role"],
      "set-support-role": ["support_role_id", "role"],
      "set-ticket-category": ["ticket_category_id", "category"],
      "set-verification-role": ["verification_role_id", "role"],
      "set-suggestion-channel": ["suggestion_channel_id", "channel"]
    };

    if (settingMap[command]) {
      if (!requirePermission(PermissionFlagsBits.ManageGuild)) return true;
      const pair = settingMap[command];
      const value = interaction.options.getChannel(pair[1]) || interaction.options.getRole("role");
      if (!value) {
        await interaction.reply({ content: "Mangler værdi.", ephemeral: true });
        return true;
      }
      if (value.isRole?.() && !value.editable) {
        await interaction.reply({ content: "Bot-rollen skal stå over den valgte rolle.", ephemeral: true });
        return true;
      }
      await setGuildSetting(interaction.guild.id, pair[0], value.id);
      await interaction.reply("✅ Indstilling gemt.");
      return true;
    }

    if (command === "set-welcome" || command === "set-leave") {
      if (!requirePermission(PermissionFlagsBits.ManageGuild)) return true;
      const channel = interaction.options.getChannel("channel", true);
      const welcome = command === "set-welcome";
      await setGuildSetting(interaction.guild.id, welcome ? "welcome_channel_id" : "leave_channel_id", channel.id);
      await setGuildSetting(
        interaction.guild.id,
        welcome ? "welcome_message" : "leave_message",
        (interaction.options.getString("message") || (welcome ? "Velkommen {user} til {server}! 👋" : "{user} har forladt {server}.")).slice(0, 1000)
      );
      await interaction.reply("✅ Indstilling gemt.");
      return true;
    }

    if (command === "set-features") {
      if (!requirePermission(PermissionFlagsBits.ManageGuild)) return true;
      await setGuildSetting(interaction.guild.id, "automod_enabled", interaction.options.getBoolean("automod", true));
      await setGuildSetting(interaction.guild.id, "invite_filter", interaction.options.getBoolean("invite_filter", true));
      await setGuildSetting(interaction.guild.id, "levels_enabled", interaction.options.getBoolean("levels", true));
      await setGuildSetting(interaction.guild.id, "economy_enabled", interaction.options.getBoolean("economy", true));
      await setGuildSetting(interaction.guild.id, "anti_raid_enabled", interaction.options.getBoolean("anti_raid", true));
      await interaction.reply("✅ Bot-funktionerne er opdateret.");
      return true;
    }

    if (["balance","daily","work","leaderboard"].includes(command) || command === "level") {
      const settings = await getGuildSettings(interaction.guild.id);
      if (["balance","daily","work","leaderboard"].includes(command) && !settings.economy_enabled) {
        await interaction.reply({ content: "Økonomi er slået fra.", ephemeral: true });
        return true;
      }
      if (command === "level" && !settings.levels_enabled) {
        await interaction.reply({ content: "Levels er slået fra.", ephemeral: true });
        return true;
      }
    }

    if (command === "balance") {
      if (!db) {
        await interaction.reply({ content: "Database kræves.", ephemeral: true });
        return true;
      }
      await ensureStats(interaction.guild.id, interaction.user.id);
      const result = await db.query("SELECT coins,xp,level FROM public.user_stats WHERE guild_id=$1 AND user_id=$2", [interaction.guild.id, interaction.user.id]);
      const row = result.rows[0] || { coins: 0, xp: 0, level: 0 };
      await interaction.reply("💰 **" + row.coins + " coins** · level " + row.level + " · " + row.xp + " XP");
      return true;
    }

    if (command === "daily") {
      if (!db) {
        await interaction.reply({ content: "Database kræves.", ephemeral: true });
        return true;
      }
      await ensureStats(interaction.guild.id, interaction.user.id);
      const result = await db.query("SELECT last_daily FROM public.user_stats WHERE guild_id=$1 AND user_id=$2", [interaction.guild.id, interaction.user.id]);
      const last = result.rows[0]?.last_daily;
      if (last && Date.now() - new Date(last).getTime() < 86400000) {
        await interaction.reply({ content: "⏰ Din daily er ikke klar endnu.", ephemeral: true });
        return true;
      }
      const reward = 250 + Math.floor(Math.random() * 251);
      await db.query("UPDATE public.user_stats SET coins=coins+$1,last_daily=NOW() WHERE guild_id=$2 AND user_id=$3", [reward, interaction.guild.id, interaction.user.id]);
      await interaction.reply("🎁 Du fik **" + reward + " coins**.");
      return true;
    }

    if (command === "work") {
      if (!db) {
        await interaction.reply({ content: "Database kræves.", ephemeral: true });
        return true;
      }
      await ensureStats(interaction.guild.id, interaction.user.id);
      const result = await db.query("SELECT last_work FROM public.user_stats WHERE guild_id=$1 AND user_id=$2", [interaction.guild.id, interaction.user.id]);
      const last = result.rows[0]?.last_work;
      if (last && Date.now() - new Date(last).getTime() < 3600000) {
        await interaction.reply({ content: "⏰ Du kan arbejde igen senere.", ephemeral: true });
        return true;
      }
      const reward = 80 + Math.floor(Math.random() * 221);
      await db.query("UPDATE public.user_stats SET coins=coins+$1,last_work=NOW() WHERE guild_id=$2 AND user_id=$3", [reward, interaction.guild.id, interaction.user.id]);
      await interaction.reply("🧰 Du tjente **" + reward + " coins**.");
      return true;
    }

    if (command === "leaderboard") {
      if (!db) {
        await interaction.reply({ content: "Database kræves.", ephemeral: true });
        return true;
      }
      const result = await db.query("SELECT user_id,xp,level,coins FROM public.user_stats WHERE guild_id=$1 ORDER BY xp DESC,coins DESC LIMIT 10", [interaction.guild.id]);
      const description = result.rows.length
        ? result.rows.map((row,index) => "**" + (index + 1) + ".** <@" + row.user_id + "> — level " + row.level + ", " + row.xp + " XP, " + row.coins + " coins").join("\n")
        : "Ingen data endnu.";
      await interaction.reply({ embeds: [new EmbedBuilder().setTitle("🏆 Leaderboard").setDescription(description).setColor(0x6d5dfc)] });
      return true;
    }

    if (command === "level") {
      if (!db) {
        await interaction.reply({ content: "Database kræves.", ephemeral: true });
        return true;
      }
      const user = interaction.options.getUser("user") || interaction.user;
      await ensureStats(interaction.guild.id, user.id);
      const result = await db.query("SELECT xp,level FROM public.user_stats WHERE guild_id=$1 AND user_id=$2", [interaction.guild.id, user.id]);
      const row = result.rows[0] || { xp: 0, level: 0 };
      await interaction.reply("📈 " + user.tag + " er level **" + row.level + "** med **" + row.xp + " XP**.");
      return true;
    }

    if (command === "giveaway") {
      if (!requirePermission(PermissionFlagsBits.ManageGuild)) return true;
      const raw = interaction.options.getString("duration", true).trim().toLowerCase();
      const match = raw.match(/^(\d+)\s*(s|m|h|d)$/);
      const duration = match ? Number(match[1]) * ({ s: 1000, m: 60000, h: 3600000, d: 86400000 }[match[2]]) : NaN;
      if (!Number.isFinite(duration) || duration < 1000 || duration > 28 * 86400000) {
        await interaction.reply({ content: "Brug fx 10m, 2h eller 1d.", ephemeral: true });
        return true;
      }
      const prize = interaction.options.getString("prize", true).slice(0, 200);
      const winners = Math.max(1, Math.min(20, interaction.options.getInteger("winners") || 1));
      const endsAt = new Date(Date.now() + duration);
      const key = interaction.guild.id + "-" + Date.now();
      const message = await interaction.channel.send({
        embeds: [new EmbedBuilder().setTitle("🎉 Giveaway: " + prize).setDescription("Vindere: **" + winners + "**\nSlutter: <t:" + Math.floor(endsAt.getTime() / 1000) + ":R>").setColor(0xf4c95d)],
        components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("giveaway:" + key).setLabel("🎉 Deltag").setStyle(ButtonStyle.Primary))]
      });
      giveaways.set(key, { guildId: interaction.guild.id, channelId: interaction.channel.id, messageId: message.id, prize, winners });
      giveawayEntries.set(key, new Set());
      setTimeout(async () => {
        const item = giveaways.get(key);
        if (!item) return;
        const list = [...(giveawayEntries.get(key) || [])];
        const picked = [];
        while (picked.length < Math.min(winners, list.length)) picked.push(list.splice(Math.floor(Math.random() * list.length), 1)[0]);
        const channel = client.channels.cache.get(item.channelId);
        if (channel?.isTextBased()) {
          await channel.send(picked.length ? "🎉 Vinder: " + picked.map(id => "<@" + id + ">").join(", ") + "\n**Præmie:** " + prize : "🎉 Ingen deltagere.\n**Præmie:** " + prize).catch(() => {});
        }
        giveaways.delete(key);
        giveawayEntries.delete(key);
      }, Math.min(duration, 2147483647));
      await interaction.reply({ content: "🎉 Giveaway startet.", ephemeral: true });
      return true;
    }

    if (command === "backup") {
      if (!requirePermission(PermissionFlagsBits.Administrator)) return true;
      const data = {
        version: 1,
        guild: { id: interaction.guild.id, name: interaction.guild.name },
        createdAt: new Date().toISOString(),
        roles: interaction.guild.roles.cache.filter(role => role.id !== interaction.guild.id && !role.managed).map(role => ({
          name: role.name,
          color: role.hexColor,
          hoist: role.hoist,
          mentionable: role.mentionable
        })),
        channels: interaction.guild.channels.cache.filter(channel => channel.type !== ChannelType.DM).map(channel => ({
          name: channel.name,
          type: channel.type,
          parentId: channel.parentId || null
        }))
      };
      await interaction.reply({
        content: "💾 Backup klar.",
        files: [new AttachmentBuilder(Buffer.from(JSON.stringify(data, null, 2)), { name: "shardnote-backup.json" })],
        ephemeral: true
      });
      return true;
    }

    if (command === "restore") {
      if (!requirePermission(PermissionFlagsBits.Administrator)) return true;
      const file = interaction.options.getAttachment("file", true);
      if (!String(file.name || "").toLowerCase().endsWith(".json")) {
        await interaction.reply({ content: "Upload en .json backup.", ephemeral: true });
        return true;
      }
      const response = await fetch(file.url);
      if (!response.ok) {
        await interaction.reply({ content: "Backup kunne ikke hentes.", ephemeral: true });
        return true;
      }
      const backup = await response.json();
      if (backup?.version !== 1) {
        await interaction.reply({ content: "Ukendt ShardNote-backup.", ephemeral: true });
        return true;
      }
      let roleCount = 0;
      let channelCount = 0;
      const existingRoles = new Set(interaction.guild.roles.cache.map(role => role.name));
      for (const role of backup.roles || []) {
        if (role.name === "@everyone" || existingRoles.has(role.name)) continue;
        await interaction.guild.roles.create({ name: role.name, hoist: Boolean(role.hoist), mentionable: Boolean(role.mentionable), reason: "ShardNote restore" }).then(() => roleCount++).catch(() => {});
      }
      for (const channel of backup.channels || []) {
        if (interaction.guild.channels.cache.find(c => c.name === channel.name && c.type === channel.type)) continue;
        await interaction.guild.channels.create({ name: channel.name, type: channel.type, reason: "ShardNote restore" }).then(() => channelCount++).catch(() => {});
      }
      await interaction.reply("♻️ Restore færdig: " + roleCount + " roller og " + channelCount + " kanaler.");
      return true;
    }

    if (command === "music-join") {
      const voice = interaction.member?.voice?.channel;
      if (!voice) {
        await interaction.reply({ content: "Gå ind i en voice-kanal først.", ephemeral: true });
        return true;
      }
      if (!voice.joinable) {
        await interaction.reply({ content: "Jeg kan ikke joine voice-kanalen.", ephemeral: true });
        return true;
      }
      joinVoiceChannel({
        channelId: voice.id,
        guildId: interaction.guild.id,
        adapterCreator: interaction.guild.voiceAdapterCreator,
        selfDeaf: true
      });
      await interaction.reply("🎵 ShardNote er nu i **" + voice.name + "**.");
      return true;
    }

    if (command === "music-leave") {
      const connection = getVoiceConnection(interaction.guild.id);
      if (!connection) {
        await interaction.reply({ content: "Jeg er ikke i voice.", ephemeral: true });
        return true;
      }
      connection.destroy();
      await interaction.reply("🎵 ShardNote forlod voice.");
      return true;
    }

    return false;
  }

  client.once("ready", async () => {
    setReady(true);

    try {
      // Keep global commands in sync and also register them directly in each
      // server so they appear immediately after the bot is added.
      await client.application.commands.set(commands);

      for (const guild of client.guilds.cache.values()) {
        await registerGuildCommands(guild);
      }

      console.log(
        `[ShardNote] Discord bot connected as ${client.user.tag}. Commands registered in ${client.guilds.cache.size} server(s).`
      );
      log("success", "Discord bot connected as " + client.user.tag);
    } catch (error) {
      console.error("[ShardNote] Slash command registration failed:", error);
      log("error", "Slash command registration failed: " + error.message);
    }
  });

  client.on("guildCreate", async (guild) => {
    setReady(true);
    console.log(`[ShardNote] Joined Discord server: ${guild.name} (${guild.id}).`);
    log("success", `Bot joined Discord server ${guild.name}`);
    await registerGuildCommands(guild);
  });

  client.on("guildDelete", (guild) => {
    console.log(`[ShardNote] Removed from Discord server: ${guild.name} (${guild.id}).`);
    log("warning", `Bot removed from Discord server ${guild.name}`);
  });

  client.on("error", (error) => {
    setReady(false);
    console.error("[ShardNote] Discord client error:", error);
    log("error", "Discord client error: " + error.message);
  });

  client.on("shardDisconnect", () => {
    setReady(false);
    console.warn("[ShardNote] Discord connection disconnected.");
    log("warning", "Discord connection disconnected.");
  });

  client.on("shardReconnecting", () => {
    console.warn("[ShardNote] Discord connection reconnecting...");
    log("warning", "Discord connection reconnecting");
  });

  client.on("interactionCreate", async (interaction) => {
    if (interaction.isButton()) return handleFeatureButton(interaction).catch(error => log("error", "Button error: " + error.message));
    if (!interaction.isChatInputCommand()) return;

    try {
      if (await handleAdditionalCommand(interaction)) return;
      if (interaction.commandName === "ping") {
        return interaction.reply("Pong! ShardNote is online.");
      }

      if (interaction.commandName === "help") {
        return interaction.reply({
          content: [
            "**ShardNote — Discord Control Center**",
            "🛡️ Moderation: /warn /warnings /clearwarnings /kick /ban /unban /timeout /untimeout /purge /slowmode /lockdown",
            "🎫 Tickets: /ticket /ticket-panel /ticket-close /ticket-claim /ticket-transcript",
            "🎉 Community: /poll /suggest /giveaway /role-panel /verify-panel",
            "📊 Progression: /balance /daily /work /leaderboard /level",
            "⚙️ Setup: /set-log-channel /set-welcome /set-leave /set-autorole /set-support-role /set-ticket-category /set-verification-role /set-suggestion-channel /set-features",
            "💾 Server: /backup /restore"
          ].join("\n")
        });
      }

      if (interaction.commandName === "ticket") {
        if (!interaction.guild) {
          return interaction.reply({ content: "Tickets kan kun oprettes i en Discord-server.", ephemeral: true });
        }
        const title = interaction.options.getString("title", true).slice(0, 120);
        const existing = interaction.guild.channels.cache.find(channel =>
          channel.name.startsWith("ticket-") && channel.permissionOverwrites.cache.has(interaction.user.id)
        );
        if (existing) return interaction.reply({ content: "Du har allerede en ticket: " + existing, ephemeral: true });

        const ticket = createTicket
          ? await createTicket({
              title,
              user: interaction.user.tag,
              status: "open",
              priority: "normal",
              guildId: interaction.guild.id
            })
          : { id: Date.now(), title, status: "open" };

        const channel = await createTicketChannel(interaction.guild, interaction.user, title);
        if (db) {
          await db.query(
            "UPDATE public.tickets SET guild_id=$1,user_id=$2,channel_id=$3 WHERE id=$4",
            [interaction.guild.id, interaction.user.id, channel.id, ticket.id]
          ).catch(() => {});
        }

        const controls = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId("ticket_claim:" + ticket.id).setLabel("Claim").setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId("ticket_close:" + ticket.id).setLabel("Luk ticket").setStyle(ButtonStyle.Danger),
          new ButtonBuilder().setCustomId("ticket_transcript:" + ticket.id).setLabel("Transcript").setStyle(ButtonStyle.Primary)
        );

        await channel.send({
          embeds: [
            new EmbedBuilder()
              .setTitle("🎫 Ticket #" + ticket.id)
              .setDescription("Hej <@" + interaction.user.id + "> — skriv her, så hjælper supporten dig.")
              .setColor(0x6d5dfc)
          ],
          components: [controls]
        });

        await sendGuildLog(interaction.guild, "Ny ticket", interaction.user.tag + " oprettede ticket #" + ticket.id, "system");
        return interaction.reply({ content: "✅ Din ticket er oprettet: " + channel, ephemeral: true });
      }

      if (interaction.commandName === "serverinfo") {
        if (!interaction.guild) {
          return interaction.reply({
            content: "This command can only be used inside a server.",
            ephemeral: true
          });
        }

        return interaction.reply(
          [
            `**${interaction.guild.name}**`,
            `Members: ${interaction.guild.memberCount || 0}`,
            `Channels: ${interaction.guild.channels.cache.size}`,
            `Server ID: ${interaction.guild.id}`
          ].join("\n")
        );
      }

      if (interaction.commandName === "userinfo") {
        const user = interaction.options.getUser("user") || interaction.user;
        const member = interaction.guild
          ? await interaction.guild.members.fetch(user.id).catch(() => null)
          : null;

        return interaction.reply({
          embeds: [
            new EmbedBuilder()
              .setTitle("👤 " + user.tag)
              .setThumbnail(user.displayAvatarURL({ size: 256 }))
              .addFields(
                { name: "ID", value: user.id },
                { name: "Oprettet", value: "<t:" + Math.floor(user.createdTimestamp / 1000) + ":R>", inline: true },
                { name: "Joined", value: member?.joinedTimestamp ? "<t:" + Math.floor(member.joinedTimestamp / 1000) + ":R>" : "Ukendt", inline: true },
                { name: "Roller", value: member ? (member.roles.cache.filter(role => role.id !== interaction.guild.id).map(role => role.toString()).slice(0, 15).join(" ") || "Ingen") : "Ukendt" }
              )
              .setColor(0x6d5dfc)
          ]
        });
      }
    } catch (error) {
      console.error("[ShardNote] Command error:", error);
      log("error", "Command error: " + error.message);

      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({
          content: "Something went wrong while running that command.",
          ephemeral: true
        }).catch(() => {});
      } else {
        await interaction.reply({
          content: "Something went wrong while running that command.",
          ephemeral: true
        }).catch(() => {});
      }
    }
  });

  client.on("guildMemberAdd", async (member) => {
    try {
      const settings = await getGuildSettings(member.guild.id);
      const now = Date.now();
      const recent = (raidBuckets.get(member.guild.id) || []).filter(ts => now - ts < 10000);
      recent.push(now);
      raidBuckets.set(member.guild.id, recent);
      if (settings.anti_raid_enabled && recent.length >= 6) {
        await sendGuildLog(member.guild, "🚨 Anti-Raid", recent.length + " joins på meget kort tid. Overvej /lockdown.", "security");
      }

      if (settings.autorole_id) {
        const role = member.guild.roles.cache.get(settings.autorole_id);
        if (role?.editable) await member.roles.add(role, "ShardNote autorole").catch(() => {});
      }

      if (settings.welcome_channel_id) {
        const channel = member.guild.channels.cache.get(settings.welcome_channel_id);
        if (channel?.isTextBased()) {
          const text = String(settings.welcome_message || "Velkommen {user} til {server}! 👋")
            .replaceAll("{user}", String(member))
            .replaceAll("{server}", member.guild.name);
          await channel.send(text).catch(() => {});
        }
      }

      await sendGuildLog(member.guild, "Join", member.user.tag + " joined serveren.", "success");
    } catch (error) {
      log("error", "guildMemberAdd error: " + error.message);
    }
  });

  client.on("guildMemberRemove", async (member) => {
    try {
      const settings = await getGuildSettings(member.guild.id);
      if (settings.leave_channel_id) {
        const channel = member.guild.channels.cache.get(settings.leave_channel_id);
        if (channel?.isTextBased()) {
          const text = String(settings.leave_message || "{user} har forladt {server}.")
            .replaceAll("{user}", member.user.tag)
            .replaceAll("{server}", member.guild.name);
          await channel.send(text).catch(() => {});
        }
      }
      await sendGuildLog(member.guild, "Leave", member.user.tag + " left serveren.", "warning");
    } catch (error) {
      log("error", "guildMemberRemove error: " + error.message);
    }
  });

  client.on("channelDelete", async (channel) => {
    if (!channel.guild) return;
    await sendGuildLog(channel.guild, "Anti-Nuke", "Kanal slettet: " + channel.name, "security");
  });

  client.on("roleDelete", async (role) => {
    if (!role.guild) return;
    await sendGuildLog(role.guild, "Anti-Nuke", "Rolle slettet: " + role.name, "security");
  });

  client.on("messageCreate", async (message) => {
    if (message.author.bot) return;

    try {
      if (await runAutoMod(message)) return;
      await addXp(message.guild, message.author);
    } catch (error) {
      log("error", "AutoMod/XP error: " + error.message);
    }

    const prefix = state.settings.prefix || "!";
    if (!message.content.startsWith(prefix)) return;

    const parts = message.content.slice(prefix.length).trim().split(/\s+/);
    const command = (parts.shift() || "").toLowerCase();

    try {
      if (command === "ping") {
        await message.reply("Pong! ShardNote is online.");
        log("command", `!ping used by ${message.author.tag}`);
        return;
      }

      if (command === "help") {
        await message.reply(
          [
            "**ShardNote commands**",
            "`!ping`",
            "`!help`",
            "`!ticket <title>`",
            "`!serverinfo`"
          ].join("\n")
        );
        return;
      }

      if (command === "ticket") {
        const title = parts.join(" ").trim() || "New Discord ticket";
        const ticket = createTicket
          ? await createTicket({
              title: title.slice(0, 120),
              user: message.author.tag,
              status: "open",
              priority: "normal"
            })
          : {
              id: Date.now(),
              title: title.slice(0, 120),
              user: message.author.tag,
              status: "open",
              priority: "normal",
              createdAt: new Date().toISOString()
            };

        await message.reply(`Ticket #${ticket.id} created.`);
        log("ticket", `Ticket #${ticket.id} created by ${message.author.tag}`);
        return;
      }

      if (command === "serverinfo") {
        await message.reply(
          [
            `**${message.guild?.name || "Direct Message"}**`,
            `Members: ${message.guild?.memberCount || 0}`,
            `Channels: ${message.guild?.channels.cache.size || 0}`
          ].join("\n")
        );
      }
    } catch (error) {
      console.error("[ShardNote] Prefix command error:", error);
      log("error", "Prefix command error: " + error.message);
    }
  });

  client.dashboardApplyDiscordTemplate = async (guildId, templateKey, options) => applyDiscordTemplate(guildId, templateKey, options);

  client.dashboardCommands = commands.map(command => ({
    name: command.name,
    description: command.description,
    options: command.options || []
  }));
  client.dashboardGetGuildSettings = getGuildSettings;
  client.dashboardSetGuildSetting = setGuildSetting;
  client.dashboardSetLockdown = async (guildId, locked) => {
    const guild = client.guilds.cache.get(String(guildId));
    if (!guild) throw new Error("Discord serveren blev ikke fundet.");
    await setLockdown(guild, Boolean(locked));
    return getGuildSettings(guild.id);
  };

  client.dashboardCommands = commands.map(command => ({
    name: command.name,
    description: command.description,
    options: command.options || []
  }));
  client.dashboardGetGuildSettings = getGuildSettings;
  client.dashboardSetGuildSetting = setGuildSetting;
  client.dashboardSetLockdown = async (guildId, locked) => {
    const guild = client.guilds.cache.get(String(guildId));
    if (!guild) throw new Error("Discord serveren blev ikke fundet.");
    await setLockdown(guild, Boolean(locked));
    return getGuildSettings(guild.id);
  };

  const token = process.env.DISCORD_TOKEN;

  if (!token) {
    console.warn("[ShardNote] DISCORD_TOKEN is not configured.");
    log("warning", "DISCORD_TOKEN is not configured. Bot is in web-only mode.");
    return client;
  }

  client.login(token).catch((error) => {
    setReady(false);
    console.error("[ShardNote] Discord login failed:", error);
    log("error", "Discord login failed: " + error.message);
  });

  return client;
}

module.exports = { createBot };
