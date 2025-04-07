const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Serve static files (HTML, JS, CSS)
app.use(express.static(path.join(__dirname, "public")));

const MAX_PLAYERS_PER_ROOM = 4;
const MAX_ROOMS = 50; // Maximum number of rooms allowed
let rooms = {}; // Stores room data: {room_id: {players: [player_ids], ready_count: int, head: player_id}}
let players = {}; // Stores player data: {player_id: {name: string, room_id: string, ready: boolean, character: string}}
let availableRoomIds = Array.from({ length: MAX_ROOMS }, (_, i) => i + 1); // Pool of available room IDs
let gameState = {}; // Stores game state: {room_id: {aliens: [{id: string, word: string, position: {x: number, y: number}, speed: int}], 
// waveNumber: int, waveStarted: boolean, alienSpawned: int, alienDestroyed: int, gameOver: boolean}}
// health: int, shield: int,
const magics = ["/reduce", "/binary", "/security", "/absorb", "/heal", "/regen", "/push", "/teleport", "/reshuffle", "/freeze", "/slow", "/fork", "/purge"];
const availableCharacters = ["Nulla", "Jacky", "Pewya", "Nutty", "Yoda", "Arthur", "Power", "Tuxedo"];

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'client.html')); // Serve the HTML file
});

io.on('connection', (socket) => {
    const playerId = socket.id;
    players[playerId] = { name: "", room_id: null, ready: false , character: "Nulla", cooldown: null }; // Initialize player data
    console.log(`Player ${playerId} connected.`);

    socket.on('set_name', (data) => {
        if (players[playerId].name === "") {
        players[playerId].name = data.name;
        socket.emit('name_set', { name: data.name });
        }
        else {
            socket.emit('error', { message: 'You already have a name!' });
        }
    });

    socket.on('change_character', (character) => {
        const roomId = players[playerId].room_id
        if (gameState[roomId]) {
            socket.emit('error', { message: "You can't change character mid-game" });
            return;
        }
        if (!(availableCharacters.includes(character))) {
            socket.emit('error', { message: "Incorrect character value. Are you trying to mess with front-end functions?" });
            return;
        }
        players[playerId].character = character;
        io.to(roomId).emit('character_changed', { id : playerId, character : character});
    });

    socket.on('get_rooms', () => {
        updateRoomList();
    });

    socket.on('create_room', () => {
        if (players[playerId].room_id) {
            socket.emit('error', { message: 'You are already in a room.' });
            return;
        }

        if (availableRoomIds.length === 0) {
            socket.emit('error', { message: 'No more rooms available.' });
            return;
        }

        // Assign the smallest available room ID
        const roomId = `Room ${availableRoomIds.shift()}`;
        rooms[roomId] = { players: [playerId], ready_count: 0, head: playerId, game_in_progress: false }; // Set the room creator as the head
        players[playerId].room_id = roomId;

        socket.join(roomId);
        console.log(`✅ Player ${playerId} created and joined ${roomId}.`);

        updateRoomList();

        socket.emit('joined_room', roomId);
        updatePlayerList(roomId); // Send updated player list to the room
    });

    socket.on('join_room', (data) => {
        if (players[playerId].room_id) {
            socket.emit('error', { message: 'You are already in a room.' });
            return;
        }

        const roomId = data.room_id;
        if (!rooms[roomId]) {
            socket.emit('error', { message: 'Room does not exist.' });
            return;
        }

        if (rooms[roomId].players.length >= MAX_PLAYERS_PER_ROOM) {
            socket.emit('error', { message: 'Room is full.' });
            return;
        }

        // Prevent joining if the game is in progress
        if (rooms[roomId].game_in_progress) {
            socket.emit('error', { message: 'This room is currently in-game.' });
            return;
        }

        rooms[roomId].players.push(playerId);
        players[playerId].room_id = roomId;

        socket.join(roomId);
        console.log(`✅ Player ${playerId} joined ${roomId}.`);

        updateRoomList();

        socket.emit('joined_room', roomId);
        updatePlayerList(roomId); // Send updated player list to the room
    });

    socket.on('exit_room', () => {
        const roomId = players[playerId].room_id;

        if (!roomId) {
            socket.emit('error', { message: 'You are not in a room.' });
            return;
        }
        if (gameState[roomId]) {
            socket.emit('error', { message: 'You are currently playing.' });
            return;
        }

        if (rooms[roomId]) {
            rooms[roomId].players = rooms[roomId].players.filter(id => id !== playerId);
            if (players[playerId].ready) {
                rooms[roomId].ready_count -= 1; // Decrement ready count if player was ready
            }

            // If the head leaves, assign a new head (the next player in the room)
            if (rooms[roomId].head === playerId && rooms[roomId].players.length > 0) {
                const newHead = rooms[roomId].players[0];
                rooms[roomId].head = newHead;

                // Reset the new head's ready state
                if (players[newHead].ready) {
                    players[newHead].ready = false;
                    rooms[roomId].ready_count -= 1;
                }
            }

            socket.leave(roomId);

            console.log(`🚪 Player ${playerId} exited ${roomId}.`);

            if (rooms[roomId].players.length === 0) { // Delete room if empty
                delete rooms[roomId];
                // Return the room ID to the pool
                const roomNumber = parseInt(roomId.split(' ')[1]);
                // console.log("returning room " + roomNumber);
                availableRoomIds.push(roomNumber);
                availableRoomIds.sort((a, b) => a - b); // Keep the pool sorted
            }
        }

        // Reset player's room and ready status
        players[playerId].room_id = null;
        players[playerId].ready = false;

        // io.emit('room_list', Object.fromEntries(Object.entries(rooms).map(([id, room]) => [id, room.players.length])));
        updateRoomList();

        socket.emit('exited_room');
        if (rooms[roomId]) {
            updatePlayerList(roomId); // Send updated player list to the room
        }
    });

    socket.on('kick_player', (data) => {
        const roomId = players[playerId].room_id;
        const targetPlayerId = data.target_player_id;
    
        console.log(`Player ${playerId} is trying to kick ${targetPlayerId} from ${roomId}.`);
    
        if (!roomId) {
            socket.emit('error', { message: 'You are not in a room.' });
            return;
        }
    
        // Only the head can kick players
        if (rooms[roomId].head !== playerId) {
            socket.emit('error', { message: 'Only the room head can kick players.' });
            return;
        }
    
        // Cannot kick yourself
        if (targetPlayerId === playerId) {
            socket.emit('error', { message: 'You cannot kick yourself.' });
            return;
        }
    
        // Remove the target player from the room
        if (rooms[roomId].players.includes(targetPlayerId)) {
            rooms[roomId].players = rooms[roomId].players.filter(id => id !== targetPlayerId);
            players[targetPlayerId].room_id = null;

            // Update ready_count -1 if the kicked player is ready
            if (players[targetPlayerId].ready) {
                console.log('update ready count from ' + rooms[roomId].ready_count)
                rooms[roomId].ready_count -= 1;
            }

            players[targetPlayerId].ready = false;
    
            // Notify the kicked player
            io.to(targetPlayerId).emit('kicked_from_room');

            // By Deepseek
            // Force the kicked player to leave the room
            const targetSocket = io.sockets.sockets.get(targetPlayerId); // Get the kicked player's socket
            if (targetSocket) {
                targetSocket.leave(roomId); // Make the kicked player leave the room
                console.log(`🚪 Player ${targetPlayerId} was kicked from ${roomId}.`);
            } else {
                console.error(`Player ${targetPlayerId} not found in sockets.`);
            }
    
            updateRoomList();
            updatePlayerList(roomId); // Ensure the player list is updated for all clients in the room
        } else {
            socket.emit('error', { message: 'Player not found in the room.' });
        }

    });

    socket.on('player_ready', () => {
        const roomId = players[playerId].room_id;

        if (!roomId) {
            socket.emit('error', { message: 'You are not in a room.' });
            return;
        }
        if (rooms[roomId].players.length === 1) {
            socket.emit('error', { message: "Please don't mess with front-end functions" });
            return;
        }

        // Toggle the player's ready state
        players[playerId].ready = !players[playerId].ready;

        // Update the room's ready count
        if (players[playerId].ready) {
            rooms[roomId].ready_count += 1;
        } else {
            rooms[roomId].ready_count -= 1;
        }

        console.log(`🎮 Player ${playerId} is ${players[playerId].ready ? 'ready' : 'not ready'} in ${roomId}.`);

        // Send the updated player list to the room
        updatePlayerList(roomId);
    });

    socket.on('start_game', () => {
        const roomId = players[playerId].room_id;

        if (!roomId) {
            socket.emit('error', { message: 'You are not in a room.' });
            return;
        }

        // Only the head can start the game
        if (rooms[roomId].head !== playerId) {
            socket.emit('error', { message: 'Only the room head can start the game.' });
            return;
        }

        // If game is on-going, disallow start
        if (rooms[roomId].game_in_progress) {
            socket.emit('error', { message: 'You are already in-game.' });
            return;
        }

        // Check if all players are ready or if the head is alone
        if (rooms[roomId].ready_count === rooms[roomId].players.length - 1 || rooms[roomId].players.length === 1) {
            
            // Mark all players as ready (including the head)
            for (const pId of rooms[roomId].players) {
                if (!players[pId].ready) {
                    players[pId].ready = true;
                    rooms[roomId].ready_count += 1;
                }
            }

            // Mark the room as in-game
            rooms[roomId].game_in_progress = true;

            updatePlayerList(roomId); // Update the player list to reflect all players as ready
            updateRoomList(); // Update room list to trigger in-progress room visibility

            // Initialize game state
            gameState[roomId] = {
                aliens: [],
                waveNumber: 1, // Initialize waveNumber to 1
                waveStarted: false,
                gameOver: false,
                aliensSpawned: 0, // Track aliens spawned in the current wave
                aliensDestroyed: 0, // Track aliens destroyed in the current wave
                health: 100,
                shield: 0,
                absorbActive: false,
                regenAmount: 0,
            };

            // Start the game loop
            startGameLoop(roomId);

            io.to(roomId).emit('game_started', rooms[roomId]);
            io.emit('request_client_color_input_change', 0)

            const characterList = rooms[roomId].players.map(playerId => ({
                id: playerId,
                character: players[playerId].character
            }));
            io.to(roomId).emit('update_player_characters', characterList);

            console.log(`🚀 Game started in ${roomId}`);
        
        } else {
            socket.emit('error', { message: 'Not all players are ready.' });
        }
    });

    socket.on('request_server_color_input_change', (data) => {
        socket.emit("color_input_cooldown", players[playerId].character);
    });

    // Handle word submission
    socket.on("submit_word", (data) => {
        const playerId = socket.id;
        const roomId = players[playerId]?.room_id;
        const word = data.word.toLowerCase();
    
        if (!roomId || !gameState[roomId]) return;

        // If it's a special command... and check validity
        if (word[0] == "/") {
            handleMagicWord(playerId, roomId, word);
            return;
        }
    
        // Find the lowest alien with the matching word
        let targetAlien = null;
        gameState[roomId].aliens.forEach(alien => {
            if (alien.word.toLowerCase() === word) {
                if (!targetAlien || alien.position.y > targetAlien.position.y) {
                    targetAlien = alien;
                }
            }
        });
    
        // Check if the word is correct
        const isCorrect = !!targetAlien;

        // Broadcast the result to all players in the room
        io.to(roomId).emit("word_submitted", {
            playerId: playerId,
            word: word,
            isCorrect: isCorrect,
            alienId: targetAlien?.id,
            character: players[playerId].character,
            drawLaser: true
        });
    
        // Destroy the alien if the word is correct
        if (targetAlien) {
            gameState[roomId].aliens = gameState[roomId].aliens.filter(alien => alien.id !== targetAlien.id);
            io.to(roomId).emit("alien_destroyed", targetAlien.id);
            console.log(targetAlien.id);
    
            // Update the number of aliens destroyed for the current wave
            gameState[roomId].aliensDestroyed += 1;
            console.log(gameState[roomId].aliensDestroyed)
            
            // Check if the current wave is complete
            if (
                gameState[roomId].aliensSpawned === gameState[roomId].totalAliens && // All aliens spawned
                gameState[roomId].aliensDestroyed === gameState[roomId].totalAliens // All aliens destroyed
            ) {
                // Safely increment the wave number
                if (typeof gameState[roomId].waveNumber === 'number') {
                    gameState[roomId].waveNumber += 1;
                } else {
                    gameState[roomId].waveNumber = 1; // Fallback to Wave 1 if waveNumber is invalid
                }
    
                // Start the next wave
                startWave(roomId, gameState[roomId].waveNumber);
            }
        }
    });

    socket.on('return_to_lobby', () => {
        const roomId = players[playerId].room_id;
    
        if (!roomId) {
            socket.emit('error', { message: 'You are not in a room.' });
            return;
        }

        if (gameState[roomId]) {
            socket.emit('error', { message: 'You are currently playing.' });
            return;
        }

        // Notify the player to return to the lobby
        socket.emit('returned_to_lobby');

        // Delete the room if it is empty
        if (rooms[roomId].players.length === 1) {
            // Return the room ID to the pool
            const roomNumber = parseInt(roomId.split(' ')[1]);
            availableRoomIds.push(roomNumber);
            availableRoomIds.sort((a, b) => a - b); // Keep the pool sorted
            
            // Delete the room
            delete rooms[roomId];
            delete gameState[roomId];

            socket.leave(roomId);
    
            console.log(`Room ${roomId} deleted and all players returned to lobby.`);
        }

    });

    socket.on('disconnect', () => {
        const roomId = players[playerId].room_id;

        if (roomId) {
            if (rooms[roomId]) {
                rooms[roomId].players = rooms[roomId].players.filter(id => id !== playerId);
                if (players[playerId].ready) {
                    rooms[roomId].ready_count -= 1;
                }

                // If the head disconnects, assign a new head
                if (rooms[roomId].head === playerId && rooms[roomId].players.length > 0) {
                    rooms[roomId].head = rooms[roomId].players[0];
                }

                // If all players have disconnected, clean up the room
                if (rooms[roomId].players.length === 0) {
                    // Stop the game loop for this room
                    if (gameState[roomId] && gameState[roomId].gameLoop) {
                        clearInterval(gameState[roomId].gameLoop);
                    }

                    // Delete the room and game state
                    delete rooms[roomId];
                    delete gameState[roomId];

                    // Return the room ID to the pool
                    const roomNumber = parseInt(roomId.split(' ')[1]);
                    availableRoomIds.push(roomNumber);
                    availableRoomIds.sort((a, b) => a - b); // Keep the pool sorted

                    console.log(`Room ${roomId} deleted and all players disconnected.`);
                }
            }

            console.log(`⚠️ Player ${playerId} disconnected from ${roomId}.`);
        }

        console.log(`Player ${playerId} disconnected.`);

        delete players[playerId]; // Remove player from global players list

        updateRoomList();

        if (rooms[roomId]) {
            updatePlayerList(roomId); // Send updated player list to the room
        }
    });

    // Handle word updates for word-display
    socket.on("update_word", (data) => {
        const playerId = socket.id;
        const roomId = players[playerId]?.room_id;

        if (!roomId) return;

        // Broadcast the updated word to all players in the room
        io.to(roomId).emit("word_updated", {
            playerId: playerId,
            word: data.word,
        });
    });

    socket.on('print_all', (password) => {
        if (!(password === 12345678)) {
            return;
        } 
        console.log('Players => ' + JSON.stringify(players))
        console.log('Rooms => ' + JSON.stringify(rooms))
        console.log('GameState => ' + JSON.stringify(gameState))
    });

    socket.on('request_name_display', (playerId1) => {
        socket.emit('received_name_to_display', {id: playerId1, name: players[playerId1].name})
    });

    function handleMagicWord(playerId, roomId, word) {
        const player = players[playerId];
        let magicSuccess = false;

        if (!(magics.includes(word))) {
            // Wrong Command (red text)
            io.to(roomId).emit("word_submitted", {
                playerId: playerId,
                isCorrect: false,
            });
            return;
        }
    
        // Check if the player is currently on cooldown
        if (player.cooldown && Date.now() - player.cooldown < 30000) {
            const remainingCooldown = 30000 - (Date.now() - player.cooldown);
            console.log(`Player is on cooldown. Remaining time: ${remainingCooldown / 1000}s`);
            // Magic on cooldown (red text)
            io.to(roomId).emit("word_submitted", {
                playerId: playerId,
                isCorrect: false,
            });
            return; // Prevent casting the spell if cooldown hasn't finished
        }
    
        switch (players[playerId].character) {
            case "Jacky":
                if (word == "/reduce") {
                    // Sort aliens by word length DESC, and if tied, by position.y ASC
                    const top4Aliens = gameState[roomId].aliens
                        .slice() // Clone to avoid mutating original
                        .sort((a, b) => {
                        if (b.word.length !== a.word.length) {
                            return b.word.length - a.word.length; // Longer words first
                        } else {
                          return a.position.y - b.position.y;   // Higher up (smaller y) first
                        }
                    })
                    .slice(0, 4); // Take top 4 only
    
                    // Now do stuff only for the top 4
                    gameState[roomId].aliens.forEach(alien => {
                        if (top4Aliens.includes(alien)) {
                            alien.word = alien.word[0];
                            io.to(roomId).emit('update_alien_word', { id: alien.id, newWord: alien.word });
                        
                            io.to(roomId).emit("word_submitted", {
                                playerId: playerId,
                                isMagic: true,
                                alienId: alien.id,
                                character: players[playerId].character,
                                drawLaser: true
                            });
                        }
                    });
                    magicSuccess = true;
                }
                else if (word == "/binary") {
                    gameState[roomId].aliens.forEach(alien => {
                        const cutBinary = Math.random() < 0.75;
                        if (cutBinary) {
                            const half = Math.ceil(alien.word.length / 2);
                            alien.word = alien.word.slice(0, half); // Cut word in half
                            io.to(roomId).emit('update_alien_word', { id: alien.id, newWord: alien.word });
                            
                            io.to(roomId).emit("word_submitted", {
                                playerId: playerId,
                                isMagic: true,
                                alienId: alien.id,
                                character: players[playerId].character,
                                drawLaser: true
                            });
                        }
                    });
                    magicSuccess = true;
                }
    
                break;
            case "Pewya":
                if (word == "/security") {
                    let addedShield = 20
                    if (gameState[roomId].shield == 90) {addedShield = 10}
                    if (gameState[roomId].shield == 100) {addedShield = 0}
                    gameState[roomId].shield += addedShield;
                    io.to(roomId).emit("update_shield", addedShield);
                    magicSuccess = true;
                }
                else if (word == "/absorb") {
                    // Activate absorption
                    gameState[roomId].absorbActive = true;
                    io.to(roomId).emit("display_absorption", true);
    
                    // If a timeout is already counting down, cancel it
                    if (gameState[roomId].absorbTimeout) {
                        clearTimeout(gameState[roomId].absorbTimeout);
                    }
    
                    // Start a new 3-second countdown
                    gameState[roomId].absorbTimeout = setTimeout(() => {
                        gameState[roomId].absorbActive = false;
                        gameState[roomId].absorbTimeout = null;
                        io.to(roomId).emit("display_absorption", false);
                    }, 3000);
                    magicSuccess = true;
                }
    
                break;
            case "Nutty":
                if (word == "/heal") {
                    let addedHealth = 30
                    if (gameState[roomId].health == 80) {addedHealth = 20}
                    if (gameState[roomId].health == 90) {addedHealth = 10}
                    if (gameState[roomId].health == 100) {addedHealth = 0}
                    gameState[roomId].health += addedHealth;
                    io.to(roomId).emit("update_health", addedHealth);
                    magicSuccess = true;
                }
                else if (word == "/regen") {
                    // This is black magic
                    let ticks = 0;
    
                    const regenInterval = setInterval(() => {
                        // Stop after 5 ticks (5 x 6 seconds = 30 seconds)
                        if (ticks >= 5 || !gameState[roomId]) {
                            clearInterval(regenInterval);
                            return;
                        }
                        if (gameState[roomId].health != 100) {
                            gameState[roomId].health += 10;
                            io.to(roomId).emit("update_health", 10);
                        }
                        ticks++;
                    }, 6000);
                    magicSuccess = true;
                }
    
                break;
            case "Yoda":
                if (word == "/push") {
                    // Push all aliens up by 40%, if off-screen, delete them
                    gameState[roomId].aliens.forEach(alien => {
                        // Move up approximately 25%
                        alien.position.y -= 25; 
                        io.to(roomId).emit('alien_moved', { id: alien.id, position: alien.position });
                        if (alien.position.y <= -10) {
                            // Remove alien from list
                            gameState[roomId].aliens = gameState[roomId].aliens.filter(n => n !== alien);
                            // Update the number of aliens destroyed for the current wave
                            gameState[roomId].aliensDestroyed += 1;
                            // Update client visual
                            io.to(roomId).emit("alien_destroyed", alien.id);
    
                            // Check if the current wave is complete
                            if (
                                gameState[roomId].aliensSpawned === gameState[roomId].totalAliens && // All aliens spawned
                                gameState[roomId].aliensDestroyed === gameState[roomId].totalAliens // All aliens destroyed
                            ) {
                                // Safely increment the wave number
                                if (typeof gameState[roomId].waveNumber === 'number') {
                                    gameState[roomId].waveNumber += 1;
                                } else {
                                    gameState[roomId].waveNumber = 1; // Fallback to Wave 1 if waveNumber is invalid
                                }
                    
                                // Start the next wave
                                startWave(roomId, gameState[roomId].waveNumber);
                            }
                        }
                    });
                    magicSuccess = true;
                }
                else if (word == "/teleport") {
                    // Statistically move half of the aliens to the top
                    gameState[roomId].aliens.forEach(alien => {
                        const moveTop = Math.random() < 0.75;
                        if (moveTop) {
                            alien.position.y = 0; // Set to 0 (move to top)
                            io.to(roomId).emit('alien_moved', { id: alien.id, position: alien.position });
                        }
                    });
                    magicSuccess = true;
                }
                else if (word == "/reshuffle") {
                    // Reshuffle all aliens x position
                    gameState[roomId].aliens.forEach(alien => {
                        alien.position.x = Math.random() * 95;
                        io.to(roomId).emit('alien_reshuffled', { id: alien.id, position: alien.position.x });
                    });
                    magicSuccess = true;
                }
    
                break;
            case "Arthur":
                if (word == "/freeze") {
                    // Freeze 6 seconds
                    gameState[roomId].aliens.forEach(alien => {
                        alien.speed = 0; // Set speed to 0 (freeze)
                        alien.status = "frozen";
    
                        // Clear any existing timeout to prevent overlap
                        if (alien.freezeTimeout) clearTimeout(alien.freezeTimeout);
                        if (alien.slowTimeout) clearTimeout(alien.slowTimeout); // clear slow if active
    
                        // Set a new timeout and store its ID
                        alien.freezeTimeout = setTimeout(() => {
                            alien.speed = alien.speedAtBirth;
                            alien.status = "normal";
                            alien.freezeTimeout = null;
                        }, 6000);
                    });
                    magicSuccess = true;
                }
                else if (word == "/slow") {
                    // Slow 10 seconds
                    gameState[roomId].aliens.forEach(alien => {
                        alien.speed /= 2; // Divide speed by 2 (slowing down)
                        alien.speedAtBirth /= 2;
                        alien.status = "slow";
    
                        // Clear any existing timeout to prevent overlap (Don't override freeze)
                        if (alien.slowTimeout) clearTimeout(alien.slowTimeout);
    
                        // Set a new timeout and store its ID
                        alien.slowTimeout = setTimeout(() => {
                            alien.speedAtBirth *= 2;
                            alien.speed = alien.speedAtBirth;
                            alien.status = "normal";
                            alien.slowTimeout = null;
                        }, 10000);
                    });
                    magicSuccess = true;
                }
    
                break;
            case "Power":
                if (word == "/fork") {
                    const aliens = gameState[roomId].aliens;
        
                    // Shuffle the aliens array
                    const shuffledAliens = aliens
                        .map(alien => ({ ...alien })) // Clone to avoid mutating the original list
                        .sort(() => Math.random() - 0.5); // Random shuffle
    
                    // Select the first 4 aliens (or as many as available)
                    const numberOfAliensToSelect = Math.min(4, shuffledAliens.length);
                    const selectedAliens = shuffledAliens.slice(0, numberOfAliensToSelect);
    
                    // Perform actions on the selected aliens
                    selectedAliens.forEach(alienSelected => {
    
                        // Broadcast the result to all players in the room
                        io.to(roomId).emit("word_submitted", {
                            playerId: playerId,
                            isMagic: true,
                            alienId: alienSelected.id,
                            character: players[playerId].character,
                            drawLaser: true
                        });
    
                        // Filter out targeted alien
                        gameState[roomId].aliens = gameState[roomId].aliens.filter(alien => alien.id !== alienSelected.id);
                        // Update the number of aliens destroyed for the current wave
                        gameState[roomId].aliensDestroyed += 1;
                        io.to(roomId).emit("alien_destroyed", alienSelected.id);
                        // Check if the current wave is complete
                        if (
                            gameState[roomId].aliensSpawned === gameState[roomId].totalAliens && // All aliens spawned
                            gameState[roomId].aliensDestroyed === gameState[roomId].totalAliens // All aliens destroyed
                        ) {
                            // Safely increment the wave number
                            if (typeof gameState[roomId].waveNumber === 'number') {
                                gameState[roomId].waveNumber += 1;
                            } else {
                                gameState[roomId].waveNumber = 1; // Fallback to Wave 1 if waveNumber is invalid
                            }
                
                            // Start the next wave
                            startWave(roomId, gameState[roomId].waveNumber);
                        }
                    });
                    magicSuccess = true;
                }
                else if (word == "/purge") {
                    gameState[roomId].aliens.forEach(alienTarget => {
    
                        if (Math.random() < 0.5) {
                            // Broadcast the result to all players in the room
                            io.to(roomId).emit("word_submitted", {
                                playerId: playerId,
                                isMagic: true,
                                alienId: alienTarget.id,
                                character: players[playerId].character,
                                drawLaser: true
                            });
    
                            // Filter out targeted alien
                            gameState[roomId].aliens = gameState[roomId].aliens.filter(alien => alien.id !== alienTarget.id);
                            // Update the number of aliens destroyed for the current wave
                            gameState[roomId].aliensDestroyed += 1;
                            io.to(roomId).emit("alien_destroyed", alienTarget.id);
                            // Check if the current wave is complete
                            if (
                                gameState[roomId].aliensSpawned === gameState[roomId].totalAliens && // All aliens spawned
                                gameState[roomId].aliensDestroyed === gameState[roomId].totalAliens // All aliens destroyed
                            ) {
                                // Safely increment the wave number
                                if (typeof gameState[roomId].waveNumber === 'number') {
                                    gameState[roomId].waveNumber += 1;
                                } else {
                                    gameState[roomId].waveNumber = 1; // Fallback to Wave 1 if waveNumber is invalid
                                }
                    
                                // Start the next wave
                                startWave(roomId, gameState[roomId].waveNumber);
                            }
                        }
                    });
                    magicSuccess = true;
                }
    
                break;
            case "Tuxedo":
                if (word == "/reduce") {
                    // Sort aliens by word length DESC, and if tied, by position.y ASC
                    const top4Aliens = gameState[roomId].aliens
                        .slice() // Clone to avoid mutating original
                        .sort((a, b) => {
                        if (b.word.length !== a.word.length) {
                            return b.word.length - a.word.length; // Longer words first
                        } else {
                          return a.position.y - b.position.y;   // Higher up (smaller y) first
                        }
                    })
                    .slice(0, 4); // Take top 4 only
    
                    // Now do stuff only for the top 4
                    gameState[roomId].aliens.forEach(alien => {
                        if (top4Aliens.includes(alien)) {
                            alien.word = alien.word[0];
                            io.to(roomId).emit('update_alien_word', { id: alien.id, newWord: alien.word });
                        
                            io.to(roomId).emit("word_submitted", {
                                playerId: playerId,
                                isMagic: true,
                                alienId: alien.id,
                                character: players[playerId].character,
                                drawLaser: true
                            });
                        }
                    });
                    magicSuccess = true;
                }
                else if (word == "/binary") {
                    gameState[roomId].aliens.forEach(alien => {
                        const cutBinary = Math.random() < 0.75;
                        if (cutBinary) {
                            const half = Math.ceil(alien.word.length / 2);
                            alien.word = alien.word.slice(0, half); // Cut word in half
                            io.to(roomId).emit('update_alien_word', { id: alien.id, newWord: alien.word });
                            
                            io.to(roomId).emit("word_submitted", {
                                playerId: playerId,
                                isMagic: true,
                                alienId: alien.id,
                                character: players[playerId].character,
                                drawLaser: true
                            });
                        }
                    });
                    magicSuccess = true;
                }
                else if (word == "/security") {
                    let addedShield = 20
                    if (gameState[roomId].shield == 90) {addedShield = 10}
                    if (gameState[roomId].shield == 100) {addedShield = 0}
                    gameState[roomId].shield += addedShield;
                    io.to(roomId).emit("update_shield", addedShield);
                    magicSuccess = true;
                }
                else if (word == "/absorb") {
                    // Activate absorption
                    gameState[roomId].absorbActive = true;
                    io.to(roomId).emit("display_absorption", true);
    
                    // If a timeout is already counting down, cancel it
                    if (gameState[roomId].absorbTimeout) {
                        clearTimeout(gameState[roomId].absorbTimeout);
                    }
    
                    // Start a new 3-second countdown
                    gameState[roomId].absorbTimeout = setTimeout(() => {
                        gameState[roomId].absorbActive = false;
                        gameState[roomId].absorbTimeout = null;
                        io.to(roomId).emit("display_absorption", false);
                    }, 3000);
                    magicSuccess = true;
                }
                else if (word == "/heal") {
                    let addedHealth = 30
                    if (gameState[roomId].health == 80) {addedHealth = 20}
                    if (gameState[roomId].health == 90) {addedHealth = 10}
                    if (gameState[roomId].health == 100) {addedHealth = 0}
                    gameState[roomId].health += addedHealth;
                    io.to(roomId).emit("update_health", addedHealth);
                    magicSuccess = true;
                }
                else if (word == "/regen") {
                    // This is black magic
                    let ticks = 0;
    
                    const regenInterval = setInterval(() => {
                        // Stop after 5 ticks (5 x 6 seconds = 30 seconds)
                        if (ticks >= 5 || !gameState[roomId]) {
                            clearInterval(regenInterval);
                            return;
                        }
                        if (gameState[roomId].health != 100) {
                            gameState[roomId].health += 10;
                            io.to(roomId).emit("update_health", 10);
                        }
                        ticks++;
                    }, 6000);
                    magicSuccess = true;
                }
                else if (word == "/push") {
                    // Push all aliens up by 40%, if off-screen, delete them
                    gameState[roomId].aliens.forEach(alien => {
                        // Move up approximately 25%
                        alien.position.y -= 25; 
                        io.to(roomId).emit('alien_moved', { id: alien.id, position: alien.position });
                        if (alien.position.y <= -10) {
                            // Remove alien from list
                            gameState[roomId].aliens = gameState[roomId].aliens.filter(n => n !== alien);
                            // Update the number of aliens destroyed for the current wave
                            gameState[roomId].aliensDestroyed += 1;
                            // Update client visual
                            io.to(roomId).emit("alien_destroyed", alien.id);
    
                            // Check if the current wave is complete
                            if (
                                gameState[roomId].aliensSpawned === gameState[roomId].totalAliens && // All aliens spawned
                                gameState[roomId].aliensDestroyed === gameState[roomId].totalAliens // All aliens destroyed
                            ) {
                                // Safely increment the wave number
                                if (typeof gameState[roomId].waveNumber === 'number') {
                                    gameState[roomId].waveNumber += 1;
                                } else {
                                    gameState[roomId].waveNumber = 1; // Fallback to Wave 1 if waveNumber is invalid
                                }
                    
                                // Start the next wave
                                startWave(roomId, gameState[roomId].waveNumber);
                            }
                        }
                    });
                    magicSuccess = true;
                }
                else if (word == "/teleport") {
                    // Statistically move half of the aliens to the top
                    gameState[roomId].aliens.forEach(alien => {
                        const moveTop = Math.random() < 0.75;
                        if (moveTop) {
                            alien.position.y = 0; // Set to 0 (move to top)
                            io.to(roomId).emit('alien_moved', { id: alien.id, position: alien.position });
                        }
                    });
                    magicSuccess = true;
                }
                else if (word == "/reshuffle") {
                    // Reshuffle all aliens x position
                    gameState[roomId].aliens.forEach(alien => {
                        alien.position.x = Math.random() * 95;
                        io.to(roomId).emit('alien_reshuffled', { id: alien.id, position: alien.position.x });
                    });
                    magicSuccess = true;
                }
                else if (word == "/freeze") {
                    // Freeze 6 seconds
                    gameState[roomId].aliens.forEach(alien => {
                        alien.speed = 0; // Set speed to 0 (freeze)
                        alien.status = "frozen";
    
                        // Clear any existing timeout to prevent overlap
                        if (alien.freezeTimeout) clearTimeout(alien.freezeTimeout);
                        if (alien.slowTimeout) clearTimeout(alien.slowTimeout); // clear slow if active
    
                        // Set a new timeout and store its ID
                        alien.freezeTimeout = setTimeout(() => {
                            alien.speed = alien.speedAtBirth;
                            alien.status = "normal";
                            alien.freezeTimeout = null;
                        }, 6000);
                    });
                    magicSuccess = true;
                }
                else if (word == "/slow") {
                    // Slow 10 seconds
                    gameState[roomId].aliens.forEach(alien => {
                        alien.speed /= 2; // Divide speed by 2 (slowing down)
                        alien.speedAtBirth /= 2;
                        alien.status = "slow";
    
                        // Clear any existing timeout to prevent overlap (Don't override freeze)
                        if (alien.slowTimeout) clearTimeout(alien.slowTimeout);
    
                        // Set a new timeout and store its ID
                        alien.slowTimeout = setTimeout(() => {
                            alien.speedAtBirth *= 2;
                            alien.speed = alien.speedAtBirth;
                            alien.status = "normal";
                            alien.slowTimeout = null;
                        }, 10000);
                    });
                    magicSuccess = true;
                }
                else if (word == "/fork") {
                    const aliens = gameState[roomId].aliens;
        
                    // Shuffle the aliens array
                    const shuffledAliens = aliens
                        .map(alien => ({ ...alien })) // Clone to avoid mutating the original list
                        .sort(() => Math.random() - 0.5); // Random shuffle
    
                    // Select the first 4 aliens (or as many as available)
                    const numberOfAliensToSelect = Math.min(4, shuffledAliens.length);
                    const selectedAliens = shuffledAliens.slice(0, numberOfAliensToSelect);
    
                    // Perform actions on the selected aliens
                    selectedAliens.forEach(alienSelected => {
    
                        // Broadcast the result to all players in the room
                        io.to(roomId).emit("word_submitted", {
                            playerId: playerId,
                            isMagic: true,
                            alienId: alienSelected.id,
                            character: players[playerId].character,
                            drawLaser: true
                        });
    
                        // Filter out targeted alien
                        gameState[roomId].aliens = gameState[roomId].aliens.filter(alien => alien.id !== alienSelected.id);
                        // Update the number of aliens destroyed for the current wave
                        gameState[roomId].aliensDestroyed += 1;
                        io.to(roomId).emit("alien_destroyed", alienSelected.id);
                        // Check if the current wave is complete
                        if (
                            gameState[roomId].aliensSpawned === gameState[roomId].totalAliens && // All aliens spawned
                            gameState[roomId].aliensDestroyed === gameState[roomId].totalAliens // All aliens destroyed
                        ) {
                            // Safely increment the wave number
                            if (typeof gameState[roomId].waveNumber === 'number') {
                                gameState[roomId].waveNumber += 1;
                            } else {
                                gameState[roomId].waveNumber = 1; // Fallback to Wave 1 if waveNumber is invalid
                            }
                
                            // Start the next wave
                            startWave(roomId, gameState[roomId].waveNumber);
                        }
                    });
                    magicSuccess = true;
                }
                else if (word == "/purge") {
                    gameState[roomId].aliens.forEach(alienTarget => {
    
                        if (Math.random() < 0.5) {
                            // Broadcast the result to all players in the room
                            io.to(roomId).emit("word_submitted", {
                                playerId: playerId,
                                isMagic: true,
                                alienId: alienTarget.id,
                                character: players[playerId].character,
                                drawLaser: true
                            });
    
                            // Filter out targeted alien
                            gameState[roomId].aliens = gameState[roomId].aliens.filter(alien => alien.id !== alienTarget.id);
                            // Update the number of aliens destroyed for the current wave
                            gameState[roomId].aliensDestroyed += 1;
                            io.to(roomId).emit("alien_destroyed", alienTarget.id);
                            // Check if the current wave is complete
                            if (
                                gameState[roomId].aliensSpawned === gameState[roomId].totalAliens && // All aliens spawned
                                gameState[roomId].aliensDestroyed === gameState[roomId].totalAliens // All aliens destroyed
                            ) {
                                // Safely increment the wave number
                                if (typeof gameState[roomId].waveNumber === 'number') {
                                    gameState[roomId].waveNumber += 1;
                                } else {
                                    gameState[roomId].waveNumber = 1; // Fallback to Wave 1 if waveNumber is invalid
                                }
                    
                                // Start the next wave
                                startWave(roomId, gameState[roomId].waveNumber);
                            }
                        }
                    });
                    magicSuccess = true;
                }
    
                break;
            default:
                // Nulla
                break;
        }

        if (magicSuccess) {
            // Set the player's cooldown to the current timestamp
            player.cooldown = Date.now();
        
            // Start the cooldown timer (30 seconds)
            player.cooldownTimeOut = setTimeout(() => {
                player.cooldown = null; // Reset cooldown after 30 seconds
                player.cooldownTimeOut = null;
                console.log(`Player ${playerId}'s cooldown is over, they can cast again.`);
                io.to(roomId).emit("update_cooldown_global", { playerId: playerId, toggle: true , character: player.character });
            }, 30000); // 30 seconds cooldown
        
            const now = Date.now(); // server timestamp in milliseconds
            socket.emit("update_cooldown", { startTime: now, character: player.character });
            io.to(roomId).emit("update_cooldown_global", { playerId: playerId, toggle: false , character: player.character });
        }
        else {
            // Incorrect (red text)
            io.to(roomId).emit("word_submitted", {
                playerId: playerId,
                isCorrect: false,
            });
        }
    }
});

function updateRoomList() {
    const roomList = {};
    for (const [roomId, room] of Object.entries(rooms)) {
        roomList[roomId] = {
            playerCount: room.players.length,
            gameInProgress: room.game_in_progress || false // Include GameInProgress status
        };
    }
    
    io.emit('room_list', roomList);
}

function updatePlayerList(roomId) {
    if (!rooms[roomId]) return; // Ensure the room exists

    const playerList = rooms[roomId].players.map(playerId => ({
        id: playerId,
        name: players[playerId].name,
        ready: players[playerId].ready,
        is_head: rooms[roomId].head === playerId,
        character: players[playerId].character
    }));

    // Emit the updated player list to all clients in the room, including the head
    io.to(roomId).emit('player_list', playerList);

    // Explicitly emit to the head of the room as a fallback
    const headSocket = io.sockets.sockets.get(rooms[roomId].head);
    if (headSocket) {
        headSocket.emit('player_list', playerList);
    }
}

// Start the game loop
function startGameLoop(roomId) {
    const gameLoop = setInterval(() => {
        // Check if the room still exists and has players
        if (!rooms[roomId] || rooms[roomId].players.length === 0) {
            clearInterval(gameLoop); // Stop the game loop if the room is empty

        // Clear the spawn interval if it exists
        if (gameState[roomId] && gameState[roomId].spawnInterval) {
            clearInterval(gameState[roomId].spawnInterval);
        }

        delete gameState[roomId]; // Clean up the game state
        return;
        }

        // Start Wave 1 when the game starts
        if (!gameState[roomId].waveStarted) {
            gameState[roomId].waveStarted = true;
            startWave(roomId, 1); // Start Wave 1
        }

        // Move aliens
        moveAliens(roomId);

        // Check for game over
        checkGameOver(roomId);

        if (gameState[roomId].gameOver) {
            clearInterval(gameLoop); // Stop the game loop if the game is over

            // Clear the spawn interval if it exists
            if (gameState[roomId].spawnInterval) {
                clearInterval(gameState[roomId].spawnInterval);
            }

            delete gameState[roomId]; // Clean up the game state
            return;
        }
    }, 1000 / 60); // 60 FPS

    // Store the game loop interval ID in the game state
    gameState[roomId].gameLoop = gameLoop;
}

// Function to start a wave of aliens
function startWave(roomId, waveNumber) {
    if (!gameState[roomId]) return;

    // Reset wave counters
    gameState[roomId].aliensSpawned = 0;
    gameState[roomId].aliensDestroyed = 0;

    switch (waveNumber) {
        case 1:
            io.to(roomId).emit('alert_warning', "Wave 1 (10 enemies)");
            gameState[roomId].totalAliens = 10;
            gameState[roomId].spawnInterval = spawnAlienWithDelay(roomId, 10, 1500, 0.5);
            break;
        case 2:
            io.to(roomId).emit('alert_warning', "Wave 2 (12 enemies)");
            gameState[roomId].totalAliens = 12;
            gameState[roomId].spawnInterval = spawnAlienWithDelay(roomId, 12, 1400, 0.6);
            break;
        case 3:
            io.to(roomId).emit('alert_warning', "Wave 3 (15 enemies)");
            gameState[roomId].totalAliens = 15;
            gameState[roomId].spawnInterval = spawnAlienWithDelay(roomId, 15, 1300, 0.7);
            break;
        case 4:
            io.to(roomId).emit('alert_warning', "Wave 4 (19 enemies)");
            gameState[roomId].totalAliens = 19;
            gameState[roomId].spawnInterval = spawnAlienWithDelay(roomId, 19, 1250, 0.8);
            break;
        case 5:
            io.to(roomId).emit('alert_warning', "Wave 5 (25 enemies)");
            gameState[roomId].totalAliens = 25;
            setTimeout(() => {
                spawnAlien(roomId, 1.4, "I", 20); // roomId, speed, specificWord, specificCoordX
            }, 50);
            setTimeout(() => {
                spawnAlien(roomId, 1.4, "Love", 40);
            }, 100);
            setTimeout(() => {
                spawnAlien(roomId, 1.4, "CN321", 60);
            }, 150);
            setTimeout(() => {
                spawnAlien(roomId, 1.4, "I", 30);
            }, 750);
            setTimeout(() => {
                spawnAlien(roomId, 1.4, "Love", 50);
            }, 800);
            setTimeout(() => {
                spawnAlien(roomId, 1.4, "CN321", 70);
            }, 850);
            setTimeout(() => {
                spawnAlien(roomId, 1.4, "I", 40);
            }, 1450);
            setTimeout(() => {
                spawnAlien(roomId, 1.4, "Love", 60);
            }, 1500);
            setTimeout(() => {
                spawnAlien(roomId, 1.4, "CN321", 80);
            }, 1550);
            setTimeout(() => {
                gameState[roomId].spawnInterval = spawnAlienWithDelay(roomId, 16, 1200, 0.9);
            }, 2700);
            break;
        case 6:
            io.to(roomId).emit('alert_warning', "Wave 6 (25 enemies)");
            gameState[roomId].totalAliens = 25;
            gameState[roomId].spawnInterval = spawnAlienWithDelay(roomId, 25, 1200, 1.2);
            break;
        case 7:
            io.to(roomId).emit('alert_warning', "Wave 7 (27 enemies)");
            gameState[roomId].totalAliens = 27;
            gameState[roomId].spawnInterval = spawnAlienWithDelay(roomId, 27, 1150, 1.3);
            break;
        case 8:
            io.to(roomId).emit('alert_warning', "Wave 8 (30 enemies)");
            gameState[roomId].totalAliens = 30;
            gameState[roomId].spawnInterval = spawnAlienWithDelay(roomId, 30, 1150, 1.4);
            break;
        case 9:
            io.to(roomId).emit('alert_warning', "Wave 9 (35 enemies)");
            gameState[roomId].totalAliens = 35;
            gameState[roomId].spawnInterval = spawnAlienWithDelay(roomId, 35, 1100, 1.5);
            break;
        case 10:
            io.to(roomId).emit('alert_warning', "Wave 10 (10 enemies, FAST!)");
            gameState[roomId].totalAliens = 10;
            gameState[roomId].spawnInterval = spawnAlienWithDelay(roomId, 10, 1100, 6);
            break;
        case 11:
            io.to(roomId).emit('alert_warning', "Wave 11 (16 enemies)");
            gameState[roomId].totalAliens = 16;
            gameState[roomId].spawnInterval = spawnAlienWithDelay(roomId, 16, 800, 1.8);
            break;
        case 12:
            io.to(roomId).emit('alert_warning', "Wave 12 (17 enemies)");
            gameState[roomId].totalAliens = 17;
            gameState[roomId].spawnInterval = spawnAlienWithDelay(roomId, 17, 790, 1.85);
            break;
        case 13:
            io.to(roomId).emit('alert_warning', "Wave 13 (18 enemies)");
            gameState[roomId].totalAliens = 18;
            gameState[roomId].spawnInterval = spawnAlienWithDelay(roomId, 18, 780, 1.9);
            break;
        case 14:
            io.to(roomId).emit('alert_warning', "Wave 14 (19 enemies)");
            gameState[roomId].totalAliens = 19;
            gameState[roomId].spawnInterval = spawnAlienWithDelay(roomId, 19, 770, 1.95);
            break;
        case 15:
            io.to(roomId).emit('alert_warning', "Wave 15 (20 enemies)");
            gameState[roomId].totalAliens = 20;
            setTimeout(() => {
                spawnAlien(roomId, 2.5, "I", 20);
            }, 50);
            setTimeout(() => {
                spawnAlien(roomId, 2.5, "Love", 40);
            }, 100);
            setTimeout(() => {
                spawnAlien(roomId, 2.5, "Ajarnjack", 60);
            }, 150);
            setTimeout(() => {
                spawnAlien(roomId, 2.5, "I", 30);
            }, 200);
            setTimeout(() => {
                spawnAlien(roomId, 2.5, "Love", 50);
            }, 250);
            setTimeout(() => {
                spawnAlien(roomId, 2.5, "Ajarnpiya", 70);
            }, 300);
            setTimeout(() => {
                spawnAlien(roomId, 2.5, "I", 40);
            }, 350);
            setTimeout(() => {
                spawnAlien(roomId, 2.5, "Love", 60);
            }, 400);
            setTimeout(() => {
                spawnAlien(roomId, 2.5, "Ajarnart", 80);
            }, 450);
            gameState[roomId].spawnInterval = spawnAlienWithDelay(roomId, 11, 770, 2);
            break;
        case 16:
            io.to(roomId).emit('alert_warning', "Wave 16 (25 enemies, 1-10 !!!)");
            gameState[roomId].totalAliens = 25;
            setTimeout(() => {
                setTimeout(() => {
                    spawnAlien(roomId, 2.6, "1", 3);
                }, 50);
                setTimeout(() => {
                    spawnAlien(roomId, 2.6, "2", 13);
                }, 100);
                setTimeout(() => {
                    spawnAlien(roomId, 2.6, "3", 23);
                }, 150);
                setTimeout(() => {
                    spawnAlien(roomId, 2.6, "4", 33);
                }, 200);
                setTimeout(() => {
                    spawnAlien(roomId, 2.6, "5", 43);
                }, 250);
                setTimeout(() => {
                    spawnAlien(roomId, 2.6, "6", 53);
                }, 300);
                setTimeout(() => {
                    spawnAlien(roomId, 2.6, "7", 63);
                }, 350);
                setTimeout(() => {
                    spawnAlien(roomId, 2.6, "8", 73);
                }, 400);
                setTimeout(() => {
                    spawnAlien(roomId, 2.6, "9", 83);
                }, 450);
                setTimeout(() => {
                    spawnAlien(roomId, 2.6, "10", 93);
                }, 500);
            }, 500);
            gameState[roomId].spawnInterval = spawnAlienWithDelay(roomId, 15, 770, 2.1);
            break;
        case 17:
            io.to(roomId).emit('alert_warning', "Wave 17 (25 enemies)");
            gameState[roomId].totalAliens = 25;
            gameState[roomId].spawnInterval = spawnAlienWithDelay(roomId, 25, 750, 2.2);
            break;
        case 18:
            io.to(roomId).emit('alert_warning', "Wave 18 (25 enemies)");
            gameState[roomId].totalAliens = 25;
            gameState[roomId].spawnInterval = spawnAlienWithDelay(roomId, 25, 700, 2.3);
            break;
        case 19:
            io.to(roomId).emit('alert_warning', "Wave 19 (25 enemies)");
            gameState[roomId].totalAliens = 25;
            gameState[roomId].spawnInterval = spawnAlienWithDelay(roomId, 25, 700, 2.4);
            break;
        case 20:
            io.to(roomId).emit('alert_warning', "Wave 20 (10 enemies, random string)");
            gameState[roomId].totalAliens = 10;
            setTimeout(() => {
                setTimeout(() => {
                    spawnAlien(roomId, 1.5, getRandomString(4), 50);
                }, 1000);
                setTimeout(() => {
                    spawnAlien(roomId, 1.5, getRandomString(4), 60);
                }, 2000);
                setTimeout(() => {
                    spawnAlien(roomId, 1.5, getRandomString(4), 50);
                }, 3000);
                setTimeout(() => {
                    spawnAlien(roomId, 1.5, getRandomString(4), 40);
                }, 4000);
                setTimeout(() => {
                    spawnAlien(roomId, 1.5, getRandomString(4), 50);
                }, 5000);
                setTimeout(() => {
                    spawnAlien(roomId, 1.5, getRandomString(4), 60);
                }, 6000);
                setTimeout(() => {
                    spawnAlien(roomId, 1.5, getRandomString(4), 50);
                }, 7000);
                setTimeout(() => {
                    spawnAlien(roomId, 1.5, getRandomString(4), 40);
                }, 8000);
                setTimeout(() => {
                    spawnAlien(roomId, 1.5, getRandomString(4), 50);
                }, 9000);
                setTimeout(() => {
                    spawnAlien(roomId, 1.5, getRandomString(10), 60);
                }, 10000);
            }, 500);
            break;
        case 21:
            io.to(roomId).emit('alert_warning', "Final Wave! (100 enemies, FAST!!!)");
            gameState[roomId].totalAliens = 100;
            gameState[roomId].spawnInterval = spawnAlienWithDelay(roomId, 100, 100, 7);
            break;
        default:
            // If no more waves are defined, end the game
            io.to(roomId).emit('alert_warning', "Final Wave Completed!");
            gameState[roomId].gameOver = true;
            io.to(roomId).emit('game_over');
            console.log(`Game over in room ${roomId}.`);
            break;
    }
}

function getRandomString(length) {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+[]{}|;:,.<>?';
    let result = '';
    for (let i = 0; i < length; i++) {
      const randomIndex = Math.floor(Math.random() * characters.length);
      result += characters[randomIndex];
    }
    return result;
  }
  

// Function to spawn aliens with a delay between each spawn
function spawnAlienWithDelay(roomId, count, delay, speed) {
    let spawnCount = 0;

    const spawnInterval = setInterval(() => {
        if (spawnCount >= count || !gameState[roomId]) {
            clearInterval(spawnInterval); // Stop spawning after the count is reached or if the room is deleted
            return;
        }

        spawnAlien(roomId, speed, null, null); // Spawn a single alien with the specified speed
        spawnCount++;
        
    }, delay);

    return spawnInterval; // Return the interval ID
}

// Spawn an alien
function spawnAlien(roomId, speed, specificWord, specificCoordX) {
    const words = [
                  "OSI", "Network", "Application", "Session", "Data-Link", "Transport", "User", "Message",
                  "Transmit", "Receive", "RS232", "Ethernet", "Hardware", "Software", "Protocol", "Social",
                  "HTTP", "HTTPS", "Encoding", "Decoding", "Encryption", "Logical", "CMD", "WWW", "Download",
                  "Sync", "Node", "Routing", "Host", "Server", "Client", "Model", "Command", "Log", "Upload",
                  "WebSocket", "E-mail", "Data", "Packet", "Security", "Ring", "Admin", "Extranet", "Put",
                  "Bus", "ENIAC", "Telephone", "FiberOptic", "Cable", "Coaxial", "LAN", "WAN", "FAX", "Get",
                  "Teleconference", "Satellite", "Microwave", "Wireless", "Wi-Fi", "ASCII", "DNS", "Update",
                  "Code", "Bandwidth", "Frequency", "Signal", "Twisted-Pair", "Multiplexing", "Broadband",
                  "Carrier", "Asynchronous", "Transmission", "Half-Duplex", "Full-Duplex", "Simplex", "Status",
                  "Interface", "Modem", "Synchronous", "Send", "FDM", "TDM", "Transmit", "Topology", "Directory",
                  "Ajarnjack", "Ajarnpiya", "Aloha", "Huffman", "Collision", "CSMA", "Tree", "Mesh", "Bye",
                  "Token", "CSMA", "Compression", "192.168.1.1", "Security", "Integrity", "Internet", "ACK",
                  "Parity", "Error", "CRC", "Hamming", "Checking", "Synchronous", "JS", "HTML", "Communicate",
                  "CRC", "Caesar", "Cipher", "Key", "Distribution", "Disconnect", "File", "Password",
                  "Protection", "Firewall", "RSA", "Digital", "Analog", "Signatures", "Virus", "Bus", "FTP",
                  "Hacking", "Public", "Private", "IP", "TCP", "Handshake", "Cable", "Switch", "Algorithm", "Route",
                  "Buffer", "Frame", "Ping", "Bitrate", "Bandwidth", "Bridge", "Network", "Traffic", "Port", "Node",
                  "Proxy", "URL", "MAC", "Gateway", "DDoS", "DoS", "Host", "Server", "Peer", "Server", "0", "1",
                  "5G", "4G", "ISP", "Dijkstra", "Session", "Route", "Bluetooth", "UDP", "SWP", "Connect",
                  "Sensor", "Repeater", "Media", "Frequency", "Period", "Analog", "Digital", "Morse"
                  ]; // Example words
    
    const word = words[Math.floor(Math.random() * words.length)];

    const alien = {
        id: `alien_${Date.now()}`,
        word: specificWord? specificWord : word,
        position: { x: specificCoordX? specificCoordX : Math.random() * 95, y: 0 }, // Random x position at the top
        speed: speed, // Add speed to the alien object
        speedAtBirth: speed,
        status: "normal"
    };

    gameState[roomId].aliensSpawned += 1;

    if (gameState[roomId]) {
        gameState[roomId].aliens.push(alien);
    }

    // Emit the new alien to all players in the room
    io.to(roomId).emit('alien_spawned', alien);
}

// Move aliens
function moveAliens(roomId) {
    gameState[roomId].aliens.forEach(alien => {
        alien.position.y += alien.speed * 0.1; // Use the alien's speed to move it down

        // Emit the updated alien position to all players in the room
        io.to(roomId).emit('alien_moved', { id: alien.id, position: alien.position });
    });
}

function resetCooldowns(roomId) {
    const roomPlayers = rooms[roomId]?.players || {};

    for (const playerId in roomPlayers) {
        const player = players[roomPlayers[playerId]];

        if (player.cooldownTimeOut) {
            clearTimeout(player.cooldownTimeOut);
            player.cooldownTimeOut = undefined;
        }

        player.cooldown = null;
    }

    console.log(`All cooldowns cleared for room ${roomId}`);
}

// Check for game over
function checkGameOver(roomId) {
    const gameOverLine = 100; // Approximately crosses the game-over line

    gameState[roomId].aliens.forEach(alien => {
        if (alien.position.y >= gameOverLine) {

            // Remove alien from list
            gameState[roomId].aliens = gameState[roomId].aliens.filter(n => n !== alien);
            // Update the number of aliens destroyed for the current wave
            gameState[roomId].aliensDestroyed += 1;
            // Update client visual
            io.to(roomId).emit("alien_destroyed", alien.id);

            if (!gameState[roomId].absorbActive) {
                if (gameState[roomId].shield == 0) {
                    gameState[roomId].health -= 10;
                    io.to(roomId).emit('update_health', -10);
                }
                else {
                    gameState[roomId].shield -= 10;
                    io.to(roomId).emit('update_shield', -10);
                }
            }

            if (gameState[roomId].health == 0) {
                // Game over
                gameState[roomId].gameOver = true;
                io.to(roomId).emit('game_over');
                resetCooldowns(roomId);
                console.log(`Game over in room ${roomId}.`);
                return;
            }

            // Check if the current wave is complete
            if (
                gameState[roomId].aliensSpawned === gameState[roomId].totalAliens && // All aliens spawned
                gameState[roomId].aliensDestroyed === gameState[roomId].totalAliens // All aliens destroyed
            ) {
                // Safely increment the wave number
                if (typeof gameState[roomId].waveNumber === 'number') {
                    gameState[roomId].waveNumber += 1;
                } else {
                    gameState[roomId].waveNumber = 1; // Fallback to Wave 1 if waveNumber is invalid
                }
    
                // Start the next wave
                startWave(roomId, gameState[roomId].waveNumber);
            }
        }
    });
}

// Use Render's dynamic port
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
