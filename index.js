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

const ALERT_CHANNEL = "1477132090456936530";

let doc;
let membersSheet;
let securitySheet;

let joinTimes = {};
let joinHistory = [];
let rejoinTracker = {};

function formatDate(date){
  return new Date(date).toLocaleString("en-US",{
    timeZone:"America/Chicago",
    year:"numeric",
    month:"long",
    day:"numeric",
    hour:"numeric",
    minute:"2-digit",
    hour12:true
  });
}

function accountAge(created){
  const diff = Date.now() - created.getTime();

  const hours = Math.floor(diff/(1000*60*60));
  const days = Math.floor(hours/24);
  const months = Math.floor(days/30);
  const years = Math.floor(days/365);

  if(years>=1) return `${years} years`;
  if(months>=1) return `${months} months`;
  if(days>=1) return `${days} days`;
  return `${hours} hours`;
}

async function setupSheets(){

  doc = new GoogleSpreadsheet(process.env.SHEET_ID);

  await doc.useServiceAccountAuth({
    client_email:process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    private_key:process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g,"\n")
  });

  await doc.loadInfo();

  membersSheet = doc.sheetsByIndex[0];

  if(doc.sheetsByIndex[1]){
    securitySheet = doc.sheetsByIndex[1];
  } else {
    securitySheet = await doc.addSheet({
      title:"SecurityLogs",
      headerValues:["UserID","Event","TimeStayed","AccountAge","Flag","Reason"]
    });
  }
}

async function findRow(userID){
  const rows = await membersSheet.getRows();
  return rows.find(r => String(r.UserID) === String(userID));
}

async function sendAlert(reason,user){
  const channel = await client.channels.fetch(ALERT_CHANNEL);
  channel.send(`⚠️ Security Flag\nUser: ${user}\nReason: ${reason}`);
}

client.once("ready", async ()=>{
  await setupSheets();
  console.log("Bot ready");
});

client.on("guildMemberAdd", async member=>{

  joinTimes[member.id] = Date.now();

  const now = Date.now();
  joinHistory.push(now);
  joinHistory = joinHistory.filter(t => now - t < 60000);

  if(joinHistory.length >= 5){
    sendAlert("Join spike detected", member.user.tag);
  }

  if(!rejoinTracker[member.id]){
    rejoinTracker[member.id] = 1;
  } else {
    rejoinTracker[member.id]++;
  }

  if(rejoinTracker[member.id] >= 3){
    sendAlert("Rejoin pattern detected", member.user.tag);
  }

  const ageDays = (Date.now()-member.user.createdAt)/(1000*60*60*24);

  if(ageDays < 30){
    sendAlert("Very new account", member.user.tag);
  }

  const existing = await findRow(member.id);

  if(existing) return;

  const roles = member.roles.cache
    .filter(r=>r.name!=="@everyone")
    .map(r=>r.name)
    .join(", ");

  await membersSheet.addRow({
    Username:member.user.username,
    DisplayName:member.displayName,
    UserID:member.id,
    JoinDate:formatDate(member.joinedAt || new Date()),
    Roles:roles,
    LastActive:"Never",
    MessageCount:0
  });

});

client.on("guildMemberUpdate", async(oldMember,newMember)=>{

  const row = await findRow(newMember.id);

  if(!row) return;

  row.DisplayName = newMember.displayName;

  const roles = newMember.roles.cache
    .filter(r=>r.name!=="@everyone")
    .map(r=>r.name)
    .join(", ");

  row.Roles = roles;

  await row.save();

});

client.on("messageCreate", async message=>{

  if(message.author.bot) return;

  const row = await findRow(message.author.id);

  if(!row) return;

  row.LastActive = formatDate(new Date());
  row.MessageCount = (parseInt(row.MessageCount)||0)+1;

  await row.save();

});

client.on("guildMemberRemove", async member=>{

  let stayed="-";

  if(joinTimes[member.id]){
    const seconds = Math.floor((Date.now()-joinTimes[member.id])/1000);
    stayed = `${seconds} sec`;
  }

  let flag="NO";
  let reason="-";

  if(stayed!=="-" && parseInt(stayed)<60){
    flag="YES";
    reason="Left under 60 seconds";
  }

  const age = accountAge(member.user.createdAt);

  await securitySheet.addRow({
    UserID:member.id,
    Event:"Leave",
    TimeStayed:stayed,
    AccountAge:age,
    Flag:flag,
    Reason:reason
  });

  if(flag==="YES"){
    const channel = await client.channels.fetch(ALERT_CHANNEL);

    channel.send(`⚠️ Security Flag
UserID: ${member.id}
TimeStayed: ${stayed}
AccountAge: ${age}
Reason: ${reason}`);
  }

});

client.login(process.env.DISCORD_TOKEN);
