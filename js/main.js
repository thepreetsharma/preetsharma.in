// preetsharma.in: boot sequence, scroll story, terminal, and the small extras.
import { buildChart, asciiChart, quoteAt, formatPrice, MILESTONES } from "./chart.js?v=2";
import { createTerminal } from "./terminal.js?v=2";
import { createSound } from "./sound.js?v=2";

const root = document.documentElement;
root.classList.add("live");

const params = new URLSearchParams(location.search);
const shot = params.has("shot") ? Number(params.get("shot")) || 0 : null; // ?shot=N skips the boot and jumps to section N
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const finePointer = matchMedia("(pointer: fine)").matches;
const EMAIL = "thisispreetsharma21@gmail.com";

const candles = buildChart();
const stops = [...document.querySelectorAll(".stop")];
const sections = stops.map((stop) => ({ inner: stop.querySelector(".stop-inner"), parts: [...stop.querySelectorAll("[data-fade]")] }));
const rail = [...document.querySelectorAll("[data-rail]")];
const chromeParts = [...document.querySelectorAll(".brand, .chrome-right, .rail, .hud")]; // labels keep clear of these too
const hint = document.querySelector("[data-hint]");
const hudPrice = document.querySelector("[data-hud-price]");
const hudChange = document.querySelector("[data-hud-change]");

let scene = null;
let story = 0;
let tops = [];

if ("scrollRestoration" in history) history.scrollRestoration = "manual";

const local = createLocal(document.querySelector("[data-local]"), { city: "Mumbai", latitude: 19.08, longitude: 72.88 });
const sound = createSound(document.querySelector("[data-sound]"));
const boot = createBoot();

/* --- Load the 3D scene; the page works without it --- */
document.fonts?.ready.then(() => {
  boot.reach(35);
  measure();
});
const patience = setTimeout(() => boot.reach(100), 12000); // a slow CDN shouldn't keep anyone waiting
import("./scene.js?v=2")
  .then(({ createScene }) => {
    boot.reach(62);
    return createScene({
      canvas: document.querySelector("[data-scene]"),
      tagLayer: document.querySelector("[data-tags]"),
      candles,
      milestones: MILESTONES,
      reducedMotion,
      snap: shot !== null,
    });
  })
  .then((created) => {
    scene = created;
    scene.setStory(story);
    root.classList.add("webgl");
    boot.reach(85);
    return scene.ready;
  })
  .catch((error) => {
    console.warn("3D scene unavailable; showing the static version.", error);
    root.classList.add("no-webgl");
  })
  .finally(() => {
    clearTimeout(patience);
    boot.reach(100);
    if (boot.done) scene?.intro();
  });

/* --- Scroll → story position (0 at the first section, 4 at the last) --- */
function measure() {
  tops = stops.map((el) => el.getBoundingClientRect().top + scrollY);
}
addEventListener("resize", measure);
addEventListener("load", measure);
measure();

function storyAt(y) {
  for (let i = 0; i < tops.length - 1; i++) {
    if (y < tops[i + 1]) return i + Math.max(0, (y - tops[i]) / (tops[i + 1] - tops[i]));
  }
  return tops.length - 1;
}

let lastQuote = "";
let uiFrames = 0;
function frame() {
  story = shot ?? storyAt(scrollY);
  scene?.setStory(story);

  // Copy is fully visible while its section is pinned, and fades as the section slides in or out.
  // Visible copy is handed to the scene so chart labels never sit behind it.
  const vh = innerHeight;
  const occluders = [];
  for (const { inner, parts } of sections) {
    const r = inner.getBoundingClientRect();
    const off = (r.top > 0 ? r.top : r.bottom < vh ? vh - r.bottom : 0) / vh;
    const opacity = Math.min(1, Math.max(0, 1 - (off - 0.04) * 2.4));
    inner.style.setProperty("--shade", opacity.toFixed(3));
    for (const part of parts) {
      part.style.opacity = opacity.toFixed(3);
      part.style.visibility = opacity < 0.02 ? "hidden" : "";
      if (opacity < 0.15) continue;
      const p = part.getBoundingClientRect();
      occluders.push({ left: p.left - 16, top: p.top - 16, right: p.right + 16, bottom: p.bottom + 16 });
    }
  }
  for (const el of chromeParts) {
    const c = el.getBoundingClientRect();
    if (c.width) occluders.push({ left: c.left - 8, top: c.top - 8, right: c.right + 8, bottom: c.bottom + 8 });
  }
  scene?.setOccluders(occluders);

  const active = Math.min(stops.length - 1, Math.round(story));
  rail.forEach((link, i) => (i === active ? link.setAttribute("aria-current", "step") : link.removeAttribute("aria-current")));

  if (scene) {
    const q = quoteAt(candles, scene.getPlayhead());
    const text = `${formatPrice(q.price)}|${q.change.toFixed(2)}`;
    if (text !== lastQuote) {
      lastQuote = text;
      hudPrice.textContent = formatPrice(q.price);
      hudChange.textContent = `${q.change >= 0 ? "▲" : "▼"} ${Math.abs(q.change).toFixed(2)}%`;
      hudChange.className = q.change >= 0 ? "up" : "down";
    }
  }

  const canOrbit = !!scene && finePointer && story > 3.6;
  root.classList.toggle("can-orbit", canOrbit);
  const message = story < 0.12 ? "Scroll to trade ↓" : canOrbit ? "Drag to look around" : "";
  if (message) hint.textContent = message;
  hint.classList.toggle("visible", !!message && boot.done);

  if (shot !== null && ++uiFrames > 60) return; // screenshots: let the page go idle
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

/* --- Pointer: gentle parallax everywhere, drag to orbit at the closing bell --- */
let dragging = false;
addEventListener("pointermove", (event) => {
  if (event.pointerType !== "mouse" || !scene) return;
  scene.setPointer((event.clientX / innerWidth) * 2 - 1, (event.clientY / innerHeight) * 2 - 1);
  if (dragging) scene.drag(event.movementX, event.movementY);
});
addEventListener("pointerdown", (event) => {
  if (!root.classList.contains("can-orbit") || event.button !== 0) return;
  if (event.target.closest("a, button, input, .term, .email")) return;
  dragging = true;
  root.classList.add("dragging");
  event.preventDefault();
});
addEventListener("pointerup", () => {
  dragging = false;
  root.classList.remove("dragging");
});

/* --- Terminal --- */
createTerminal(document.querySelector("[data-terminal]"), {
  email: EMAIL,
  quote: () => {
    const q = quoteAt(candles, scene ? scene.getPlayhead() : candles.length - 1);
    return { price: formatPrice(q.price), change: q.change };
  },
  go: (id) => document.getElementById(id)?.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth" }),
  local,
});

/* --- Small things --- */
document.querySelectorAll("[data-copy]").forEach((button) => {
  button.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(button.dataset.copy);
    } catch (e) {
      location.href = `mailto:${button.dataset.copy}`;
      return;
    }
    button.textContent = "Copied";
    setTimeout(() => (button.textContent = "Copy"), 1800);
  });
});
document.querySelectorAll("[data-year]").forEach((el) => (el.textContent = new Date().getFullYear()));

/* --- Boot: a candlestick chart prints itself while the scene loads --- */
function createBoot() {
  const el = document.querySelector("[data-boot]");
  const art = el.querySelector("[data-boot-art]");
  const log = el.querySelector("[data-boot-log]");
  const enter = el.querySelector("[data-boot-enter]");
  // Load progress (%) at which each line appears
  const STEPS = [
    [0, "Exchange: connecting"],
    [14, "Tick data: streaming"],
    [30, "Order book: loaded"],
    [46, "Candles: rendering"],
    [62, "Volatility: priced"],
    [78, "Circuit breakers: armed"],
    [92, "Opening auction: cleared"],
    [100, "Market: open"],
  ];
  const state = { target: 6, progress: 0, done: false };
  let seen = false;
  try {
    seen = sessionStorage.getItem("booted") === "1";
  } catch (e) {}
  const minimum = reducedMotion ? 300 : seen ? 1100 : 2800;
  const cols = innerWidth < 560 ? 26 : 40;
  const draw = asciiChart(candles, cols, 13);
  const start = performance.now();

  // While the boot screen is up, the page behind it is out of reach for keyboards and screen readers
  const behind = [document.querySelector("main"), document.querySelector(".chrome")];
  const setInert = (value) => behind.forEach((node) => node && (node.inert = value));

  function finish() {
    if (state.done) return;
    state.done = true;
    try {
      sessionStorage.setItem("booted", "1");
    } catch (e) {}
    sound.bell();
    el.classList.add("exit");
    root.classList.remove("booting");
    root.classList.add("ready");
    setInert(false);
    scene?.intro();
    setTimeout(() => el.remove(), 1000);
  }

  function tick() {
    if (state.done) return;
    const goal = Math.min(state.target, ((performance.now() - start) / minimum) * 100);
    state.progress += (goal - state.progress) * 0.12;
    if (goal - state.progress < 0.4) state.progress = goal;
    art.textContent = draw(Math.round((state.progress / 100) * cols));
    log.textContent = STEPS.filter(([at]) => at <= state.progress).pop()[1];
    if (state.progress >= 100) {
      enter.hidden = false;
      enter.focus({ preventScroll: true });
      return;
    }
    requestAnimationFrame(tick);
  }

  enter.addEventListener("click", finish);
  addEventListener("keydown", (event) => {
    if (!enter.hidden && !state.done && event.key === "Enter") {
      event.preventDefault();
      finish();
    }
  });

  if (shot !== null || !root.classList.contains("booting")) {
    // Skip the boot: screenshot mode, or the page's safety timer already revealed the site
    state.done = true;
    el.remove();
    root.classList.remove("booting");
    root.classList.add("ready");
    // Screenshot mode shows only the requested section, as if scrolled to it
    if (shot !== null) stops.forEach((stop, i) => i !== shot && (stop.style.display = "none"));
  } else {
    setInert(true);
    requestAnimationFrame(tick);
  }

  return {
    reach(value) {
      state.target = Math.max(state.target, value);
    },
    get done() {
      return state.done;
    },
  };
}

/* --- Local time and weather (Open-Meteo, no key needed) --- */
function createLocal(el, { city, latitude, longitude }) {
  const clock = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit", hour12: true });
  const stampFormat = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Kolkata",
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  // WMO weather codes, by upper bound
  const SKIES = [
    [0, "clear"],
    [1, "mostly clear"],
    [2, "partly cloudy"],
    [3, "overcast"],
    [48, "foggy"],
    [57, "drizzling"],
    [67, "raining"],
    [77, "snowing"],
    [82, "showery"],
    [86, "snowing"],
    [99, "stormy"],
  ];
  let sky = null;
  const time = () => clock.format(new Date()).toLowerCase();
  const render = () => {
    if (el) el.textContent = `${city} ${time()}${sky ? ` · ${sky.temp}°C` : ""}`;
  };
  const weather = fetch(
    `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,weather_code&timezone=Asia%2FKolkata`
  )
    .then((response) => (response.ok ? response.json() : Promise.reject(response.status)))
    .then(({ current }) => {
      const match = SKIES.find(([max]) => current.weather_code <= max);
      sky = { temp: Math.round(current.temperature_2m), label: match ? match[1] : "unpredictable" };
      render();
      return sky;
    })
    .catch(() => null);
  render();
  setInterval(render, 30000);

  return {
    city,
    time: () => `It's ${time()} in ${city}.`,
    weather: () => weather.then((s) => s && `${s.temp}°C and ${s.label} in ${city}.`),
    stamp: () => {
      const part = Object.fromEntries(stampFormat.formatToParts(new Date()).map(({ type, value }) => [type, value]));
      return `${part.weekday} ${part.month} ${part.day} ${part.hour}:${part.minute}`;
    },
  };
}
