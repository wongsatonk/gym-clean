# Source

Vendored from https://github.com/nextlevelbuilder/ui-ux-pro-max-skill (MIT), commit `6ae86f6`
(2026-11-10), skill v2.15.0. Tests omitted. Reviewed 2026-11-13: scripts are offline (no network,
no subprocess); files are only written with `--persist`.

In this repo, run the search script by its project path (not `${CLAUDE_PLUGIN_ROOT}`):

    python3 .claude/skills/ui-ux-pro-max/scripts/search.py "<query>" --domain <domain>

Project rules win over its suggestions: Gym Clean is vanilla TS (no Tailwind/framework), and the
page's CSP blocks third-party requests, so any suggested Google Font must be self-hosted.
