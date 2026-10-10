# boety studio: YouTube Short publish package

Built with the youtube-agent-skill pack (`yt-script`, `yt-package`, `yt-seo`).

| file | what it is |
| --- | --- |
| `boety-studio-short.mp4` | 1080×1920, 30 fps, H.264 + AAC, ~39 s, loudness normalized to -14 LUFS |
| `cover.png` | 1080×1920 cover frame |
| `captions.srt` | Caption file to upload in YouTube Studio → Subtitles |
| `hooks*.txt`, `titles.txt` | Every hook and title candidate that was scored |

---

## Hook (`/yt-script`)

Two rounds of five hooks were scored with `hookscore.py`. These are the top two that make no false claims:

| verdict | hook | formula |
| --- | --- | --- |
| **70 WORKABLE** | *Why do you still install Photoshop, when seven open-source apps run in one browser tab, and your files never leave your machine?* | The Question |
| 58 WORKABLE | *What if Photoshop, Premiere and After Effects were one free browser tab, and your files never left your machine?* | The Question |

A variant ending in "before you can blink" scored 72 but was dropped. It isn't true: each app downloads 9–19 MB of WebAssembly before it starts.

**Why this formula fits:** someone who uses creative tools has already typed "free Photoshop alternative" into a search bar. The question puts that search back to them, names the cost (installs, and files that leave the machine) and leaves a gap (*which seven?*) that only the video closes.

**Loop point:** the last line, "So why are you still installing them?", is answered by the first line, "Why do you still install Photoshop…", so a replay plays as one continuous thought.

## Script (as voiced, 101 words, ~39 s)

| time | spoken | on screen |
| --- | --- | --- |
| 0:00 | Why do you still install Photoshop, when seven open-source apps run in one browser tab, and your files never leave your machine? | **NO INSTALL.** above a browser window labeled *boety studio* scrolling through all 7 app screenshots; a **1 TAB** stamp lands |
| 0:07 | This is boety studio. Seven creative apps, one tab. | Wordmark, "Seven apps. One tab.", the 7 app icons pop in |
| 0:10 | PhotoCraft, for images. | 01/07 card: screenshot, icon, name in the app's color, "Early alpha" |
| 0:12 | VectorCraft, for vector art. | 02/07 |
| 0:14 | FilmCraft, for video. | 03/07 |
| 0:15 | LightCraft, for raw photos. | 04/07 |
| 0:17 | PdfCraft, for PDF files. | 05/07 |
| 0:19 | EffectCraft, for motion graphics. | 06/07 |
| 0:21 | And DesignCraft, for page layout. | 07/07 |
| 0:23 | Every one is open source, written from scratch in Rust, and running right here in the browser. | Four tiles: Open source / Written in Rust / Runs in your browser / Files stay local; MIT or Apache-2.0 |
| 0:28 | They're early builds from the ArtCraft team, so expect rough edges. | "Expect rough edges." + credit line |
| 0:32 | Link's in the description. Seven apps. Zero installs. | "7 apps. 0 installs." + bouncing arrow |
| 0:36 | So why are you still installing them? | Full-screen question → loops to the start |

Voiceover is Piper TTS (`en_US-ryan-high`). Burned-in captions highlight each word as it's spoken and stay inside the Shorts safe zone (clear of the bottom title/description area and the right-hand button rail). The music bed was synthesized for this video, so there's nothing to license, and it ducks under the voice.

---

## Packaging (`/yt-package`)

**Title:** `7 Creative Apps, One Browser Tab` · `title.py` 100/100 (32 chars, fits the 40-character mobile cut, carries a number)

**Cover text:** `NO INSTALL`, two words that don't repeat the title

Runners-up from the ten candidates in `titles.txt`:

- `No Install, No Upload: 7 Creative Apps in One Tab`: 94, loses the subject on a mobile cut
- `I Put 7 Creative Apps in One Browser Tab (No Install)`: 94, same mobile issue, and duplicates the cover text

**Cover brief:** the hook frame without captions, showing "NO INSTALL." in Archivo Extra-Expanded (white + the studio's blue `#6f9cff`) over the browser window with real screenshots. It's dark ground with no face, and the contrast comes from the white headline and the light Great Wave / PrintCraft tiles.

---

## Description (`/yt-seo`)

Copy everything between the lines.

---

Seven free, open-source creative apps (image editing, vector art, video, raw photos, PDFs, motion graphics and page layout) running in one browser tab. No install, and your files stay on your machine.

▶ Open boety studio: https://claude.ai/artifact/ScASWMprghhD3pXZYZzFbC

The seven:
PhotoCraft · image editor (early alpha)
VectorCraft · vector illustration
FilmCraft · video editor
LightCraft · photo library & raw developer
PdfCraft · PDF workbench (early alpha)
EffectCraft · motion graphics & VFX
DesignCraft · page layout & publishing

Every app is written from scratch in Rust and compiled to WebAssembly for the browser. These are early builds, so expect rough edges.

Credits: the Crafting Apps are made by the ArtCraft team and contributors, released under MIT or Apache-2.0 (source: https://github.com/storytold). boety studio hosts their unmodified web builds in one tab. It is not an official ArtCraft site. Desktop versions: https://getartcraft.com/apps

#shorts #opensource #rustlang

---

**Tags** (for disambiguation only, since tags are a weak signal):
`boety studio, open source creative apps, free photoshop alternative, browser photo editor, rust, webassembly, wasm, photocraft, vectorcraft, filmcraft, lightcraft, pdfcraft, effectcraft, designcraft, artcraft`

**Query test:** these are the three searches this should win, and the title plus the first two description lines contain each one's words:

1. `open source creative apps` → description line 1 ✓
2. `creative apps browser` → title ✓
3. `free photo editor in browser no install` → description line 1 (free, image editing, browser, no install) ✓

**Pinned comment (one ask):**
> Which one are you opening first? All seven run in the tab linked above. No install, your files stay local.

**Chapters:** skipped. Shorts don't render chapters.

---

## Before you upload, check these

- [ ] **Pronunciation of "boety".** The voice says it "BO-dee". If you say it differently, tell me and I'll regenerate that line.
- [ ] **The artifact link is shared with anyone who has it.** Posting it in a description makes it effectively public.
- [ ] **No `voice.md` yet.** The skill pack wants one (`~/.claude/youtube/voice.md`). This script was written in a neutral voice; send me three of your videos and I'll build it so the next one sounds like you.
- [ ] **Settings in YouTube Studio:** "Altered or synthetic content" is about realistic people, places or events. A TTS narrator over real screenshots generally doesn't require it, but answer it for your situation.

**Nothing here publishes. This skill writes and you publish. Ship it, or change it?**
