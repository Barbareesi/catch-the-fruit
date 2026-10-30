const canvas = document.querySelector("#game-canvas");
const context = canvas.getContext("2d");
const overlay = document.querySelector("#game-overlay");
const overlayIcon = document.querySelector("#overlay-icon");
const overlayTitle = document.querySelector("#overlay-title");
const overlayMessage = document.querySelector("#overlay-message");
const playButton = document.querySelector("#play-button");
const scoreText = document.querySelector("#score");
const timerText = document.querySelector("#timer");
const livesText = document.querySelector("#lives");
const cameraButton = document.querySelector("#camera-button");
const cameraStatus = document.querySelector("#camera-status");
const cameraVideo = document.querySelector("#camera-video");
const cameraPlaceholder = document.querySelector("#camera-placeholder");
const cameraIndicator = document.querySelector("#camera-indicator");
const landmarkCanvas = document.querySelector("#landmark-canvas");
const landmarkContext = landmarkCanvas.getContext("2d");

const WIDTH = canvas.width;
const HEIGHT = canvas.height;
const BASKET_WIDTH = 116;
const BASKET_HEIGHT = 53;
const TRACKING_INTERVAL = 75;
const FRUITS = ["🍎", "🍊", "🍋", "🍐", "🍑", "🍇", "🍓", "🍉"];
const LANDMARK_CONNECTIONS = [
  ["wrist", "thumb_cmc"], ["thumb_cmc", "thumb_mcp"], ["thumb_mcp", "thumb_ip"], ["thumb_ip", "thumb_tip"],
  ["wrist", "index_finger_mcp"], ["index_finger_mcp", "index_finger_pip"], ["index_finger_pip", "index_finger_dip"], ["index_finger_dip", "index_finger_tip"],
  ["index_finger_mcp", "middle_finger_mcp"], ["middle_finger_mcp", "middle_finger_pip"], ["middle_finger_pip", "middle_finger_dip"], ["middle_finger_dip", "middle_finger_tip"],
  ["middle_finger_mcp", "ring_finger_mcp"], ["ring_finger_mcp", "ring_finger_pip"], ["ring_finger_pip", "ring_finger_dip"], ["ring_finger_dip", "ring_finger_tip"],
  ["ring_finger_mcp", "pinky_finger_mcp"], ["pinky_finger_mcp", "pinky_finger_pip"], ["pinky_finger_pip", "pinky_finger_dip"], ["pinky_finger_dip", "pinky_finger_tip"],
  ["wrist", "pinky_finger_mcp"],
];

let state = "ready";
let score = 0;
let lives = 3;
let timeLeft = 60;
let basketX = WIDTH / 2;
let targetBasketX = basketX;
let items = [];
let particles = [];
let spawnTimer = 0.35;
let lastFrameTime = 0;
let animationFrame = 0;
let cameraStream = null;
let handDetector = null;
let trackingBusy = false;
let trackingFailed = false;
let lastDetectionTime = 0;
let handSeen = false;
let cameraBusy = false;
let startupTask = null;
let lastTimeAnnouncement = 60;

const backgroundDots = Array.from({ length: 44 }, (_, index) => ({
  x: (index * 193 + 37) % WIDTH,
  y: (index * 127 + 23) % HEIGHT,
  radius: 1 + (index % 4) * 0.45,
  phase: index * 0.68,
}));

function setCameraStatus(message, isError = false) {
  cameraStatus.textContent = message;
  cameraStatus.classList.toggle("is-error", isError);
}

function updateStats() {
  scoreText.textContent = String(score);
  timerText.textContent = String(Math.ceil(timeLeft));
  livesText.textContent = `${"♥ ".repeat(lives)}${"♡ ".repeat(3 - lives)}`.trim();
  livesText.setAttribute("aria-label", `${lives} ${lives === 1 ? "life" : "lives"}`);
  timerText.classList.toggle("is-urgent", timeLeft <= 10);
}

function showOverlay(icon, title, message, buttonLabel) {
  overlayIcon.textContent = icon;
  overlayTitle.textContent = title;
  overlayMessage.textContent = message;
  playButton.textContent = buttonLabel;
  overlay.classList.remove("is-hidden");
}

function startGame() {
  score = 0;
  lives = 3;
  timeLeft = 60;
  basketX = WIDTH / 2;
  targetBasketX = basketX;
  items = [];
  particles = [];
  spawnTimer = 0.35;
  lastTimeAnnouncement = 60;
  handSeen = false;
  state = "running";
  lastFrameTime = 0;
  updateStats();
  overlay.classList.add("is-hidden");
  if (!animationFrame) animationFrame = requestAnimationFrame(gameLoop);
}

function endGame(reason) {
  if (state !== "running") return;
  state = "over";
  const headline = reason === "time" ? "Time's up!" : "Out of lives!";
  const message = score === 10
    ? "You caught 1 fruit. Ready to try again?"
    : `You caught ${score / 10} ${score === 10 ? "fruit" : "fruits"} and scored ${score} points. Ready to try again?`;
  showOverlay("✨", headline, message, "Restart");
}

function roundedRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
}

function drawBackground(time) {
  const sky = context.createLinearGradient(0, 0, WIDTH, HEIGHT);
  sky.addColorStop(0, "#a9e8e4");
  sky.addColorStop(0.48, "#d4f4d0");
  sky.addColorStop(1, "#ffe9b7");
  context.fillStyle = sky;
  context.fillRect(0, 0, WIDTH, HEIGHT);

  const glow = context.createRadialGradient(790, 105, 12, 790, 105, 150);
  glow.addColorStop(0, "rgb(255 244 177 / 74%)");
  glow.addColorStop(1, "rgb(255 244 177 / 0%)");
  context.fillStyle = glow;
  context.fillRect(620, -40, 340, 300);
  context.fillStyle = "#ffed9d";
  context.beginPath();
  context.arc(790, 105, 46, 0, Math.PI * 2);
  context.fill();

  backgroundDots.forEach((dot) => {
    const opacity = 0.22 + (Math.sin(time / 570 + dot.phase) + 1) * 0.13;
    context.fillStyle = `rgb(255 255 255 / ${opacity})`;
    context.beginPath();
    context.arc(dot.x, dot.y, dot.radius, 0, Math.PI * 2);
    context.fill();
  });

  context.fillStyle = "#a9d8a8";
  context.beginPath();
  context.moveTo(0, 410);
  for (let x = 0; x <= WIDTH; x += 160) {
    context.quadraticCurveTo(x + 80, 340 + Math.sin(x) * 12, x + 160, 410);
  }
  context.lineTo(WIDTH, HEIGHT);
  context.lineTo(0, HEIGHT);
  context.closePath();
  context.fill();

  context.fillStyle = "#82c99d";
  context.beginPath();
  context.moveTo(0, 466);
  for (let x = 0; x <= WIDTH; x += 210) {
    context.quadraticCurveTo(x + 105, 405 + Math.cos(x) * 10, x + 210, 466);
  }
  context.lineTo(WIDTH, HEIGHT);
  context.lineTo(0, HEIGHT);
  context.closePath();
  context.fill();

  context.fillStyle = "#70b98e";
  context.fillRect(0, 526, WIDTH, 74);
  context.fillStyle = "#9cdb92";
  context.fillRect(0, 526, WIDTH, 8);
}

function drawItem(item, time) {
  const bob = item.type === "fruit" ? Math.sin(time / 150 + item.phase) * 3 : 0;
  context.save();
  context.translate(item.x, item.y + bob);
  context.rotate(item.rotation);
  context.shadowColor = item.type === "fruit" ? "rgb(67 88 55 / 24%)" : "rgb(55 38 66 / 35%)";
  context.shadowBlur = 12;
  context.font = `${item.radius * 1.8}px "Apple Color Emoji", "Segoe UI Emoji", sans-serif`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(item.emoji, 0, 2);
  context.restore();
}

function drawBasket(time) {
  const x = basketX - BASKET_WIDTH / 2;
  const y = HEIGHT - BASKET_HEIGHT - 19;
  context.save();
  context.translate(0, Math.sin(time / 240) * 1.2);
  context.shadowColor = "rgb(112 75 37 / 22%)";
  context.shadowBlur = 13;
  context.shadowOffsetY = 5;
  context.fillStyle = "#bf7943";
  context.beginPath();
  context.moveTo(x + 8, y + 10);
  context.quadraticCurveTo(x + 58, y + 18, x + 108, y + 10);
  context.lineTo(x + 97, y + 47);
  context.quadraticCurveTo(x + 58, y + 56, x + 19, y + 47);
  context.closePath();
  context.fill();
  context.shadowColor = "transparent";
  context.strokeStyle = "#f4c27a";
  context.lineWidth = 5;
  context.beginPath();
  context.ellipse(basketX, y + 12, BASKET_WIDTH / 2, 11, 0, Math.PI, Math.PI * 2);
  context.stroke();
  context.strokeStyle = "rgb(255 226 177 / 82%)";
  context.lineWidth = 3;
  for (let lineX = x + 29; lineX < x + 99; lineX += 18) {
    context.beginPath();
    context.moveTo(lineX, y + 18);
    context.lineTo(lineX + 5, y + 46);
    context.stroke();
  }
  context.restore();
}

function drawParticles(deltaSeconds) {
  particles = particles.filter((particle) => particle.life > 0);
  particles.forEach((particle) => {
    particle.x += particle.vx * deltaSeconds;
    particle.y += particle.vy * deltaSeconds;
    particle.vy += 170 * deltaSeconds;
    particle.life -= deltaSeconds;
    context.globalAlpha = Math.max(0, particle.life / particle.maxLife);
    context.fillStyle = particle.color;
    context.beginPath();
    context.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
    context.fill();
  });
  context.globalAlpha = 1;
}

function render(time, deltaSeconds) {
  drawBackground(time);
  items.forEach((item) => drawItem(item, time));
  drawBasket(time);
  drawParticles(deltaSeconds);
}

function createBurst(x, y, color) {
  for (let index = 0; index < 15; index += 1) {
    const angle = (Math.PI * 2 * index) / 15 + Math.random() * 0.25;
    const speed = 80 + Math.random() * 170;
    particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      radius: 2 + Math.random() * 3,
      color,
      life: 0.45 + Math.random() * 0.35,
      maxLife: 0.8,
    });
  }
}

function loseLife(x, y) {
  lives = Math.max(0, lives - 1);
  createBurst(x, y, "#f36a7d");
  updateStats();
  if (lives === 0) endGame("lives");
}

function spawnItem() {
  const isBomb = Math.random() < 0.15;
  items.push({
    x: 52 + Math.random() * (WIDTH - 104),
    y: -40,
    radius: isBomb ? 25 : 24,
    type: isBomb ? "bomb" : "fruit",
    emoji: isBomb ? "💣" : FRUITS[Math.floor(Math.random() * FRUITS.length)],
    speed: 185 + Math.random() * 95 + (60 - timeLeft) * 1.6,
    phase: Math.random() * Math.PI * 2,
    rotation: (Math.random() - 0.5) * 0.14,
  });
}

function updateGame(deltaSeconds) {
  timeLeft = Math.max(0, timeLeft - deltaSeconds);
  if (Math.ceil(timeLeft) !== lastTimeAnnouncement) {
    lastTimeAnnouncement = Math.ceil(timeLeft);
    timerText.textContent = String(lastTimeAnnouncement);
    timerText.classList.toggle("is-urgent", timeLeft <= 10);
  }
  if (timeLeft <= 0) {
    endGame("time");
    return;
  }

  basketX += (targetBasketX - basketX) * Math.min(1, deltaSeconds * 11);
  spawnTimer -= deltaSeconds;
  if (spawnTimer <= 0) {
    spawnItem();
    spawnTimer = Math.max(0.48, 0.88 - (60 - timeLeft) * 0.005) + Math.random() * 0.25;
  }

  const basketY = HEIGHT - BASKET_HEIGHT - 19;
  items = items.filter((item) => {
    item.y += item.speed * deltaSeconds;
    item.rotation += (item.type === "bomb" ? 0.8 : 0.35) * deltaSeconds;
    const withinBasket = item.y + item.radius * 0.5 >= basketY
      && item.y - item.radius * 0.5 <= basketY + BASKET_HEIGHT
      && Math.abs(item.x - basketX) <= BASKET_WIDTH * 0.48 + item.radius * 0.38;

    if (withinBasket) {
      if (item.type === "fruit") {
        score += 10;
        scoreText.textContent = String(score);
        createBurst(item.x, item.y, "#ffd269");
      } else {
        loseLife(item.x, item.y);
      }
      return false;
    }

    if (item.y - item.radius > HEIGHT) {
      if (item.type === "fruit") loseLife(item.x, HEIGHT - 25);
      return false;
    }
    return true;
  });
}

function gameLoop(now) {
  if (!animationFrame) return;
  const deltaSeconds = lastFrameTime ? Math.min((now - lastFrameTime) / 1000, 0.04) : 0;
  lastFrameTime = now;
  if (state === "running") updateGame(deltaSeconds);
  render(now, deltaSeconds);
  animationFrame = requestAnimationFrame(gameLoop);
}

function setCameraReady() {
  cameraPlaceholder.classList.add("is-hidden");
  cameraIndicator.textContent = "CAMERA ON";
  cameraIndicator.classList.add("is-ready");
  cameraButton.textContent = "Camera enabled";
  cameraButton.disabled = true;
}

function describeCameraError(error) {
  if (error?.name === "NotAllowedError" || error?.name === "PermissionDeniedError") {
    return "Camera permission was denied. Allow camera access in Chrome's address-bar settings, then try again.";
  }
  if (error?.name === "NotFoundError" || error?.name === "DevicesNotFoundError") {
    return "No camera was found. Connect a webcam and try again.";
  }
  if (error?.name === "NotReadableError" || error?.name === "TrackStartError") {
    return "The camera is already in use by another app. Close it there and try again.";
  }
  if (error?.name === "SecurityError") {
    return "Camera access requires localhost or HTTPS. Open this page using VS Code Live Server.";
  }
  return "Could not start hand tracking. Check your camera connection and internet, then try again.";
}

async function initializeHandTracking() {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("Camera access is unavailable. Use Chrome on localhost or HTTPS.");
  }
  if (!window.handPoseDetection || !window.tf || !window.Hands) {
    throw new Error("Hand-tracking libraries did not load. Check your internet connection and reload the page.");
  }

  await window.tf.setBackend("webgl");
  await window.tf.ready();
  handDetector = await window.handPoseDetection.createDetector(
    window.handPoseDetection.SupportedModels.MediaPipeHands,
    {
      runtime: "mediapipe",
      solutionPath: "https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1675469240",
      modelType: "full",
      maxHands: 1,
    },
  );
  cameraStream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      facingMode: "user",
      width: { ideal: 640 },
      height: { ideal: 480 },
      frameRate: { ideal: 30, max: 30 },
    },
  });
  cameraVideo.srcObject = cameraStream;
  await new Promise((resolve, reject) => {
    cameraVideo.addEventListener("loadedmetadata", resolve, { once: true });
    cameraVideo.addEventListener("error", () => reject(new Error("The camera preview could not be started.")), { once: true });
  });
  await cameraVideo.play();
  landmarkCanvas.width = cameraVideo.videoWidth;
  landmarkCanvas.height = cameraVideo.videoHeight;
  setCameraReady();
  setCameraStatus("Camera ready. Show one hand and move your index finger to steer.");
  if (!animationFrame) animationFrame = requestAnimationFrame(gameLoop);
  void trackHands();
}

function drawHandLandmarks(keypoints) {
  landmarkContext.clearRect(0, 0, landmarkCanvas.width, landmarkCanvas.height);
  const byName = new Map(keypoints.map((point) => [point.name, point]));
  landmarkContext.lineWidth = Math.max(2, landmarkCanvas.width / 180);
  landmarkContext.strokeStyle = "rgba(255, 220, 112, 0.9)";
  LANDMARK_CONNECTIONS.forEach(([start, end]) => {
    const first = byName.get(start);
    const second = byName.get(end);
    if (!first || !second) return;
    landmarkContext.beginPath();
    landmarkContext.moveTo(first.x, first.y);
    landmarkContext.lineTo(second.x, second.y);
    landmarkContext.stroke();
  });
  keypoints.forEach((point) => {
    landmarkContext.beginPath();
    landmarkContext.arc(point.x, point.y, Math.max(2.5, landmarkCanvas.width / 115), 0, Math.PI * 2);
    landmarkContext.fillStyle = point.name === "index_finger_tip" ? "#ff6980" : "#ffffff";
    landmarkContext.fill();
    landmarkContext.strokeStyle = "#7355c7";
    landmarkContext.lineWidth = 1.5;
    landmarkContext.stroke();
  });
}

async function trackHands() {
  if (!handDetector || !cameraStream || trackingBusy) return;
  trackingBusy = true;
  try {
    const hands = await handDetector.estimateHands(cameraVideo, { flipHorizontal: false });
    const hand = hands[0];
    if (hand) {
      const keypoints = hand.keypoints;
      drawHandLandmarks(keypoints);
      const indexTip = keypoints.find((point) => point.name === "index_finger_tip");
      const indexMcp = keypoints.find((point) => point.name === "index_finger_mcp");
      const controlPoint = indexTip ?? indexMcp;
      if (controlPoint && cameraVideo.videoWidth > 0) {
        const mirroredX = 1 - controlPoint.x / cameraVideo.videoWidth;
        const desiredX = mirroredX * WIDTH;
        targetBasketX = Math.max(BASKET_WIDTH / 2, Math.min(WIDTH - BASKET_WIDTH / 2, desiredX));
      }
      if (!handSeen) setCameraStatus("Hand detected! Move left or right to steer.");
      handSeen = true;
    } else {
      landmarkContext.clearRect(0, 0, landmarkCanvas.width, landmarkCanvas.height);
      if (handSeen) setCameraStatus("No hand detected. Move your hand into the camera view.");
      handSeen = false;
    }
  } catch (error) {
    console.error("Hand detection failed.", error);
    trackingFailed = true;
    setCameraStatus("Hand tracking stopped unexpectedly. Reload the page and try again.", true);
  } finally {
    trackingBusy = false;
    if (cameraStream?.active && !trackingFailed) {
      const now = performance.now();
      const delay = Math.max(0, TRACKING_INTERVAL - (now - lastDetectionTime));
      lastDetectionTime = now;
      window.setTimeout(() => void trackHands(), delay);
    }
  }
}

async function startCamera() {
  if (cameraBusy) return startupTask;
  if (cameraStream?.active && handDetector) return;
  cameraBusy = true;
  cameraButton.disabled = true;
  playButton.disabled = true;
  cameraButton.textContent = "Loading hand tracking…";
  setCameraStatus("Loading the hand-tracking model and requesting camera access…");
  cameraIndicator.textContent = "LOADING";
  try {
    trackingFailed = false;
    startupTask = initializeHandTracking();
    await startupTask;
  } catch (error) {
    console.error("Could not initialize webcam hand tracking.", error);
    if (cameraStream) {
      cameraStream.getTracks().forEach((track) => track.stop());
      cameraStream = null;
    }
    cameraVideo.srcObject = null;
    if (handDetector) {
      await handDetector.dispose();
      handDetector = null;
    }
    setCameraStatus(error instanceof Error && error.message.startsWith("Camera access is unavailable")
      ? error.message
      : describeCameraError(error), true);
    cameraIndicator.textContent = "CAMERA OFF";
    cameraIndicator.classList.remove("is-ready");
    cameraButton.textContent = "Try camera again";
    cameraButton.disabled = false;
    if (error instanceof Error && error.message.includes("libraries did not load")) {
      cameraStatus.textContent = error.message;
    }
    throw error;
  } finally {
    cameraBusy = false;
    playButton.disabled = false;
    startupTask = null;
  }
}

async function startFromPlayButton() {
  if (state === "running") return;
  playButton.disabled = true;
  if (!cameraStream?.active || !handDetector) {
    try {
      await startCamera();
    } catch {
      playButton.disabled = false;
      return;
    }
  }
  startGame();
  playButton.disabled = false;
}

playButton.addEventListener("click", () => void startFromPlayButton());
cameraButton.addEventListener("click", () => {
  void startCamera().catch(() => {});
});

window.addEventListener("beforeunload", () => {
  cameraStream?.getTracks().forEach((track) => track.stop());
  if (handDetector) void handDetector.dispose();
});

updateStats();
render(0, 0);
