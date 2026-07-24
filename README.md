# Huan_Hi_Karaoke (歡喜卡拉OK)

一個結合 AI、簡譜/五線譜即時渲染與 Tone.js 的網頁版智慧卡拉OK與音樂創作平台。

本專案名稱靈感源自台語經典金曲《歡喜就好》（Huan-Hí-Tō-Hó），旨在讓音樂創作、看譜與歌唱體驗變得更加「簡單、歡喜就好」。

---

## 📌 專案願景與核心目標

在華人音樂圈（特別是流行樂自彈自唱、長者合唱團及國樂器演奏），**數字簡譜（Numbered Musical Notation / Jianpu）** 的使用需求極大。本專案旨在打造一個純前端、零伺服器成本的音樂平台，能夠：
1. **匯入/轉換**：讓使用者直接拖放任何 MusicXML 檔案，並在 0.01 秒內完成解析。
2. **多模態渲染**：一鍵在**「五線譜」**與**「首調數字簡譜」**之間無縫切換，並完美對齊歌詞。
3. **高品質伴奏**：利用 Tone.js 驅動的音訊引擎，實現高品質 Sampler 合成播放，提供即時的變速、升降 Key（變調）及導唱切換功能。
4. **AI 自動配樂**（未來規劃）：
   - 接收使用者透過 MIDI 鍵盤彈奏的單音主旋律。
   - 經由 JS 量化演算法校正拍值。
   - 透過 AI Agent（LLM API）自動進行調性分析、配和弦（Chord Progression）及生成雙聲部伴奏織體（例如鋼琴左手伴奏）。
   - 將 AI 生成的 MusicXML 重新渲染為帶和弦標記的簡譜，完成創作與播放閉環。

---

## 🛠️ 技術架構

本專案採用純網頁前端技術開發，以實現極速的本地運算與零伺服器維護成本。

```mermaid
graph TD
    A[MusicXML / MIDI 鍵盤輸入] --> B[xml2abc.js 解析器]
    B --> C[ABC 記譜法字串 / 歌詞數據]
    C -->|插入 %%jianpu 1| D[abc2svg.js 渲染引擎]
    C -->|擷取音符與時值時間軸| E[Tone.js 伴奏引擎]
    D --> F[SVG 向量簡譜 / 五線譜 + 動態滾動歌詞]
    E --> G[高品質音訊輸出: 升降Key / 變速 / 殘響效果]
```

### 關鍵運作原理：
* **`xml2abc-js`**：讀取 MusicXML XML 結構並翻譯為 ABC 記譜法。
* **`abc2svg` (簡譜的關鍵)**：由 Jean-François Moine 開發的網頁繪圖引擎，原生支援 `%%jianpu 1` 指令。當啟用時，會將 ABC 碼自動轉換為首調簡譜數字（如 `1 2 3 1`）並與歌詞對齊渲染。
* **`Tone.js`**：接管 Web Audio，配合高音質 Sampler 音源，並實現變調/變速等 KTV 必備功能。

---

## 🔊 音色引擎三層架構

本專案採用「三層優先順序」策略，兼顧音質與相容性：

| 優先順序 | 引擎 | 涵蓋樂器 | 音質 | 說明 |
|:---:|------|----------|:---:|------|
| 1️⃣ | **Tone.js Sampler** | 鋼琴、管風琴、風琴、尼龍吉他、木吉他、豎琴 | ⭐⭐⭐⭐⭐ | 來自 `SelfPlayingMusic/samples/` 的真實樂器錄音採樣 |
| 2️⃣ | **xmlplay SF2 引擎** | 任何有對應 `instrXXmp3.js` 的 GM 樂器 | ⭐⭐⭐⭐ | Wim Vree 原版即時合成器，支援包絡線、濾波器、顫音 |
| 3️⃣ | **MIDI-js Fallback** | 以上都沒有的樂器 | ⭐⭐⭐ | 線上 FluidR3_GM 預渲染音波，離線無法使用 |

SF2 樂器檔案命名規則為 `instrXXmp3.js`，其中 `XX` 是 GM Program Number（0-127）。例如：
- `instr0mp3.js` → 鋼琴 (Acoustic Grand Piano)
- `instr24mp3.js` → 尼龍吉他 (Nylon Guitar)
- `instr40mp3.js` → 小提琴 (Violin)
- `instr73mp3.js` → 長笛 (Flute)

只需將需要的 `instrXXmp3.js` 檔案放入 `xmlplay_188/` 目錄，引擎會自動載入。

### 🔮 未來規劃：完整 SoundFont 分支 (`feature/full-soundfont`)

目前的 SF2 方案需要為每個樂器單獨下載 JS 檔案。未來計劃在獨立分支中探索**載入完整 `.sf2` SoundFont 檔案**的方案，一次涵蓋全部 128 種 GM 樂器：

| 候選方案 | 函式庫 | 特點 |
|---------|-------|------|
| **js-synthesizer** | FluidSynth → WebAssembly | 完整的 FluidSynth 移植，音質最高，支援所有 SF2 特性 |
| **WebAudioFont** | 純 JavaScript | 輕量級，內建 GM 音色，載入快速 |
| **smplr** | 純 JavaScript | 現代 API，支援 Splendid Grand Piano 等高品質音源 |

> **注意**：完整 SF2 檔案（如 FluidR3_GM.sf2）約 140 MB，可能需要搭配壓縮版（~30 MB）或按需載入策略。此方案將在 `feature/full-soundfont` 分支中實驗。

---

## 📂 資料夾與相依專案說明

本專案集成了多個優秀的開源音樂工具：

* **[SelfPlayingMusic](file:///D:/01%20TASK/2024/20260720%20OpenKtvAI/SelfPlayingMusic)** (Git Submodule)
  * 專案的子模組，參考並整合網頁端自動伴奏與音訊播放的實作邏輯。
* **[xml2abc-js_122](file:///D:/01%20TASK/2024/20260720%20OpenKtvAI/xml2abc-js_122)** (第三方開源原始碼)
  * Wim Vree 開發的 `xml2abc-js` 轉換工具，用於在瀏覽器端將 MusicXML 解析轉換成 ABC Notation。
* **[xmlplay_188](file:///D:/01%20TASK/2024/20260720%20OpenKtvAI/xmlplay_188)** (第三方開源原始碼)
  * Wim Vree 開發的 `xmlplay` 網頁版樂譜播放器，內含 `abc2svg` 引擎與 `xmlplay.js` 核心控制程式。
* **[MUSIC](file:///D:/01%20TASK/2024/20260720%20OpenKtvAI/MUSIC)**
  * 用於測試的音樂檔案與 MusicXML 資源目錄。

---

## 🚀 開始使用與測試

### 1. 簡譜渲染本地測試
可以直接參考 `xmlplay_188` 中的 `xmlplay.html` 或 `xmlplay_emb.html` 來理解其如何載入 `xml2abc.js` 與 `abc2svg`。
若要在 ABC 代碼中啟用簡譜渲染，只需在音軌聲明中加入 `%%jianpu 1`：
```abc
X:1
T:兩隻老虎 (簡譜範例)
M:4/4
L:1/4
K:C
V:1
%%jianpu 1
C D E C | C D E C | E F G2 | E F G2 :|
w:兩 隻 老 虎, 兩 隻 老 虎, 跑 得 快, 跑 得 快,
```

### 2. 子模組初始化
如果您剛 clone 本專案，請確保初始化並更新子模組：
```bash
git submodule init
git submodule update
```

---

## 📝 專案開發藍圖 (Roadmap)

1. **第一階段：UI/UX 現代化改造** ✅ 已完成
   - 設計暗色玻璃擬態（Glassmorphism）KTV 播放器介面。
   - 側邊欄整合示範曲庫、拖曳上傳、播放控制、音軌樂器分配。
   - 底部 KTV 歌詞同步高亮顯示。
2. **第二階段：音訊引擎升級 (Tone.js Bridge)** ✅ 已完成
   - Tone.js Sampler 載入 SelfPlayingMusic 高品質錄音採樣。
   - 與 xmlplay SF2 引擎共享同一 AudioContext（`Tone.setContext`），確保音符與游標完美同步。
   - 三層音色回退架構：Tone.js → SF2 → MIDI-js。
3. **第三階段：歌詞動態走位 (Karaoke Lyrics Sync)** ✅ 已完成
   - MusicXML `<lyric>` 標籤解析與分句演算法。
   - 逐字高亮變色與滾動，霓虹綠 KTV 效果。
4. **第四階段：SF2 樂器擴充** 🔄 進行中
   - 下載常用 GM 樂器的 SF2 檔案（電吉他、弦樂、管樂、打擊等）。
   - 探索完整 SoundFont 載入方案（`feature/full-soundfont` 分支）。
5. **第五階段：MIDI 輸入與 AI 創作功能** 📋 規劃中
   - 使用 Web MIDI API 錄製鍵盤演奏。
   - 實現 Quantization 量化演算法，將 MIDI 時間校正為標準音符長度。
   - 對接 AI (LLM) 自動配樂與聲部生成，提供創作協同。
