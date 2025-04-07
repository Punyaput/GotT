// Switch on for local development
// const socket = io('http://localhost:5000');

// Switch on for testing on Render
const socket = io('https://gott-thqh.onrender.com/');

let currentRoom = null;
let playerName = "";
let isReady = false; // Track the player's ready state
let isHead = false; // Track if the player is the head
let currentWord = ""; // Track the current word being typed
let playerElements = {}; // Store player elements for updating positions

let characters = ["Nulla", "Jacky", "Pewya", "Nutty", "Yoda", "Arthur", "Power", "Tuxedo"];
let currentIndex = 0;

function setName() {
    playerName = document.getElementById("player-name").value;
    if (playerName) {
        socket.emit("set_name", { name: playerName });
        document.getElementById("name-form").style.display = "none";
        document.getElementById("lobby").style.display = "flex";
    }
}

function createRoom() {
    socket.emit("create_room");
}

function joinRoom(roomId) {
    socket.emit("join_room", { room_id: roomId });
}

function exitRoom() {
    socket.emit("exit_room");
}

function readyUp() {
    socket.emit("player_ready");
    isReady = !isReady; // Toggle the ready state
    updateReadyButton(); // Update the button text
}

function startGame() {
    socket.emit("start_game");
}

function kickPlayer(targetPlayerId) {
    socket.emit("kick_player", { target_player_id: targetPlayerId });
}

function updateReadyButton() {
    const readyButton = document.getElementById("ready-button");
    if (isHead) {
        readyButton.innerText = "Start Game";
        readyButton.onclick = startGame;
    } else {
        readyButton.innerText = isReady ? "Unready" : "Ready";
        readyButton.onclick = readyUp;
    }
}

function updateLobbyVisibility() {
    const roomList = document.getElementById("room-list");
    const createRoomBtn = document.getElementById("create-room-btn");
    const gameRoom = document.getElementById("game-room");

    if (currentRoom) {
        roomList.style.display = "none";
        createRoomBtn.style.display = "none";
        gameRoom.style.display = "flex";
    } else {
        roomList.style.display = "flex";
        createRoomBtn.style.display = "inline-block";
        gameRoom.style.display = "none";
    }
}

socket.on("room_list", (rooms) => {
    const roomList = document.getElementById("room-list");
    roomList.innerHTML = "";

    for (const [roomId, playerCount] of Object.entries(rooms)) {
        const roomDiv = document.createElement("div");
        roomDiv.classList.add("room");

        // Add the "full" class if the room is full
        if (playerCount.playerCount >= 4) {
            roomDiv.classList.add("full");
        }

        // Add the "in-progress" class if the game is in progress
        if (rooms[roomId].gameInProgress) {
            roomDiv.classList.add("in-progress");
        }

        roomDiv.innerHTML = 
        `
        <h3>${roomId}</h3>
        <p>${rooms[roomId].playerCount} / 4 Players</p>
        <button onclick="joinRoom('${roomId}')" ${rooms.playerCount >= 4 || rooms.gameInProgress ? "disabled" : ""}>Join</button>
        `;

        roomList.appendChild(roomDiv);
    }
});

socket.on("joined_room", (roomId) => {
    currentRoom = roomId;
    document.getElementById("room-title").innerText = `${roomId}`;
    isHead = false; // Joined player is never the head
    updateLobbyVisibility();
});

socket.on("exited_room", () => {
    currentRoom = null;
    isReady = false; // Reset ready state when exiting the room
    updateLobbyVisibility();
    socket.emit("get_rooms");
});

socket.on("player_list", (players) => {
    const playerList = document.getElementById("player-list");
    playerList.innerHTML = "";

    // Update the player's head status
    const currentPlayer = players.find(p => p.id === socket.id); // Use socket.id to identify the current player
    if (currentPlayer) {
        isHead = currentPlayer.is_head;
        isReady = currentPlayer.ready;
    }

    players.forEach(player => {
        const playerDiv = document.createElement("div");
        playerDiv.classList.add("player");

        // Add kick button for the head (only if the current player is the head and the target is not themselves)
        const kickButton = isHead && player.id !== socket.id
            ? `<div class="kick-button" onclick="kickPlayer('${player.id}')">❌</div>`
            : "";
        const crownDisplay = player.is_head 
            ? `<div class="crown-display">👑</div>`
            : "";
        const blankButton = !player.is_head && !isHead
            ? `<div class="blank-button"></div>`
            : "";
        const chosenCatIcon = `<div class="chosen-cat" id="chosen-cat-${player.id}"> <img class="character-image2" src="./images/${player.character}TN2.png"> </div>`

        playerDiv.innerHTML = `
            ${chosenCatIcon}
            <div class="player-name">${player.name}</div>
            <div id="ready-state" class="${player.ready ? "player-ready" : "player-not-ready"}">${player.ready ? "Ready" : "Await"}</div>
            ${kickButton}
            ${crownDisplay}
            ${blankButton}
        `;
        playerList.appendChild(playerDiv);
        // socket.emit('retrieve_character');
        
        if (player.id == socket.id) {
            const characterSelection = document.createElement("div");
            characterSelection.classList.add("character-selection");
            playerList.appendChild(characterSelection);

            characterSelection.innerHTML = 
            `<div class="character-container">
                <div class="character fade-in" id="character"> <img id="character-image1" class="character-image1" src="./images/${characters[currentIndex]}TN1.png"></div>
            </div>
            <div class="arrow left" onclick="prevCharacter()">&#9664;</div>
            <div class="arrow right" onclick="nextCharacter()">&#9654;</div>
            <button class="select-btn" onclick="selectCharacter()">Select</button>`;
        }
    });
    updateReadyButton(); // Update the button based on head status and ready state
});

socket.on('character_changed', (data) => {
    chosenCharacter = data.character;
    document.getElementById("chosen-cat-" + data.id).innerHTML = `<img class="character-image2" src="./images/${data.character}TN2.png">`
});

function updateCharacter(direction) {
    document.getElementById("character").classList.remove("fade-in");
    document.getElementById("character").classList.add(direction === 'left' ? "fade-out-left" : "fade-out-right");
    
    setTimeout(() => {
        document.getElementById("character").textContent = characters[currentIndex];
        document.getElementById("character").innerHTML = `<img id="character-image1" class="character-image1">`
        document.getElementById("character").classList.remove("fade-out-left", "fade-out-right");
        document.getElementById("character").classList.add("fade-in");
        changeCharacterBG1(characters[currentIndex]);
    }, 300);
}

function prevCharacter() {
    currentIndex = (currentIndex - 1 + characters.length) % characters.length;
    updateCharacter('left');
}

function nextCharacter() {
    currentIndex = (currentIndex + 1) % characters.length;
    updateCharacter('right');
}

function changeCharacterBG1(character) {
    document.getElementById("character-image1").src = "./images/" + character + "TN1.png";
}

function selectCharacter() {

    socket.emit("change_character", characters[currentIndex])

    Swal.fire({
        toast: true,
        icon: "success",
        title: "Selected " + characters[currentIndex],
        position: "top",
        background: "#00CC00",
        color: "#000",
        showConfirmButton: false,
        timer: 1500,
    });
}

socket.on("kicked_from_room", () => {
    Swal.fire({
        toast: true,
        icon: "error",
        title: "You've been kicked out of a room!", 
        position: "top",
        background: "#ff4b2b",
        color: "#fff",
        showConfirmButton: false,
        timer: 3000,
    });
    currentRoom = null;
    updateLobbyVisibility();
    socket.emit("get_rooms");
});

socket.on("game_started", (data) => {

    Swal.fire({
        toast: true,
        icon: "warning",
        title: "Game started in" + currentRoom,
        position: "top",
        background: "#ffff00",
        color: "#000",
        showConfirmButton: false,
        timer: 3000,
    });

    // Update the UI to reflect all players as ready
    isReady = true;
    updateReadyButton();
    console.log(`Current room: ${currentRoom}`);

    // Add game logic here

    document.getElementById("lobby").style.display = "none";
    document.getElementById("game-screen").style.display = "flex";

    // Draw the game-over line
    const gameContainer = document.getElementById("game-container");
    const gameOverLine = document.createElement("div");
    const gameAliensContainer = document.createElement("div");
    gameOverLine.id = "game-over-line";
    gameAliensContainer.id = "game-aliens-container";
    gameContainer.appendChild(gameOverLine);
    gameContainer.appendChild(gameAliensContainer);

    // Draw health bar
    const healthBar = document.createElement("div");
    healthBar.classList.add("health-bar");
    healthBar.id = "health-bar";
    gameContainer.appendChild(healthBar);

    // Set health bar to 100 (full)
    document.getElementById("health-bar").style.width = `100%`;

    // Draw shield bar
    const shieldBar = document.createElement("div");
    shieldBar.classList.add("shield-bar");
    shieldBar.id = "shield-bar";
    gameContainer.appendChild(shieldBar);

    // Set shield bar to 0
    document.getElementById("shield-bar").style.width = `0%`;

    // Add the input box
    const inputBox = document.createElement("input");
    inputBox.id = "input-box";
    inputBox.autocomplete = "off"; // new-password autocomplete disable t
    inputBox.placeholder = "Type words here!";
    gameContainer.appendChild(inputBox);

    // Add input box event listener
    inputBox.addEventListener("input", handleInputChange); // Update word on input change
    document.getElementById("input-box").addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
            submitWord();
        }
    });

    // Add and update player squares
    updatePlayerPositions(data.players);
});

socket.on("request_client_color_input_change", (data) => {
    socket.emit("request_server_color_input_change", 0);
});

socket.on("color_input_cooldown", (playerCharacter) => {
    const gameContainer = document.getElementById("game-container");
    const inputBox = document.getElementById("input-box");

    inputBox.classList.add(`border-color-${playerCharacter}`);
    console.log(playerCharacter);

    // Add cd to input box
    const inputCD = document.createElement("div");
    inputCD.id = "input-cd";
    inputCD.classList.add("input-cd");
    inputCD.classList.add(`bg-color-${playerCharacter}1`);
    gameContainer.appendChild(inputCD);
});

socket.on("update_player_characters", (data) => {
    data.forEach((player) => {
        document.getElementById(`player-${player.id}`).classList.add(`border-color-${player.character}`);
        document.getElementById("igchar-" + player.id).src = "./images/" + player.character + "TN2.png";
        document.getElementById("player-" + player.id).classList.add("bg-color-" + player.character);
    });
});

socket.on("update_health", (amount) => {
    const health = document.getElementById("health-bar");
    const widthNum = parseFloat(health.style.width);
    document.getElementById("health-bar").style.width = `${widthNum + amount}%`;
});

socket.on("update_shield", (amount) => {
    const shield = document.getElementById("shield-bar");
    const widthNum = parseFloat(shield.style.width);
    document.getElementById("shield-bar").style.width = `${widthNum + amount}%`;
});

// Handle word submission response
socket.on("word_submitted", (data) => {
    const { playerId, isCorrect, alienId, character, isMagic , drawLaser } = data;

    // Update the word display color
    updateWordDisplayColor(playerId, isCorrect, isMagic, character);

    // If the word is correct, draw a laser beam to the alien
    if (drawLaser) {
        drawLaserBeam(playerId, alienId, character);
    }
});

// Handle alien destroyed
socket.on("alien_destroyed", (alienId) => {
    const alienElement = document.getElementById(alienId);
    if (alienElement) {
        alienElement.remove(); // Remove the alien from the screen
    }
});

// Handle alien spawned
socket.on("alien_spawned", (alien) => {
    // Create Word
    const alienElement = document.createElement("div");
    alienElement.id = alien.id;
    alienElement.className = "alien";
    
    setTimeout(() => {
        const alienWordRect = alienElement.getBoundingClientRect();
        const xpos = Math.max(0, Math.min(alien.position.x, 100 - ((alienWordRect.width / window.innerWidth) * 100)));
        alienElement.style.left = `${xpos}%`;
    }, 0);

    alienElement.style.top = `${alien.position.y}px`;
    alienElement.textContent = alien.word;
    document.getElementById("game-aliens-container").prepend(alienElement);

    // Create Body
    const alienBody = document.createElement("div");
    alienBody.className = "alien-square";
    alienElement.appendChild(alienBody);

});

// Handle alien moved
socket.on("alien_moved", (data) => {
    const alienElement = document.getElementById(data.id);
    if (alienElement) {
        alienElement.style.top = `${data.position.y}%`;
    }
});

socket.on("alien_reshuffled", (data) => {
    const alienElement = document.getElementById(data.id);
    if (alienElement) {
        setTimeout(() => {
            const alienWordRect = alienElement.getBoundingClientRect();
            const xpos = Math.max(0, Math.min(data.position, 100 - ((alienWordRect.width / window.innerWidth) * 100)));
            alienElement.style.left = `${xpos}%`;
        }, 0);
    }

});

socket.on("display_absorption", (toggleState) => {
    if (toggleState) {
        document.getElementById("game-over-line").style.background = `#0000ff`;
        document.getElementById("game-over-line").style.boxShadow = `#0000ff`;
    }
    else {
        document.getElementById("game-over-line").style.background = `#e94560`;
        document.getElementById("game-over-line").style.boxShadow = `#e94560`;
    }
});

socket.on("update_alien_word", (data) => {
    const alien = document.getElementById(data.id);

    // Find the text node inside the parent
    for (let node of alien.childNodes) {
        if (node.nodeType === Node.TEXT_NODE) {
            node.textContent = data.newWord;
            break;
        }
    }
});

// // Handle keydown event for typing
// document.addEventListener("keydown", (event) => {
//     if (document.getElementById("game-screen").style.display === "block") {
//         const key = event.key.toLowerCase();
//         socket.emit("player_input", { key: key });
//     }
// });

// Function to update player positions based on the number of players
function updatePlayerPositions(players) {
    let playerContainer = document.getElementById("player-container");

    // If the player container doesn't exist, create it
    if (!playerContainer) {
        playerContainer = document.createElement("div");
        playerContainer.id = "player-container";
        document.getElementById("game-container").appendChild(playerContainer);
    }

    // Clear existing player elements
    playerContainer.innerHTML = "";

    // Create player elements
    players.forEach((player) => {
        const playerElement = document.createElement("div");
        playerElement.className = "player-square";
        playerElement.id = `player-${player}`;

        // Character image
        const characterImgInGame = document.createElement("img");
        characterImgInGame.className = "character-image3";
        characterImgInGame.id = `igchar-${player}`;
        playerElement.appendChild(characterImgInGame);

        // Add word display above the player
        const wordDisplay = document.createElement("div");
        wordDisplay.className = "word-display";
        wordDisplay.id = `word-display-${player}`;
        wordDisplay.innerText = ""; // Initially empty

        // Add player name
        const nameDisplay = document.createElement("div");
        nameDisplay.className = "name-display";
        nameDisplay.id = `name-display-${player}`;
        setDisplayName(player)
        
        playerElement.appendChild(wordDisplay);
        playerElement.appendChild(nameDisplay);

        playerContainer.appendChild(playerElement);
    });
}

function setDisplayName(playerId) {
    socket.emit('request_name_display', playerId);
}

socket.on('received_name_to_display', (data) => {
    const playerId = data.id;
    const playerName1 = data.name;
    document.getElementById(`name-display-${playerId}`).innerText = playerName1;
});

// Function to handle word submission
function submitWord() {
    const inputBox = document.getElementById("input-box");
    const word = inputBox.value.trim();

    if (word) {
        socket.emit("submit_word", { word: word });
        inputBox.value = ""; // Clear the input box
    }
}

// Handle word updates from the server
socket.on("word_updated", (data) => {
    updateWordDisplay(data.playerId, data.word);
});

// Function to handle input changes
function handleInputChange(event) {
    currentWord = event.target.value;

    // Emit the updated word to the server
    socket.emit("update_word", { word: currentWord });

    // Update the local word display for the current player
    const wordDisplay = document.getElementById(`word-display-${socket.id}`);
    if (wordDisplay) {
        wordDisplay.innerText = currentWord;
    }
}

socket.on("update_cooldown", ({ startTime, character }) => {
    // Update cooldown on the input bar
    const cooldownElement1 = document.getElementById("input-cd");
    
    const COOLDOWN_DURATION = 30000; // 60s in ms

    const now = Date.now();
    const elapsed = now - startTime;
    const remaining = Math.max(COOLDOWN_DURATION - elapsed, 0);
    const percent = Math.min((remaining / COOLDOWN_DURATION) * 50, 50); // max 50%

    // Set width to 0% instantly
    cooldownElement1.style.transition = 'none';
    cooldownElement1.style.width = '0%';

    const inputBox = document.getElementById("input-box");
    inputBox.classList.remove(`border-color-${character}`);

    setTimeout(() => {
        cooldownElement1.style.transition = `width ${remaining}ms linear`;
        cooldownElement1.style.width = `${percent}%`;
    }, 50); // 50ms is usually enough
    
    // Optional: Log when cooldown ends (30s later)
    setTimeout(() => {
        console.log(`Magic cooldown over`);
        inputBox.classList.add(`border-color-${character}`);
    }, 30000);
});

socket.on("update_cooldown_global", ({ playerId, toggle, character }) => {
    // Update cooldown on the player's square to everyone
    const player = document.getElementById(`player-${playerId}`);

    if (toggle) {
        player.classList.add(`border-color-${character}`)
    }
    else {
        player.classList.remove(`border-color-${character}`)
    }
});

// Function to update word displays for all players
function updateWordDisplay(playerId, word) {

    const wordDisplay = document.getElementById(`word-display-${playerId}`);
    if (wordDisplay) {
        wordDisplay.innerText = word;
    }
}

// Function to draw a laser beam from a player to an alien
function drawLaserBeam(playerId, alienId, character) {
    const playerElement = document.getElementById(`player-${playerId}`);
    const alienElement = document.getElementById(alienId);
    const gameContainer = document.getElementById("game-container");

    if (!playerElement || !alienElement || !gameContainer) return;

    // Get the positions of the player and alien relative to the game container
    const playerRect = playerElement.getBoundingClientRect();
    const alienRect = alienElement.getBoundingClientRect();
    const gameRect = gameContainer.getBoundingClientRect();

    // Calculate the positions relative to the game container
    const playerX = playerRect.left - gameRect.left + playerRect.width / 2;
    const playerY = playerRect.top - gameRect.top + playerRect.height / 2 - 52;
    const alienX = alienRect.left - gameRect.left + alienRect.width / 2;
    const alienY = alienRect.top - gameRect.top + alienRect.height / 2 + 50;

    // Calculate the distance and angle between the player and alien
    const dx = alienX - playerX;
    const dy = alienY - playerY;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const angle = Math.atan2(dy, dx) * (180 / Math.PI);

    // Create the laser beam element
    const laserBeam = document.createElement("div");
    laserBeam.className = "laser-beam";
    laserBeam.classList.add("laser-color-" + character)
    laserBeam.style.width = `${distance}px`;
    laserBeam.style.left = `${playerX}px`;
    laserBeam.style.top = `${playerY}px`;
    laserBeam.style.transform = `rotate(${angle}deg)`;

    // Append the laser beam to the game container
    gameContainer.appendChild(laserBeam);

    // Remove the laser beam after the animation ends
    setTimeout(() => {
        laserBeam.remove();
    }, 500); // Match the duration of the fadeLaser animation
}

// Function to update word display color
function updateWordDisplayColor(playerId, isCorrect, isMagic, character) {
    const wordDisplay = document.getElementById(`word-display-${playerId}`);
    if (!wordDisplay) return;

    if (isMagic) {
        wordDisplay.classList.add(`bg-color-${character}`);
        setTimeout(() => {
            wordDisplay.classList.remove(`bg-color-${character}`);
        }, 500); // Match the duration of the color transition
    }
    else {
        // Add the correct/incorrect class
        wordDisplay.classList.add(isCorrect ? "correct" : "incorrect");
        // Remove the class after a short delay
        setTimeout(() => {
            wordDisplay.classList.remove(isCorrect ? "correct" : "incorrect");
        }, 500); // Match the duration of the color transition
    }


}

let countdownTimer = null;

// Handle game over
socket.on("game_over", () => {
    document.getElementById("countdown").innerText = `Returning to lobby in 20 seconds...`;
    document.getElementById("game-over-screen").style.display = "flex";

    // Start a 20-second countdown
    let countdown = 20;
    countdownTimer = setInterval(() => {
        countdown--;
        if (countdown <= 0) {
            clearInterval(countdownTimer);
            returnToLobby(); // Automatically return to lobby
        } else {
            document.getElementById("countdown").innerText = `Returning to lobby in ${countdown} seconds...`;
        }
    }, 1000);

});

function returnToLobby() {
    if (countdownTimer) {
        clearInterval(countdownTimer); // Stop the countdown
        countdownTimer = null;
    }
    socket.emit('return_to_lobby');
}

socket.on('returned_to_lobby', () => {
    currentRoom = null;
    isReady = false;
    document.getElementById("lobby").style.display = "flex";
    document.getElementById("game-screen").style.display = "none";
    document.getElementById("game-over-screen").style.display = "none";
    socket.emit('exit_room');
    clearGameContainer();
    socket.emit('get_rooms');
});

function clearGameContainer() {
    const gameContainer = document.getElementById("game-container");
    gameContainer.innerHTML = ""; // Remove all child elements
}

socket.on("error", (data) => {
    // document.getElementById("error-message").innerText = data.message;
    Swal.fire({
        toast: true,
        icon: "error",
        title: data.message, 
        position: "top",
        background: "#ff4b2b",
        color: "#fff",
        showConfirmButton: false,
        timer: 3000,
    });
});

socket.on("alert_warning", (message) => {
    Swal.fire({
        toast: true,
        icon: "warning",
        title: message,
        position: "middle",
        background: "#ffff00",
        color: "#000",
        showConfirmButton: false,
        timer: 1500,
    });
});


socket.emit("get_rooms");

function printAll() {
    socket.emit('print_all')
}

function howToPlay() {
    console.log("not implemented yet");
}

function leaderBoard() {
    console.log("not implemented yet");
}

function adjustHeight() {
    document.body.style.height = `${window.visualViewport.height}px`;
    document.getElementById("star-container").style.height = `${window.visualViewport.height}px`;
}

adjustHeight()

window.visualViewport.addEventListener("resize", adjustHeight);
window.visualViewport.addEventListener("scroll", adjustHeight);
