var mineflayer = require("mineflayer");
var config = require("./config.json");
var nb = require("./multi.js");

const numWorkers = 2;

var options = {
    username: config.bot.username || "notebot",
    host: config.bot.host || "localhost",
    port: config.bot.port || 25565,
    version: config.bot.version || "1.20.1",
}

var bot = mineflayer.createBot(options);
var workers = [];

bot.on("login", () => {
  bot.chat(`Mineflayer Notebot by @meeplabsdev on github`);

  for (i = 1; i <= numWorkers; i++) {
    let username = `notebot_worker${twoNum(i)}`;
    workers.push(new nb.NoteBot(username));
  }
});

bot.on("kicked", (reason) => {
  console.log(`I got kicked for ${reason}`, 2)
  console.log(`Rage Quitting`, 2)
  process.exit();
})

bot.on("whisper", (username, message, rawMessage) => {
  if (config.commands_perms.includes(username)) {
    handleWorkers(username, message);
  }
});

async function handleWorkers(username, message) {
  workers.forEach(async worker => {
    setTimeout(() => { worker.handle(message, username); }, 500);
  })
}

function twoNum(num) {
  if (num > 9) {
    return num.toString();
  } else {
    return `0${num.toString()}`;
  }
}