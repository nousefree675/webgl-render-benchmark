# webgl-render-benchmark

Measures how fast a three.js WebGL scene renders video frames with **software
rendering (SwiftShader)** on a standard GitHub-hosted Actions runner, using
headless Chrome and ffmpeg at 1280x720 / 24 fps.

## Why

To get a measured answer to: "how long would CI take to render a one-minute
3D video?" All content here is **original procedural geometry** (terrain,
snow, capsule figures, tents) written for this benchmark. There are no
third-party models, textures, or assets of any kind, so it is safe to keep
public. Numbers describe this synthetic scene only; heavier real projects
will render slower per frame.

## Method

- `scene.html` draws a deterministic animated scene (any frame depends only
  on its timestamp, so out-of-order rendering never drops or duplicates work).
- `render.mjs` serves the folder, drives headless Chrome with puppeteer-core,
  steps time frame by frame, and pipes canvas PNGs into ffmpeg.
- `--n` mirrors a quality knob used by real renderers: N sub-frame renders per
  output frame (cost scales linearly with N).
- The workflow prints seconds/frame into the job summary and uploads the
  rendered clip plus log as an artifact.

## Run it

Actions tab -> "render-benchmark" -> Run workflow. Inputs:
- `seconds` of video at 24 fps (1.25 = 30 frames)
- `quality` sub-frames per frame (1 = draft, 4 = preview-grade)

Locally: `npm ci && CHROME_PATH=$(which google-chrome) node render.mjs --video --from=0 --to=1.25 --fps=24 --n=1`
