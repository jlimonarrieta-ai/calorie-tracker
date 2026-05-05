# Collaboration rules — Claude Code ↔ Codex

This project is built jointly by **Claude Code** and **OpenAI Codex**.
The two assistants have distinct, non-overlapping roles to avoid stepping on each other.

## Roles

### Claude Code — Architect & primary implementer
- Designs architecture and project structure.
- Implements new features end-to-end.
- Performs large refactors.
- Owns stack decisions, dependencies, and config.
- Operates the developer machine: file edits, git, deploys, EAS builds.

### Codex — Reviewer, QA, debugger
- Reviews every feature Claude implements (PR review).
- Hunts for bugs, edge cases, security issues, accessibility problems.
- Suggests optimizations and cleaner patterns.
- Writes and reviews tests.
- Debugs issues when something fails (logs, stack traces, repro).
- **Does not** add new features unsolicited.

## Workflow

1. Claude works on a feature branch (`feat/<name>`).
2. Claude commits and pushes.
3. User opens a PR on GitHub.
4. User asks Codex to review the PR (Codex CLI, ChatGPT web, or Cursor).
5. User relays Codex's findings to Claude.
6. Claude applies fixes, pushes again.
7. Merge once both assistants are satisfied.

## Hard rules

- **One feature per branch.** No bundling unrelated changes.
- **No secrets in code.** Use `.env` (gitignored). The `.env.example` is the contract.
- **Type safety:** strict TS. No `any` unless justified in a comment.
- **Migrations live in `supabase/migrations/`** with timestamp prefixes.
- **No new top-level dependencies without discussing trade-offs first.**
- **Tests:** new features that touch business logic ship with tests.

## Repo conventions

- **Routing:** expo-router file-based. Routes live in `app/`.
- **Styling:** NativeWind classes. Avoid inline `StyleSheet` unless animation needs it.
- **State:** local `useState` first, lift to context only when shared. No Redux unless we hit a real need.
- **Data layer:** all Supabase calls go through hooks in `lib/hooks/`. Components don't call `supabase` directly.
- **Imports:** absolute from project root via `tsconfig` paths (to be set up when project grows).

## Out of scope until v2

Don't build (or accept reviews suggesting we build):
- Apple Health integration
- InBody import
- Photo recognition
- Push notifications / reminders
- Lifestack / iCal export

These are deliberately deferred. Stay focused on the v1 MVP.
