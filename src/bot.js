const {
  Client,
  GatewayIntentBits,
  PermissionFlagsBits
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
    description: "Show information about a Discord member."
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
