const fs = require("fs");
const { fromArrayBuffer, SongInstrument } = require("@encode42/nbs.js"); // Import NBS.js
const chalk = require('chalk');
var mineflayer = require("mineflayer");
var parseSentence = require("minimist-string");
var block_mapper = require("./block_mapper.js")
var config = require("./config.json");
var instruments = require('./instruments_map.json');

class NoteBot {
  constructor(username) {
    this.options = {
      username: username,
      host: config.bot.host || "localhost",
      port: config.bot.port || 25565,
      version: config.bot.version || "1.20.1",
    }
    this.bot = mineflayer.createBot(this.options);
    this.availableNoteblocks = {};

    this.bot.on("login", () => {
      this.respond(this.options.username + " ONLINE");
    });

    this.bot.on("kicked", (reason) => {
      this.respond(`I got kicked for ${reason}`, 2)
      this.respond(`Rage Quitting`, 2)
    })

    this.bot.on("chat", (username, message) => {
      if (username == this.options.username) {
        this.respond(message)
      }
    });

    this.bot.on("whisper", (username, message, rawMessage) => {
      if (config.commands_perms.includes(username)) {
        this.handle(message, username);
      }
    });
  }

  respond(message, level = 0) {
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
    // if (level >= 1) {
    //   beep();
    // }
  }

  beep() {
    require("child_process").exec("powershell.exe [console]::beep(500,600)");
  }

  handle(command, username) {
    var cmd = command.substring(1);
    cmd = parseSentence(cmd);
    delete cmd["_"]

    switch(Object.keys(cmd)[0]) {
      case "detect":
        this.detect()
        break;
      case "play":
        this.respond(`Playing ${cmd.play}`);
        if (!this.isValidFile(cmd.play)) {
          this.respond(`${cmd.play} is not a valid file!`, 1);
        } else {
          let songFile = fs.readFileSync("songs/" + cmd.play); // Read a NBS file
          let buffer = new Uint8Array(songFile).buffer; // Create an ArrayBuffer
          let song = fromArrayBuffer(buffer); // Parse song from ArrayBuffer

          this.play(song, cmd.speed || 100);
        }
        break;
      case "setup":
        if (!this.isValidFile(cmd.setup)) {
          this.respond(`${cmd.setup} is not a valid file!`, 1);
        } else {
          let songFileReq = fs.readFileSync("songs/" + cmd.setup); // Read a NBS file
          let bufferReq = new Uint8Array(songFileReq).buffer; // Create an ArrayBuffer
          let songReq = fromArrayBuffer(bufferReq); // Parse song from ArrayBuffer

          this.prettyRequirements(songReq);
        }
        break;
      case "tune":
        this.respond(`Tuning to ${cmd.tune}`);
        if (!this.isValidFile(cmd.tune)) {
          this.respond(`${cmd.tune} is not a valid file!`, 1);
        } else {
          let songFileTune = fs.readFileSync("songs/" + cmd.tune); // Read a NBS file
          let bufferTune = new Uint8Array(songFileTune).buffer; // Create an ArrayBuffer
          let songTune = fromArrayBuffer(bufferTune); // Parse song from ArrayBuffer

          this.tune(songTune);
        }
        break;
      case "stop":
        this.respond(`Stopping`);
        clearInterval(this.currentSong);
        break;
    }
  }

  stop() {
    clearInterval(this.currentSong);
  }

  isValidFile(name) {
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

  tune(songBuffer) {
    let req = this.findRequirements(songBuffer);
    let blocks = this.detect_noteblocks();

    Object.keys(req).forEach(instrument_id => {
      let notes = req[instrument_id];
      notes.forEach(pitch => {
        // Find an available block for the instrument_id
        let availableBlocks = blocks[instrument_id];
        if (availableBlocks) {
          let blockToTune = availableBlocks.find(block => !block.isTuned);

          if (blockToTune) {
            // Tune the block to the requested pitch
            this.tuneNoteblock(blockToTune, pitch);

            // Mark the block as tuned to avoid re-tuning it
            blockToTune.isTuned = true;
          } else {
            this.respond(`No available block for instrument ${instrument_id} and pitch ${pitch}`, 1);
          }
        } else {
          this.respond(`No available block for instrument ${instrument_id} and pitch ${pitch}`, 1);
        }
      });
    });
  }

 tuneNoteblock(block, pitch) {
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
        this.bot._client.write('block_place', {
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

  isTunedAndReady(songBuffer) {
    let goodToGo = true;

    let req = this.findNeededRequirements(songBuffer);
    Object.keys(req).forEach(instrument_id => {
      if (req[instrument_id].length > 0) goodToGo = false;
    })

    return goodToGo;
  }

  play(songBuffer, speed) {
    if (this.currentSong) {
      clearInterval(this.currentSong);
    }

    if (this.isTunedAndReady(songBuffer)) {
      this.detect();
      var tick = 0
      this.currentSong = setInterval(() => {
        this.runJob(songBuffer, tick);
        tick += 1;
      }, speed)
    } else {
      this.tune(songBuffer);
      setTimeout(() => {
        if(this.isTunedAndReady(songBuffer)) {
          this.play(songBuffer, speed);
        } else {
          this.prettyRequirements(songBuffer);
        }
      }, 3000)
    }
  }

  async runJob(songBuffer, tick) {
    // Iterate each layer
    for (let currentLayer = 0; currentLayer < songBuffer.layers.length; currentLayer++) {
      const layer = songBuffer.layers[currentLayer];
      const note = layer.notes[tick];

      if (note) {
        let pitch = note.key - 33;
        this.play_note(note.instrument, pitch);
        //play_note(0, pitch);
      }
    }
  }

  findRequirements(songBuffer) {
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

  findNeededRequirements(songBuffer) {
    var needed = {};
    var myNoteblocks = {};

    let noteblocks = block_mapper.mapnoteblocks(this.bot);
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

  prettyRequirements(songBuffer) {
    var needed = {};
    var myNoteblocks = {};

    let noteblocks = block_mapper.mapnoteblocks(this.bot);
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
      list += `${instruments.blocks[instrument].toUpperCase()} x${this.twoNum(needed[instrument.toString()].length)} \n`;
    })

    this.respond(list, 1);
  }

  twoNum(num) {
    if (num > 9) {
      return num.toString();
    } else {
      return `0${num.toString()}`;
    }
  }

  detect_noteblocks() {
    let myNoteblocks = {};
    let noteblocks = block_mapper.mapnoteblocks(this.bot);

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

  detect() {
    this.respond(`Detecting Nearby Noteblocks`);
    this.availableNoteblocks = this.detect_noteblocks();

    let numDetected = 0;
    let values = Object.keys(this.availableNoteblocks).map((key) => { return this.availableNoteblocks[key]; });
    values.forEach(instrument => {
      numDetected += instrument.length;
    })

    this.respond(`Found ${numDetected}!`)
  }

  play_note(instrument_id, pitch) {
    //detect();

    if(instrument_id in this.availableNoteblocks) {
      let target = null;
      let blocks = this.availableNoteblocks[instrument_id.toString()];
      blocks.forEach(block => {
        if (block.pitch.toString() == pitch.toString()) {
          target = block;
        }
      })
      if (target != null) { 
        this.play_note_by_block(target);
        //this.respond(`Playing ${pitch} on ${instrument_id}`);
      } else {
        this.respond(`Pitch ${pitch} not available for instrument ${instrument_id}. (${instruments.blocks[instrument_id.toString()]})`, 1);
        clearInterval(this.currentSong);
      }
      return;
    } else {
      this.respond(`Instrument ${instrument_id} not available. (${instruments.blocks[instrument_id.toString()]})`, 1);
      return;
    }
  }

  play_note_by_block(block) {
    let position = block.position;
    this.bot.lookAt(position, true)
    //let updatedblock = this.bot.blockAt(position, extraInfos=true)

    this.bot._client.write('block_dig', {
      status: 0,
      location: position,
      face: 1
    });
    this.bot._client.write('block_dig', {
      status: 1,
      location: position,
      face: 1
    });
  }
}

module.exports.NoteBot = NoteBot;