const fs = require("fs");
const { fromArrayBuffer, SongInstrument } = require("@encode42/nbs.js"); // Import NBS.js
const chalk = require('chalk');
var mineflayer = require("mineflayer");
var parseSentence = require("minimist-string");
var block_mapper = require("./block_mapper.js")
var config = require("./config.json");
var instruments = require('./instruments_map.json');

module.exports.availableNoteblocks = {};

var options = {
    username: config.bot.username || "notebot",
    host: config.bot.host || "localhost",
    port: config.bot.port || 25565,
    version: config.bot.version || "1.20.1",
}

var bot = mineflayer.createBot(options);

bot.on("login", () => {
  bot.chat(`Mineflayer Notebot by @meeplabsdev on github`);
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

  if (config.commands_perms.includes(username)) {
    //handle(message, username);
    // only accept /tell
  }
});

bot.on("whisper", (username, message, rawMessage) => {
  if (config.commands_perms.includes(username)) {
    handle(message, username);
  }
});

bot.on("noteHeard", (block, instrument, pitch) => {
  //console.log(`Music for my ears! I just heard a ${instrument.name}`)
})

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
      detect()
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

        prettyRequirements(songReq);
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

        tune(songTune);
      }
      break;
    case "stop":
      respond(`Stopping`);
      clearInterval(module.exports.currentSong);
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

function tune(songBuffer) {
  let req = findRequirements(songBuffer);
  let blocks = detect_noteblocks();

  Object.keys(req).forEach(instrument_id => {
    let notes = req[instrument_id];
    notes.forEach(pitch => {
      // Find an available block for the instrument_id
      let availableBlocks = blocks[instrument_id];
      if (availableBlocks) {
        let blockToTune = availableBlocks.find(block => !block.isTuned);

        if (blockToTune) {
          // Tune the block to the requested pitch
          tuneNoteblock(blockToTune, pitch);

          // Mark the block as tuned to avoid re-tuning it
          blockToTune.isTuned = true;
        } else {
          respond(`No available block for instrument ${instrument_id} and pitch ${pitch}`, 1);
        }
      } else {
        respond(`No available block for instrument ${instrument_id} and pitch ${pitch}`, 1);
      }
    });
  });
}

function tuneNoteblock(block, pitch) {
  if(block == null) {
    return;
  }
	if(block.pitch == pitch) {
		return;
	}

  let play_times = 0;
  if (pitch - block.pitch < 0)
    play_times = 25-(block.pitch-pitch);
  else
    play_times = pitch-block.pitch;
  var timeouts = []
  for (i = 0; i < play_times; i++) {
    timeouts[i] = setTimeout(() => {
      bot._client.write('block_place', {
        location: block.position,
        direction: 1,
        hand: 0,
        cursorX: 0.5,
        cursorY: 0.5,
        cursorZ: 0.5
      });    
    }, config.settings.tune_speed*i);
  } 

  block.pitch = pitch;
}

function isTunedAndReady(songBuffer) {
  let goodToGo = true;

  let req = findNeededRequirements(songBuffer);
  Object.keys(req).forEach(instrument_id => {
    if (req[instrument_id].length > 0) goodToGo = false;
  })

  return goodToGo;
}

function play(songBuffer, speed) {
  if (module.exports.currentSong) {
    clearInterval(module.exports.currentSong);
  }

  if (isTunedAndReady(songBuffer)) {
    detect();
    var tick = 0
    module.exports.currentSong = setInterval(() => {
      runJob(songBuffer, tick);
      tick += 1;
    }, speed)
  } else {
    tune(songBuffer);
    setTimeout(() => {
      if(isTunedAndReady(songBuffer)) {
        play(songBuffer, speed);
      } else {
        prettyRequirements(songBuffer);
      }
    }, 3000)
  }
}

async function runJob(songBuffer, tick) {
  // Iterate each layer
  for (let currentLayer = 0; currentLayer < songBuffer.layers.length; currentLayer++) {
    const layer = songBuffer.layers[currentLayer];
    const note = layer.notes[tick];

    if (note) {
      let pitch = note.key - 33;
      play_note(note.instrument, pitch);
      //play_note(0, pitch);
    }
  }
}

function sleepSync(ms) {
  const startTime = Date.now();
  while (Date.now() - startTime < ms) {
    // Blocking the thread using a busy loop
  }
}

function findRequirements(songBuffer) {
  var needed = {};

  for (let currentLayer = 0; currentLayer < songBuffer.layers.length; currentLayer++) {
    const layer = songBuffer.layers[currentLayer];
    layer.notes.forEach(note => {
      if (note) {
        let pitch = (note.key - 33).toString();

        if(!(note.instrument in needed)) {
          needed[note.instrument] = [];
        }

        if (!needed[note.instrument].includes(pitch)) {
          needed[note.instrument].push(pitch);
        }
      }
    })
  }

  return needed;
}

function findNeededRequirements(songBuffer) {
  var needed = {};
  var myNoteblocks = {};

  let noteblocks = block_mapper.mapnoteblocks(bot);
  noteblocks.forEach(item => {
    let instrument_id = item.instrumentid;
    let pitch = item.pitch.toString();

    if(!(instrument_id in myNoteblocks)) {
      myNoteblocks[instrument_id] = [];
    }

    myNoteblocks[instrument_id].push(pitch);
  })


  for (let currentLayer = 0; currentLayer < songBuffer.layers.length; currentLayer++) {
    const layer = songBuffer.layers[currentLayer];
    layer.notes.forEach(note => {
      if (note) {
        let pitch = (note.key - 33).toString();

        if(!(note.instrument in needed)) {
          needed[note.instrument] = [];
        }

        if(!(note.instrument in myNoteblocks)) {
          myNoteblocks[note.instrument] = [];
        }

        if (!needed[note.instrument].includes(pitch) && !myNoteblocks[note.instrument].includes(pitch)) {
          needed[note.instrument].push(pitch);
        }
      }
    })
  }

  return needed;
}

function prettyRequirements(songBuffer) {
  var needed = {};
  var myNoteblocks = {};

  let noteblocks = block_mapper.mapnoteblocks(bot);
  noteblocks.forEach(item => {
    let instrument_id = item.instrumentid;
    let pitch = item.pitch.toString();

    if(!(instrument_id in myNoteblocks)) {
      myNoteblocks[instrument_id] = [];
    }

    myNoteblocks[instrument_id].push(pitch);
  })


  for (let currentLayer = 0; currentLayer < songBuffer.layers.length; currentLayer++) {
    const layer = songBuffer.layers[currentLayer];
    layer.notes.forEach(note => {
      if (note) {
        let pitch = (note.key - 33).toString();

        if(!(note.instrument in needed)) {
          needed[note.instrument] = [];
        }

        if(!(note.instrument in myNoteblocks)) {
          myNoteblocks[note.instrument] = [];
        }

        if (!needed[note.instrument].includes(pitch) && !myNoteblocks[note.instrument].includes(pitch)) {
          needed[note.instrument].push(pitch);
        }
      }
    })
  }

  let list = "Add the following note blocks:\n";
  Object.keys(needed).forEach(instrument => {
    list += `${instruments.blocks[instrument].toUpperCase()} x${twoNum(needed[instrument.toString()].length)} \n`;
  })

  respond(list, 1);
}

function twoNum(num) {
  if (num > 9) {
    return num.toString();
  } else {
    return `0${num.toString()}`;
  }
}

function detect_noteblocks() {
  let myNoteblocks = {};
  let noteblocks = block_mapper.mapnoteblocks(bot);

  noteblocks.forEach(item => {
    let instrument_id = item.instrumentid;
    let pitch = item.pitch;
    let position = item.position;

    if(!(instrument_id in myNoteblocks)) {
      myNoteblocks[instrument_id] = [];
    }

    let info = { position: position, pitch: pitch };
    myNoteblocks[instrument_id].push(info);
  })

  return myNoteblocks;
}

function detect() {
  respond(`Detecting Nearby Noteblocks`);
  module.exports.availableNoteblocks = detect_noteblocks();

  let numDetected = 0;
  let values = Object.keys(module.exports.availableNoteblocks).map(function(key){ return module.exports.availableNoteblocks[key]; });
  values.forEach(instrument => {
    numDetected += instrument.length;
  })

  respond(`Found ${numDetected}!`)
}

function play_note(instrument_id, pitch) {
  //detect();

  if(instrument_id in module.exports.availableNoteblocks) {
    let target = null;
    let blocks = module.exports.availableNoteblocks[instrument_id.toString()];
    blocks.forEach(block => {
      if (block.pitch.toString() == pitch.toString()) {
        target = block;
      }
    })
    if (target != null) { 
      play_note_by_block(target);
      respond(`Playing ${pitch} on ${instrument_id}`);
    } else {
      respond(`Pitch ${pitch} not available for instrument ${instrument_id}. (${instruments.blocks[instrument_id.toString()]})`, 1);
      clearInterval(module.exports.currentSong);
    }
    return;
  } else {
    respond(`Instrument ${instrument_id} not available. (${instruments.blocks[instrument_id.toString()]})`, 1);
    return;
  }
}

function play_note_by_block(block) {
  let position = block.position;
  bot.lookAt(position, true)
  //let updatedblock = bot.blockAt(position, extraInfos=true)

  bot._client.write('block_dig', {
    status: 0,
    location: position,
    face: 1
  });
  bot._client.write('block_dig', {
    status: 1,
    location: position,
    face: 1
  });
}

module.exports.getBot = () => {
	return bot;
}