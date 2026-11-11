// Optional sound: a soft generated ambient bed, and a bell when the market opens. Off unless the visitor turns it on.
export function createSound(button) {
  let ctx = null;
  let master = null;
  let on = false;
  try {
    on = localStorage.getItem("sound") === "on";
  } catch (e) {}

  // Audio can only start after a click, so nothing is built until then
  function ensure() {
    if (ctx) return ctx;
    const Context = window.AudioContext || window.webkitAudioContext;
    if (!Context) return null;
    ctx = new Context();
    master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);

    // Four quiet tones through a low-pass filter that slowly breathes open and closed
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 520;
    filter.Q.value = 0.7;
    filter.connect(master);
    const lfo = ctx.createOscillator();
    const depth = ctx.createGain();
    lfo.frequency.value = 0.06;
    depth.gain.value = 240;
    lfo.connect(depth).connect(filter.frequency);
    lfo.start();
    [110, 164.81, 220.5, 277.18].forEach((frequency, i) => {
      const tone = ctx.createOscillator();
      const level = ctx.createGain();
      tone.type = i % 2 ? "triangle" : "sine";
      tone.frequency.value = frequency;
      tone.detune.value = (i - 1.5) * 6;
      level.gain.value = 0.22 / (i + 1);
      tone.connect(level).connect(filter);
      tone.start();
    });
    return ctx;
  }

  function apply() {
    if (button) {
      button.setAttribute("aria-pressed", String(on));
      button.classList.toggle("playing", on);
      button.querySelector(".sound-label").textContent = on ? "Sound on" : "Sound off";
    }
    if (!ctx) return;
    if (on) ctx.resume();
    master.gain.cancelScheduledValues(ctx.currentTime);
    master.gain.setTargetAtTime(on ? 0.05 : 0, ctx.currentTime, 0.6);
  }

  function bell() {
    if (!on || !ensure()) return;
    apply();
    const now = ctx.currentTime;
    [
      [880, 0.16],
      [1760, 0.07],
      [2637, 0.04],
      [3520, 0.02],
    ].forEach(([frequency, level]) => {
      const tone = ctx.createOscillator();
      const gain = ctx.createGain();
      tone.frequency.value = frequency;
      gain.gain.setValueAtTime(level, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 2.6);
      tone.connect(gain).connect(ctx.destination);
      tone.start(now);
      tone.stop(now + 2.7);
    });
  }

  button?.addEventListener("click", () => {
    on = !on;
    try {
      localStorage.setItem("sound", on ? "on" : "off");
    } catch (e) {}
    if (on) {
      ensure();
      bell();
    }
    apply();
  });
  apply();

  return { bell };
}
