---
type: Learning
title: .righthand/ runtime footprint holds a nested git repo — exclude it when publishing the source repo
description: When publishing the **source** repo to GitHub, the project's own `./.righthand/` must be gitignored entirely (not committed). It is righthand's runtime footprin
tags: [distribution, git, publishing, security, footprint]
timestamp: "2026-07-24T17:13:39.561Z"
---

# .righthand/ runtime footprint holds a nested git repo — exclude it when publishing the source repo

When publishing the **source** repo to GitHub, the project's own `./.righthand/` must be gitignored entirely (not committed). It is righthand's runtime footprint — config, `history.jsonl`, and critically a **nested `.git`** because every footprint is an isomorphic-git repo ([[rollback-version-store-isomorphic-git-pure-js-over-system-gi]]). Committing it would (a) publish the runtime footprint and (b) embed a nested git repo inside the published tree.

The pre-publish checklist that caught this (turn: pushing to GitHub):
1. Scan committable files for the `sk-` key (or any secret) before `git add`.
2. Confirm `.env` is gitignored.
3. Confirm `./.righthand/`, `./.pi/`, `./.work/` are gitignored.
4. Re-verify the staged set is clean, then re-run the secret scan against the remote after push.

## The live distribution channel (as of this turn)
righthand is now actually published to GitHub and installable via the npm **owner/repo** shorthand:

```bash
npm install -g hoipippeloi/righthand-cli.dev     # npm resolves owner/repo → GitHub
righthand version
```

Two remotes are configured on the source repo:
- `origin` → `creatuluw/righthand.cli` (private)
- `dev` → `hoipippeloi/righthand-cli.dev` (public — the installable one)

## Two known TODOs surfaced by going public
- **Author email exposure**: commits are authored as `creatuluw@gmail.com` (visible on the public repo). Rewrite author + force-push early if that identity shouldn't be public.
- **License is `UNLICENSED`**: publicly-visible source with no license is legally "all rights reserved." Pick MIT/Apache-2.0 soon.

Relates to [[distribution-npm-based-for-cli-and-plugins-version-pinned-op]] (the strategy this executes).
