const { Client, GatewayIntentBits } = require('discord.js');
const { GoogleSpreadsheet } = require('google-spreadsheet');
require('dotenv').config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers
  ]
});

const ALERT_CHANNEL = "1477132090456936530";

let membersSheet;
let securitySheet;
let doc;

function accountAge(created) {

  const diff = Date.now() - created.getTime();

  const hours = Math.floor(diff / (1000*60*60));
  const days = Math.floor(hours/24);
  const months = Math.floor(days/30);
  const years = Math.floor(days/365);

  if (years >= 1) return `${years} years`;
  if (months >= 1) return `${months} months`;
  if (days >= 1) return `${days} days`;
  return `${hours} hours`;
}

async function setupSheets(){

  doc = new GoogleSpreadsheet(process.env.SHEET_ID);

  await doc.useServiceAccountAuth({
    client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g,"\n")
  });

  await doc.loadInfo();

  membersSheet = doc.sheetsByIndex[0];

  if(doc.sheetsByIndex[1]){
    securitySheet = doc.sheetsByIndex[1];
  } else {
    securitySheet = await doc.addSheet({
      title: "SecurityLogs",
      headerValues:["UserID","Event","TimeStayed","AccountAge","Flag","Reason"]
    });
  }

}

async function logEvent(data){

  await securitySheet.addRow(data);

  if(data.Flag === "YES"){

    const channel = await client.channels.fetch(ALERT_CHANNEL);

    channel.send(`⚠️ Security Flag

UserID: ${data.UserID}
Event: ${data.Event}
TimeStayed: ${data.TimeStayed}
AccountAge: ${data.AccountAge}
Reason: ${data.Reason}`);

  }

}

client.once("ready", async ()=>{

  await setupSheets();

  console.log("Security bot ready");

});

client.on("guildMemberAdd", async member=>{

  const age = accountAge(member.user.createdAt);

  let flag="NO";
  let reason="-";

  const ageDays = (Date.now()-member.user.createdAt)/(1000*60*60*24);

  if(ageDays < 30){
    flag="YES";
    reason="Very new account";
  }

  await logEvent({
    UserID:member.id,
    Event:"Join",
    TimeStayed:"-",
    AccountAge:age,
    Flag:flag,
    Reason:reason
  });

});

client.on("guildMemberRemove", async member=>{

  const rows = await membersSheet.getRows();

  const row = rows.find(r => String(r.UserID) === String(member.id));

  let stayed="-";

  if(row && row.JoinDate){

    const joinDate = new Date(row.JoinDate);
    const seconds = Math.floor((Date.now()-joinDate)/1000);

    stayed = `${seconds} sec`;

  }

  let flag="NO";
  let reason="-";

  if(stayed !== "-" && parseInt(stayed) < 60){
    flag="YES";
    reason="Left under 60 seconds";
  }

  const age = accountAge(member.user.createdAt);

  await logEvent({
    UserID:member.id,
    Event:"Leave",
    TimeStayed:stayed,
    AccountAge:age,
    Flag:flag,
    Reason:reason
  });

});

client.login(process.env.DISCORD_TOKEN);
