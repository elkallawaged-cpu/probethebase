# PROBE THE BASE 🚀
### Junior Astronaut Mission Trainer · NASA Space Apps Challenge · v3.2

A browser game for kids aged **7–12**. You run the power grid of a Mars or Moon base while **real NASA space-weather data** hits it with solar flares. Every kilowatt has a cost. When a flare hits, you have to decide fast: protect the crew, or keep the science going?

**New in v3.0:** a guided tutorial with Probe the robot, a kids' space quiz with stars, a printable **Mission Manual** (web + PDF), a clearer mission HUD, and a fixed one-click deployment to GitHub Pages.

**Stack:** Phaser 3.60.0 · Tailwind CSS 3.4 · Chart.js 4.4.1 · NASA DONKI API · NASA OSDR calibration · vanilla JS (no bundler, works offline)

> **Just want it online?** Jump to [Deploy to GitHub Pages, step by step](#9-deploy-to-github-pages-step-by-step).
> **بالعربي؟** انزل على [خطوات النشر بالعربي](#14-خطوات-النشر-على-github-بالعربي).

---

## Table of contents
1. [What's in this version](#1-whats-in-this-version)
2. [How to play](#2-how-to-play)
3. [PROBE Academy: tutorial and space quiz](#3-probe-academy-tutorial-and-space-quiz)
4. [The Mission Manual](#4-the-mission-manual)
5. [NASA open data](#5-nasa-open-data)
6. [Scoring: Critical Thinking Index and AI Mission Analyst](#6-scoring-critical-thinking-index-and-ai-mission-analyst)
7. [Project structure](#7-project-structure)
8. [Run it on your computer](#8-run-it-on-your-computer)
9. [Deploy to GitHub Pages, step by step](#9-deploy-to-github-pages-step-by-step)
10. [Other hosts: Netlify and Vercel](#10-other-hosts-netlify-and-vercel)
11. [Testing](#11-testing)
12. [Configuration and tuning](#12-configuration-and-tuning)
13. [Troubleshooting](#13-troubleshooting)
14. [خطوات النشر على GitHub بالعربي](#14-خطوات-النشر-على-github-بالعربي)
15. [Changelog](#15-changelog)
16. [Credits and license](#16-credits-and-license)

---

## 1. What's in this version

### Game flow
| Scene | What it does |
|---|---|
| **Boot** | Loads and checks all 21 images, then shows **"Tap to begin"**. That first tap unlocks Web Audio, so there's no autoplay warning. |
| **Title** | START / OPTIONS / QUIT. Mouse, touch, **← → + Enter**, **O** for options, **H** for the manual. |
| **Settings** | Five rows: **Sound**, **NASA live data** (LIVE / OFFLINE), **Difficulty** (Cadet / Engineer / Commander), **Practice with Probe** (First flight / Every flight / Off) and **Space quiz** (On / Off). Saved in `localStorage`. |
| **Mode select** | Mars or Moon (keys **M** / **L**). A **Practice with Probe** toggle for this flight and a **Mission Manual** button. Shows your best CTI. |
| **Mission** | 90 seconds, 1 game second = 1 base hour. The cockpit crossfades to flare art during a storm. Optional tutorial at the start, quiz after the flare. |
| **Results** | Success or failure card, CTI breakdown, quiz stars, AI Mission Analyst summary. **PLAY AGAIN / MENU / REPORT** (the report includes quiz results). |
| **Quit** | Missions flown, best CTI, best quiz score. |

### Mission HUD
- **Top strip:** crew health, solar radiation and the amount **reaching the crew**, power used / capacity, science sent, time left, live CTI, a radiation chart and the data-source label.
- **System checks panel (new, left):** three traffic lights a 7-year-old can read at a glance (**Air and heat**, **Radiation**, **Power**), a phase chip (**Calm / Flare! / Fading / All clear / Practice**) and a coach tip that names the most urgent fix. Yellow on radiation means "shields are as high as your power allows".
- **Power sliders (right):** four 0–50 kW sliders with *critical* / *optional* tags and a live power budget. On Cadet and Engineer, rows glow **turn up** / **turn down** during a storm.
- **Instant feedback (new):** radiation reaching the crew and all three lights update the moment a slider moves, not just once a second.
- **Pause** (button, **P**, **Esc**) now shows a rules refresher card.
- **? button (new):** opens the Mission Manual. 🔊 toggles sound.

### Engineering
- Fixed 1280×720 stage that scales canvas and HUD together: no scrollbars, clicks always land correctly.
- All libraries vendored in `js/vendor/`, so it runs offline after the first load. Sound is synthesised (no audio files).
- Missing images get placeholder textures; an asset-manifest validator blocks bad extensions.
- **17 automated tests**, a GitHub Actions workflow that tests before every deploy, security headers for Netlify and Vercel.
- Accessibility: keyboard play everywhere (including the quiz), ARIA labels, focus trapping in the quiz, `prefers-reduced-motion`, rotate-your-device hint.

---

## 2. How to play
1. Pick **Mars** or **Moon**. On your first flight, Probe gives you a practice run.
2. Keep the crew healthy for **90 seconds**:
   - **Life Support** must stay at **25 kW or more**.
   - **Shielding** blocks radiation: **40 kW blocks 100%**, 20 kW blocks 50%.
   - **Total power** must stay **under the capacity**. Flares and CMEs dim the solar panels.
   - Radiation reaching the crew above **0.2 mSv/h** hurts them.
3. When the **ALERT** fires: cut **Research** and **Comms**, set Life Support to 25 kW, and push **Shielding** up until the budget says 0 kW spare.
4. When it says **All clear**, turn Research and Comms back on to send **science to Earth**.

> **Design note:** at the peak of a big flare, full protection costs more power than the panels make (Mars: 25 + 37 = 62 kW, but only 60 kW are available). That's on purpose: the best possible move is a trade-off, and the game rewards it (yellow light, "best you can").

---

## 3. PROBE Academy: tutorial and space quiz
Code: `js/academy.js` and `css/academy.css` (prefix `pa-`, no external files, works offline).

### Tutorial ("Practice with Probe")
- Seven steps. Probe spotlights the power budget, then each system, then sends a **practice storm**.
- The **mission clock is frozen** during the whole tutorial, so the crew can't be hurt.
- The practice storm is an M-class flare (1.6 mSv/h, 70 kW budget) that **can** be fully blocked: 25 kW life support + 35 kW shielding fits. A live checklist ticks green as the player gets it right, and a **Hint** button explains the next move.
- When it's done, the quiz opens, then the real mission starts. **Skip tutorial** is always available.
- Runs automatically on the first flight; controlled in Settings and on the mode-select screen.

### Space quiz
- **3 questions** per quiz, always including one about the player's planet. **23 questions** in the bank, at three levels.
- Cadet gets levels 1–2, Engineer 1–3, Commander 2–3.
- Up to **3 stars** per question. A wrong answer or a hint costs a star (minimum 1). A second hint crosses out a wrong answer. Every answer ends with a short real space fact.
- Ranks: **Space Weather Pro** (≥ 80% of stars), **Storm Watcher** (≥ 50%), **Flare Spotter**.
- In a normal mission, the quiz opens once the player has **handled the flare** (life support OK, under budget, shields as high as possible) for about a second. It pauses the mission.
- Keyboard: **A/B/C** or **1/2/3** to answer, **H** for a hint, Tab stays inside the card.

### How it's wired (for developers)
`MainGameScene.setupAcademy()` in `js/main.js` calls `ProbeAcademy.init({...})` with the HUD targets, a `getState()` reader, and `pause` / `resume` / `triggerFlare` / `endFlare` callbacks. The scene's clock only runs when `!paused && !inTutorial && !academyHold`. `ProbeAcademy.destroy()` runs on scene shutdown.

### Look and feel (palette and fonts)
The whole Academy overlay (Probe's bubble, spotlight, toast, quiz card, mascot, stars) uses one palette, defined as CSS variables at the top of `css/academy.css`:

| Role | Color | Used for |
|---|---|---|
| Navy `#04102a` | text, mascot outline, dim scrim | all body text (14:1 contrast on the card) |
| Pale blue `#c8e3ff` | bubble and quiz card | |
| Mint `#9ee1e7` | main buttons, progress, correct answers | |
| Purple `#b380c2` | Hint buttons, hint notes | |
| Coral `#ce7372` | alerts, wrong answers, earned stars, Probe's antenna | |
| Mauve `#aa85b4` | card edges and borders | |

To re-theme the tutorial, change only the `--pa-*` variables. All text/background pairs were checked against WCAG AA (lowest is 5.5:1).

Fonts are **self-hosted** in `assets/fonts/` (SIL Open Font License, licences included), so they work offline and under the strict security headers: **Fredoka** (titles, buttons, numbers) and **Nunito** (reading text). Only two weights of each are shipped (about 65 KB), and they are preloaded in `index.html`. If a font fails to load, the system rounded font is used instead.

---

## 4. The Mission Manual
`manual/index.html` (web) and `manual/PROBE-THE-BASE-Manual.pdf` (17 printable A4 pages). Opened from the **?** button, the **Mission Manual** button, or the **H** key.

| Part | Contents |
|---|---|
| **Cadet handbook** | Your mission · the four systems · three golden rules · an annotated screenshot of the HUD · the **solar storm checklist** · practising with Probe · quiz and stars · score and ranks · pro tips · space-word glossary |
| **Teacher and parent guide** | Learning goals (science, maths, data literacy, critical thinking) · a **45-minute lesson plan** · discussion questions · **power-puzzle worksheet with answer key** · printable mission log · where the data comes from · privacy note |
| **Quick reference** | Controls, settings, key numbers, difficulty levels, quiz answer key |

**Regenerating the PDF** after editing `manual/index.html`: open `http://localhost:8000/manual/` in Chrome or Edge, press **Ctrl+P / Cmd+P**, choose **Save as PDF**, paper **A4**, tick **Background graphics**, and save over `manual/PROBE-THE-BASE-Manual.pdf`.

---

## 5. NASA open data

### NASA DONKI (Space Weather Database)
| Endpoint | Used for |
|---|---|
| `https://api.nasa.gov/DONKI/FLR` | Latest **solar flare class** in the last 30 days. Scales the radiation spike (C ≈ 0.85×, M ≈ 1.0×, X ≈ 1.2–1.3×, capped so every mission can be won). |
| `https://api.nasa.gov/DONKI/CME` | Latest **CME speed**. Faster CMEs dim the panels up to an extra 8%. |

- Both requests run in parallel with a **2.5 s timeout** each. Results are cached for 60 minutes.
- Any failure (offline, CORS, HTTP 429/5xx, bad JSON, no flares) falls back to archived events: **Mars:** X8.2, 2017-09-10 (also measured on the surface by Curiosity's RAD). **Moon:** X9.0, 2024-10-03.

### NASA OSDR (crew-health calibration)
`OSDR_DOSIMETRY` in `js/scenarios.js`: radiation decay 2.0 per mSv/h of net radiation, brown-out decay 1.2, hypoxia decay 1.5, recovery 0.5 per second when green, career limit 600 mSv (NASA-STD-3001). A gameplay-tuned teaching model, **not medical advice**.

### Core maths
```js
netRadiation    = Math.max(0, radiation_mSv_hr * (1 - shielding / 40));
currentCapacity = baseSolarKW * solar_efficiency;
// crew decays if netRadiation > 0.2 || totalPower > currentCapacity || lifeSupport < 25
```

---

## 6. Scoring: Critical Thinking Index and AI Mission Analyst
```
CTI = 100 × (0.40 × S_diag + 0.35 × S_eff + 0.25 × S_stab)
```
| Part | How it's measured |
|---|---|
| **S_diag** Diagnostic speed | Seconds from the flare alert to the first slider move (paused time doesn't count). ≤ 2 s = 100%, ≥ 15 s = 0%. Tutorial moves don't count. |
| **S_eff** Resource efficiency | During flares: (Life Support + Shielding) ÷ total power. |
| **S_stab** System stability | Share of mission seconds with no radiation danger, no overload and life support OK. |

Ranks: **Outpost Commander** ≥ 85 · **Flight Engineer** ≥ 70 · **Mission Specialist** ≥ 50 · **Cadet**.

**AI Mission Analyst** (`MissionAnalyst.analyze()` in `js/CtiEvaluator.js`) is an on-device, rule-based expert system. It writes a 3-line summary (reaction time, storm efficiency, stability, dose in chest X-rays, one "Next time…" tip), strengths and improvements, and a full text **REPORT** for teachers and judges. It works offline, gives the same answer every time, and sends no data anywhere.

---

## 7. Project structure
```
probe-the-base/
├── index.html                  # Stage + Tailwind HUD (system checks, sliders, pause card)
├── manual/
│   ├── index.html              # Mission Manual (web, print-ready)
│   ├── PROBE-THE-BASE-Manual.pdf
│   └── img/                    # screenshots used in the manual
├── css/
│   ├── tailwind.css            # compiled Tailwind (npm run build:css)
│   ├── style.css               # sliders, icons, system checks, hints
│   └── academy.css             # tutorial + quiz overlay
├── src/tailwind.input.css
├── js/
│   ├── vendor/                 # phaser.min.js 3.60.0, chart.umd.js 4.4.1
│   ├── assets.js               # asset manifest + validator
│   ├── simulation.js           # GAME_CONFIG + pure physics / health maths
│   ├── scenarios.js            # NASA DONKI fetch, presets, OSDR calibration
│   ├── CtiEvaluator.js         # CTI engine + AI Mission Analyst
│   ├── academy.js              # PROBE Academy: tutorial + quiz + question bank
│   └── main.js                 # Phaser scenes, HUD binding, audio, scaling
├── assets/images/              # 21 game-ready images
├── assets/fonts/               # Fredoka + Nunito (woff2) and their OFL licences
├── assets/originals/           # raw art (not deployed)
├── tools/                      # prepare_assets.py, copy-vendor.js
├── tests/
│   ├── simulation.test.js      # 9 tests: physics, NASA parsers, CTI, balance, assets
│   └── academy.test.js         # 8 tests: quiz bank, trade-off check, HUD contract, manual
├── .github/workflows/deploy.yml
├── package.json · package-lock.json · netlify.toml · vercel.json · tailwind.config.js
└── README.md
```

---

## 8. Run it on your computer
Double-clicking `index.html` won't work (browsers block game files on `file://`). Use a tiny local server:

```bash
cd probe-the-base
python3 -m http.server 8000        # Windows: py -m http.server 8000
# then open http://localhost:8000
```
Or with Node: `npx http-server . -p 8000 -c-1`

**Your own NASA key (recommended):** the shared `DEMO_KEY` allows about 30 requests per hour per IP. Get a free key at <https://api.nasa.gov>, then open `http://localhost:8000/?nasaKey=YOUR_KEY` or set `apiKey` in `js/scenarios.js`.

**Only if you change things:**
```bash
npm install
npm run build:css     # after changing Tailwind classes in index.html or js/
npm run vendor        # re-copy Phaser / Chart.js into js/vendor
npm test              # run the 17 checks
```

---

## 9. Deploy to GitHub Pages, step by step

The game is a fully static site. GitHub Actions will **test it, build it and publish it** every time you push. Total time: about 15 minutes the first time.

### Step 0: What you need
- A free GitHub account: <https://github.com/signup>
- **Git** installed: <https://git-scm.com/downloads> (check with `git --version`)
- *(Optional, only to run tests locally)* **Node.js 20 or newer**: <https://nodejs.org> (check with `node --version`)

### Step 1: Unzip and check the project
1. Unzip `probe-the-base-v3-final.zip`. You get a folder called `probe-the-base`.
2. Open a terminal **inside** that folder (Windows: right-click the folder → *Open in Terminal*; macOS: drag the folder onto Terminal).
3. *(Optional but recommended)* run the tests:
   ```bash
   npm ci
   npm test
   ```
   You should see `# pass 17` and `# fail 0`.
4. *(Optional)* play it once locally (section 8).

### Step 2: Put your NASA key in (optional, recommended)
1. Get a free key at <https://api.nasa.gov> (it arrives by email in seconds).
2. Open `js/scenarios.js`, find `apiKey: 'DEMO_KEY'` and replace `DEMO_KEY` with your key.
   *api.nasa.gov keys are meant for browser apps: they are rate-limited, not secret, so it's fine to commit it.*

### Step 3: Create an empty repository on GitHub
1. Go to <https://github.com/new>.
2. **Repository name:** `probe-the-base`.
3. Choose **Public** (GitHub Pages is free for public repositories).
4. **Do not** tick "Add a README", ".gitignore" or "license". The project already has them, and an extra commit would block your first push.
5. Click **Create repository**. Keep the page open; you need its URL.

### Step 4: Push the code
In the terminal, inside the `probe-the-base` folder, run these one at a time. Replace `YOUR-USERNAME` with your GitHub username.
```bash
git init
git add .
git commit -m "PROBE THE BASE v3.0 - NASA Space Apps"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/probe-the-base.git
git push -u origin main
```
- **First time using Git?** Git may ask for your name and email first:
  `git config --global user.name "Your Name"` and `git config --global user.email "you@example.com"`
- **Asked for a password?** GitHub doesn't accept account passwords in the terminal. Either sign in through the browser window that pops up (Git Credential Manager, the default on Windows and macOS), or create a **personal access token**: GitHub → your avatar → *Settings* → *Developer settings* → *Personal access tokens* → *Tokens (classic)* → *Generate new token*, tick **repo** and **workflow**, then paste the token as the password.
- `node_modules/` is excluded by `.gitignore`, so nothing large gets uploaded.

> **No terminal? Use the website instead.** On the empty repository page click **uploading an existing file**, then drag in **everything inside** the `probe-the-base` folder (not the folder itself). The `.github` folder is hidden on some computers: on macOS press **Cmd+Shift+.** in Finder, on Windows tick *View → Hidden items*. Make sure `.github/workflows/deploy.yml` is uploaded, then click **Commit changes**. Do **not** upload `node_modules`.

### Step 5: Turn on GitHub Pages with GitHub Actions
1. In your repository, open **Settings** (top tab).
2. In the left menu, click **Pages**.
3. Under **Build and deployment → Source**, choose **GitHub Actions**. (Not "Deploy from a branch".)
4. That's it. There's nothing to save.

### Step 6: Run and watch the deployment
1. Open the **Actions** tab. You should see **Test and deploy to GitHub Pages**.
   - If it already ran before you switched on Pages and failed, click it and press **Re-run all jobs**.
   - If nothing is listed, click the workflow name on the left, then **Run workflow** → **Run workflow**.
2. The run has two jobs:
   - **build:** `npm ci` → `npm test` (all 17 checks) → `npm run build` → assembles the site (game + manual, without the raw art).
   - **deploy:** publishes to GitHub Pages.
3. Both get a green tick after about 1–2 minutes. A red ✗ means a test failed and **nothing was published**, so a broken version never goes live. Click the red job to see which step failed (see section 13).

### Step 7: Open your game
- Game: `https://YOUR-USERNAME.github.io/probe-the-base/`
- Manual: `https://YOUR-USERNAME.github.io/probe-the-base/manual/`

The link is also shown at **Settings → Pages** and on the **deploy** job. Allow a minute for the first publish.

### Step 8: Check the live site
- [ ] Open the link in a **private/incognito** window. DevTools (F12) → **Console** has no red errors from the game.
- [ ] The label under the radiation chart says `DONKI LIVE: …` (or `NASA archive … (offline)` if NASA is unreachable; both are fine).
- [ ] Play a full mission with **Practice with Probe** on: tutorial → quiz → mission → results → REPORT downloads.
- [ ] The **?** button opens the manual, and **Download PDF** works.
- [ ] DevTools → **Network → Offline**, reload: the game still starts and uses the archive flare within 2.5 s.
- [ ] Phone in landscape: sliders work by touch.

### Step 9: Updating the game later
Edit files, then:
```bash
git add .
git commit -m "Describe your change"
git push
```
Every push to `main` re-runs the tests and redeploys automatically.

### Step 10: Finishing touches for the Space Apps submission
1. **About box:** on the repository's main page click ⚙️ next to *About*, paste your game URL in **Website**, add topics like `nasa-space-apps`, `phaser`, `education`.
2. **Tag the submitted version:**
   ```bash
   git tag v3.0-spaceapps
   git push --tags
   ```
3. Put the live URL and the manual URL on your Space Apps project page.
4. *(Optional) Custom domain:* **Settings → Pages → Custom domain**, enter e.g. `probe.yourteam.org`. At your DNS provider add a `CNAME` record from `probe` to `YOUR-USERNAME.github.io`. Wait for the DNS check, then tick **Enforce HTTPS**.

---

## 10. Other hosts: Netlify and Vercel
**Netlify, drag and drop:** go to <https://app.netlify.com/drop> and drop the `probe-the-base` folder (delete `node_modules` first if present). You get a live URL in seconds.
**Netlify from GitHub:** *Add new site → Import an existing project → GitHub* → pick the repo → **Deploy**. `netlify.toml` runs the tests and sets a Content-Security-Policy that only allows connections to `api.nasa.gov`.

**Vercel:** `npm i -g vercel`, `vercel login`, then `vercel` and `vercel --prod` in the project folder. `vercel.json` sets the build command, output directory and security headers. Or *Add New → Project → Import* the GitHub repo in the dashboard.

---

## 11. Testing
```bash
npm test
```
**17 automated checks** (Node's built-in test runner, no extra dependencies):
- `simulation.test.js` (9): net-radiation formula, the three decay triggers, flare/CME scaling, DONKI parsers, offline fallback, CTI weights, analyst summary length, **game balance** (a smart player survives both missions, an idle one fails), asset manifest.
- `academy.test.js` (8): every quiz question is well formed, every planet × difficulty has a full quiz, the **trade-off check counts the best possible shielding as "handled"** on both bases, the practice storm is winnable, quiz report lines, the HUD contains every element the tutorial and system checks need, the manual ships, offline scenarios still load.

**Manual QA before judging:** Chrome, Edge, Firefox, Safari → title → options → mode select → Mars with practice → quiz → result → play again → Moon without practice. Resize the window very small and very wide (no scrollbars). Phone in landscape.

---

## 12. Configuration and tuning
| What | Where |
|---|---|
| Mission length, slider max, thresholds, difficulty | `GAME_CONFIG` in `js/simulation.js` |
| Crew decay rates | `OSDR_DOSIMETRY` in `js/scenarios.js` |
| Mission timelines, solar capacity, archive flares | `NASA_PRESETS` in `js/scenarios.js` |
| DONKI key, timeout, look-back, cache time | `NASA_CONFIG` in `js/scenarios.js` |
| CTI weights and reaction window | `CTI_DEFAULTS` in `js/CtiEvaluator.js` |
| Quiz questions, levels, questions per quiz | `BANK`, `LEVELS`, `questionsPerQuiz` in `js/academy.js` |
| Tutorial steps and texts | `STEPS` in `js/academy.js` |
| Practice storm strength | `startPracticeFlare()` in `js/main.js` (keep it winnable: a test checks this) |
| On-screen positions | `LAYOUT` at the top of `js/main.js` |
| Menu click zones | `MENU_BUTTON_ZONES` in `js/assets.js` |

**Adding a quiz question:** add an object to `BANK` with a unique `id`, `level` (1–3), `place` (`any`, `mars` or `moon`), `q`, 2–4 `options`, the `answer` index, a `hint` and a `fact`. Run `npm test`; it checks the format for you. Add it to the answer key in the manual too.

---

## 13. Troubleshooting
| Symptom | Cause and fix |
|---|---|
| Black screen or missing images locally | You opened `index.html` with `file://`. Use a local server (section 8). |
| GitHub site shows **404** | Pages source isn't **GitHub Actions** (step 5), the workflow hasn't finished, or the URL is missing `/probe-the-base/`. Wait 1–2 minutes after the green tick. |
| GitHub site shows this README instead of the game | Pages is set to "Deploy from a branch". Switch the source to **GitHub Actions** and re-run the workflow. |
| Actions: `npm ci` fails | `package-lock.json` wasn't uploaded. Commit it (it's in the zip). |
| Actions: a **test** step fails | Click the red step and read the failing test name; nothing was published. Fix it, push again. |
| Actions: deploy fails with "permission" / "environment" errors | **Settings → Pages → Source** must be GitHub Actions. If your org restricts Actions, allow them under **Settings → Actions → General**. |
| `git push` rejected ("fetch first") | The repo got a README or license when it was created. Run `git pull origin main --allow-unrelated-histories`, then `git push`. |
| `git push` asks for a password and rejects it | Use browser sign-in or a personal access token (step 4). |
| Workflow never appears | The `.github` folder wasn't uploaded (it's hidden). See the website-upload note in step 4. |
| Chart label always says "offline" | `DEMO_KEY` limit used up (HTTP 429) or no network. Use your own key: `?nasaKey=…`. The game still works. |
| "Failed to load resource 429/503" in console | The browser reporting NASA's answer, not a game error. The game already switched to the archive flare. |
| Tutorial or quiz never appears | Check Settings: **Practice with Probe** and **Space quiz**. The mission quiz needs the flare to be handled (life support ≥ 25 kW, under budget, shields as high as power allows). |
| Want to see the tutorial again | Settings → Practice with Probe → **Every flight**, or toggle it on the mode-select screen. |
| No sound | Tap the boot screen first, check 🔊 and Settings → Sound, check the device isn't muted. |
| Tailwind changes have no effect | Run `npm run build:css`. |

---

## 14. خطوات النشر على GitHub بالعربي

**المطلوب:** حساب على GitHub، وبرنامج Git متسطّب على جهازك.

1. **فك الضغط** عن الملف `probe-the-base-v3-final.zip` وافتح الـ Terminal جوّه فولدر `probe-the-base`.
2. **(اختياري)** شغّل الاختبارات: `npm ci` وبعدين `npm test`، لازم يطلعلك `pass 17`.
3. **(اختياري ومُفضّل)** هات مفتاح مجاني من <https://api.nasa.gov> وحطّه مكان `DEMO_KEY` في ملف `js/scenarios.js`.
4. ادخل على <https://github.com/new> واعمل Repository جديد اسمه `probe-the-base`، خليه **Public**، و**ماتعلّمش** على "Add a README".
5. في الـ Terminal اكتب الأوامر دي واحد ورا التاني (غيّر `YOUR-USERNAME` باسم حسابك):
   ```bash
   git init
   git add .
   git commit -m "PROBE THE BASE v3.0"
   git branch -M main
   git remote add origin https://github.com/YOUR-USERNAME/probe-the-base.git
   git push -u origin main
   ```
   لو طلب باسورد: سجّل دخول من نافذة المتصفح اللي هتفتح، أو استخدم **Personal access token** بدل الباسورد.
6. في الـ Repository افتح **Settings ← Pages**، ومن **Source** اختار **GitHub Actions**.
7. افتح تبويب **Actions** واستنى العلامة الخضرا ✅ (دقيقة أو اتنين). لو ظهر ❌ يبقى في اختبار فشل ومفيش حاجة اتنشرت، دوس عليه واعرف السبب.
8. اللعبة هتبقى على: `https://YOUR-USERNAME.github.io/probe-the-base/`
   والدليل على: `https://YOUR-USERNAME.github.io/probe-the-base/manual/`
9. أي تعديل بعد كده: `git add .` ثم `git commit -m "التعديل"` ثم `git push`، والموقع هيتحدّث لوحده.

**مش عايز تستخدم الـ Terminal؟** في صفحة الـ Repository الفاضي دوس **uploading an existing file** واسحب **كل اللي جوّه** الفولدر. خلي بالك إن فولدر `.github` مخفي، لازم تظهره وترفعه، ومترفعش `node_modules`.

---

## 15. Changelog

### v3.2
- **Added** smooth fades everywhere: every screen change (Boot, Title, Options, Mission select, Mission, Results, Quit) fades out to deep space and the next screen fades in. New `js/transitions.js` holds all of it.
- **Added** title intro: the logo fades in first, then the START / OPTIONS / QUIT buttons.
- **Added** the mission HUD fades in with the cockpit and fades out when the mission ends; the results screen fades in; the pause overlay fades in.
- **Fixed** double-click / ENTER-spam / ESC-during-fade can no longer start a scene twice or skip a screen. Input is switched off during a fade, and a fallback timer guarantees the next screen always starts.
- **Fixed** the BACK button and ESC are ignored while NASA data is loading on the mission-select screen.
- **Tests:** 24 unit tests pass (7 new for transitions) and a headless-Chromium run through Title, Options, Quit, Mission select, Mission, Results, Play again and Menu finished with a clean console.

### v3.1
- **Changed** the PROBE Academy tutorial, quiz, toast, mascot and stars to the new navy / pale blue / mint / purple / coral / mauve palette (CSS variables, WCAG AA contrast).
- **Changed** tutorial fonts: self-hosted Fredoka (titles, buttons, numbers) and Nunito (text), larger titles, better weights; works offline.
- **Fixed** the quiz start timer was not cancelled when the mission ended or the scene closed within 1.5 s of the "Alert handled" toast, so the quiz could pop up over the results screen. `disarm()` now clears it.
- **Tests:** 17 unit tests plus six headless-browser scenarios (first run, returning player, skip, settings, phone landscape offline, late-quiz regression) pass with a clean console.

### v3.0
- **Added** PROBE Academy: 7-step guided tutorial with a frozen mission clock and a winnable practice storm; 3-question space quiz with stars, hints and facts; question bank grown from 18 to 23.
- **Added** Mission Manual (web + 17-page PDF): cadet handbook, storm checklist, teacher guide, lesson plan, worksheet, mission log, quiz answer key.
- **Added** System checks panel, mission phase chip, coach tips, storm slider hints, instant readouts while dragging, rules card on pause, **?** manual button, **H** shortcut.
- **Added** Settings rows for *Practice with Probe* and *Space quiz*; mode-select toggle and manual button; quiz stars on results, in the report and on the Quit screen.
- **Fixed** the quiz trigger and tutorial goal: "all green" is impossible at a big flare's peak, so the check now accepts the best possible shielding.
- **Fixed** GitHub Actions deploy: `npm ci` needs `package-lock.json`, which was missing; it's now included. The workflow also publishes `manual/`.
- **Improved** mode-select layout (welcome banner instead of an opaque box) and settings layout (five rows).
- **Tests:** 9 → 17.

### v2.0
Flare cockpit art, NASA DONKI live data with offline presets, CTI scoring, AI Mission Analyst, Settings scene, CI/CD, security headers.

---

## 16. Credits and license
- Space-weather data: **NASA DONKI**, Community Coordinated Modeling Center (CCMC), via api.nasa.gov
- Crew-health calibration: informed by **NASA OSDR** radiation biology and **NASA-STD-3001** limits
- Libraries: Phaser (MIT), Chart.js (MIT), Tailwind CSS (MIT)
- Fonts: Fredoka and Nunito (SIL Open Font License 1.1, see `assets/fonts/`)
- Art, game, PROBE Academy and Mission Manual: the PROBE THE BASE team
- This project is not endorsed by NASA. Code license: **MIT**.
