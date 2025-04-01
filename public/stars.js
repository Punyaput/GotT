// Function to create stars
function createStars() {
    const starContainer = document.createElement("div");
    starContainer.className = "star-container";
    starContainer.id = "star-container";

    // Number of stars to create
    const numStars = 200;

    for (let i = 0; i < numStars; i++) {
        const star = document.createElement("div");
        star.className = "star";

        const starSizes = [2, 3, 5]; // Different star sizes in pixels
        const size = starSizes[Math.floor(Math.random() * starSizes.length)];
        star.style.width = `${size}px`;
        star.style.height = `${size}px`;

        const starColors = ["#fff", "#e94560", "#0f3460", "#4caf50"]; // White, pink, blue, green
        const color = starColors[Math.floor(Math.random() * starColors.length)];
        star.style.backgroundColor = color;

        // Randomize star position
        star.style.left = `${Math.random() * 100}%`;
        star.style.top = `${Math.random() * 100}%`;

        // Randomize animation delay and duration
        star.style.animationDelay = `${Math.random() * 3}s`;
        star.style.animationDuration = `${2 + Math.random() * 3}s`;

        starContainer.appendChild(star);
    }

    // Append the star container to the body
    document.body.appendChild(starContainer);
}

// Call this function when the page loads
window.onload = () => {
    createStars();
};
