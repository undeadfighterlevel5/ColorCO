const state = {
  hue: 210,
  saturation: 72,
  lightness: 52,
};

const controlConfig = {
  hue: {
    max: 360,
    step: 1,
    unit: "°",
    wheel: document.querySelector("#hue-wheel"),
    output: document.querySelector("#hue-output"),
  },
  saturation: {
    max: 100,
    step: 1,
    unit: "%",
    wheel: document.querySelector("#saturation-wheel"),
    output: document.querySelector("#saturation-output"),
  },
  lightness: {
    max: 100,
    step: 1,
    unit: "%",
    wheel: document.querySelector("#lightness-wheel"),
    output: document.querySelector("#lightness-output"),
  },
};

const hslReadout = document.querySelector("#hsl-readout");
let activeControl = null;
let scrapeAudio = null;
let lastScrapeAt = 0;

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function valueToAngle(control, value) {
  const { max } = controlConfig[control];
  return (value / max) * 360;
}

function angleToValue(control, angle) {
  const { max, step } = controlConfig[control];
  const normalized = ((angle % 360) + 360) % 360;
  const rawValue = (normalized / 360) * max;
  return clamp(Math.round(rawValue / step) * step, 0, max);
}

function pointerToAngle(event, wheel) {
  const rect = wheel.getBoundingClientRect();
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;
  const radians = Math.atan2(event.clientY - centerY, event.clientX - centerX);
  return (radians * 180) / Math.PI + 90;
}

function getColor() {
  return `hsl(${state.hue} ${state.saturation}% ${state.lightness}%)`;
}

function updateControl(control) {
  const config = controlConfig[control];
  const angle = valueToAngle(control, state[control]);
  config.wheel.style.setProperty("--angle", `${angle}deg`);
  config.output.value = `${state[control]}${config.unit}`;
  config.wheel.setAttribute("aria-valuenow", String(state[control]));
  config.wheel.setAttribute(
    "aria-valuetext",
    control === "hue" ? `${state[control]} degrees` : `${state[control]} percent`,
  );
}

function render() {
  const color = getColor();
  document.documentElement.style.setProperty("--selected-color", color);
  hslReadout.textContent = color;
  Object.keys(controlConfig).forEach(updateControl);
}

function setControlValue(control, value) {
  const { max } = controlConfig[control];
  state[control] = clamp(value, 0, max);
  render();
}

function createMarkers(wheel) {
  const markerRing = wheel.querySelector(".marker-ring");
  if (!markerRing) return;

  for (let value = 0; value <= 100; value += 10) {
    const marker = document.createElement("span");
    marker.className = "marker";
    marker.textContent = value;
    marker.style.setProperty("--angle", `${(value / 100) * 360}deg`);
    markerRing.append(marker);
  }
}

function getScrapeAudio() {
  if (scrapeAudio) return scrapeAudio;

  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return null;

  const context = new AudioContext();
  const bufferSize = context.sampleRate * 0.55;
  const noiseBuffer = context.createBuffer(1, bufferSize, context.sampleRate);
  const samples = noiseBuffer.getChannelData(0);

  for (let index = 0; index < bufferSize; index += 1) {
    samples[index] = (Math.random() * 2 - 1) * (1 - index / bufferSize);
  }

  scrapeAudio = { context, noiseBuffer };
  return scrapeAudio;
}

function playScrape() {
  const now = performance.now();
  if (now - lastScrapeAt < 55) return;
  lastScrapeAt = now;

  const audio = getScrapeAudio();
  if (!audio) return;

  const { context, noiseBuffer } = audio;
  if (context.state === "suspended") {
    context.resume();
  }

  const source = context.createBufferSource();
  const filter = context.createBiquadFilter();
  const gain = context.createGain();

  source.buffer = noiseBuffer;
  filter.type = "bandpass";
  filter.frequency.value = 420;
  filter.Q.value = 4.8;
  gain.gain.setValueAtTime(0.0001, context.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.045, context.currentTime + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.13);

  source.connect(filter).connect(gain).connect(context.destination);
  source.start();
  source.stop(context.currentTime + 0.14);
}

function updateFromPointer(event, control) {
  const wheel = controlConfig[control].wheel;
  const angle = pointerToAngle(event, wheel);
  setControlValue(control, angleToValue(control, angle));
  playScrape();
}

function startDrag(event, control) {
  activeControl = control;
  const wheel = controlConfig[control].wheel;
  wheel.classList.add("dragging");
  wheel.setPointerCapture(event.pointerId);
  updateFromPointer(event, control);
}

function stopDrag(event) {
  if (!activeControl) return;
  const wheel = controlConfig[activeControl].wheel;
  if (wheel.hasPointerCapture(event.pointerId)) {
    wheel.releasePointerCapture(event.pointerId);
  }
  wheel.classList.remove("dragging");
  activeControl = null;
}

function handleKeyboard(event, control) {
  const { max } = controlConfig[control];
  const largeStep = control === "hue" ? 15 : 10;
  const smallStep = control === "hue" ? 1 : 1;
  const keyActions = {
    ArrowRight: smallStep,
    ArrowUp: smallStep,
    ArrowLeft: -smallStep,
    ArrowDown: -smallStep,
    PageUp: largeStep,
    PageDown: -largeStep,
    Home: -Infinity,
    End: Infinity,
  };

  if (!(event.key in keyActions)) return;
  event.preventDefault();

  if (event.key === "Home") {
    setControlValue(control, 0);
  } else if (event.key === "End") {
    setControlValue(control, max);
  } else {
    setControlValue(control, state[control] + keyActions[event.key]);
  }
}

Object.entries(controlConfig).forEach(([control, config]) => {
  createMarkers(config.wheel);

  config.wheel.addEventListener("pointerdown", (event) => startDrag(event, control));
  config.wheel.addEventListener("pointermove", (event) => {
    if (activeControl === control) updateFromPointer(event, control);
  });
  config.wheel.addEventListener("pointerup", stopDrag);
  config.wheel.addEventListener("pointercancel", stopDrag);
  config.wheel.addEventListener("keydown", (event) => handleKeyboard(event, control));
});

render();
