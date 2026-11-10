// 왜뜬겨? 소리: 째깍째깍 긴장감 배경음 + 밑에 깔리는 마림바 멜로디 + 정답·오답 효과음.
// 음원 파일 없이 브라우저의 Web Audio로 직접 만들어요(저작권 걱정 없음).
(() => {
'use strict';
const KEY = 'wae.sound';
let on = true;
try { on = localStorage.getItem(KEY) !== 'off'; } catch (e) {}

let ctx = null, master = null, noise = null;
let timer = null, nextAt = 0, step = 0, urgent = false;

function init() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = on ? 0.7 : 0;
  master.connect(ctx.destination);
  noise = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.05), ctx.sampleRate);
  const d = noise.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  return ctx;
}

// 째깍 (tick: 높게 / tock: 조금 낮게). 짧고 맑은 소리.
function tick(t, high) {
  const src = ctx.createBufferSource(); src.buffer = noise;
  const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = high ? 6000 : 4500;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(high ? 0.55 : 0.4, t + 0.001);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.022);
  src.connect(hp).connect(g).connect(master);
  src.start(t); src.stop(t + 0.03);
  // 나무 블록 같은 '톡' 울림
  const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = high ? 2600 : 1900;
  const g2 = ctx.createGain();
  g2.gain.setValueAtTime(0.0001, t);
  g2.gain.exponentialRampToValueAtTime(high ? 0.35 : 0.28, t + 0.001);
  g2.gain.exponentialRampToValueAtTime(0.0001, t + 0.035);
  o.connect(g2).connect(master);
  o.start(t); o.stop(t + 0.04);
}

// 통 (짧고 단단한 베이스 펄스)
function thump(t, vol, pitch) {
  const o = ctx.createOscillator(); o.type = 'triangle';
  o.frequency.setValueAtTime(pitch * 1.5, t);
  o.frequency.exponentialRampToValueAtTime(pitch, t + 0.03);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
  o.connect(g).connect(master);
  o.start(t); o.stop(t + 0.16);
}

// 밑에 깔리는 경쾌한 마림바 멜로디 (4마디 반복, 8분음표 단위, C5=0 기준 반음 수, null=쉼표)
const MELODY = [
  4, null, 7, null, 12, null, 7, 4,   // C
  2, null, 7, null, 11, null, 7, 2,   // G
  0, 4, 9, null, 4, null, 0, 4,       // Am
  5, null, 9, null, 7, 5, 4, 2        // F
];
const BASS = [[0, 7], [-5, 2], [-3, 4], [-7, 0]]; // 마디마다 [근음, 5도] (C4=0 기준)
const hz = (base, semi) => base * Math.pow(2, semi / 12);
const MUSIC_VOL = 0.11;
let eighth = 0;

function marimba(t, f, vol) {
  const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f;
  const o2 = ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = f * 4;
  const g = ctx.createGain(), g2 = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
  g2.gain.setValueAtTime(0.0001, t);
  g2.gain.exponentialRampToValueAtTime(vol * 0.3, t + 0.002);
  g2.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
  o.connect(g).connect(master); o2.connect(g2).connect(master);
  o.start(t); o.stop(t + 0.25); o2.start(t); o2.stop(t + 0.06);
}
function pluck(t, f, vol) {
  const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = f;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.13);
  o.connect(g).connect(master);
  o.start(t); o.stop(t + 0.15);
}
// 8분음표 하나 연주. 마지막 5초엔 한 음 올려서(조바꿈) 긴장감을 더해요.
function music(t) {
  const k = eighth % MELODY.length, bar = Math.floor(k / 8), up = urgent ? 2 : 0;
  const m = MELODY[k];
  if (m !== null) marimba(t, hz(523.25, m + up), MUSIC_VOL);
  if (k % 8 === 0) pluck(t, hz(261.63, BASS[bar][0] + up), MUSIC_VOL * 1.1);
  if (k % 8 === 4) pluck(t, hz(261.63, BASS[bar][1] + up), MUSIC_VOL * 0.9);
  eighth++;
}

// 4박이 한 마디. 평소엔 0.5초마다 째깍, 남은 시간 5초 이하면 두 배 빠르게.
// 멜로디는 빠르기가 그대로(8분음표 0.25초)라서 째깍 소리만 빨라져요.
function schedule() {
  const ahead = ctx.currentTime + 0.12;
  while (nextAt < ahead) {
    const beat = step % 4;
    tick(nextAt, step % 2 === 0);
    if (urgent) {
      thump(nextAt, step % 2 === 0 ? 0.4 : 0.25, 175);
      music(nextAt);
    } else {
      if (beat === 0) thump(nextAt, 0.35, 131);
      if (beat === 1) thump(nextAt, 0.2, 131); // 통-통 (심장 박동)
      music(nextAt); music(nextAt + 0.25);
    }
    nextAt += urgent ? 0.25 : 0.5;
    step++;
  }
}

function start() {
  if (!init()) return;
  stop();
  if (ctx.state === 'suspended') ctx.resume();
  urgent = false; step = 0; eighth = 0; nextAt = ctx.currentTime + 0.05;
  schedule();
  timer = setInterval(schedule, 30);
}
function stop() { if (timer) { clearInterval(timer); timer = null; } }
function setUrgent(v) {
  if (!ctx || !timer || urgent === !!v) return;
  urgent = !!v;
  nextAt = Math.max(ctx.currentTime + 0.02, Math.min(nextAt, ctx.currentTime + 0.25));
}

function tone(t, f, dur, type, vol, lp) {
  const o = ctx.createOscillator(); o.type = type; o.frequency.value = f;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  let node = o;
  if (lp) { const f2 = ctx.createBiquadFilter(); f2.type = 'lowpass'; f2.frequency.value = lp; node = o.connect(f2); }
  node.connect(g).connect(master);
  o.start(t); o.stop(t + dur + 0.02);
}
// 맑은 종소리 한 음 (기본음 + 종 배음)
function bell(t, f, dur, vol) {
  tone(t, f, dur, 'sine', vol);
  tone(t, f * 2, dur * 0.6, 'sine', vol * 0.35);
  tone(t, f * 3.01, dur * 0.35, 'sine', vol * 0.15);
}
// 정답: 띵-동 (밝게 올라가는 두 음)
function correct() {
  if (!init()) return; stop();
  const t = ctx.currentTime + 0.02;
  bell(t, 1318.5, 0.4, 0.4);
  bell(t + 0.11, 1975.5, 0.7, 0.4);
}
// 오답·시간 초과: 삐빅 (짧고 또렷한 버저 두 번)
function wrong() {
  if (!init()) return; stop();
  const t = ctx.currentTime + 0.02;
  tone(t, 392, 0.13, 'sawtooth', 0.2, 2500);
  tone(t + 0.16, 294, 0.24, 'sawtooth', 0.2, 2500);
}

function setOn(v) {
  on = !!v;
  try { localStorage.setItem(KEY, on ? 'on' : 'off'); } catch (e) {}
  if (master) master.gain.setTargetAtTime(on ? 0.7 : 0, ctx.currentTime, 0.02);
  if (on && ctx && ctx.state === 'suspended') ctx.resume();
  paint();
}

// 화면 오른쪽 위 소리 켜기/끄기 버튼
let btn = null;
function paint() {
  if (!btn) return;
  btn.textContent = on ? '🔊' : '🔇';
  btn.setAttribute('aria-label', on ? '소리 끄기' : '소리 켜기');
  btn.setAttribute('aria-pressed', String(!on));
}
function mount() {
  btn = document.createElement('button');
  btn.className = 'sound-btn';
  btn.type = 'button';
  btn.addEventListener('click', () => { init(); setOn(!on); });
  paint();
  document.body.append(btn);
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();

// 다른 앱으로 넘어가거나 화면이 꺼지면 소리 멈춤
document.addEventListener('visibilitychange', () => {
  if (!ctx) return;
  if (document.hidden) ctx.suspend(); else if (on) ctx.resume();
});

window.WaeSound = { start, stop, setUrgent, correct, wrong, setOn, isOn: () => on };
})();
