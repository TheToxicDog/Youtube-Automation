# Rebuild

Sources for `../boety-studio-short.mp4`. Run these from a working folder that holds `img/` (the app
icons and screenshots from the boety studio artifact), `vo/` and these files.

1. Voice: `pip install piper-tts`, then synthesize each line in `lines.json` with
   `piper -m en_US-ryan-high.onnx --length_scale 0.92 --sentence_silence 0.15` into `vo/<id>.wav`.
   `timing.json` records each clip's duration.
2. Frames: `NODE_PATH=$(npm root -g) node render.mjs video video_silent.mp4`. This renders
   `short.html` with Playwright at 1080x1920, 30 fps, and writes `timeline.json`.
3. Audio: `python3 audio.py` lays the VO on the timeline, synthesizes and ducks the music bed, and
   writes `mix.wav` and `captions.srt`.
4. Mux: `ffmpeg -i video_silent.mp4 -i mix.wav -af loudnorm=I=-14:TP=-1:LRA=7 -c:v copy -c:a aac -b:a 192k -ar 48000 -shortest -movflags +faststart boety-studio-short.mp4`
