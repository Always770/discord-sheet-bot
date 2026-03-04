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

const SECURITY_CHANNEL_ID = "1477132090456936530";

let sheet;
let securitySheet;
const joinTimes = new Map();

function formatDate(date) {
  return new Date(date).toLocaleString('en-US', {
    timeZone: 'America/Chicago',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });
}

function getAccountAge(createdAt) {
  const diff = Date.now() - createdAt.getTime();

  const hours = Math.floor(diff / (1000 * 60 * 60));
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const months = Math.floor(days / 30);
  const years = Math.floor(days / 365);

  if (years >= 1) return `${years} years`;
  if (months >= 1) return `${months} months`;
  if (days >= 1) return `${days} days`;
  return `${hours} hours`;
}

async function initSheet() {
  const doc = new GoogleSpreadsheet(process.env.SHEET_ID);

  await doc.useServiceAccountAuth({
    client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
  });

  await doc.loadInfo();

  sheet = doc.sheetsByIndex[0];

  if (doc.sheetsByIndex[1]) {
    securitySheet = doc.sheetsByIndex[1];
  } else {
    securitySheet = await doc.addSheet({
      title: "SecurityLogs",
      headerValues: [
        "UserID",
        "Event",
        "TimeStayed",
        "AccountAge",
        "Flag",
        "Reason"
      ]
    });
  }
}

async function logSecurity(data) {
  await securitySheet.addRow(data);

  if (data.Flag === "YES") {
    const channel = await client.channels.fetch(SECURITY_CHANNEL_ID);

    channel.send(
`⚠️ Security Flag

User ID: ${data.UserID}
Event: ${data.Event}
Time Stayed: ${data.TimeStayed}
Account Age: ${data.AccountAge}
Reason: ${data.Reason}`
    );
  }
}

client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag}`);
  await initSheet();
});

client.on('guildMemberAdd', async (member) => {

  joinTimes.set(member.id, Date.now());

  const accountAge = getAccountAge(member.user.createdAt);

  await logSecurity({
    UserID: member.id,
    Event: "Join",
    TimeStayed: "-",
    AccountAge: accountAge,
    Flag: "NO",
    Reason: "-"
  });

  try {
    await sheet.addRow({
      Username: member.user.username,
      DisplayName: member.displayName,
      UserID: member.id,
      JoinDate: formatDate(new Date()),
      Roles: member.roles.cache.map(r => r.name).join(", "),
      LastActive: "Never",
      MessageCount: 0
    });
  } catch (err) {
    console.error(err);
  }
});

client.on('guildMemberRemove', async (member) => {

  const joinTime = joinTimes.get(member.id);
  let timeStayed = "-";
  let flag = "NO";
  let reason = "-";

  if (joinTime) {
    const seconds = Math.floor((Date.now() - joinTime) / 1000);
    timeStayed = `${seconds} sec`;

    if (seconds < 60) {
      flag = "YES";
      reason = "Left under 60 seconds";
    }
  }

  const accountAge = getAccountAge(member.user.createdAt);

  await logSecurity({
    UserID: member.id,
    Event: "Leave",
    TimeStayed: timeStayed,
    AccountAge: accountAge,
    Flag: flag,
    Reason: reason
  });
});

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  try {
    const rows = await sheet.getRows();
    const row = rows.find(r => r.UserID === message.author.id);

    if (row) {
      row.LastActive = formatDate(new Date());
      row.MessageCount = (parseInt(row.MessageCount) || 0) + 1;
      await row.save();
    }
  } catch (err) {
    console.error(err);
  }
});

client.login(process.env.DISCORD_TOKEN);
