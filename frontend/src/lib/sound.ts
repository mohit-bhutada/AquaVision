import { useEffect, useState } from 'react';

// Tiny synthesized UI sounds (Web Audio, no files). Volumes stay very low on purpose.
const KEY = 'av-sound';
let ctx: AudioContext | null = null;
let enabled = read();
const listeners = new Set<(on: boolean) => void>();

function read() {
  try {
    return localStorage.getItem(KEY) !== 'off';
  } catch {
    return true;
  }
}

function audio() {
  if (!enabled) return null;
  if (!ctx) {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function env(c: AudioContext, peak: number, attack: number, decay: number) {
  const g = c.createGain();
  const t = c.currentTime;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  g.connect(c.destination);
  return g;
}

/** Soft underwater "bloop": a short sine that drops in pitch. */
export function bubble() {
  const c = audio();
  if (!c) return;
  const o = c.createOscillator();
  o.type = 'sine';
  const t = c.currentTime;
  const f = 520 + Math.random() * 160;
  o.frequency.setValueAtTime(f, t);
  o.frequency.exponentialRampToValueAtTime(f * 0.45, t + 0.18);
  o.connect(env(c, 0.05, 0.008, 0.2));
  o.start(t);
  o.stop(t + 0.25);
}

let lastTick = 0;
/** Barely-there tick for hovers. */
export function tick() {
  const now = performance.now();
  if (now - lastTick < 80) return;
  lastTick = now;
  const c = audio();
  if (!c) return;
  const o = c.createOscillator();
  o.type = 'triangle';
  o.frequency.value = 1600;
  const t = c.currentTime;
  o.connect(env(c, 0.012, 0.002, 0.04));
  o.start(t);
  o.stop(t + 0.06);
}

/** Filtered-noise sweep for the page curtain. */
export function whoosh() {
  const c = audio();
  if (!c) return;
  const len = c.sampleRate * 0.9;
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource();
  src.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = 'bandpass';
  f.Q.value = 0.9;
  const t = c.currentTime;
  f.frequency.setValueAtTime(300, t);
  f.frequency.exponentialRampToValueAtTime(1400, t + 0.5);
  f.frequency.exponentialRampToValueAtTime(400, t + 0.9);
  src.connect(f);
  f.connect(env(c, 0.045, 0.25, 0.6));
  src.start(t);
  src.stop(t + 0.9);
}

export function setSound(on: boolean) {
  enabled = on;
  try {
    localStorage.setItem(KEY, on ? 'on' : 'off');
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l(on));
  if (on) bubble();
}

export function useSound() {
  const [on, setOn] = useState(enabled);
  useEffect(() => {
    listeners.add(setOn);
    return () => void listeners.delete(setOn);
  }, []);
  return { on, toggle: () => setSound(!enabled) };
}

/** One delegated listener: bubble on any button/link click, tick on nav hover. */
export function installSoundDelegation() {
  const onClick = (e: MouseEvent) => {
    if ((e.target as HTMLElement).closest('a, button, [role="slider"], summary')) bubble();
  };
  const onOver = (e: PointerEvent) => {
    if (e.pointerType === 'mouse' && (e.target as HTMLElement).closest('nav a, nav button')) tick();
  };
  document.addEventListener('click', onClick);
  document.addEventListener('pointerover', onOver);
  return () => {
    document.removeEventListener('click', onClick);
    document.removeEventListener('pointerover', onOver);
  };
}
