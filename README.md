# 🌊 OceanGram — Instagram OSINT Tool

An ocean-themed GitHub Pages UI for Instagram OSINT reconnaissance, inspired by [Osintgram](https://github.com/Datalux/Osintgram).

## 🌐 Live Demo

GitHub Pages is enabled for this repository.

Use **Settings → Pages** with **Branch: `main`** and **Folder: `/ (root)`**, then visit:

```
https://potemkin666.github.io/instagram-downloader-/
```

## ✨ Features

- **Ocean-themed UI** — deep-sea gradient, animated bubbles, shimmering particle canvas, and SVG waves
- **20 OSINT command cards** — organised by category (Profile, Social, Content, Engagement, Contact)
- **Interactive terminal panel** — click any card to see simulated command output with typewriter animation
- **Filterable command grid** — filter by category tabs
- **Quick-start code block** — copy the Osintgram install commands in one click
- **Fully responsive** — works on mobile and desktop
- **Zero dependencies** — pure HTML/CSS/JS, no frameworks required

## 🧰 OSINT Commands Showcased

| Category   | Commands |
|------------|----------|
| Profile    | `info`, `propic` |
| Social     | `followers`, `followings`, `tagged`, `wtagged`, `wcommented` |
| Content    | `photos`, `stories`, `captions`, `photodes`, `mediatype`, `hashtags` |
| Engagement | `likes`, `comments` |
| Contact    | `addrs`, `fwersemail`, `fwingsemail`, `fwersnumber`, `fwingsnumber` |

## ⚡ Quick Start (Osintgram backend)

```bash
git clone https://github.com/Datalux/Osintgram.git && cd Osintgram
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
make setup
python3 main.py <target_username>
```

## ⚠️ Disclaimer

For **educational purposes only**. The authors assume no responsibility for misuse.
Only public Instagram profiles can be analysed.
