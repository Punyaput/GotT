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
const magics = ["/reduce", "/binary", "/security", "/absorb", "/heal", "/regen", "/push", "/teleport", "/reshuffle", "/freeze", "/slow", "/fork", "/purge", "/kill_all"];
const availableCharacters = ["Nulla", "Jacky", "Pewya", "Natty", "Yoda", "Arthur", "Power", "Tuxedo"];
const RATE_LIMIT_MS = 150; // How fast is considered "spam"
const MAX_WARNINGS = 2;
const WARNING_INTERVAL_MS = 3000; // Wait at least this long between warnings
const WARNING_RESET_MS = 10000; // Time until warnings reset after good behavior

// Store client rate limit state
const clientRateLimits = new Map();

const wordsNetwork = [
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
    "CRC", "Caesar", "Cipher", "Key", "Distribution", "Disconnect", "File", "Password", "CPU",
    "Protection", "Firewall", "RSA", "Digital", "Analog", "Signatures", "Virus", "Bus", "FTP",
    "Hacking", "Public", "Private", "IP", "TCP", "Handshake", "Cable", "Switch", "Algorithm", "Route",
    "Buffer", "Frame", "Ping", "Bitrate", "Bandwidth", "Bridge", "Network", "Traffic", "Port", "Node",
    "Proxy", "URL", "MAC", "Gateway", "DDoS", "DoS", "Host", "Server", "Peer", "Server", "0", "1",
    "5G", "4G", "ISP", "Dijkstra", "Session", "Route", "Bluetooth", "UDP", "SWP", "Connect",
    "Sensor", "Repeater", "Media", "Frequency", "Period", "Analog", "Digital", "Morse"
];

const wordsSoftware = [
    "SDLC", "DevOps", "Frontend", "Backend", "FullStack", "JavaScript", "TypeScript", "Python", "Java", "Kotlin", 
    "C#", "CPlusPlus", "Ruby", "PHP", "HTML", "CSS", "ReactJS", "Angular", "VueJS", "Agile", "Scrum", "C++", "Frontend",
    "NodeJS", "Express", "Django", "Flask", "Spring", "REST", "Graph", "WebSocket", "Microservice", "UI", "Backend",
    "API", "Database", "SQL", "AWS", "Azure", "Photoshop", "Sprint", "Sprint", "System", "UX", "Tester", "SoftEN", "CPU",
    "PostgreSQL", "MongoDB", "Redis", "Diagram", "Firebase", "Docker", "Cloud", "Git", "Kanban", "Wireframe", "Timeline",
    "GitHub", "GitLab", "Agile", "Scrum", "Kanban", "Sprint", "UI", "UX", "Wireframe", "Agile", "Scrum", "RAD", "Development",
    "Prototype", "Testing", "Unit", "Integration", "Figma", "Selenium", "Cypress", "Agile", "Scrum", "Component", "Visual",
    "Debug", "Log", "Monitor", "OAuth", "Agile", "Scrum", "Deployment", "SA", "BA", "Business", "User", "User", "Coding",
    "Firewall", "VPN", "Scalability", "LoadBalancer", "Cache", "Linux", "Bash", "Shell", "Automation", "GitHub", "Vue",
    "CDN", "BigO", "Flowchart", "Blockchain", "Web", "Agile", "Scrum", "API", "Class", "Class", "Art", "Deploy", "API",
    "Refactor", "Design", "Factory", "Observer", "Render", "Agile", "Scrum", "Agile", "Scrum", "Agile", "Scrum", "AI",
]

const wordsGeneral = [
    "Apple", "Banana", "Orange", "Grape", "Mango",
    "Peach", "Pear", "Lemon", "Lime", "Cherry",
    "Berry", "Kiwi", "Melon", "Plum", "Fig",
    "Guava", "Papaya", "DragonFruit", "Avocado", "Coconut",
    "Carrot", "Tomato", "Potato", "Onion", "Garlic",
    "Pepper", "Lettuce", "Spinach", "Broccoli", "Cauliflower",
    "Cucumber", "Radish", "Beet", "Celery", "Bean",
    "Pea", "Corn", "Pumpkin", "Eggplant", "Zucchini",   
    "Chair", "Table", "Lamp", "Clock", "Mirror",
    "Vase", "Bottle", "Cup", "Plate", "Bowl",
    "Knife", "Fork", "Spoon", "Glass", "Towel",
    "Basket", "Bucket", "Brush", "Broom", "Mop",
    "Phone", "Laptop", "Tablet", "Camera", "Remote",
    "Speaker", "Headphone", "Keyboard", "Mouse", "Monitor",
    "Charger", "Battery", "Flashlight", "Radio", "Drone",
    "Shirt", "Pants", "Dress", "Jacket", "Sweater",
    "Socks", "Shoes", "Hat", "Gloves", "Scarf",
    "Tree", "Flower", "Rock", "River", "Mountain",
    "Cloud", "Star", "Moon", "Sun", "Rain",
    "Book", "Pen", "Paper", "Bag", "Key",
    "Toy", "Ball", "Doll", "Block", "Puzzle",
    "Coin", "Stamp", "Ticket", "Card", "Gift"
]

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'client.html')); // Serve the HTML file
});

io.on('connection', (socket) => {
    const playerId = socket.id;
    players[playerId] = { name: "", room_id: null, ready: false , character: "Nulla", cooldown: null }; // Initialize player data
    console.log(`✅ Player ${playerId} connected.`);

    socket.on('set_name', (data) => {

        // VALIDATE DATA (VERY IMPORTANT!!!)
        if (!data || typeof data.name !== "string") {
            socket.emit('error', { message: 'Invalid action.' });
            return;
        }

        if (data.name.length > 30) {
            socket.emit('error', { message: 'Name too long. (30 Characters limit)' });
            return;
        }

        if (players[playerId].name === "") {
        players[playerId].name = data.name;
        socket.emit('name_set');
        }
        else {
            socket.emit('error', { message: 'You already have a name!' });
        }
    });

    socket.on('change_character', (character) => {

        // VALIDATE DATA (VERY IMPORTANT!!!)
        if (!character || typeof character !== "string") {
            socket.emit('error', { message: 'Invalid action.' });
            return;
        }

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
        console.log(`➕ Player ${playerId} created and joined ${roomId}.`);

        updateRoomList();

        socket.emit('joined_room', roomId);
        updatePlayerList(roomId); // Send updated player list to the room
    });

    socket.on('join_room', (data) => {

        // VALIDATE DATA (VERY IMPORTANT!!!)
        if (!data || typeof data.room_id !== "string") {
            socket.emit('error', { message: 'Invalid action.' });
            return;
        }

        if (players[playerId].room_id) {
            socket.emit('error', { message: 'You are already in a room.' });
            return;
        }

        if (!players[playerId].name) {
            socket.emit('error', { message: 'Invalid action.' });
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
        console.log(`➕ Player ${playerId} joined ${roomId}.`);

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

            console.log(`➖ Player ${playerId} exited ${roomId}.`);

            if (rooms[roomId].players.length === 0) { // Delete room if empty
                delete rooms[roomId];
                // Return the room ID to the pool
                const roomNumber = parseInt(roomId.split(' ')[1]);
                availableRoomIds.push(roomNumber);
                availableRoomIds.sort((a, b) => a - b); // Keep the pool sorted
            }
        }

        // Reset player's room and ready status
        players[playerId].room_id = null;
        players[playerId].ready = false;

        updateRoomList();

        socket.emit('exited_room');
        if (rooms[roomId]) {
            updatePlayerList(roomId); // Send updated player list to the room
        }
    });

    socket.on('kick_player', (data) => {

        // VALIDATE DATA (VERY IMPORTANT!!!)
        if (!data || typeof data.target_player_id !== "string") {
            socket.emit('error', { message: 'Invalid action.' });
            return;
        }

        const roomId = players[playerId].room_id;
        const targetPlayerId = data.target_player_id;
    
        console.log(`🦶 Player ${playerId} is trying to kick ${targetPlayerId} from ${roomId}.`);
    
        if (!roomId) {
            socket.emit('error', { message: 'You are not in a room.' });
            return;
        }
    
        // Only the head can kick players
        if (rooms[roomId].head !== playerId) {
            socket.emit('error', { message: 'Only the room head can kick players.' });
            return;
        }

        // Can't kick if in-game
        if (gameState[roomId]) {
            socket.emit('error', { message: "Can't kick players while in-game" });
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
                console.log(`➖ Player ${targetPlayerId} was kicked from ${roomId}.`);
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
            socket.emit('error', { message: "Incorrect action..." });
            return;
        }

        // Heads can't readyUp
        if (rooms[roomId].head == playerId) {
            socket.emit('error', { message: "You can't readyUp, only startGame" });
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
                aliensSpawned: 0,
                aliensDestroyed: 0,
                health: 100,
                shield: 0,
                absorbActive: false,
                regenAmount: 0,
                morphyCD: null,
            };

            // Start the game loop
            startGameLoop(roomId);

            if (!gameState[roomId].morphyCD) {
                gameState[roomId].morphyCD = setInterval(() => {
                    transformAllMorphy(roomId);
                }, 5000); // every 5 seconds
            }

            io.to(roomId).emit('game_started', rooms[roomId]);
            io.to(roomId).emit('request_client_color_input_change');

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

    socket.on('request_server_color_input_change', () => {
        const roomId = players[playerId]?.room_id;
        if (!roomId || !gameState[roomId]) {
            socket.emit('error', { message: "You're not in a room" });
            return;
        }
        socket.emit("color_input_cooldown", players[playerId].character);
    });

    // Handle word submission
    socket.on("submit_word", (data) => {
        ///// RATE LIMIT /////
        checkSpam(socket.id);

        // VALIDATE DATA (VERY IMPORTANT!!!)
        if (!data || typeof data.word !== "string") {
            socket.emit('error', { message: 'Invalid action.' });
            return;
        }
        if (data.word.length > 500) {
            socket.emit('error', { message: 'Submission too long.' });
            return;
        }

        const playerId = socket.id;
        const roomId = players[playerId]?.room_id;
        const word = data.word.toLowerCase();
    
        if (!roomId || !gameState[roomId]) {
            socket.emit('error', { message: "You're not in a game." });
            return;
        }

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

            io.to(roomId).emit("emit_sound", "laser");

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
    
            console.log(`🚪 In ${roomId}, deleted and all players returned to lobby.`);
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
                        clearInterval(gameState[roomId].morphyCD);
                    }

                    // Delete the room and game state
                    delete rooms[roomId];
                    delete gameState[roomId];

                    // Return the room ID to the pool
                    const roomNumber = parseInt(roomId.split(' ')[1]);
                    availableRoomIds.push(roomNumber);
                    availableRoomIds.sort((a, b) => a - b); // Keep the pool sorted

                    console.log(`🚪 ${roomId} deleted and all players disconnected.`);
                }
            }

            console.log(`➖ Player ${playerId} disconnected from ${roomId}.`);
        }

        console.log(`🚫 Player ${playerId} disconnected.`);
        
        // Remove rate limit object if any
        clientRateLimits.delete(socket.id);

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

    socket.on('request_name_display', (playerId1) => {
        socket.emit('received_name_to_display', {id: playerId1, name: players[playerId1].name})
    });

    function checkSpam(socketId) {
        const now = Date.now();
        
        // Initialize client state if not exists
        if (!clientRateLimits.has(socketId)) {
            clientRateLimits.set(socketId, {
                lastSubmit: 0,
                warnings: 0,
                lastWarnTime: 0,
                warningResetTimeout: null
            });
        }
        
        const clientState = clientRateLimits.get(socketId);
        
        // Check if submitting too fast
        if (now - clientState.lastSubmit < RATE_LIMIT_MS) {
            // Only warn if enough time passed since last warning
            if (now - clientState.lastWarnTime >= WARNING_INTERVAL_MS) {
                clientState.warnings++;
                clientState.lastWarnTime = now;
                
                // Clear any existing reset timeout
                if (clientState.warningResetTimeout) {
                    clearTimeout(clientState.warningResetTimeout);
                }
                
                if (clientState.warnings > MAX_WARNINGS) {
                    // Disconnect the client
                    socket.emit('error', { 
                        message: 'Disconnected for excessive spamming' 
                    });
                    console.log(`🚫 Disconnected ${socketId} for spamming`);
                    socket.disconnect(true);
                    clientRateLimits.delete(socketId);
                    return;
                } else {
                    // Send warning
                    socket.emit('error', {
                        message: `Warning ${clientState.warnings}/${MAX_WARNINGS}: Slow down!`
                    });
                    console.log(`⚠️ Warning ${clientState.warnings} to ${socketId}`);
                }
                
                // Schedule warnings reset after good behavior period
                clientState.warningResetTimeout = setTimeout(() => {
                    if (clientRateLimits.has(socketId)) {
                        const state = clientRateLimits.get(socketId);
                        state.warnings = 0;
                        console.log(`♻️ Reset warnings for ${socketId}`);
                    }
                }, WARNING_RESET_MS);
            }
            
            // Reject this submission
            return;
        }
        
        // Valid submission - update last submit time
        clientState.lastSubmit = now;
        
        // If they waited long enough between submissions, reduce warnings
        if (now - clientState.lastWarnTime > WARNING_RESET_MS) {
            clientState.warnings = Math.max(0, clientState.warnings - 1);
        }
    }

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
                    io.to(roomId).emit("emit_sound", "retro");
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
                            io.to(roomId).emit('update_alien_word', { id: alien.id, newWord: generateWordImageImg(alien.word, alien.type)});
                        
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
                    io.to(roomId).emit("emit_sound", "retro");
                    gameState[roomId].aliens.forEach(alien => {
                        const cutBinary = Math.random() < 0.75;
                        if (cutBinary) {
                            const half = Math.ceil(alien.word.length / 2);
                            alien.word = alien.word.slice(0, half); // Cut word in half
                            io.to(roomId).emit('update_alien_word', { id: alien.id, newWord: generateWordImageImg(alien.word, alien.type)});
                            
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
                    io.to(roomId).emit("emit_sound", "shield");
                    magicSuccess = true;
                }
                else if (word == "/absorb") {
                    // Activate absorption
                    gameState[roomId].absorbActive = true;
                    io.to(roomId).emit("emit_sound", "shield");
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
            case "Natty":
                if (word == "/heal") {
                    let addedHealth = 30
                    if (gameState[roomId].health == 80) {addedHealth = 20}
                    if (gameState[roomId].health == 90) {addedHealth = 10}
                    if (gameState[roomId].health == 100) {addedHealth = 0}
                    gameState[roomId].health += addedHealth;
                    io.to(roomId).emit("update_health", addedHealth);
                    io.to(roomId).emit("emit_sound", "bing");
                    magicSuccess = true;
                }
                else if (word == "/regen") {
                    // This is black magic
                    let ticks = 0;
                    io.to(roomId).emit("emit_sound", "bing");
                    const regenInterval = setInterval(() => {
                        // Stop after 5 ticks (5 x 6 seconds = 30 seconds)
                        if (ticks >= 5 || !gameState[roomId]) {
                            clearInterval(regenInterval);
                            return;
                        }
                        if (gameState[roomId].health != 100) {
                            gameState[roomId].health += 10;
                            io.to(roomId).emit("update_health", 10);
                            io.to(roomId).emit("emit_sound", "cash");
                        }
                        ticks++;
                    }, 6000);
                    magicSuccess = true;
                }
    
                break;
            case "Yoda":
                if (word == "/push") {
                    io.to(roomId).emit("emit_sound", "woosh");
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
                    io.to(roomId).emit("emit_sound", "woosh");
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
                    io.to(roomId).emit("emit_sound", "woosh");
                    gameState[roomId].aliens.forEach(alien => {
                        alien.position.x = Math.random() * 95;
                        io.to(roomId).emit('alien_reshuffled', { id: alien.id, position: alien.position.x });
                    });
                    magicSuccess = true;
                }
    
                break;
            case "Arthur":
                if (word == "/freeze") {
                    io.to(roomId).emit("emit_sound", "pop");
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
                    io.to(roomId).emit("emit_sound", "pop");
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
                    io.to(roomId).emit("emit_sound", "slap");
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
                    io.to(roomId).emit("emit_sound", "slap");
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
                    io.to(roomId).emit("emit_sound", "retro");
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
                            io.to(roomId).emit('update_alien_word', { id: alien.id, newWord: generateWordImageImg(alien.word, alien.type)});
                        
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
                    io.to(roomId).emit("emit_sound", "retro");
                    gameState[roomId].aliens.forEach(alien => {
                        const cutBinary = Math.random() < 0.75;
                        if (cutBinary) {
                            const half = Math.ceil(alien.word.length / 2);
                            alien.word = alien.word.slice(0, half); // Cut word in half
                            io.to(roomId).emit('update_alien_word', { id: alien.id, newWord: generateWordImageImg(alien.word, alien.type)});
                            
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
                    io.to(roomId).emit("emit_sound", "shield");
                    magicSuccess = true;
                }
                else if (word == "/absorb") {
                    // Activate absorption
                    gameState[roomId].absorbActive = true;
                    io.to(roomId).emit("display_absorption", true);
                    io.to(roomId).emit("emit_sound", "shield");
    
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
                    io.to(roomId).emit("emit_sound", "bing");
                    magicSuccess = true;
                }
                else if (word == "/regen") {
                    // This is black magic
                    let ticks = 0;
                    io.to(roomId).emit("emit_sound", "bing");
                    const regenInterval = setInterval(() => {
                        // Stop after 5 ticks (5 x 6 seconds = 30 seconds)
                        if (ticks >= 5 || !gameState[roomId]) {
                            clearInterval(regenInterval);
                            return;
                        }
                        if (gameState[roomId].health != 100) {
                            gameState[roomId].health += 10;
                            io.to(roomId).emit("update_health", 10);
                            io.to(roomId).emit("emit_sound", "cash");
                        }
                        ticks++;
                    }, 6000);
                    magicSuccess = true;
                }
                else if (word == "/push") {
                    io.to(roomId).emit("emit_sound", "woosh");
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
                    io.to(roomId).emit("emit_sound", "woosh");
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
                    io.to(roomId).emit("emit_sound", "woosh");
                    // Reshuffle all aliens x position
                    gameState[roomId].aliens.forEach(alien => {
                        alien.position.x = Math.random() * 95;
                        io.to(roomId).emit('alien_reshuffled', { id: alien.id, position: alien.position.x });
                    });
                    magicSuccess = true;
                }
                else if (word == "/freeze") {
                    io.to(roomId).emit("emit_sound", "pop");
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
                    io.to(roomId).emit("emit_sound", "pop");
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
                    io.to(roomId).emit("emit_sound", "slap");
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
                    io.to(roomId).emit("emit_sound", "slap");
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
                else if (word == "/kill_all") {
                    io.to(roomId).emit("emit_sound", "boom");
                    gameState[roomId].aliens.forEach(alienTarget => {
    
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
                    });
                    magicSuccess = true;
                }
                break;
            default:
                // Nulla
            break;
        }

        if (magicSuccess && players[playerId].character !== "Tuxedo") {
            // Set the player's cooldown to the current timestamp
            player.cooldown = Date.now();
        
            // Start the cooldown timer (30 seconds)
            player.cooldownTimeOut = setTimeout(() => {
                player.cooldown = null; // Reset cooldown after 30 seconds
                player.cooldownTimeOut = null;
                io.to(roomId).emit("update_cooldown_global", { playerId: playerId, toggle: true , character: player.character });
            }, 30000); // 30 seconds cooldown
        
            const now = Date.now(); // server timestamp in milliseconds
            socket.emit("update_cooldown", { startTime: now, character: player.character });
            io.to(roomId).emit("update_cooldown_global", { playerId: playerId, toggle: false , character: player.character });
        }
        else if (players[playerId].character !== "Tuxedo") {
            // Incorrect (red text)
            io.to(roomId).emit("word_submitted", {
                playerId: playerId,
                isCorrect: false,
            });
        }
        else {
            // Admin (Tuxedo) execute commands with no cooldown, display green text
            io.to(roomId).emit("word_submitted", {
                playerId: playerId,
                isCorrect: true,
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
            clearInterval(gameState[roomId].morphyCD);

            // Clear the spawn interval if it exists
            if (gameState[roomId] && gameState[roomId].spawnIntervals) {
                gameState[roomId].spawnIntervals.forEach(clearInterval);
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
            clearInterval(gameState[roomId].morphyCD);

            // Clear the spawn interval if it exists
            if (gameState[roomId].spawnIntervals) {
                gameState[roomId].spawnIntervals.forEach(clearInterval);
            }

            delete gameState[roomId]; // Clean up the game state
            return;
        }
    }, 1000 / 30); // 30 Game ticks

    // Store the game loop interval ID in the game state
    gameState[roomId].gameLoop = gameLoop;
}

function cancelAllAlienTimeoutsInRoom(roomId) {
    gameState[roomId].allTimeouts.forEach(id => clearTimeout(id));
}

function transformAllMorphy(roomId) {
    if (!gameState[roomId]) return;
    const allAliens = gameState[roomId].aliens;
    const morphyAliens = allAliens.filter(alien => alien.type === "Morphy");

    morphyAliens.forEach(morphy => {
        morphy.word = wordsNetwork[Math.floor(Math.random() * wordsNetwork.length)];

        io.to(roomId).emit('update_alien_word', {
            id: morphy.id,
            newWord: generateWordImageImg(morphy.word, morphy.type),
        });
    });
}

function getRandomMathExpression() {
    const operators = ['+', '-', '*', '/'];
    const numOperands = Math.floor(Math.random() * 4) + 2; // 2-5 operands
    const numOperators = numOperands - 1; // 1-4 operators
    
    // Generate random numbers ensuring integer results for division
    let numbers = [];
    let ops = [];
    
    // First generate all numbers
    for (let i = 0; i < numOperands; i++) {
      numbers.push(Math.floor(Math.random() * 12) + 1); // 1-20
    }
    
    // Generate operators with division constraints
    let divisionCount = 0;
    for (let i = 0; i < numOperators; i++) {
      // Limit consecutive divisions and total divisions
      const lastWasDivision = i > 0 && ops[i-1] === '/';
      const availableOps = operators.filter(op => 
        op !== '/' || (!lastWasDivision && divisionCount < 1)
      );
      
      const chosenOp = availableOps[Math.floor(Math.random() * availableOps.length)];
      ops.push(chosenOp);
      
      if (chosenOp === '/') {
        divisionCount++;
        // Ensure integer division
        const factors = getFactors(numbers[i]);
        numbers[i+1] = factors[Math.floor(Math.random() * factors.length)] || 1;
      }
    }
    
    // Build the expression string
    let expression = numbers[0];
    for (let i = 0; i < ops.length; i++) {
      expression += ` ${ops[i]} ${numbers[i+1]}`;
    }
    return expression;
}
  
// Helper function to get factors of a number (excluding 1)
function getFactors(n) {
    const factors = [];
    for (let i = 2; i <= n; i++) {
        if (n % i === 0) factors.push(i);
    }
    return factors;
}

function getRandomString(length) {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789=!@#$%^&*(-)_+[]{}|;:,.<>?';
    let result = '';
    for (let i = 0; i < length; i++) {
      const randomIndex = Math.floor(Math.random() * characters.length);
      result += characters[randomIndex];
    }
    return result;
}

// Function to spawn aliens with a delay between each spawn
function spawnAlienWithDelay(roomId, count, delay, speed, word=null, type=null) {
    let spawnCount = 0;

    const spawnInterval = setInterval(() => {
        if (spawnCount >= count || !gameState[roomId]) {
            clearInterval(spawnInterval); // Stop spawning after the count is reached or if the room is deleted
            return;
        }

        spawnAlien(roomId, speed, word, null, type); // Spawn a single alien with the specified speed
        spawnCount++;
        
    }, delay);
    return spawnInterval; // Return the interval ID
}

const { createCanvas } = require('canvas');  // Import canvas creation
// const wordImageCache = new Map();

function generateWordImageImg(text, type) {
    // if (wordImageCache.has(text)) {
    //     return wordImageCache.get(text); // No need to clone since it's server-side
    // }

    // Create server-side canvas
    const canvas = createCanvas(200, 35);  // width and height can be adjusted as needed
    const ctx = canvas.getContext('2d');

    // Set font and draw text
    ctx.font = '600 16px Arial';
    const textWidth = ctx.measureText(text).width;
    canvas.width = textWidth + 20;  // Adjust canvas width based on text length
    canvas.height = 35;  // Set a fixed height

    ctx.fillStyle = '#ffffff';  // Text color
    ctx.font = '600 16px Arial';
    ctx.textBaseline = 'middle';

    if (type === "Reavy") {
        // Flip horizontally
        ctx.translate(canvas.width, 0);     // Move to the right edge
        ctx.scale(-1, 1);                   // Flip the x-axis
        ctx.fillText(text, 10, canvas.height / 2); // Draw flipped
    } else {
        ctx.fillText(text, 10, canvas.height / 2); // Normal draw
    }

    // Convert canvas to data URL (image in PNG format)
    const dataUrl = canvas.toDataURL('image/png');

    // Return the data URL instead of an image element
    const img = dataUrl;  // Just use the base64 string directly

    return img;
}

// Spawn an alien
function spawnAlien(roomId, speed, specificWord, specificCoordX, specificType) {
    if (!gameState[roomId]) return;

    let word = wordsNetwork[Math.floor(Math.random() * wordsNetwork.length)];

    if (!specificType) {
        if (word.length <= 4) {
            specificType = "Triangy";
        }
        else if (word.length <= 8) {
            specificType = "Rectangy";
        }
        else if (word.length >= 9) {
            specificType = "Pentagy";
        }
    }

    if (specificType === "Reavy" && !specificWord) word = wordsSoftware[Math.floor(Math.random() * wordsSoftware.length)]
    if (specificType === "Lancey" && !specificWord) word = wordsGeneral[Math.floor(Math.random() * wordsGeneral.length)]

    const alien = {
        id: `alien_${Date.now()}`,
        word: specificWord? specificWord : word,
        position: { x: specificCoordX? specificCoordX : Math.random() * 100, y: 0 }, // Random x position at the top
        speed: speed, // Add speed to the alien object
        speedAtBirth: speed,
        status: "normal",
        type: specificType,
    };

    gameState[roomId].aliensSpawned += 1;
    gameState[roomId].aliens.push(alien);

    // Emit the new alien to all players in the room // Handle Mathy specifically
    if (specificType === "Mathy") {
        word = "( " + getRandomMathExpression() + " )";
        alien.word = eval(word).toString();
        io.to(roomId).emit('alien_spawned', {alienId: alien.id, alienWord: generateWordImageImg(word, alien.type), alienPosition: alien.position, alienType: alien.type});
    }
    else {
        io.to(roomId).emit('alien_spawned', {alienId: alien.id, alienWord: generateWordImageImg(alien.word, alien.type), alienPosition: alien.position, alienType: alien.type});
    }
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
                    io.to(roomId).emit("emit_sound", "damage");
                    gameState[roomId].health -= 10;
                    io.to(roomId).emit('update_health', -10);
                }
                else {
                    io.to(roomId).emit("emit_sound", "damage");
                    gameState[roomId].shield -= 10;
                    io.to(roomId).emit('update_shield', -10);
                }
            }

            if (gameState[roomId].health == 0) {
                // Game over
                gameState[roomId].gameOver = true;
                io.to(roomId).emit("emit_sound", "gameOver");
                io.to(roomId).emit('game_over');
                resetCooldowns(roomId);
                cancelAllAlienTimeoutsInRoom(roomId);
                clearInterval(gameState[roomId].morphyCD);
                gameState[roomId].morphyCD = null;
                console.log(`❌ Game over in room ${roomId}.`);
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

// Function to start a wave of aliens
function startWave(roomId, waveNumber) {
    if (!gameState[roomId]) return;

    // Reset wave counters and stuff
    gameState[roomId].aliensSpawned = 0;
    gameState[roomId].aliensDestroyed = 0;
    gameState[roomId].allTimeouts = [];
    gameState[roomId].spawnIntervals = [];
    const timeouts = gameState[roomId].allTimeouts;
    const sAWD = gameState[roomId].spawnIntervals;

    switch (waveNumber) {
        case 1:
            io.to(roomId).emit('alert_warning', "Wave 1 (10 enemies)");
            io.to(roomId).emit("emit_sound", "start");
            gameState[roomId].totalAliens = 10;
            sAWD.push(spawnAlienWithDelay(roomId, 10, 1500, 0.5)); // roomId, amount, delay, speed, word=null, type=null
            break;
        case 2:
            io.to(roomId).emit('alert_warning', "Wave 2");
            io.to(roomId).emit("emit_sound", "clear");
            gameState[roomId].totalAliens = 12;
            sAWD.push(spawnAlienWithDelay(roomId, 12, 1400, 0.5));
            break;
        case 3:
            io.to(roomId).emit('alert_warning', "Wave 3");
            io.to(roomId).emit("emit_sound", "clear");
            gameState[roomId].totalAliens = 15;
            sAWD.push(spawnAlienWithDelay(roomId, 15, 1300, 0.6));
            break;
        case 4:
            io.to(roomId).emit('alert_warning', "Wave 4");
            io.to(roomId).emit("emit_sound", "clear");
            gameState[roomId].totalAliens = 19;
            sAWD.push(spawnAlienWithDelay(roomId, 19, 1250, 0.65));
            break;
        case 5:
            io.to(roomId).emit('alert_warning', "Wave 5");
            io.to(roomId).emit("emit_sound", "clear");
            gameState[roomId].totalAliens = 20;
            timeouts.push(setTimeout(() => {
                spawnAlien(roomId, 0.6, "I", 15, "Goldy");
            }, 50));
            timeouts.push(setTimeout(() => {
                spawnAlien(roomId, 0.6, "Love", 27, "Goldy");
            }, 150));
            timeouts.push(setTimeout(() => {
                spawnAlien(roomId, 0.6, "CN321", 35, "Goldy");
            }, 250));
            timeouts.push(setTimeout(() => {
                sAWD.push(spawnAlienWithDelay(roomId, 17, 1200, 0.7));
            }, 500));
            break;
        case 6:
            io.to(roomId).emit('alert_warning', "Wave 6");
            io.to(roomId).emit("emit_sound", "clear");
            gameState[roomId].totalAliens = 25;
            sAWD.push(spawnAlienWithDelay(roomId, 25, 1200, 0.75));
            break;
        case 7:
            io.to(roomId).emit('alert_warning', "Wave 7");
            io.to(roomId).emit("emit_sound", "clear");
            gameState[roomId].totalAliens = 27;
            sAWD.push(spawnAlienWithDelay(roomId, 24, 1150, 0.8));
            sAWD.push(spawnAlienWithDelay(roomId, 3, 6000, 0.6, null, "Mathy")); // roomId, amount, delay, speed, word=null, type=null
            break;
        case 8:
            io.to(roomId).emit('alert_warning', "Wave 8");
            io.to(roomId).emit("emit_sound", "clear");
            gameState[roomId].totalAliens = 30;
            sAWD.push(spawnAlienWithDelay(roomId, 27, 1150, 0.85));
            sAWD.push(spawnAlienWithDelay(roomId, 3, 6000, 0.65, null, "Mathy"));
            break;
        case 9:
            io.to(roomId).emit('alert_warning', "Wave 9");
            io.to(roomId).emit("emit_sound", "clear");
            gameState[roomId].totalAliens = 35;
            sAWD.push(spawnAlienWithDelay(roomId, 30, 1100, 0.9));
            sAWD.push(spawnAlienWithDelay(roomId, 5, 5555, 0.7, null, "Mathy"));
            break;
        case 10:
            io.to(roomId).emit('alert_warning', "Wave 10");
            io.to(roomId).emit("emit_sound", "clear");
            gameState[roomId].totalAliens = 5;
            sAWD.push(spawnAlienWithDelay(roomId, 5, 1100, 5, null, "Lancey"));
            break;
        case 11:
            io.to(roomId).emit('alert_warning', "Wave 11");
            io.to(roomId).emit("emit_sound", "clear");
            gameState[roomId].totalAliens = 16;
            sAWD.push(spawnAlienWithDelay(roomId, 16, 800, 1));
            break;
        case 12:
            io.to(roomId).emit('alert_warning', "Wave 12");
            io.to(roomId).emit("emit_sound", "clear");
            gameState[roomId].totalAliens = 17;
            sAWD.push(spawnAlienWithDelay(roomId, 16, 790, 1.05));
            sAWD.push(spawnAlienWithDelay(roomId, 1, 1333, 0.7, null, "Morphy"));
            break;
        case 13:
            io.to(roomId).emit('alert_warning', "Wave 13");
            io.to(roomId).emit("emit_sound", "clear");
            gameState[roomId].totalAliens = 18;
            sAWD.push(spawnAlienWithDelay(roomId, 16, 780, 1.1));
            sAWD.push(spawnAlienWithDelay(roomId, 2, 1233, 0.75, null, "Morphy"));
            break;
        case 14:
            io.to(roomId).emit('alert_warning', "Wave 14");
            io.to(roomId).emit("emit_sound", "clear");
            gameState[roomId].totalAliens = 19;
            sAWD.push(spawnAlienWithDelay(roomId, 16, 770, 1.15));
            sAWD.push(spawnAlienWithDelay(roomId, 3, 1213, 0.8, null, "Morphy"));
            break;
        case 15:
            io.to(roomId).emit('alert_warning', "Wave 15");
            io.to(roomId).emit("emit_sound", "clear");
            gameState[roomId].totalAliens = 20;
            timeouts.push(setTimeout(() => {
                spawnAlien(roomId, 1.2, "I", 20, "Goldy");
            }, 50));
            timeouts.push(setTimeout(() => {
                spawnAlien(roomId, 1.2, "Love", 40, "Goldy");
            }, 100));
            timeouts.push(setTimeout(() => {
                spawnAlien(roomId, 1.2, "Ajarnjack", 60, "Goldy");
            }, 150));
            timeouts.push(setTimeout(() => {
                spawnAlien(roomId, 1.2, "I", 30, "Goldy");
            }, 200));
            timeouts.push(setTimeout(() => {
                spawnAlien(roomId, 1.2, "Love", 50, "Goldy");
            }, 250));
            timeouts.push(setTimeout(() => {
                spawnAlien(roomId, 1.2, "Ajarnpiya", 70, "Goldy");
            }, 300));
            timeouts.push(setTimeout(() => {
                spawnAlien(roomId, 1.2, "I", 40, "Goldy");
            }, 350));
            timeouts.push(setTimeout(() => {
                spawnAlien(roomId, 1.2, "Love", 60, "Goldy");
            }, 400));
            timeouts.push(setTimeout(() => {
                spawnAlien(roomId, 1.2, "Ajarnart", 80, "Goldy");
            }, 450));
            sAWD.push(spawnAlienWithDelay(roomId, 11, 770, 1.2));
            break;
        case 16:
            io.to(roomId).emit('alert_warning', "Wave 16");
            io.to(roomId).emit("emit_sound", "clear");
            gameState[roomId].totalAliens = 25;
            timeouts.push(setTimeout(() => {
                timeouts.push(setTimeout(() => {
                    spawnAlien(roomId, 1.5, "1", 3, "Goldy");
                }, 50));
                timeouts.push(setTimeout(() => {
                    spawnAlien(roomId, 1.5, "2", 13, "Goldy");
                }, 100));
                timeouts.push(setTimeout(() => {
                    spawnAlien(roomId, 1.5, "3", 23, "Goldy");
                }, 150));
                timeouts.push(setTimeout(() => {
                    spawnAlien(roomId, 1.5, "4", 33, "Goldy");
                }, 200));
                timeouts.push(setTimeout(() => {
                    spawnAlien(roomId, 1.5, "5", 43, "Goldy");
                }, 250));
                timeouts.push(setTimeout(() => {
                    spawnAlien(roomId, 1.5, "6", 53, "Goldy");
                }, 300));
                timeouts.push(setTimeout(() => {
                    spawnAlien(roomId, 1.5, "7", 63, "Goldy");
                }, 350));
                timeouts.push(setTimeout(() => {
                    spawnAlien(roomId, 1.5, "8", 73, "Goldy");
                }, 400));
                timeouts.push(setTimeout(() => {
                    spawnAlien(roomId, 1.5, "9", 83, "Goldy");
                }, 450));
                timeouts.push(setTimeout(() => {
                    spawnAlien(roomId, 1.5, "10", 93, "Goldy");
                }, 500));
            }, 500));
            sAWD.push(spawnAlienWithDelay(roomId, 15, 770, 1.3));
            break;
        case 17:
            io.to(roomId).emit('alert_warning', "Wave 17");
            io.to(roomId).emit("emit_sound", "clear");
            gameState[roomId].totalAliens = 25;
            sAWD.push(spawnAlienWithDelay(roomId, 20, 755, 1.4));
            sAWD.push(spawnAlienWithDelay(roomId, 5, 1100, 5.5, null, "Lancey"));
            break;
        case 18:
            io.to(roomId).emit('alert_warning', "Wave 18");
            io.to(roomId).emit("emit_sound", "clear");
            gameState[roomId].totalAliens = 25;
            sAWD.push(spawnAlienWithDelay(roomId, 20, 700, 1.5));
            sAWD.push(spawnAlienWithDelay(roomId, 5, 1100, 5.6, null, "Lancey"));
            break;
        case 19:
            io.to(roomId).emit('alert_warning', "Wave 19");
            io.to(roomId).emit("emit_sound", "clear");
            gameState[roomId].totalAliens = 25;
            sAWD.push(spawnAlienWithDelay(roomId, 20, 700, 1.6));
            sAWD.push(spawnAlienWithDelay(roomId, 5, 1100, 5.7, null, "Lancey"));
            break;
        case 20:
            io.to(roomId).emit('alert_warning', "Wave 20");
            io.to(roomId).emit("emit_sound", "clear");
            gameState[roomId].totalAliens = 10;
            timeouts.push(setTimeout(() => {
                timeouts.push(setTimeout(() => {
                    spawnAlien(roomId, 1.5, getRandomString(3), 9, "Smoky");
                }, 1000));
                timeouts.push(setTimeout(() => {
                    spawnAlien(roomId, 1.5, getRandomString(4), 18, "Smoky");
                }, 2000));
                timeouts.push(setTimeout(() => {
                    spawnAlien(roomId, 1.5, getRandomString(3), 27, "Smoky");
                }, 3000));
                timeouts.push(setTimeout(() => {
                    spawnAlien(roomId, 1.5, getRandomString(4), 36, "Smoky");
                }, 4000));
                timeouts.push(setTimeout(() => {
                    spawnAlien(roomId, 1.5, getRandomString(3), 45, "Smoky");
                }, 5000));
                timeouts.push(setTimeout(() => {
                    spawnAlien(roomId, 1.5, getRandomString(4), 54, "Smoky");
                }, 6000));
                timeouts.push(setTimeout(() => {
                    spawnAlien(roomId, 1.5, getRandomString(3), 63, "Smoky");
                }, 7000));
                timeouts.push(setTimeout(() => {
                    spawnAlien(roomId, 1.5, getRandomString(4), 72, "Smoky");
                }, 8000));
                timeouts.push(setTimeout(() => {
                    spawnAlien(roomId, 1.5, getRandomString(3), 81, "Smoky");
                }, 9000));
                timeouts.push(setTimeout(() => {
                    spawnAlien(roomId, 1.5, getRandomString(4), 90, "Smoky");
                }, 10000));
            }, 500));
            break;
        case 21:
            io.to(roomId).emit('alert_warning', "Wave 21");
            io.to(roomId).emit("emit_sound", "clear");
            gameState[roomId].totalAliens = 8;
            sAWD.push(spawnAlienWithDelay(roomId, 8, 1200, 6, null, "Lancey"));
            break;
        case 22:
            io.to(roomId).emit('alert_warning', "Wave 22");
            io.to(roomId).emit("emit_sound", "clear");
            gameState[roomId].totalAliens = 10;
            sAWD.push(spawnAlienWithDelay(roomId, 5, 1200, 6, null, "Lancey"));
            sAWD.push(spawnAlienWithDelay(roomId, 5, 1250, 1.5));
            break;
        case 23:
            io.to(roomId).emit('alert_warning', "Wave 23");
            io.to(roomId).emit("emit_sound", "clear");
            gameState[roomId].totalAliens = 10;
            sAWD.push(spawnAlienWithDelay(roomId, 5, 1200, 6, null, "Lancey"));
            sAWD.push(spawnAlienWithDelay(roomId, 5, 1250, 1.5, null, "Morphy"));
            break;
        case 24:
            io.to(roomId).emit('alert_warning', "Wave 24");
            io.to(roomId).emit("emit_sound", "clear");
            gameState[roomId].totalAliens = 10;
            sAWD.push(spawnAlienWithDelay(roomId, 5, 1200, 6, null, "Lancey"));
            sAWD.push(spawnAlienWithDelay(roomId, 5, 1250, 1.5, null, "Mathy"));
            break;
        case 25:
            io.to(roomId).emit('alert_warning', "Wave 25");
            io.to(roomId).emit("emit_sound", "clear");
            gameState[roomId].totalAliens = 15;
            sAWD.push(spawnAlienWithDelay(roomId, 5, 1200, 6, null, "Lancey"));
            sAWD.push(spawnAlienWithDelay(roomId, 5, 1250, 1.5, null, "Mathy"));
            sAWD.push(spawnAlienWithDelay(roomId, 5, 1330, 1.5, null, "Morphy"));
            break;
        case 26:
            io.to(roomId).emit('alert_warning', "Wave 26");
            io.to(roomId).emit("emit_sound", "clear");
            gameState[roomId].totalAliens = 20;
            sAWD.push(spawnAlienWithDelay(roomId, 10, 1141, 1.5));
            sAWD.push(spawnAlienWithDelay(roomId, 5, 1250, 1.5, null, "Mathy"));
            sAWD.push(spawnAlienWithDelay(roomId, 5, 1330, 1.5, null, "Morphy"));
            break;
        case 27:
            io.to(roomId).emit('alert_warning', "Wave 27");
            io.to(roomId).emit("emit_sound", "clear");
            gameState[roomId].totalAliens = 25;
            sAWD.push(spawnAlienWithDelay(roomId, 25, 500, 1.5));
            break;
        case 28:
            io.to(roomId).emit('alert_warning', "Wave 28");
            io.to(roomId).emit("emit_sound", "clear");
            gameState[roomId].totalAliens = 20;
            timeouts.push(setTimeout(() => {
                timeouts.push(setTimeout(() => {
                    spawnAlien(roomId, 1.5, getRandomString(4), 9, "Smoky");
                }, 1000));
                timeouts.push(setTimeout(() => {
                    spawnAlien(roomId, 1.5, getRandomString(4), 18, "Smoky");
                }, 2000));
                timeouts.push(setTimeout(() => {
                    spawnAlien(roomId, 1.5, getRandomString(4), 27, "Smoky");
                }, 3000));
                timeouts.push(setTimeout(() => {
                    spawnAlien(roomId, 1.5, getRandomString(4), 36, "Smoky");
                }, 4000));
                timeouts.push(setTimeout(() => {
                    spawnAlien(roomId, 1.5, getRandomString(4), 45, "Smoky");
                }, 5000));
                timeouts.push(setTimeout(() => {
                    spawnAlien(roomId, 1.5, getRandomString(4), 54, "Smoky");
                }, 6000));
                timeouts.push(setTimeout(() => {
                    spawnAlien(roomId, 1.5, getRandomString(4), 64, "Smoky");
                }, 7000));
                timeouts.push(setTimeout(() => {
                    spawnAlien(roomId, 1.5, getRandomString(4), 72, "Smoky");
                }, 8000));
                timeouts.push(setTimeout(() => {
                    spawnAlien(roomId, 1.5, getRandomString(4), 81, "Smoky");
                }, 9000));
                timeouts.push(setTimeout(() => {
                    spawnAlien(roomId, 1.5, getRandomString(4), 90, "Smoky");
                }, 10000));
            }, 500));
            sAWD.push(spawnAlienWithDelay(roomId, 10, 950, 1.5));
            break;
        case 29:
            io.to(roomId).emit('alert_warning', "Wave 29");
            io.to(roomId).emit("emit_sound", "clear");
            gameState[roomId].totalAliens = 25;
            sAWD.push(spawnAlienWithDelay(roomId, 5, 500, 1.5));
            sAWD.push(spawnAlienWithDelay(roomId, 10, 1670, 6, null, "Lancey"));
            sAWD.push(spawnAlienWithDelay(roomId, 10, 1780, 1.5, null, "Morphy"));
            break;
        case 30:
            io.to(roomId).emit('alert_warning', "Wave 30");
            io.to(roomId).emit("emit_sound", "clear");
            gameState[roomId].totalAliens = 25;
            sAWD.push(spawnAlienWithDelay(roomId, 11, 1670, 6, null, "Lancey"));
            sAWD.push(spawnAlienWithDelay(roomId, 11, 1780, 1.5, null, "Morphy"));
            sAWD.push(spawnAlienWithDelay(roomId, 3, 2215, 1.5, null, "Reavy"));
            break;
        case 31:
            io.to(roomId).emit('alert_warning', "Wave 31");
            io.to(roomId).emit("emit_sound", "clear");
            gameState[roomId].totalAliens = 15;
            sAWD.push(spawnAlienWithDelay(roomId, 15, 900, 1.5, null, "Reavy"));
            break;
        case 32:
            io.to(roomId).emit('alert_warning', "Wave 32");
            io.to(roomId).emit("emit_sound", "clear");
            gameState[roomId].totalAliens = 25;
            sAWD.push(spawnAlienWithDelay(roomId, 10, 1455, 1.5));
            sAWD.push(spawnAlienWithDelay(roomId, 15, 1100, 1.5, null, "Reavy"));
            break;
        case 33:
            io.to(roomId).emit('alert_warning', "Wave 33");
            io.to(roomId).emit("emit_sound", "clear");
            gameState[roomId].totalAliens = 25;
            sAWD.push(spawnAlienWithDelay(roomId, 10, 1355, 6.1, null, "Lancey"));
            sAWD.push(spawnAlienWithDelay(roomId, 15, 1100, 1.5, null, "Reavy"));
            break;
        case 34:
            io.to(roomId).emit('alert_warning', "Wave 34");
            io.to(roomId).emit("emit_sound", "clear");
            gameState[roomId].totalAliens = 25;
            sAWD.push(spawnAlienWithDelay(roomId, 10, 1255, 1.5, null, "Morphy"));
            sAWD.push(spawnAlienWithDelay(roomId, 15, 1100, 1.5, null, "Reavy"));
            break;
        case 35:
            io.to(roomId).emit('alert_warning', "Wave 35");
            io.to(roomId).emit("emit_sound", "clear");
            gameState[roomId].totalAliens = 40;
            sAWD.push(spawnAlienWithDelay(roomId, 40, 800, 1.5, null, "Morphy"));
            break;
        case 36:
            io.to(roomId).emit('alert_warning', "Wave 36");
            io.to(roomId).emit("emit_sound", "clear");
            gameState[roomId].totalAliens = 20;
            sAWD.push(spawnAlienWithDelay(roomId, 20, 700, 6.2, null, "Lancey"));
            break;
        case 37:
            io.to(roomId).emit('alert_warning', "Wave 37");
            io.to(roomId).emit("emit_sound", "clear");
            gameState[roomId].totalAliens = 30;
            sAWD.push(spawnAlienWithDelay(roomId, 10, 775, 6.2, null, "Lancey"));
            sAWD.push(spawnAlienWithDelay(roomId, 20, 610, 1.7));
            break;
        case 38:
            io.to(roomId).emit('alert_warning', "Wave 38");
            io.to(roomId).emit("emit_sound", "clear");
            gameState[roomId].totalAliens = 20;
            sAWD.push(spawnAlienWithDelay(roomId, 10, 775, 6.2, null, "Lancey"));
            sAWD.push(spawnAlienWithDelay(roomId, 10, 810, 1.7, null, "Mathy"));
            break;
        case 39:
            io.to(roomId).emit('alert_warning', "Wave 39");
            io.to(roomId).emit("emit_sound", "clear");
            gameState[roomId].totalAliens = 40;
            sAWD.push(spawnAlienWithDelay(roomId, 25, 1115, 1.7, null, "Reavy"));
            sAWD.push(spawnAlienWithDelay(roomId, 15, 1950, 1.7, null, "Mathy"));
            break;
        case 40:
            io.to(roomId).emit('alert_warning', "Wave 40");
            io.to(roomId).emit("emit_sound", "clear");
            gameState[roomId].totalAliens = 45;
            timeouts.push(setTimeout(() => {
                timeouts.push(setTimeout(() => {
                    spawnAlien(roomId, 1.7, getRandomString(5), 9, "Smoky");
                }, 1000));
                timeouts.push(setTimeout(() => {
                    spawnAlien(roomId, 1.7, getRandomString(5), 18, "Smoky");
                }, 4000));
                timeouts.push(setTimeout(() => {
                    spawnAlien(roomId, 1.7, getRandomString(5), 27, "Smoky");
                }, 7000));
                timeouts.push(setTimeout(() => {
                    spawnAlien(roomId, 1.7, getRandomString(5), 36, "Smoky");
                }, 10000));
                timeouts.push(setTimeout(() => {
                    spawnAlien(roomId, 1.7, getRandomString(5), 45, "Smoky");
                }, 13000));
                timeouts.push(setTimeout(() => {
                    spawnAlien(roomId, 1.7, getRandomString(5), 54, "Smoky");
                }, 16000));
                timeouts.push(setTimeout(() => {
                    spawnAlien(roomId, 1.7, getRandomString(5), 64, "Smoky");
                }, 19000));
                timeouts.push(setTimeout(() => {
                    spawnAlien(roomId, 1.7, getRandomString(5), 72, "Smoky");
                }, 22000));
                timeouts.push(setTimeout(() => {
                    spawnAlien(roomId, 1.7, getRandomString(5), 81, "Smoky");
                }, 25000));
                timeouts.push(setTimeout(() => {
                    spawnAlien(roomId, 1.7, getRandomString(5), 90, "Smoky");
                }, 10000));
            }, 500));
            timeouts.push(setTimeout(() => {
                timeouts.push(setTimeout(() => {
                    spawnAlien(roomId, 2, "2", 3, "Goldy");
                }, 50));
                timeouts.push(setTimeout(() => {
                    spawnAlien(roomId, 2, "3", 13, "Goldy");
                }, 100));
                timeouts.push(setTimeout(() => {
                    spawnAlien(roomId, 2, "5", 23, "Goldy");
                }, 150));
                timeouts.push(setTimeout(() => {
                    spawnAlien(roomId, 2, "7", 33, "Goldy");
                }, 200));
                timeouts.push(setTimeout(() => {
                    spawnAlien(roomId, 2, "11", 43, "Goldy");
                }, 250));
                timeouts.push(setTimeout(() => {
                    spawnAlien(roomId, 2, "13", 53, "Goldy");
                }, 300));
                timeouts.push(setTimeout(() => {
                    spawnAlien(roomId, 2, "17", 63, "Goldy");
                }, 350));
                timeouts.push(setTimeout(() => {
                    spawnAlien(roomId, 2, "19", 73, "Goldy");
                }, 400));
                timeouts.push(setTimeout(() => {
                    spawnAlien(roomId, 2, "23", 83, "Goldy");
                }, 450));
                timeouts.push(setTimeout(() => {
                    spawnAlien(roomId, 2, "29", 93, "Goldy");
                }, 500));
            }, 5000));
            timeouts.push(setTimeout(() => {
                timeouts.push(setTimeout(() => {
                    spawnAlien(roomId, 2, "31", 93, "Goldy");
                }, 50));
                timeouts.push(setTimeout(() => {
                    spawnAlien(roomId, 2, "37", 83, "Goldy");
                }, 100));
                timeouts.push(setTimeout(() => {
                    spawnAlien(roomId, 2, "41", 73, "Goldy");
                }, 150));
                timeouts.push(setTimeout(() => {
                    spawnAlien(roomId, 2, "43", 63, "Goldy");
                }, 200));
                timeouts.push(setTimeout(() => {
                    spawnAlien(roomId, 2, "47", 53, "Goldy");
                }, 250));
                timeouts.push(setTimeout(() => {
                    spawnAlien(roomId, 2, "53", 43, "Goldy");
                }, 300));
                timeouts.push(setTimeout(() => {
                    spawnAlien(roomId, 2, "59", 33, "Goldy");
                }, 350));
                timeouts.push(setTimeout(() => {
                    spawnAlien(roomId, 2, "61", 23, "Goldy");
                }, 400));
                timeouts.push(setTimeout(() => {
                    spawnAlien(roomId, 2, "67", 13, "Goldy");
                }, 450));
                timeouts.push(setTimeout(() => {
                    spawnAlien(roomId, 2, "71", 3, "Goldy");
                }, 500));
            }, 15000));
            timeouts.push(setTimeout(() => {
                timeouts.push(setTimeout(() => {
                    spawnAlien(roomId, 2, "73", 3, "Goldy");
                }, 50));
                timeouts.push(setTimeout(() => {
                    spawnAlien(roomId, 2, "79", 13, "Goldy");
                }, 100));
                timeouts.push(setTimeout(() => {
                    spawnAlien(roomId, 2, "83", 23, "Goldy");
                }, 150));
                timeouts.push(setTimeout(() => {
                    spawnAlien(roomId, 2, "89", 33, "Goldy");
                }, 200));
                timeouts.push(setTimeout(() => {
                    spawnAlien(roomId, 2, "97", 43, "Goldy");
                }, 250));
            }, 25000));
            sAWD.push(spawnAlienWithDelay(roomId, 10, 3333, 1.7, null, "Mathy"));
            break;
        case 41:
            io.to(roomId).emit('alert_warning', "Wave 41");
            io.to(roomId).emit("emit_sound", "clear");
            gameState[roomId].totalAliens = 45;
            sAWD.push(spawnAlienWithDelay(roomId, 20, 1115, 1.7, null, "Reavy"));
            sAWD.push(spawnAlienWithDelay(roomId, 15, 1931, 1.7, null, "Mathy"));
            sAWD.push(spawnAlienWithDelay(roomId, 10, 2350, 1.7, null, "Morphy"));
            break;
        case 42:
            io.to(roomId).emit('alert_warning', "Wave 42");
            io.to(roomId).emit("emit_sound", "clear");
            gameState[roomId].totalAliens = 6;
            timeouts.push(setTimeout(() => {
                spawnAlien(roomId, 0.85, "Lorem, ipsum dolor sit amet consectetur adipisicing elit. Magnam, atque?", 45, "Goldy");
            }, 250));
            timeouts.push(setTimeout(() => {
                spawnAlien(roomId, 0.83, getRandomString(17), 55, "Smoky");
            }, 8000));
            timeouts.push(setTimeout(() => {
                spawnAlien(roomId, 0.8, "Lorem, ipsum dolor sit amet consectetur adipisicing elit.", 45, "Goldy");
            }, 16000));
            timeouts.push(setTimeout(() => {
                spawnAlien(roomId, 0.75, getRandomString(21), 55, "Smoky");
            }, 24000));
            timeouts.push(setTimeout(() => {
                spawnAlien(roomId, 0.7, "Lorem, ipsum dolor sit amet.", 45, "Goldy");
            }, 30000));
            timeouts.push(setTimeout(() => {
                spawnAlien(roomId, 0.65, getRandomString(25), 55, "Smoky");
            }, 37000));
            break;
        case 43:
            io.to(roomId).emit('alert_warning', "Wave 43");
            io.to(roomId).emit("emit_sound", "clear");
            gameState[roomId].totalAliens = 28;
            timeouts.push(setTimeout(() => {
                spawnAlien(roomId, 0.85, "Congratulations! You beat the game!", 45, "Goldy");
            }, 250));
            timeouts.push(setTimeout(() => {
                spawnAlien(roomId, 0.85, "jk", 45, "Goldy");
            }, 10000));
            timeouts.push(setTimeout(() => {
                spawnAlien(roomId, 0.85, "Now, DIE!", 45, "Goldy");
            }, 13000));
            timeouts.push(setTimeout(() => {
                sAWD.push(spawnAlienWithDelay(roomId, 25, 500, 6.5, null, "Lancey"));
            }, 14900));
            break;
        case 44:
            io.to(roomId).emit('alert_warning', "Wave 44");
            io.to(roomId).emit("emit_sound", "clear");
            gameState[roomId].totalAliens = 37;
            timeouts.push(setTimeout(() => {
                spawnAlien(roomId, 0.85, "How did you survive that!?!?", 45, "Goldy");
            }, 250));
            timeouts.push(setTimeout(() => {
                spawnAlien(roomId, 0.85, "Now, take this!", 45, "Goldy");
            }, 10000));
            timeouts.push(setTimeout(() => {
                sAWD.push(spawnAlienWithDelay(roomId, 35, 630, 1.8, null, "Morphy"));
            }, 16000));
            break;
        case 45:
            io.to(roomId).emit('alert_warning', "Wave 45");
            io.to(roomId).emit("emit_sound", "clear");
            gameState[roomId].totalAliens = 30;
            sAWD.push(spawnAlienWithDelay(roomId, 30, 540, 1.8, null, "Reavy"));
            break;
        case 46:
            io.to(roomId).emit('alert_warning', "Wave 46");
            io.to(roomId).emit("emit_sound", "clear");
            gameState[roomId].totalAliens = 20;
            timeouts.push(setTimeout(() => {
                timeouts.push(setTimeout(() => {
                    spawnAlien(roomId, 1.7, getRandomString(6), 9, "Smoky");
                }, 1000));
                timeouts.push(setTimeout(() => {
                    spawnAlien(roomId, 1.7, getRandomString(6), 18, "Smoky");
                }, 2000));
                timeouts.push(setTimeout(() => {
                    spawnAlien(roomId, 1.7, getRandomString(6), 27, "Smoky");
                }, 3000));
                timeouts.push(setTimeout(() => {
                    spawnAlien(roomId, 1.7, getRandomString(6), 36, "Smoky");
                }, 4000));
                timeouts.push(setTimeout(() => {
                    spawnAlien(roomId, 1.7, getRandomString(6), 45, "Smoky");
                }, 5000));
                timeouts.push(setTimeout(() => {
                    spawnAlien(roomId, 1.7, getRandomString(6), 54, "Smoky");
                }, 6000));
                timeouts.push(setTimeout(() => {
                    spawnAlien(roomId, 1.7, getRandomString(6), 64, "Smoky");
                }, 7000));
                timeouts.push(setTimeout(() => {
                    spawnAlien(roomId, 1.7, getRandomString(6), 72, "Smoky");
                }, 8000));
                timeouts.push(setTimeout(() => {
                    spawnAlien(roomId, 1.7, getRandomString(6), 81, "Smoky");
                }, 9000));
                timeouts.push(setTimeout(() => {
                    spawnAlien(roomId, 1.7, getRandomString(6), 90, "Smoky");
                }, 10000));
                timeouts.push(setTimeout(() => {
                    spawnAlien(roomId, 1.7, getRandomString(6), 9, "Smoky");
                }, 11000));
                timeouts.push(setTimeout(() => {
                    spawnAlien(roomId, 1.7, getRandomString(6), 18, "Smoky");
                }, 12000));
                timeouts.push(setTimeout(() => {
                    spawnAlien(roomId, 1.7, getRandomString(6), 27, "Smoky");
                }, 13000));
                timeouts.push(setTimeout(() => {
                    spawnAlien(roomId, 1.7, getRandomString(6), 36, "Smoky");
                }, 14000));
                timeouts.push(setTimeout(() => {
                    spawnAlien(roomId, 1.7, getRandomString(6), 45, "Smoky");
                }, 15000));
                timeouts.push(setTimeout(() => {
                    spawnAlien(roomId, 1.7, getRandomString(6), 54, "Smoky");
                }, 16000));
                timeouts.push(setTimeout(() => {
                    spawnAlien(roomId, 1.7, getRandomString(6), 64, "Smoky");
                }, 17000));
                timeouts.push(setTimeout(() => {
                    spawnAlien(roomId, 1.7, getRandomString(6), 72, "Smoky");
                }, 18000));
                timeouts.push(setTimeout(() => {
                    spawnAlien(roomId, 1.7, getRandomString(6), 81, "Smoky");
                }, 19000));
                timeouts.push(setTimeout(() => {
                    spawnAlien(roomId, 1.7, getRandomString(6), 90, "Smoky");
                }, 20000));
            }, 500));
            break;
        case 47:
            io.to(roomId).emit('alert_warning', "Wave 47");
            io.to(roomId).emit("emit_sound", "clear");
            gameState[roomId].totalAliens = 31;
            timeouts.push(setTimeout(() => {
                spawnAlien(roomId, 2, "Impossible!", 45, "Goldy");
            }, 250));
            timeouts.push(setTimeout(() => {
            sAWD.push(spawnAlienWithDelay(roomId, 30, 1400, 1.3, null, "Mathy"));
            }, 3500));
            break;
        case 48:
            io.to(roomId).emit('alert_warning', "Wave 48");
            io.to(roomId).emit("emit_sound", "clear");
            gameState[roomId].totalAliens = 55;
            sAWD.push(spawnAlienWithDelay(roomId, 50, 850, 2.1));
            timeouts.push(setTimeout(() => {
                spawnAlien(roomId, 1, getRandomString(10), 50, "Smoky");
            }, 10070));
            timeouts.push(setTimeout(() => {
                spawnAlien(roomId, 1, "Guardian of the Typurr", 50, "Reavy");
            }, 20070));
            timeouts.push(setTimeout(() => {
                spawnAlien(roomId, 1, "AbcdEfGhIjKlmNopqrStuvWXYz", 50, "Reavy");
            }, 30070));
            timeouts.push(setTimeout(() => {
                spawnAlien(roomId, 0.5, getRandomString(40), 50, "Smoky");
            }, 40070));
            timeouts.push(setTimeout(() => {
                spawnAlien(roomId, 3, "eh...", 50, "Goldy");
            }, 50070));
            break;
        case 49:
            io.to(roomId).emit('alert_warning', "Wave 49");
            io.to(roomId).emit("emit_sound", "clear");
            gameState[roomId].totalAliens = 20;
            sAWD.push(spawnAlienWithDelay(roomId, 20, 900, 8.7, null, "Lancey"));
            break;
        case 50:
            io.to(roomId).emit('alert_warning', "Wave 50");
            io.to(roomId).emit("emit_sound", "clear");
            gameState[roomId].totalAliens = 2;
            timeouts.push(setTimeout(() => {
                spawnAlien(roomId, 1, "Ok, that is it for real, thanks for playing!", 50, "Goldy");
            }, 400));
            timeouts.push(setTimeout(() => {
                spawnAlien(roomId, 20, "xD", 50, "Goldy");
            }, 12000));
            break;
        default:
            // If no more waves are defined, end the game
            io.to(roomId).emit('alert_warning', "Final Wave Completed!");
            io.to(roomId).emit("emit_sound", "clear");
            cancelAllAlienTimeoutsInRoom(roomId);
            gameState[roomId].gameOver = true;
            io.to(roomId).emit('game_over');
            console.log(`❌ Game over in room ${roomId}.`);
            break;
    }
}

// Use Render's dynamic port
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
