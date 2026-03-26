# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a static HTML mockup of a LinkedIn feed page (`linkedin_post.html`) — a single self-contained file with no build system, no dependencies, and no framework. Open it directly in a browser.

## Architecture

Everything lives in one file: `linkedin_post.html`. It contains:
- All CSS in a `<style>` block in `<head>`
- The full page layout: top nav, left sidebar (profile card), center feed, right sidebar
- No JavaScript

**Layout system:** CSS Grid with `grid-template-columns: 225px 1fr 300px` for the three-column layout.

## Key Design Decisions

- **Profile banner** (`profile-card-banner`): Uses `background-size: 160% auto; background-position: 40% top` on `Zoom in pic.png` to crop to sky/ocean only and hide the circular avatar artifact at the bottom of the source image.
- **VibeCoderz.ai logo** (`.mechanize-logo`): Animated rainbow gradient via `@keyframes tacky-gradient`. The class name is `mechanize-logo` for historical reasons — it is the VibeCoderz.ai promoted post logo.
- **Nav badges** (`.nav-badge`): Absolutely positioned on `.nav-item` (which has `position: relative`). Messaging shows `1`, Notifications shows `4`.
- **AI-generated face avatars**: `person1.jpg`, `person2.jpg`, `person3.jpg` are locally saved images from thispersondoesnotexist.com (StyleGAN2) — fictional faces, not real people.

## Assets

| File | Purpose |
|------|---------|
| `NICHOLAS+BEAUDOIN0449.webp` | Profile photo used in avatar and composer |
| `zoom-in-pic.png` | Banner background (688×768px LinkedIn profile screenshot) |
| `Wiggins.png` | Meme image shown in the VibeCoderz.ai promoted post |
| `person1/2/3.jpg` | AI-generated fictional faces for "People you may know" |

## MCP Server

A Playwright MCP server lives at `./playwright-mcp/` and is configured via `.mcp.json` at the project root. It runs on `node ./playwright-mcp/dist/index.js`. If `node_modules` is missing, run `npm install` inside `playwright-mcp/` first.

Use it via Playwright MCP tools to navigate, screenshot, scrape, or interact with pages in headless Chromium. Useful for visual QA of the HTML file or scraping reference pages.

To regenerate the README screenshot after HTML changes:
```
npx playwright screenshot "file:///path/to/linkedin_post.html" "images/screenshot.png" --wait-for-timeout 2000
```
