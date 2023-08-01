# MineflayerNotebot
A notebot to play .nbs files using mineflayer
## Authors

- [@meeplabsdev](https://www.github.com/meeplabsdev)
## Usage/Examples

Multiple Accounts (defaults to 4 players + one leader account)
```cmd
node index.js
```
Change the `const numWorkers` in index.js to change the number of accounts that play.

`node single.js` can also be used to run a single client that handles leading and playing.

Once in the game, run the following chat commands to use the bot:

`/tell notebot @notebot --setup songName` where songName is the name of the song in the `/songs` folder (excluding the .nbs extension).

This will tell you what note blocks to place around the notebot. I have found that it helps to stand as close as you can to the notebot to place the note blocks as you will have a better idea of the range that the bot can reach.

When all the note blocks have been placed run 
`/tell notebot @notebot --play songName`. It will attempt to auto-tune the note blocks but may fail. In this case run `/tell notebot @notebot --tune songName` to manually initiate a tune.

If the bot is not detecting the note blocks, you can also use `/tell notebot @notebot --detect` to find them.
## Logging

Debug messages are GREEN.
Info messages are BLUE.
Warning messages are YELLOW.
Error messages are RED.

Warning and error messages will produce a beep when logged to get you attention because the bot will not use chat due to players becoming annoyed at the chat messages and the bot being kicked for spam.

Most messages are self-explanatory.

