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
  }
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
        ? await createTicket({ title: "Support", user: interaction.user.tag, status: "open", priority: "normal" })
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
      if (interaction.commandName === "ping") {
        return interaction.reply("Pong! ShardNote is online.");
      }

      if (interaction.commandName === "help") {
        return interaction.reply({
          content: [
            "**ShardNote commands**",
            "`/ping` — Check bot status",
            "`/help` — Show this help",
            "`/ticket <title>` — Create a support ticket",
            "`/serverinfo` — Show server information",
            "`/userinfo` — Show your user information"
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
              priority: "normal"
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
        const member = interaction.guild
          ? await interaction.guild.members.fetch(interaction.user.id).catch(() => null)
          : null;

        return interaction.reply(
          [
            `**${interaction.user.tag}**`,
            `User ID: ${interaction.user.id}`,
            member ? `Joined server: ${member.joinedAt ? member.joinedAt.toLocaleDateString("da-DK") : "Unknown"}` : "Server member data unavailable."
          ].join("\n")
        );
      }
      if (!interaction.guild) {
        return interaction.reply({ content: "Denne command virker kun i en Discord-server.", ephemeral: true });
      }

      const requirePermission = (permission) => {
        if (!interaction.memberPermissions?.has(permission)) {
          interaction.reply({ content: "Du har ikke de nødvendige rettigheder.", ephemeral: true });
          return false;
        }
        return true;
      };

      if (interaction.commandName === "ticket-panel") {
        if (!requirePermission(PermissionFlagsBits.ManageGuild)) return;
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId("ticket_create").setLabel("🎫 Opret ticket").setStyle(ButtonStyle.Primary)
        );
        await interaction.channel.send({
          embeds: [new EmbedBuilder().setTitle("🎫 Support").setDescription("Tryk på knappen for at åbne en privat support-ticket.").setColor(0x6d5dfc)],
          components: [row]
        });
        return interaction.reply({ content: "✅ Ticket-panel sendt.", ephemeral: true });
      }

      if (interaction.commandName === "ticket-close") {
        if (!interaction.channel?.name?.startsWith("ticket-")) return interaction.reply({ content: "Dette er ikke en ticket-kanal.", ephemeral: true });
        if (!requirePermission(PermissionFlagsBits.ManageChannels)) return;
        const match = interaction.channel.name.match(/ticket-(\d+)/);
        if (db && match) await db.query("UPDATE public.tickets SET status='closed' WHERE id=$1", [match[1]]).catch(() => {});
        await interaction.channel.setName("closed-" + interaction.channel.name).catch(() => {});
        return interaction.reply("🔒 Ticket lukket.");
      }

      if (interaction.commandName === "ticket-claim") {
        if (!interaction.channel?.name?.startsWith("ticket-")) return interaction.reply({ content: "Dette er ikke en ticket-kanal.", ephemeral: true });
        if (!requirePermission(PermissionFlagsBits.ManageMessages)) return;
        const match = interaction.channel.name.match(/ticket-(\d+)/);
        if (db && match) await db.query("UPDATE public.tickets SET claimed_by=$1 WHERE id=$2", [interaction.user.id, match[1]]).catch(() => {});
        return interaction.reply("✅ Ticket claimed af " + interaction.user + ".");
      }

      if (interaction.commandName === "ticket-transcript") {
        if (!interaction.channel?.name?.startsWith("ticket-")) return interaction.reply({ content: "Dette er ikke en ticket-kanal.", ephemeral: true });
        if (!requirePermission(PermissionFlagsBits.ManageMessages)) return;
        await interaction.deferReply({ ephemeral: true });
        const text = await transcript(interaction.channel);
        return interaction.editReply({
          content: "📄 Transcript klar.",
          files: [new AttachmentBuilder(Buffer.from(text || "Ingen beskeder."), { name: "ticket-transcript.txt" })]
        });
      }

      if (interaction.commandName === "warn") {
        if (!requirePermission(PermissionFlagsBits.ModerateMembers)) return;
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
        return interaction.reply("⚠️ " + user.tag + " er blevet advaret" + (caseId ? " (case #" + caseId + ")" : "") + ".");
      }

      if (interaction.commandName === "warnings") {
        if (!requirePermission(PermissionFlagsBits.ModerateMembers)) return;
        const user = interaction.options.getUser("user", true);
        if (!db) return interaction.reply({ content: "Database kræves for warnings.", ephemeral: true });
        const result = await db.query(
          "SELECT moderator_id, reason, created_at FROM public.warnings WHERE guild_id=$1 AND user_id=$2 ORDER BY created_at DESC LIMIT 20",
          [interaction.guild.id, user.id]
        );
        const text = result.rows.length
          ? result.rows.map((row, index) => (index + 1) + ". " + row.reason).join("\n")
          : "Ingen advarsler.";
        return interaction.reply({ content: "**Advarsler for " + user.tag + "**\n" + text, ephemeral: true });
      }

      if (interaction.commandName === "clearwarnings") {
        if (!requirePermission(PermissionFlagsBits.ModerateMembers)) return;
        const user = interaction.options.getUser("user", true);
        if (db) await db.query("DELETE FROM public.warnings WHERE guild_id=$1 AND user_id=$2", [interaction.guild.id, user.id]);
        return interaction.reply("✅ Advarsler slettet for " + user.tag + ".");
      }

      if (interaction.commandName === "kick") {
        if (!requirePermission(PermissionFlagsBits.KickMembers)) return;
        const user = interaction.options.getUser("user", true);
        const member = await getMember(interaction.guild, user.id);
        const reason = (interaction.options.getString("reason") || "Ingen grund angivet").slice(0, 500);
        if (!member?.kickable) return interaction.reply({ content: "Jeg kan ikke kicke den bruger.", ephemeral: true });
        await member.kick(reason);
        await sendGuildLog(interaction.guild, "Kick", interaction.user.tag + " kickede " + user.tag + ": " + reason, "security");
        return interaction.reply("👢 " + user.tag + " er blevet kicked.");
      }

      if (interaction.commandName === "ban") {
        if (!requirePermission(PermissionFlagsBits.BanMembers)) return;
        const user = interaction.options.getUser("user", true);
        const reason = (interaction.options.getString("reason") || "Ingen grund angivet").slice(0, 500);
        const days = interaction.options.getInteger("delete_days") || 0;
        await interaction.guild.members.ban(user.id, { deleteMessageSeconds: days * 86400, reason });
        await sendGuildLog(interaction.guild, "Ban", interaction.user.tag + " bannede " + user.tag + ": " + reason, "security");
        return interaction.reply("🔨 " + user.tag + " er blevet bannet.");
      }

      if (interaction.commandName === "unban") {
        if (!requirePermission(PermissionFlagsBits.BanMembers)) return;
        const userId = interaction.options.getString("user_id", true).trim();
        await interaction.guild.members.unban(userId);
        return interaction.reply("✅ " + userId + " er unbannet.");
      }

      if (interaction.commandName === "timeout") {
        if (!requirePermission(PermissionFlagsBits.ModerateMembers)) return;
        const user = interaction.options.getUser("user", true);
        const raw = interaction.options.getString("duration", true).trim().toLowerCase();
        const match = raw.match(/^(\d+)\s*(s|m|h|d)$/);
        if (!match) return interaction.reply({ content: "Brug fx 10m, 2h eller 1d.", ephemeral: true });
        const multiplier = { s: 1000, m: 60000, h: 3600000, d: 86400000 }[match[2]];
        const duration = Number(match[1]) * multiplier;
        if (!Number.isFinite(duration) || duration > 28 * 86400000) return interaction.reply({ content: "Timeout må højst være 28 dage.", ephemeral: true });
        const member = await getMember(interaction.guild, user.id);
        if (!member?.moderatable) return interaction.reply({ content: "Jeg kan ikke timeoute den bruger.", ephemeral: true });
        await member.timeout(duration, interaction.options.getString("reason") || "ShardNote timeout");
        return interaction.reply("⏳ " + user.tag + " er i timeout i " + (duration >= 3600000 ? Math.floor(duration / 3600000) + "h" : Math.floor(duration / 60000) + "m") + ".");
      }

      if (interaction.commandName === "untimeout") {
        if (!requirePermission(PermissionFlagsBits.ModerateMembers)) return;
        const user = interaction.options.getUser("user", true);
        const member = await getMember(interaction.guild, user.id);
        if (!member?.moderatable) return interaction.reply({ content: "Jeg kan ikke fjerne timeout.", ephemeral: true });
        await member.timeout(null, "ShardNote untimeout");
        return interaction.reply("✅ Timeout fjernet.");
      }

      if (interaction.commandName === "purge") {
        if (!requirePermission(PermissionFlagsBits.ManageMessages)) return;
        const amount = interaction.options.getInteger("amount", true);
        const deleted = await interaction.channel.bulkDelete(amount, true);
        return interaction.reply({ content: "🧹 Slettede " + deleted.size + " beskeder.", ephemeral: true });
      }

      if (interaction.commandName === "slowmode") {
        if (!requirePermission(PermissionFlagsBits.ManageChannels)) return;
        const seconds = interaction.options.getInteger("seconds", true);
        await interaction.channel.setRateLimitPerUser(seconds, "ShardNote slowmode");
        return interaction.reply("🐢 Slowmode sat til " + seconds + " sekunder.");
      }

      if (interaction.commandName === "lockdown" || interaction.commandName === "unlockdown") {
        if (!requirePermission(PermissionFlagsBits.Administrator)) return;
        const locked = interaction.commandName === "lockdown";
        await setLockdown(interaction.guild, locked);
        return interaction.reply(locked ? "🔒 Serveren er låst ned." : "🔓 Serveren er åben igen.");
      }

      if (interaction.commandName === "announce") {
        if (!requirePermission(PermissionFlagsBits.ManageGuild)) return;
        const target = interaction.options.getChannel("channel") || interaction.channel;
        const embed = new EmbedBuilder()
          .setTitle(interaction.options.getString("title", true).slice(0, 200))
          .setDescription(interaction.options.getString("message", true).slice(0, 2000))
          .setColor(0x6d5dfc)
          .setFooter({ text: "ShardNote • " + interaction.guild.name });
        await target.send({ embeds: [embed] });
        return interaction.reply({ content: "✅ Announcement sendt.", ephemeral: true });
      }

      if (interaction.commandName === "poll") {
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
        const message = await interaction.channel.send({
          embeds: [pollEmbed(poll)],
          components: [pollButtons(interaction.id, poll.options)]
        });
        polls.set(interaction.id, poll);
        return interaction.reply({ content: "✅ Poll oprettet: " + message.url, ephemeral: true });
      }

      if (interaction.commandName === "suggest") {
        const settings = await getGuildSettings(interaction.guild.id);
        const channel = settings.suggestion_channel_id
          ? interaction.guild.channels.cache.get(settings.suggestion_channel_id)
          : interaction.channel;
        if (!channel?.isTextBased()) return interaction.reply({ content: "Suggestion-kanalen er ikke tilgængelig.", ephemeral: true });
        const text = interaction.options.getString("text", true).slice(0, 1800);
        const message = await channel.send({
          embeds: [
            new EmbedBuilder()
              .setTitle("💡 Nyt forslag")
              .setDescription(text)
              .addFields({ name: "Fra", value: interaction.user.tag, inline: true }, { name: "Status", value: "Pending", inline: true })
              .setColor(0x42d392)
          ]
        });
        if (db) await db.query(
          "INSERT INTO public.suggestions (guild_id,user_id,content,channel_id,message_id) VALUES ($1,$2,$3,$4,$5)",
          [interaction.guild.id, interaction.user.id, text, channel.id, message.id]
        );
        return interaction.reply({ content: "✅ Forslag sendt.", ephemeral: true });
      }

      if (interaction.commandName === "role-panel") {
        if (!requirePermission(PermissionFlagsBits.ManageRoles)) return;
        const role = interaction.options.getRole("role", true);
        if (!role.editable) return interaction.reply({ content: "Bot-rollen skal stå over den valgte rolle.", ephemeral: true });
        const button = new ButtonBuilder()
          .setCustomId("role:" + role.id)
          .setLabel(interaction.options.getString("label", true).slice(0, 80))
          .setStyle(ButtonStyle.Primary);
        await interaction.channel.send({
          embeds: [new EmbedBuilder().setTitle("🎭 Rollepanel").setDescription("Tryk for at få eller fjerne " + role + ".").setColor(0x6d5dfc)],
          components: [new ActionRowBuilder().addComponents(button)]
        });
        return interaction.reply({ content: "✅ Rollepanel sendt.", ephemeral: true });
      }

      if (interaction.commandName === "verify-panel") {
        if (!requirePermission(PermissionFlagsBits.ManageGuild)) return;
        const settings = await getGuildSettings(interaction.guild.id);
        if (!settings.verification_role_id) return interaction.reply({ content: "Sæt først en verification-role.", ephemeral: true });
        await interaction.channel.send({
          embeds: [new EmbedBuilder().setTitle("✅ Verification").setDescription("Tryk for at blive verificeret.").setColor(0x42d392)],
          components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("verify").setLabel("✅ Verificer mig").setStyle(ButtonStyle.Success))]
        });
        return interaction.reply({ content: "✅ Verification-panel sendt.", ephemeral: true });
      }

      const settingMap = {
        "set-log-channel": ["log_channel_id", "channel"],
        "set-autorole": ["autorole_id", "role"],
        "set-support-role": ["support_role_id", "role"],
        "set-ticket-category": ["ticket_category_id", "category"],
        "set-verification-role": ["verification_role_id", "role"],
        "set-suggestion-channel": ["suggestion_channel_id", "channel"]
      };

      if (settingMap[interaction.commandName]) {
        if (!requirePermission(PermissionFlagsBits.ManageGuild)) return;
        const config = settingMap[interaction.commandName];
        const value = interaction.options.getChannel(config[1]) || interaction.options.getRole("role");
        if (!value) return interaction.reply({ content: "Mangler værdi.", ephemeral: true });
        if (value.isRole?.() && !value.editable) return interaction.reply({ content: "Bot-rollen skal stå over rollen.", ephemeral: true });
        await setGuildSetting(interaction.guild.id, config[0], value.id);
        return interaction.reply("✅ Indstilling gemt.");
      }

      if (interaction.commandName === "set-welcome" || interaction.commandName === "set-leave") {
        if (!requirePermission(PermissionFlagsBits.ManageGuild)) return;
        const channel = interaction.options.getChannel("channel", true);
        const isWelcome = interaction.commandName === "set-welcome";
        const key = isWelcome ? "welcome_channel_id" : "leave_channel_id";
        const messageKey = isWelcome ? "welcome_message" : "leave_message";
        const message = interaction.options.getString("message") || (isWelcome ? "Velkommen {user} til {server}! 👋" : "{user} har forladt {server}.");
        await setGuildSetting(interaction.guild.id, key, channel.id);
        await setGuildSetting(interaction.guild.id, messageKey, message.slice(0, 1000));
        return interaction.reply("✅ Indstilling gemt.");
      }

      if (interaction.commandName === "set-features") {
        if (!requirePermission(PermissionFlagsBits.ManageGuild)) return;
        await setGuildSetting(interaction.guild.id, "automod_enabled", interaction.options.getBoolean("automod", true));
        await setGuildSetting(interaction.guild.id, "invite_filter", interaction.options.getBoolean("invite_filter", true));
        await setGuildSetting(interaction.guild.id, "levels_enabled", interaction.options.getBoolean("levels", true));
        await setGuildSetting(interaction.guild.id, "economy_enabled", interaction.options.getBoolean("economy", true));
        await setGuildSetting(interaction.guild.id, "anti_raid_enabled", interaction.options.getBoolean("anti_raid", true));
        return interaction.reply("✅ Bot-funktionerne er opdateret.");
      }

      if (interaction.commandName === "giveaway") {
        if (!requirePermission(PermissionFlagsBits.ManageGuild)) return;
        const raw = interaction.options.getString("duration", true).trim().toLowerCase();
        const match = raw.match(/^(\d+)\s*(s|m|h|d)$/);
        if (!match) return interaction.reply({ content: "Brug fx 10m, 2h eller 1d.", ephemeral: true });
        const multiplier = { s: 1000, m: 60000, h: 3600000, d: 86400000 }[match[2]];
        const duration = Number(match[1]) * multiplier;
        if (!Number.isFinite(duration) || duration < 1000 || duration > 28 * 86400000) return interaction.reply({ content: "Varigheden skal være mellem 1 sekund og 28 dage.", ephemeral: true });

        const prize = interaction.options.getString("prize", true).slice(0, 200);
        const winners = Math.max(1, Math.min(20, interaction.options.getInteger("winners") || 1));
        const endsAt = new Date(Date.now() + duration);
        const tempId = interaction.guild.id + "-" + Date.now();
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId("giveaway:" + tempId).setLabel("🎉 Deltag").setStyle(ButtonStyle.Primary)
        );
        const message = await interaction.channel.send({
          embeds: [new EmbedBuilder().setTitle("🎉 Giveaway: " + prize).setDescription("Vindere: **" + winners + "**\nSlutter: <t:" + Math.floor(endsAt.getTime() / 1000) + ":R>\n\nTryk på **Deltag**.").setColor(0xf4c95d)],
          components: [row]
        });
        giveaways.set(tempId, { guildId: interaction.guild.id, channelId: interaction.channel.id, messageId: message.id, prize, winners });
        giveawayEntries.set(tempId, new Set());
        let giveawayId = tempId;
        if (db) {
          await db.query("CREATE TABLE IF NOT EXISTS public.giveaway_entries (giveaway_id BIGINT NOT NULL,user_id VARCHAR(32) NOT NULL,PRIMARY KEY(giveaway_id,user_id))");
          const result = await db.query(
            "INSERT INTO public.giveaways (guild_id,channel_id,message_id,prize,winners,ends_at,host_id) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id",
            [interaction.guild.id, interaction.channel.id, message.id, prize, winners, endsAt.toISOString(), interaction.user.id]
          );
          giveawayId = String(result.rows[0].id);
          giveaways.set(giveawayId, giveaways.get(tempId));
          giveawayEntries.set(giveawayId, giveawayEntries.get(tempId));
          giveaways.delete(tempId);
          giveawayEntries.delete(tempId);
        }
        setTimeout(async () => {
          const item = giveaways.get(String(giveawayId));
          if (!item) return;
          const channel = client.channels.cache.get(item.channelId);
          if (!channel?.isTextBased()) return;
          const dbEntries = db
            ? await db.query("SELECT user_id FROM public.giveaway_entries WHERE giveaway_id=$1", [giveawayId]).catch(() => ({ rows: [] }))
            : { rows: [] };
          const candidates = dbEntries.rows.length ? dbEntries.rows.map(row => row.user_id) : [...(giveawayEntries.get(String(giveawayId)) || [])];
          const winnersList = [];
          while (winnersList.length < Math.min(item.winners, candidates.length)) {
            winnersList.push(candidates.splice(Math.floor(Math.random() * candidates.length), 1)[0]);
          }
          await channel.send(
            winnersList.length
              ? "🎉 Giveaway slut! Vinder: " + winnersList.map(id => "<@" + id + ">").join(", ") + "\n**Præmie:** " + item.prize
              : "🎉 Giveaway slut! Ingen deltagere.\n**Præmie:** " + item.prize
          ).catch(() => {});
          if (db) await db.query("UPDATE public.giveaways SET status='ended' WHERE id=$1", [giveawayId]).catch(() => {});
          giveaways.delete(String(giveawayId));
          giveawayEntries.delete(String(giveawayId));
        }, Math.min(duration, 2147483647));
        return interaction.reply({ content: "🎉 Giveaway startet.", ephemeral: true });
      }

      if (interaction.commandName === "balance" || interaction.commandName === "daily" || interaction.commandName === "work" || interaction.commandName === "leaderboard" || interaction.commandName === "level") {
        const settings = await getGuildSettings(interaction.guild.id);
        if (["balance","daily","work","leaderboard"].includes(interaction.commandName) && !settings.economy_enabled) return interaction.reply({ content: "Økonomi er slået fra.", ephemeral: true });
        if (interaction.commandName === "level" && !settings.levels_enabled) return interaction.reply({ content: "Levels er slået fra.", ephemeral: true });
      }

      if (interaction.commandName === "balance") {
        if (!db) return interaction.reply({ content: "Database kræves.", ephemeral: true });
        await ensureStats(interaction.guild.id, interaction.user.id);
        const result = await db.query("SELECT coins,xp,level FROM public.user_stats WHERE guild_id=$1 AND user_id=$2", [interaction.guild.id, interaction.user.id]);
        const row = result.rows[0] || { coins: 0, xp: 0, level: 0 };
        return interaction.reply("💰 **" + row.coins + " coins** · level " + row.level + " · " + row.xp + " XP");
      }

      if (interaction.commandName === "daily") {
        if (!db) return interaction.reply({ content: "Database kræves.", ephemeral: true });
        await ensureStats(interaction.guild.id, interaction.user.id);
        const result = await db.query("SELECT last_daily FROM public.user_stats WHERE guild_id=$1 AND user_id=$2", [interaction.guild.id, interaction.user.id]);
        const last = result.rows[0]?.last_daily;
        if (last && Date.now() - new Date(last).getTime() < 86400000) return interaction.reply({ content: "⏰ Din daily er ikke klar endnu.", ephemeral: true });
        const reward = 250 + Math.floor(Math.random() * 251);
        await db.query("UPDATE public.user_stats SET coins=coins+$1,last_daily=NOW() WHERE guild_id=$2 AND user_id=$3", [reward, interaction.guild.id, interaction.user.id]);
        return interaction.reply("🎁 Du fik **" + reward + " coins**.");
      }

      if (interaction.commandName === "work") {
        if (!db) return interaction.reply({ content: "Database kræves.", ephemeral: true });
        await ensureStats(interaction.guild.id, interaction.user.id);
        const result = await db.query("SELECT last_work FROM public.user_stats WHERE guild_id=$1 AND user_id=$2", [interaction.guild.id, interaction.user.id]);
        const last = result.rows[0]?.last_work;
        if (last && Date.now() - new Date(last).getTime() < 3600000) return interaction.reply({ content: "⏰ Du kan arbejde igen senere.", ephemeral: true });
        const reward = 80 + Math.floor(Math.random() * 221);
        await db.query("UPDATE public.user_stats SET coins=coins+$1,last_work=NOW() WHERE guild_id=$2 AND user_id=$3", [reward, interaction.guild.id, interaction.user.id]);
        return interaction.reply("🧰 Du tjente **" + reward + " coins**.");
      }

      if (interaction.commandName === "leaderboard") {
        if (!db) return interaction.reply({ content: "Database kræves.", ephemeral: true });
        const result = await db.query("SELECT user_id,xp,level,coins FROM public.user_stats WHERE guild_id=$1 ORDER BY xp DESC,coins DESC LIMIT 10", [interaction.guild.id]);
        const description = result.rows.length
          ? result.rows.map((row, index) => "**" + (index + 1) + ".** <@" + row.user_id + "> — level " + row.level + ", " + row.xp + " XP, " + row.coins + " coins").join("\n")
          : "Ingen data endnu.";
        return interaction.reply({ embeds: [new EmbedBuilder().setTitle("🏆 Leaderboard").setDescription(description).setColor(0x6d5dfc)] });
      }

      if (interaction.commandName === "level") {
        if (!db) return interaction.reply({ content: "Database kræves.", ephemeral: true });
        const user = interaction.options.getUser("user") || interaction.user;
        await ensureStats(interaction.guild.id, user.id);
        const result = await db.query("SELECT xp,level FROM public.user_stats WHERE guild_id=$1 AND user_id=$2", [interaction.guild.id, user.id]);
        const row = result.rows[0] || { xp: 0, level: 0 };
        return interaction.reply("📈 " + user.tag + " er level **" + row.level + "** med **" + row.xp + " XP**.");
      }

      if (interaction.commandName === "backup") {
        if (!requirePermission(PermissionFlagsBits.Administrator)) return;
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
        const attachment = new AttachmentBuilder(Buffer.from(JSON.stringify(data, null, 2)), { name: "shardnote-backup.json" });
        return interaction.reply({ content: "💾 Backup klar.", files: [attachment], ephemeral: true });
      }

      if (interaction.commandName === "restore") {
        if (!requirePermission(PermissionFlagsBits.Administrator)) return;
        const file = interaction.options.getAttachment("file", true);
        if (!String(file.name || "").toLowerCase().endsWith(".json")) return interaction.reply({ content: "Upload en .json backup.", ephemeral: true });
        const response = await fetch(file.url);
        if (!response.ok) return interaction.reply({ content: "Backup kunne ikke hentes.", ephemeral: true });
        const backup = await response.json();
        if (backup?.version !== 1) return interaction.reply({ content: "Ukendt ShardNote-backup.", ephemeral: true });
        let roles = 0;
        let channels = 0;
        const existingRoles = new Set(interaction.guild.roles.cache.map(role => role.name));
        for (const role of backup.roles || []) {
          if (role.name === "@everyone" || existingRoles.has(role.name)) continue;
          await interaction.guild.roles.create({
            name: role.name,
            hoist: Boolean(role.hoist),
            mentionable: Boolean(role.mentionable),
            reason: "ShardNote restore"
          }).then(() => roles++).catch(() => {});
        }
        for (const channel of backup.channels || []) {
          if (interaction.guild.channels.cache.find(c => c.name === channel.name && c.type === channel.type)) continue;
          await interaction.guild.channels.create({ name: channel.name, type: channel.type, reason: "ShardNote restore" }).then(() => channels++).catch(() => {});
        }
        return interaction.reply("♻️ Restore færdig: " + roles + " roller og " + channels + " kanaler.");
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
