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

client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag}`);
  await initSheet();
});

client.on('guildMemberAdd', async (member) => {
  await sheet.addRow({
    Username: member.user.username,
    DisplayName: member.displayName,
    UserID: member.id,
    JoinDate: new Date().toISOString(),
    Roles: member.roles.cache.map(r => r.name).join(", "),
    LastActive: "Never"
  });
});

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  const rows = await sheet.getRows();
  const userRow = rows.find(r => r.UserID === message.author.id);

  if (userRow) {
    userRow.LastActive = new Date().toISOString();
    await userRow.save();
  }
});

client.login(process.env.DISCORD_TOKEN);
