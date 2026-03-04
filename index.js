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

let securitySheet;

const joinTimes = new Map();
const joinLeaveHistory = new Map();
let recentJoins = [];

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

  const doc = new GoogleSpreadsheet(process.env.SHEET_ID);

  await doc.useServiceAccountAuth({
    client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g,"\n")
  });

  await doc.loadInfo();

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

  const guild = client.guilds.cache.first();
  await guild.members.fetch();

  guild.members.cache.forEach(member => {
    joinTimes.set(member.id, member.joinedAt.getTime());
  });

  console.log("Security bot ready");

});

client.on("guildMemberAdd", async member=>{

  joinTimes.set(member.id, Date.now());

  const age = accountAge(member.user.createdAt);

  let flag="NO";
  let reason="-";

  const ageDays = (Date.now()-member.user.createdAt)/(1000*60*60*24);

  if(ageDays < 30){
    flag="YES";
    reason="Very new account";
  }

  recentJoins.push(Date.now());
  recentJoins = recentJoins.filter(t => Date.now()-t < 60000);

  if(recentJoins.length >= 5){
    flag="YES";
    reason="Raid-type join pattern";
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

  const joinTime = joinTimes.get(member.id);

  let stayed="-";
  let flag="NO";
  let reason="-";

  if(joinTime){

    const sec = Math.floor((Date.now()-joinTime)/1000);
    stayed=`${sec} sec`;

    if(sec < 60){
      flag="YES";
      reason="Left under 60 seconds";
    }

    let history = joinLeaveHistory.get(member.id) || [];
    history.push(Date.now());

    history = history.filter(t => Date.now()-t < 600000);

    if(history.length >= 3){
      flag="YES";
      reason="Join/leave scouting pattern";
    }

    joinLeaveHistory.set(member.id, history);

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
