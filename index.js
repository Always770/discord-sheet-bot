const { Client, GatewayIntentBits } = require('discord.js');
const { GoogleSpreadsheet } = require('google-spreadsheet');
require('dotenv').config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

let sheet;

async function initSheet() {
  const doc = new GoogleSpreadsheet(process.env.SHEET_ID);

  await doc.useServiceAccountAuth({
    client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
  });

  await doc.loadInfo();
  sheet = doc.sheetsByIndex[0];
}

async function syncAllMembers(guild) {
  const rows = await sheet.getRows();
  const existingIDs = rows.map(r => r.UserID);

  await guild.members.fetch();

  for (const member of guild.members.cache.values()) {
    if (member.user.bot) continue;

    if (!existingIDs.includes(member.id)) {
      await sheet.addRow({
        Username: member.user.username,
        DisplayName: member.displayName,
        UserID: member.id,
        JoinDate: member.joinedAt?.toISOString() || new Date().toISOString(),
        Roles: member.roles.cache.map(r => r.name).join(", "),
        LastActive: "Never",
        MessageCount: 0
      });
    }
  }

  console.log("Finished syncing existing members.");
}

client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag}`);
  await initSheet();

  const guild = client.guilds.cache.first();
  await syncAllMembers(guild);
});

client.on('guildMemberAdd', async (member) => {
  try {
    await sheet.addRow({
      Username: member.user.username,
      DisplayName: member.displayName,
      UserID: member.id,
      JoinDate: new Date().toISOString(),
      Roles: member.roles.cache.map(r => r.name).join(", "),
      LastActive: "Never",
      MessageCount: 0
    });
  } catch (err) {
    console.error("Error adding new member:", err);
  }
});

client.on('guildMemberUpdate', async (oldMember, newMember) => {
  try {
    const rows = await sheet.getRows();
    const row = rows.find(r => r.UserID === newMember.id);

    if (row) {
      row.Roles = newMember.roles.cache.map(r => r.name).join(", ");
      await row.save();
    }
  } catch (err) {
    console.error("Error updating roles:", err);
  }
});

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  try {
    const rows = await sheet.getRows();
    const row = rows.find(r => r.UserID === message.author.id);

    if (row) {
      row.LastActive = new Date().toISOString();
      row.MessageCount = (parseInt(row.MessageCount) || 0) + 1;
      await row.save();
    }
  } catch (err) {
    console.error("Error updating activity:", err);
  }
});

client.login(process.env.DISCORD_TOKEN);
