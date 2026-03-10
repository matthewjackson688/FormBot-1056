const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env"), quiet: true });
const fs = require("fs");
const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");

const TITLES = [
  { label: "Governor", description: "Recruitment speed +10%", value: "Governor" },
  { label: "Architect", description: "Construction speed +10%", value: "Architect" },
  { label: "Prefect", description: "Research speed +10%", value: "Prefect" },
  { label: "General", description: "Bender attack +5%", value: "General" },
];

function parseArg(flag) {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return null;
  return process.argv[idx + 1] || null;
}

const guildId = parseArg("--guild") || process.env.GUILD_ID || null;
const channelId = parseArg("--channel") || process.env.PANEL_CHANNEL_ID || null;
const token = process.env.DISCORD_TOKEN || null;

if (!token) {
  console.error("Missing DISCORD_TOKEN in environment.");
  process.exit(1);
}
if (!guildId || !channelId) {
  console.error("Usage: node scripts/panel-reset-once.js --guild <guildId> --channel <channelId>");
  process.exit(1);
}

function buildPanelPayload() {
  const embed = new EmbedBuilder()
    .setTitle("Title Requests")
    .setDescription("Select your requested title:")
    .setColor(0x2b2d31);

  const select = new StringSelectMenuBuilder()
    .setCustomId("select_title")
    .setPlaceholder("Choose a title…")
    .addOptions(
      TITLES.map((t) => ({
        label: t.label,
        description: t.description,
        value: t.value,
      }))
    );

  const row1 = new ActionRowBuilder().addComponents(select);
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("check_reservations")
      .setLabel("Check Reservations")
      .setStyle(ButtonStyle.Primary)
  );

  return { embeds: [embed], components: [row1, row2] };
}

function isPanelMessage(msg, clientUserId) {
  if (!msg || msg.author?.id !== clientUserId) return false;
  const hasPanelTitle = Array.isArray(msg.embeds) && msg.embeds.some((e) => e?.title === "Title Requests");
  if (!hasPanelTitle) return false;
  return Array.isArray(msg.components) && msg.components.some((row) =>
    Array.isArray(row?.components) && row.components.some((component) => component?.customId === "select_title")
  );
}

function updatePanelStore(channelId, messageId) {
  const storePath = path.join(__dirname, "..", "panel.json");
  let data = {};
  try {
    data = JSON.parse(fs.readFileSync(storePath, "utf8"));
  } catch {}
  if (!data || typeof data !== "object") data = {};
  if (!data.byChannel || typeof data.byChannel !== "object") data.byChannel = {};
  data.byChannel[channelId] = messageId;
  fs.writeFileSync(storePath, JSON.stringify(data, null, 2));
}

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once("clientReady", async () => {
  try {
    const channel = await client.channels.fetch(channelId);
    if (!channel?.isTextBased()) {
      throw new Error(`Channel ${channelId} is not text-based or not found.`);
    }
    if (channel.guildId !== guildId) {
      throw new Error(`Channel ${channelId} is not in guild ${guildId}.`);
    }

    const existing = await channel.messages.fetch({ limit: 100 });
    const panelMessages = existing.filter((m) => isPanelMessage(m, client.user.id));

    for (const msg of panelMessages.values()) {
      await msg.delete().catch(() => {});
    }

    const payload = buildPanelPayload();
    const newMsg = await channel.send(payload);
    updatePanelStore(channelId, newMsg.id);

    console.log(`✅ Panel reset: deleted ${panelMessages.size} old message(s), sent ${newMsg.id}`);
  } catch (err) {
    console.error(`❌ Panel reset failed: ${err?.message || err}`);
    process.exitCode = 1;
  } finally {
    await client.destroy();
    process.exit();
  }
});

client.login(token).catch((err) => {
  console.error(`❌ Login failed: ${err?.message || err}`);
  process.exit(1);
});
