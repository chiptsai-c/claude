# Prompt to Pocket

An animated showcase of Claude Code building a mobile app (an IT service request app). Viewers watch one sentence become a working app across four scenes, on a phone that builds itself.

| Folder | What it is | Status |
|---|---|---|
| `app/` | The Phase 1 app: React + Framer Motion, installable on phones, works offline | **Current** |
| `prototype/` | Phase 0 single-file prototype, kept for reference | Superseded |
| `wan-video-bot/` | Separate side project: Telegram agent (runs on an Android phone) that turns photos into Wan 2.2 videos via fal.ai or your own ComfyUI | Personal testing |

## The story

| # | Scene | Claude Code feature | Interaction |
|---|---|---|---|
| – | Intro | Title card | Start the demo or play the Director's Cut |
| 1 | Plan | Plan mode | Prompt is typed; a 5-step plan waits for approval |
| 2 | Subagents | Parallel subagents | UI, API and Tests helpers race; the phone fills in |
| 3 | Self-heal | Run tests, fix failures | Tap the bug to squash it; Claude fixes the cause |
| 4 | Ship | Permissions, git, CI | **Approve** or **Deny** the push; CI goes green, rocket launches |
| – | Wrap-up | Recap | Jump back to any scene, call to action, demo stats |

## Modes
- **Explore:** Back/Next, the scene dots, arrow keys, or swipe.
- **Director's Cut:** loops intro → 4 scenes → wrap-up without anyone touching it.
  - **Camera:** scrolls to whatever matters at each moment (the text, the phone, the console or the stats) and briefly highlights it. It only scrolls when that area isn't already fully on screen, so on a large display it rarely moves. If someone scrolls by hand, it leaves the page alone for 8 seconds.
  - **Approvals:** the push is approved automatically and clearly labelled as simulated, with a note that in real use a person must approve.
- **Kiosk:** open the app with `#kiosk` at the end of the URL. It auto-plays, and when someone stops to explore, it restarts the Director's Cut after 45 seconds with no interaction.
- **Sound:** off by default; the button in the header turns it on. All sounds are generated in the browser.
- **Reduced motion:** respects the device setting by skipping typing and jumping to end states.

## Editing the content
All scene text and scripts live in **`app/src/content/showcase.json`**. Change wording, plan steps, test names or stats there; no code changes needed.

Text supports colour tags: `{ok:green}`, `{bad:red}`, `{warn:amber}`, `{acc:orange}`, `{dim:grey}`, `{pr:prompt}`, `{add:added file}`, `{tag:helper name}`.

Each scene's `script` is a list of steps (`type`, `line`, `lines`, `wait`, `phone`, `ask`, `lanes`, `diff`, `awaitBug`, `squish`, `permission`, `checks`, `payoff`, `sound`, `focus`). `focus` is the Director's Cut camera: `{ "do": "focus", "target": "phone", "autoHoldMs": 1500 }` waits 1.5s, then brings the phone into view. It does nothing in manual mode. `npm test` checks the file and fails with a clear message if a step is mistyped.

## Develop
```bash
cd app
npm install
npm run dev              # local dev server
npm test                 # engine, content and app tests
npm run build            # typecheck + production build in dist/
npm run build:artifact   # also writes artifact/index.html, a single self-contained page
```

## Deploy
- **Azure Static Web Apps (recommended):** point the app location at `app` and the output at `dist`. `public/staticwebapp.config.json` is included. Behind company sign-in, this is the best fit for internal sharing.
- **SharePoint / Teams:** upload `artifact/index.html` (one file, no dependencies besides Google Fonts).
- Installable on phones (Add to Home Screen) and works offline after the first visit when served over HTTPS.

CI (`.github/workflows/app.yml`) runs typecheck, tests and both builds on every change to `app/`.

## Notes
- All tickets, figures and code are example content for the demo, and the page labels the stats "In this demo".
- No official Anthropic or Claude logos are used.
- The bug counter is stored per device only.
