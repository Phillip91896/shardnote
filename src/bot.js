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

function createBot({ state, log, createTicket, setReady }) {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
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
          return interaction.reply({
            content: "Tickets can only be created inside a Discord server.",
            ephemeral: true
          });
        }

        const title = interaction.options.getString("title", true).slice(0, 120);
        const ticket = createTicket
          ? await createTicket({
              title,
              user: interaction.user.tag,
              status: "open",
              priority: "normal"
            })
          : {
              id: Date.now(),
              title,
              user: interaction.user.tag,
              status: "open",
              priority: "normal",
              createdAt: new Date().toISOString()
            };

        log("ticket", `Ticket #${ticket.id} created by ${interaction.user.tag}`);
        return interaction.reply(
          `Ticket #${ticket.id} created: **${title}**`
        );
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

  client.on("messageCreate", async (message) => {
    if (message.author.bot) return;

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
