/* 소개 영상 4판 나레이션 — 컷마다 한 줄을 한국어 신경망 음성으로 만든다(사람 목소리로 바꿀 수 있게 줄마다 따로 남김).
   node tts-v4.mjs   → <OUT4>/tts/line-XX.wav · <OUT4>/tts/times.json · <OUT4>/narration.txt
   1순위 edge-tts(무료 온라인 · 계정/키 없음 · 나레이션 글만 보냄) — EDGE_TTS=edge-tts 실행 파일 경로, LX_TTS_VOICE(기본 ko-KR-SunHiNeural)
   못 쓰면 Windows SAPI 'Microsoft Heami Desktop'. 말 빠르기는 바꾸지 않는다(기본 빠르기). */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { SHOTS, say } from './story-v4.mjs';

const OUT2 = process.env.LX_VIDEO_OUT4 || 'E:/Land-XI 플랫폼/02. 데이터/_video/intro-2026-10-18-v4';
const DIR = path.join(OUT2, 'tts'); fs.mkdirSync(DIR, { recursive: true });
const EDGE = process.env.EDGE_TTS || 'edge-tts';
const VOICE = process.env.LX_TTS_VOICE || 'ko-KR-SunHiNeural';
const probe = (f) => Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).toString());

function edge(text, mp3) { execFileSync(EDGE, ['--voice', VOICE, '--text', text, '--write-media', mp3], { stdio: 'pipe' }); }
function sapi(text, wav) {
  const ps = `Add-Type -AssemblyName System.Speech; $s = New-Object System.Speech.Synthesis.SpeechSynthesizer; $s.SelectVoice('Microsoft Heami Desktop'); $s.SetOutputToWaveFile($env:LX_WAV); $s.Speak($env:LX_TEXT); $s.Dispose()`;
  execFileSync('powershell', ['-NoProfile', '-Command', ps], { env: { ...process.env, LX_WAV: wav, LX_TEXT: text }, stdio: 'pipe' });
}

let engine = null;
const times = [];
// LX_TTS_ONLY=id,id — 그 줄만 다시 만들고 나머지 줄은 그대로(같은 목소리 · 이미 만든 파일 · times.json 값)
const ONLY = (process.env.LX_TTS_ONLY || '').split(',').filter(Boolean);
const OLD = ONLY.length ? JSON.parse(fs.readFileSync(path.join(DIR, 'times.json'), 'utf8')) : null;
for (const [i, s] of SHOTS.entries()) {
  if (ONLY.length && !ONLY.includes(s.id)) { const o = OLD.lines.find((l) => l.id === s.id); if (!o) throw new Error('예전 줄 없음 ' + s.id); times.push({ ...o, i, text: s.narr }); engine = OLD.engine; continue; }
  const base = path.join(DIR, `line-${String(i + 1).padStart(2, '0')}`);
  const t = say(s.narr);
  let src = null;
  if (engine !== 'sapi') {
    try { edge(t, base + '.mp3'); src = base + '.mp3'; engine = 'edge-tts ' + VOICE; }
    catch (e) { if (engine) throw e; console.log('edge-tts 안 됨 → SAPI', String(e).slice(0, 200)); engine = 'sapi'; }
  }
  if (!src) { sapi(t, base + '-sapi.wav'); src = base + '-sapi.wav'; engine = 'sapi Microsoft Heami Desktop'; }
  // 앞뒤 무음 다듬기 → 48k 모노 wav(편집에서 그대로 씀)
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', src, '-af',
    'silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.02,areverse,silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.05,areverse',
    '-ar', '48000', '-ac', '1', base + '.wav']);
  times.push({ i, id: s.id, text: s.narr, say: t, dur: +probe(base + '.wav').toFixed(3) });
  console.log(String(i + 1).padStart(2), s.id, times.at(-1).dur);
}
fs.writeFileSync(path.join(DIR, 'times.json'), JSON.stringify({ engine, voice: VOICE, lines: times }, null, 1));
fs.writeFileSync(path.join(OUT2, 'narration.txt'),
  `Land-XI 소개 영상 4판 — 나레이션 원고 (${new Date().toISOString().slice(0, 10)})\n음성: ${engine} · 컷마다 한 줄(tts/line-XX.wav) · 사람 목소리로 바꿀 때는 같은 번호 파일을 바꾸고 edit-v4.mjs 를 다시 돌리면 컷 길이가 맞춰집니다.\n\n`
  + times.map((t) => `${String(t.i + 1).padStart(2, '0')}  [${SHOTS[t.i].cap ? SHOTS[t.i].cap[0] : '마무리'}]  ${t.text}`).join('\n') + '\n', 'utf8');
console.log(JSON.stringify({ engine, total: +times.reduce((a, t) => a + t.dur, 0).toFixed(1) }));
