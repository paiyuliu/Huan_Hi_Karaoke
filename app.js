/**
 * app.js — Huan Hi Karaoke App
 * 嚴格依照 xmlplay.js 原版流程整合聲音引擎
 */
import * as mLib from './xmlplay_188/full_source/xmlplay_lib.js';
import * as sLib from './xmlplay_188/full_source/xmlplay_syn.js';

// ═══════════════════════════════════════════════════════
//  Demo Songs Configuration
// ═══════════════════════════════════════════════════════
const DEMO_SONGS = [
  { title: "歡喜就好 - 陳雷",      file: "MUSIC/歡喜就好_陳雷.xml" },
  { title: "稻香 - 周杰倫",        file: "MUSIC/稻香.xml" },
  { title: "隱形的翅膀 - 張韶涵",  file: "MUSIC/隱形的翅膀.xml" },
  { title: "明天會更好 - 群星",    file: "MUSIC/明天會更好.xml" },
  { title: "我還年輕我還年輕 - 告五人", file: "MUSIC/我還年輕我還年輕.xml" },
  { title: "再見 - 張震嶽",        file: "MUSIC/再見_張震獄.xml" },
  { title: "外婆的澎湖灣 - 潘安邦", file: "MUSIC/外婆的澎湖灣.xml" },
  { title: "追夢人 - 鳳飛飛",      file: "MUSIC/追夢人_鳳飛飛.xml" },
  { title: "淚橋 - 伍佰",          file: "MUSIC/淚橋_伍佰.xml" },
  { title: "不要慌太陽下山有月光",  file: "MUSIC/不要慌太陽下山有月光.xml" },
  { title: "好想你 - 四葉草",      file: "MUSIC/好想你_四葉草.xml" },
  { title: "親愛的你啊 - 任素汐",  file: "MUSIC/親愛的你啊_任素汐.xml" },
  { title: "離別開出花",            file: "MUSIC/離別開出花.xml" }
];

// ═══════════════════════════════════════════════════════
//  App State  (mirror of xmlplay.js globals)
// ═══════════════════════════════════════════════════════
let isPlaying   = 0;
let audioCtx    = null;
let instrumentsReady = false;  // true after laadNoot finishes
let withRT      = 1;
let hasPan      = 1, hasLFO = 1, hasFlt = 1, hasVCF = 1;
let instMap     = [];
let isJianpu    = false;
let gTempo      = 120;
let mapTab      = {};

// Options object — identical to original xmlplay.js
const opt = {
  speed:       1.0,
  curmsk:      0,
  sf2url1:     'xmlplay_188/',
  sf2url2:     '',
  instTab:     {},
  midijsUrl1:  'xmlplay_188/',
  midijsUrl2:  'https://gleitz.github.io/midi-js-soundfonts/FluidR3_GM/',
  instList:    {},
  transMap:    {},
  burak:       0,
  nosm:        0,
  noDash:      1,
  arpmaxdur:   36,
  dynvce:      0,
  tomsr:       0
};

// Working copy of abc text (with jianpu patch if needed)
let activeXmlText = '';
let activeAbcText = '';

// Lyric data
let xmlLyrics  = [];
let lyricLines = [];

// ═══════════════════════════════════════════════════════
//  DOM Cache
// ═══════════════════════════════════════════════════════
let songListEl, dropzoneEl, fileInputEl, notationToggleEl,
    tempoSliderEl, tempoValEl, keySliderEl, keyValEl,
    playBtnEl, stopBtnEl, trackListEl, notationEl,
    lyricPrevEl, lyricCurrentEl, lyricNextEl,
    waitOverlayEl, waitTextEl, errEl, compEl, tmpEl;

// ═══════════════════════════════════════════════════════
//  Initialisation  (DOMContentLoaded)
// ═══════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', async () => {
  // Cache DOM
  songListEl      = document.getElementById('songList');
  dropzoneEl      = document.getElementById('dropzone');
  fileInputEl     = document.getElementById('fileInput');
  notationToggleEl= document.getElementById('notationToggle');
  tempoSliderEl   = document.getElementById('tempoSlider');
  tempoValEl      = document.getElementById('tempoVal');
  keySliderEl     = document.getElementById('keySlider');
  keyValEl        = document.getElementById('keyVal');
  playBtnEl       = document.getElementById('playBtn');
  stopBtnEl       = document.getElementById('stopBtn');
  trackListEl     = document.getElementById('trackList');
  notationEl      = document.getElementById('notation');
  lyricPrevEl     = document.getElementById('lyricPrev');
  lyricCurrentEl  = document.getElementById('lyricCurrent');
  lyricNextEl     = document.getElementById('lyricNext');
  waitOverlayEl   = document.getElementById('wait');
  waitTextEl      = document.getElementById('waitText');
  errEl           = document.getElementById('err');
  compEl          = document.getElementById('comp');
  tmpEl           = document.getElementById('tempo');

  // ── 1. Create AudioContext immediately (like original xmlplay.js line 544-545)
  const AC = window.AudioContext || window.webkitAudioContext;
  if (AC) {
    audioCtx = new AC();
    // Detect feature support
    if (!audioCtx.createStereoPanner) hasPan = 0;
    if (!audioCtx.createOscillator)   hasLFO = 0;
    if (!audioCtx.createBiquadFilter) hasFlt = 0;
    if (!audioCtx.createConstantSource) hasVCF = 0;
    // ── CRITICAL: Tell Tone.js to use the SAME AudioContext
    //    so that audioCtx.currentTime and Tone.context.currentTime
    //    are identical clocks — fixes highlight / audio sync.
    if (typeof Tone !== 'undefined') {
      Tone.setContext(audioCtx);
    }
  } else {
    alert('您的瀏覽器不支援 Web Audio API，將無法播放音樂。');
  }

  // ── 2. Initialise xmlplay_lib DOM elements
  mLib.addElms();

  // ── 3. Set up tempo element listener (xmlplay_lib reads tmpElm.value directly)
  if (tmpEl) tmpEl.value = opt.speed;

  // ── 4. UI event listeners
  setupDemoSongs();
  setupEventListeners();

  // ── 5. Load first demo song
  await loadDemoSong(DEMO_SONGS[0].file);
});

// ═══════════════════════════════════════════════════════
//  setSynVars + laadNoot  (mirrors xmlplay.js exactly)
// ═══════════════════════════════════════════════════════
function setSynVars() {
  sLib.setSynVars(
    audioCtx, opt,
    mLib.midiVol, mLib.midiPan, mLib.midiInstr, mLib.midiUsedArr,
    withRT, hasPan, hasLFO, hasFlt, hasVCF,
    instMap,
    compEl, logerr
  );
}

function logerr(s) {
  if (errEl) errEl.textContent += s + '\n';
  console.log('[xmlplay]', s);
}

async function laadNoot() {
  setSynVars();
  await sLib.laadNoot();
}

// ═══════════════════════════════════════════════════════
//  addUnlockListener  (mirrors xmlplay.js exactly)
// ═══════════════════════════════════════════════════════
function addUnlockListener(elm, type, handler) {
  function unlockAudio() {
    elm.removeEventListener('mousedown', unlockAudio);
    elm.removeEventListener('touchend',  unlockAudio);
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume().then(() => console.log('AudioContext resumed'));
    }
  }
  elm.addEventListener('mousedown', unlockAudio);
  elm.addEventListener('touchend',  unlockAudio);
  elm.addEventListener(type, handler);
}

// ═══════════════════════════════════════════════════════
//  Demo Songs
// ═══════════════════════════════════════════════════════
function setupDemoSongs() {
  songListEl.innerHTML = '';
  DEMO_SONGS.forEach((song, idx) => {
    const card = document.createElement('div');
    card.className = `song-card ${idx === 0 ? 'active' : ''}`;
    card.dataset.file = song.file;
    card.innerHTML = `
      <div class="song-name">${song.title}</div>
      <div class="song-meta">${song.file.split('/').pop()}</div>
    `;
    card.addEventListener('click', () => {
      document.querySelectorAll('.song-card').forEach(c => c.classList.remove('active'));
      card.classList.add('active');
      if (isPlaying) stopPlay();
      loadDemoSong(song.file);
    });
    songListEl.appendChild(card);
  });
}

// ═══════════════════════════════════════════════════════
//  Event Listeners
// ═══════════════════════════════════════════════════════
function setupEventListeners() {
  // Drag & drop
  dropzoneEl.addEventListener('dragover',  e => { e.preventDefault(); dropzoneEl.style.borderColor = '#8b5cf6'; });
  dropzoneEl.addEventListener('dragleave', () => { dropzoneEl.style.borderColor = 'rgba(255,255,255,0.15)'; });
  dropzoneEl.addEventListener('drop', e => {
    e.preventDefault();
    dropzoneEl.style.borderColor = 'rgba(255,255,255,0.15)';
    if (e.dataTransfer.files.length > 0) handleFileSelect(e.dataTransfer.files[0]);
  });
  fileInputEl.addEventListener('change', e => {
    if (e.target.files.length > 0) handleFileSelect(e.target.files[0]);
  });

  // Notation toggle
  notationToggleEl.addEventListener('click', () => {
    isJianpu = !isJianpu;
    notationToggleEl.classList.toggle('toggle-active', isJianpu);
    renderScore();
  });

  // Tempo slider — updates the hidden <input id="tempo"> that xmlplay_lib reads
  tempoSliderEl.addEventListener('input', e => {
    const val = parseFloat(e.target.value);
    tempoValEl.textContent = `${val.toFixed(1)}x`;
    if (tmpEl) tmpEl.value = val;
  });

  // Key / Transposition slider
  keySliderEl.addEventListener('input', e => {
    const semitones = parseInt(e.target.value);
    keyValEl.textContent = (semitones > 0 ? '+' : '') + semitones;
    for (let v = 0; v < 32; v++) opt.transMap[v] = semitones;
  });

  // Play / Stop
  addUnlockListener(playBtnEl, 'click', togglePlay);
  stopBtnEl.addEventListener('click', stopPlay);
}

// ═══════════════════════════════════════════════════════
//  File Loading
// ═══════════════════════════════════════════════════════
async function loadDemoSong(filePath) {
  showLoading('載入示範歌曲中…');
  try {
    const res = await fetch(filePath);
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${filePath}`);
    const text = await res.text();
    await processSong(text);
  } catch (err) {
    console.error(err);
    alert('載入歌曲失敗！\n' + err.message);
  } finally {
    hideLoading();
  }
}

function handleFileSelect(file) {
  const reader = new FileReader();
  reader.onload = e => {
    try { processSong(e.target.result); }
    catch (err) { alert('解析檔案失敗！\n' + err.message); }
  };
  reader.readAsText(file);
}

// ═══════════════════════════════════════════════════════
//  Core Song Processing  (mirrors dolayout in xmlplay.js)
// ═══════════════════════════════════════════════════════
async function processSong(content) {
  activeXmlText = content;

  // Parse XML lyrics for KTV display
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(content, 'text/xml');
  if (xmlDoc.getElementsByTagName('parsererror').length > 0) {
    throw new Error('MusicXML 格式解析錯誤');
  }
  xmlLyrics  = parseXmlLyrics(xmlDoc);
  lyricLines = groupLyricsIntoLines(xmlLyrics);
  updateLyricDisplay(0);

  // Convert XML → ABC
  const vertaalFn = typeof vertaal === 'function' ? vertaal : window.vertaal;
  if (typeof vertaalFn !== 'function') throw new Error('xml2abc vertaal 函式未載入！');
  const res = vertaalFn(xmlDoc, { p: 'f', t: 1, u: 0, v: 3, m: 2, mnum: 0 });
  if (res[1]) logerr(res[1]);

  await renderScore(res[0]);
}

// ═══════════════════════════════════════════════════════
//  Score Rendering  (matches dolayout order precisely)
// ═══════════════════════════════════════════════════════
async function renderScore(abcOverride) {
  let abcText = abcOverride || activeAbcText;
  if (!abcText) return;

  // Apply Jianpu patch
  if (isJianpu) {
    abcText = abcText.replace(/(K:[^\n]+\n)/g, '$1%%jianpu 1\n');
  }
  activeAbcText = abcText;

  // ── Step 1: doModel  (MUST run before doLayout — populates ntsSeq etc.)
  mLib.doModel(abcText, opt, gTempo, 0, mapTab, logerr);

  // Grab shared arrays (mLib exposes them as exported vars)
  instMap = Array(256).fill(1).map((_, i) => i);

  // ── Step 2: load instruments for this score (AWAIT completion!)
  instrumentsReady = false;
  playBtnEl.textContent = '⏳ 載入中…';
  playBtnEl.disabled = true;
  await laadNoot();
  instrumentsReady = true;
  playBtnEl.textContent = '▶ 播放';
  playBtnEl.disabled = false;

  // ── Step 3: doLayout — render SVG and hook up click events
  notationEl.innerHTML = '';
  mLib.doLayout(
    abcText, opt,
    null,           // abc_elm (null = xmlplay.js mode)
    1,              // fplay (enable playback cursor)
    notationEl,     // abcElm_p — the container div
    logerr,
    addUnlockListener,
    () => isPlaying,
    playBack,
    null            // dolayout callback (not needed — we handle it ourselves)
  );

  // ── Step 4: rebuild track controls
  updateTrackControls();
}

// ═══════════════════════════════════════════════════════
//  Playback  (mirrors playBack in xmlplay.js exactly)
// ═══════════════════════════════════════════════════════
async function playBack() {
  if (!mLib.ntsSeq || !mLib.ntsSeq.length) return;
  if (!instrumentsReady) return; // instruments still loading

  isPlaying = 1 - isPlaying;

  // Update UI immediately so user sees feedback
  if (isPlaying) {
    playBtnEl.textContent = '⏸ 暫停';
    stopBtnEl.style.display = 'inline-flex';

    // Resume suspended context BEFORE starting playback
    if (audioCtx && audioCtx.state === 'suspended') {
      await audioCtx.resume();
    }
    // Also ensure Tone.js context is running (same context, but Tone needs its own start)
    if (typeof Tone !== 'undefined' && Tone.context.state !== 'running') {
      await Tone.start();
    }

    mLib.start_markeer(audioCtx);
  } else {
    playBtnEl.textContent = '▶ 播放';
    mLib.stop_markeer();
  }
}

async function togglePlay() {
  await playBack();
}

function stopPlay() {
  if (isPlaying) {
    isPlaying = 0;
    mLib.stop_markeer();
  }
  playBtnEl.textContent = '▶ 播放';
  stopBtnEl.style.display = 'none';
  updateLyricDisplay(0);
}

// ═══════════════════════════════════════════════════════
//  Track / Voice Controls
// ═══════════════════════════════════════════════════════
const INSTRUMENT_OPTIONS = [
  { value: 0,  label: '鋼琴 (Piano)' },
  { value: 16, label: '管風琴 (Organ)' },
  { value: 20, label: '風琴 (Harmonium)' },
  { value: 24, label: '尼龍吉他 (Nylon Guitar)' },
  { value: 25, label: '木吉他 (Acoustic Guitar)' },
  { value: 46, label: '豎琴 (Harp)' },
  { value: 40, label: '小提琴 (Violin)' },
  { value: 73, label: '長笛 (Flute)' },
  { value: 56, label: '小號 (Trumpet)' }
];

function updateTrackControls() {
  trackListEl.innerHTML = '';
  const count = mLib.midiVol ? mLib.midiVol.length : 0;
  if (count === 0) {
    trackListEl.innerHTML = '<div style="font-size:0.8rem;color:var(--text-muted);text-align:center;padding:1rem">此樂譜無音軌資料</div>';
    return;
  }
  for (let i = 0; i < count; i++) {
    const stf  = mLib.vce2stf[i];
    const name = mLib.stf2name[stf] || `音軌 ${i + 1}`;
    const inst = mLib.midiInstr[i] || 0;

    const opts = INSTRUMENT_OPTIONS.map(o =>
      `<option value="${o.value}" ${o.value === inst ? 'selected' : ''}>${o.label}</option>`
    ).join('');

    const card = document.createElement('div');
    card.className = 'track-item';
    card.innerHTML = `
      <div class="track-header">${name} (Voice ${i})</div>
      <div class="track-controls">
        <select class="track-inst-select" data-voice="${i}">${opts}</select>
        <div style="display:flex;align-items:center;gap:.25rem;font-size:.75rem;">
          <span>音量:</span>
          <input type="range" class="track-vol-slider" data-voice="${i}"
                 min="0" max="127" value="${mLib.midiVol[i] || 100}"
                 style="margin:0;height:4px">
        </div>
      </div>`;

    card.querySelector('.track-inst-select').addEventListener('change', e => {
      const v = parseInt(e.target.dataset.voice);
      const newInst = parseInt(e.target.value);
      mLib.midiInstr[v] = newInst;
      instMap[mLib.midiInstr[v]] = newInst;
      mLib.midiUsedArr.push(60 + (newInst << 7));
      laadNoot();
    });

    card.querySelector('.track-vol-slider').addEventListener('input', e => {
      const v = parseInt(e.target.dataset.voice);
      mLib.midiVol[v] = parseInt(e.target.value);
      setSynVars();
    });

    trackListEl.appendChild(card);
  }
}

// ═══════════════════════════════════════════════════════
//  KTV Lyrics
// ═══════════════════════════════════════════════════════
function parseXmlLyrics(xmlDoc) {
  const lyrics = [];
  const parts   = xmlDoc.getElementsByTagName('part');
  if (!parts.length) return lyrics;
  const measures  = parts[0].getElementsByTagName('measure');
  let   tick      = 0;
  let   division  = 1;

  for (let m = 0; m < measures.length; m++) {
    const divs = measures[m].getElementsByTagName('divisions');
    if (divs.length) division = parseInt(divs[0].textContent) || 1;

    for (const child of measures[m].children) {
      const durEl = child.getElementsByTagName('duration')[0];
      const dur   = durEl ? parseInt(durEl.textContent) : 0;

      if (child.tagName === 'note') {
        const isRest = child.getElementsByTagName('rest').length > 0;
        const lyrEls = child.getElementsByTagName('lyric');
        if (lyrEls.length && !isRest) {
          const txt = lyrEls[0].getElementsByTagName('text')[0];
          if (txt) lyrics.push({ text: txt.textContent, beat: tick / division });
        }
        tick += dur;
      } else if (child.tagName === 'backup') {
        tick -= dur;
      } else if (child.tagName === 'forward') {
        tick += dur;
      }
    }
  }
  return lyrics;
}

function groupLyricsIntoLines(syllables) {
  const lines = [];
  let   cur   = [];
  syllables.forEach((syl, i) => {
    cur.push(syl);
    const last = i === syllables.length - 1;
    const gap  = !last && (syllables[i + 1].beat - syl.beat > 2.5);
    const full = cur.length >= 8;
    const punc = /[，。,.！!？?]/.test(syl.text);
    if (last || gap || full || punc) { lines.push(cur); cur = []; }
  });
  return lines;
}

function updateLyricDisplay(beat) {
  if (!lyricLines.length) {
    lyricCurrentEl.textContent = '歡迎使用歡喜卡拉 OK！請載入樂譜開始唱歌';
    lyricPrevEl.textContent    = '';
    lyricNextEl.textContent    = '';
    return;
  }
  let idx = 0;
  lyricLines.forEach((line, i) => {
    if (beat >= line[0].beat - 0.5) idx = i;
  });
  lyricPrevEl.textContent = (lyricLines[idx - 1] || []).map(s => s.text).join(' ');
  lyricNextEl.textContent = (lyricLines[idx + 1] || []).map(s => s.text).join(' ');

  lyricCurrentEl.innerHTML = '';
  (lyricLines[idx] || []).forEach(syl => {
    const span = document.createElement('span');
    span.textContent = syl.text;
    if (beat >= syl.beat - 0.05) span.className = 'char-highlight';
    lyricCurrentEl.appendChild(span);
    lyricCurrentEl.appendChild(document.createTextNode(' '));
  });
}

// ═══════════════════════════════════════════════════════
//  Loading Overlay
// ═══════════════════════════════════════════════════════
function showLoading(msg) { waitTextEl.textContent = msg; waitOverlayEl.style.display = 'block'; }
function hideLoading()    { waitOverlayEl.style.display = 'none'; }
