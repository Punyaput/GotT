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
let players = {}; // Stores player data: {player_id: {name: string, room_id: string, ready: boolean}}
let availableRoomIds = Array.from({ length: MAX_ROOMS }, (_, i) => i + 1); // Pool of available room IDs
let gameState = {}; // Stores game state: {room_id: {aliens: [{id: string, word: string, position: {x: number, y: number}, speed: int}], waveNumber: int, waveStarted: boolean, alienSpawned: int, alienDestroyed: int, gameOver: boolean}}

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'client.html')); // Serve the HTML file
});

io.on('connection', (socket) => {
    const playerId = socket.id;
    players[playerId] = { name: "", room_id: null, ready: false }; // Initialize player data
    console.log(`Player ${playerId} connected.`);

    socket.on('set_name', (data) => {
        players[playerId].name = data.name;
        socket.emit('name_set', { name: data.name });
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
        const roomId = `room_${availableRoomIds.shift()}`;
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
                const roomNumber = parseInt(roomId.split('_')[1]);
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
            };

            // Start the game loop
            startGameLoop(roomId);

            io.to(roomId).emit('game_started', rooms[roomId]);
            console.log(`🚀 Game started in ${roomId}`);
        
        } else {
            socket.emit('error', { message: 'Not all players are ready.' });
        }
    });

    // Handle word submission
    socket.on("submit_word", (data) => {
        const playerId = socket.id;
        const roomId = players[playerId]?.room_id;
        const word = data.word.toLowerCase();
    
        if (!roomId || !gameState[roomId]) return;
    
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
    
        // Notify the player of the word submission result
        socket.emit("word_submitted", {
            playerId: playerId,
            word: word,
            isCorrect: isCorrect,
            alienId: targetAlien?.id,
        });
    
        // Broadcast the result to all players in the room
        io.to(roomId).emit("word_submitted", {
            playerId: playerId,
            word: word,
            isCorrect: isCorrect,
            alienId: targetAlien?.id,
        });
    
        // Destroy the alien if the word is correct
        if (targetAlien) {
            gameState[roomId].aliens = gameState[roomId].aliens.filter(alien => alien.id !== targetAlien.id);
            io.to(roomId).emit("alien_destroyed", targetAlien.id);
    
            // Update the number of aliens destroyed for the current wave
            gameState[roomId].aliensDestroyed += 1;
    
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

        // Notify the player to return to the lobby
        socket.emit('returned_to_lobby');

        // Delete the room if it is empty
        if (rooms[roomId].players.length === 1) {
            // Return the room ID to the pool
            const roomNumber = parseInt(roomId.split('_')[1]);
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
                    const roomNumber = parseInt(roomId.split('_')[1]);
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

    socket.on('print_all', () => {
        console.log('Players => ' + JSON.stringify(players))
        console.log('Rooms => ' + JSON.stringify(rooms))
        console.log('GameState => ' + JSON.stringify(gameState))
    });

    socket.on('request_name_display', (playerId1) => {
        socket.emit('received_name_to_display', {id: playerId1, name: players[playerId1].name})
    });
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
        is_head: rooms[roomId].head === playerId
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
            // Wave 1: Spawn 10 aliens, 0.5 seconds apart
            io.to(roomId).emit('alert_warning', "Wave 1 (10 enemies)");
            gameState[roomId].totalAliens = 10; // Total aliens for this wave
            gameState[roomId].spawnInterval = spawnAlienWithDelay(roomId, 10, 1500, 1); // 10 Aliens, 500ms Delay, 1 Speed
            break;
        case 2:
            io.to(roomId).emit('alert_warning', "Wave 2 (15 enemies)");
            gameState[roomId].totalAliens = 15;
            gameState[roomId].spawnInterval = spawnAlienWithDelay(roomId, 15, 1200, 1.5);
            break;
        case 3:
            io.to(roomId).emit('alert_warning', "Wave 3 (20 enemies)");
            gameState[roomId].totalAliens = 20;
            gameState[roomId].spawnInterval = spawnAlienWithDelay(roomId, 20, 1000, 2);
            break;
        case 4:
            io.to(roomId).emit('alert_warning', "Wave 4 (25 enemies)");
            gameState[roomId].totalAliens = 25;
            gameState[roomId].spawnInterval = spawnAlienWithDelay(roomId, 25, 800, 3);
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

// Function to spawn aliens with a delay between each spawn
function spawnAlienWithDelay(roomId, count, delay, speed) {
    let spawnCount = 0;

    const spawnInterval = setInterval(() => {
        if (spawnCount >= count || !gameState[roomId]) {
            clearInterval(spawnInterval); // Stop spawning after the count is reached or if the room is deleted
            return;
        }

        spawnAlien(roomId, speed); // Spawn a single alien with the specified speed
        spawnCount++;

        // Update the number of aliens spawned for the current wave
        gameState[roomId].aliensSpawned = spawnCount;
    }, delay);

    return spawnInterval; // Return the interval ID
}

// Spawn an alien
function spawnAlien(roomId, speed) {
    const words = [
                  "OSI-Model", "Network", "Application", "Session", "Data-Link", "Transport",
                  "Transmit", "Receive", "RS232", "Ethernet", "Hardware", "Software", "Protocol",
                  "HTTP", "HTTPS", "MAC-Address", "Encoding", "Decoding", "Encryption", "Logical",
                  "Sync", "Node", "Virtual-Network", "Routing", "Host", "Server", "Client",
                  "WebSocket", "E-mail", "Data", "Packet", "Security", "Ring-Topology",
                  "Bus-Topology", "Star-Topology", "Fully-Connected-Topology", "Combined-Topology",
                  "ENIAC", "Telephone", "FiberOptic", "Cable", "Coaxial-Cable", "LAN", "WAN", "FAX",
                  "Teleconference", "Satellite", "Microwave", "Wireless", "Wi-Fi", "ASCII",
                  "MorseCode", "Bandwidth", "Frequency", "Signal", "Twisted-Pair", "Multiplexing",
                  "Carrier", "Asynchronous", "Transmission", "Half-Duplex", "Full-Duplex", "Simplex",
                  "Interface", "Modem", "Synchronous", "Clear-To-Send", "RS-449", "FDM", "TDM",
                  "Frequency-Division-Multiplexing", "Time-Division-Multiplexing", "Ajarnjack",
                  "Ajarnpiya", "Aloha-Protocol", "Huffman-Code", "Collision-Detection", "CSMA/CD",
                  "Token", "CSMA", "Data-Compression", "192.168.1.1", "Security", "Data-Integrity",
                  "Parity-Checking", "Error-Detection", "CRC", "Hamming-Code",
                  "Cyclic-Redundancy-Checking", "Caesar-Cipher", "Cipher", "Key", "Distribution",
                  "Protection", "Fire-Wall", "RSA", "Digital", "Analog", "Signatures", "Virus",
                  "Worm", "Hacking", "6EB6957008E03CE4", "KDC", "Public-Key", "Private-Key"
                  ]; // Example words
    const word = words[Math.floor(Math.random() * words.length)];

    const alien = {
        id: `alien_${Date.now()}`,
        word: word,
        position: { x: Math.random() * (0.88 - 0.12) + 0.12, y: 0 }, // Random x position at the top
        speed: speed // Add speed to the alien object
    };

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

// Check for game over
function checkGameOver(roomId) {
    const gameOverLine = 100; // Approximately crosses the game-over line

    gameState[roomId].aliens.forEach(alien => {
        if (alien.position.y >= gameOverLine) {
            // Game over
            gameState[roomId].gameOver = true;
            io.to(roomId).emit('game_over');
            console.log(`Game over in room ${roomId}.`);
            return;
        }
    });
}

// Use Render's dynamic port
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
