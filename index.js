const fs = require("fs");
const { fromArrayBuffer } = require("@encode42/nbs.js"); // Import NBS.js
const chalk = require('chalk');
var mineflayer = require("mineflayer");
var parseSentence = require("minimist-string");
var config = require("./config.json");
var nb = require("./multi.js");

const numWorkers = 4;
module.exports.currentSong = null;

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
  respond(`I got kicked for ${reason}`, 2)
  respond(`Rage Quitting`, 2)
  process.exit();
})

bot.on("chat", (username, message) => {
  if (username == options.username) {
    respond(message)
  }
});

bot.on("whisper", (username, message, rawMessage) => {
  if (config.commands_perms.includes(username)) {
    handle(message, username);
  }
});

function respond(message, level = 0) {
  let mes = message;
  switch (level) {
    case -1:
      mes = chalk.green("[DEBUG] " + message); // debug
      break;
    case 0:
      mes = chalk.blue("[INFO]  " + message); // info
      break;
    case 1:
      mes = chalk.yellow("[WARN]  " + message); // warning
      break;
    case 2:
      mes = chalk.red("[ERROR] " + message); // error
      break;
  }
  console.log(mes);
  if (level >= 1) {
    beep();
  }
}

function beep() {
  require("child_process").exec("powershell.exe [console]::beep(500,600)");
}

function handle(command, username) {
  if(!command.startsWith(config.settings.command_prefix + options.username)) return false;
  var cmd = command.substring(1);
  cmd = parseSentence(cmd);
  delete cmd["_"]

  switch(Object.keys(cmd)[0]) {
    case "detect":
      workers.forEach(async worker => {
        setTimeout(() => { worker.detect(); }, 100);
      })
      break;
    case "play":
      respond(`Playing ${cmd.play}`);
      if (!isValidFile(cmd.play)) {
        respond(`${cmd.play} is not a valid file!`, 1);
      } else {
        let songFile = fs.readFileSync("songs/" + cmd.play); // Read a NBS file
        let buffer = new Uint8Array(songFile).buffer; // Create an ArrayBuffer
        let song = fromArrayBuffer(buffer); // Parse song from ArrayBuffer

        play(song, cmd.speed || 100);
      }
      break;
    case "setup":
      if (!isValidFile(cmd.setup)) {
        respond(`${cmd.setup} is not a valid file!`, 1);
      } else {
        let songFileReq = fs.readFileSync("songs/" + cmd.setup); // Read a NBS file
        let bufferReq = new Uint8Array(songFileReq).buffer; // Create an ArrayBuffer
        let songReq = fromArrayBuffer(bufferReq); // Parse song from ArrayBuffer

        workers.forEach(async worker => {
          setTimeout(() => { worker.handle(command, username); }, 500);
        })
      }
      break;
    case "tune":
      respond(`Tuning to ${cmd.tune}`);
      if (!isValidFile(cmd.tune)) {
        respond(`${cmd.tune} is not a valid file!`, 1);
      } else {
        let songFileTune = fs.readFileSync("songs/" + cmd.tune); // Read a NBS file
        let bufferTune = new Uint8Array(songFileTune).buffer; // Create an ArrayBuffer
        let songTune = fromArrayBuffer(bufferTune); // Parse song from ArrayBuffer

        workers.forEach(async worker => {
          setTimeout(() => { worker.handle(command, username); }, 500);
        })
      }
      break;
    case "stop":
      respond(`Stopping`);
      stop()
      break;
  }
}

function isValidFile(name) {
  try {
    if (fs.existsSync("songs/" + name)) {
      return true;
    } else {
      return false;
    }
  } catch(err) {
    return false;
  }
}

function stop() {
  clearInterval(module.exports.currentSong);
}

function play(songBuffer, speed) {
  stop();

  let ready = true;
  workers.forEach(worker => {
    if (!worker.isTunedAndReady(songBuffer)) ready = false;
  })

  if (ready) {
  
    workers.forEach(async worker => {
      worker.detect();
    })

    var tick = 0
    module.exports.currentSong = setInterval(() => {
      runJob(songBuffer, tick);
      tick += 1;
    }, speed)

  } else {

    workers.forEach(worker => {
      worker.tune(songBuffer);
      respond("Worker " + worker.options.username + ":", 2);
      worker.prettyRequirements(songBuffer);
    })

  }
}

async function runJob(songBuffer, tick) {
  // Iterate each layer
  for (let currentLayer = 0; currentLayer < songBuffer.layers.length; currentLayer++) {
    const layer = songBuffer.layers[currentLayer];
    const note = layer.notes[tick];

    if (note) {
      let pitch = note.key - 33;
      workers.forEach(async worker => {
        worker.play_note(note.instrument, pitch);
      })
    }
  }
}

function twoNum(num) {
  if (num > 9) {
    return num.toString();
  } else {
    return `0${num.toString()}`;
  }
}

module.exports.getBot = () => {
	return bot;
}