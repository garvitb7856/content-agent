# Content Agent System

## Overview
A multi-agent content team system (5 AI Agents: Ideator, Hook & Script, Planner, Analyst, DM Manager) reporting to a web dashboard and Telegram bot.

## Architecture
- `scripts/`: Data fetching (Apify Instagram Scraper) and agent intelligence logic.
- `dashboard/`: Web application displaying real content metrics & agent activity.
- `.env`: Environment variables and API credentials.

## Workflow Rules
- One step at a time with user verification.
- Tokens kept securely in `.env`.
- Iterative enhancements to code files.
