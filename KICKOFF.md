# Gym Clean — How to kick off Claude Code

## 1. One-time setup (≈15 min)

1. Install Node.js LTS and Git. Create an empty GitHub repo `gym-clean` and clone it.
2. Copy these starter files into the repo root, keeping the folders:
   ```
   CLAUDE.md
   KICKOFF.md
   docs/SPEC.md
   docs/PROGRESS.md
   .claude/settings.json
   ```
3. In the repo folder, start `claude`, then add the helpers. Commands change over time;
   if one fails, check that project's README for the current one.
   ```
   /plugin marketplace add obra/superpowers-marketplace
   /plugin install superpowers@superpowers-marketplace
   ```
   Then, from your normal terminal:
   ```
   claude mcp add playwright npx @playwright/mcp@latest
   claude mcp add --transport http context7 https://mcp.context7.com/mcp
   ```
   Also install the **frontend-design** skill from Anthropic's official plugin marketplace
   (browse it with `/plugin`).
4. Restart `claude` and run `/mcp` to confirm `playwright` and `context7` are connected.
5. Commit the starter files to `main`.

`.claude/settings.json` lets Claude Code edit files, install packages, run tests and commit
without asking every time. It still has to ask before pushing, and it can't force-push, hard-reset,
`rm -rf`, or open your raw fixture videos.

## 2. First prompt (paste as-is)

```
Read CLAUDE.md, docs/SPEC.md and docs/PROGRESS.md fully. You are building Gym Clean
agentically: you own implementation, I own product decisions and the human checkpoints.

Work through the milestones in order, starting at M0, and keep going on your own until you
reach a 🧍 HUMAN CHECKPOINT or a stop condition from CLAUDE.md. For each milestone:
1. Write the task plan into docs/PROGRESS.md (use the writing-plans skill).
2. Create the milestone branch.
3. Implement test-first; use subagents for independent tasks.
4. Verify: npm run check, npm run e2e, open the app with the Playwright MCP at 390x844,
   screenshot, check the console. Record the evidence in PROGRESS.md.
5. Commit, then merge the branch into main locally and move to the next milestone.

When you stop, give me: what's done, the evidence, exactly what you need from me, and the
URL or command to test it on my phone.
```

## 3. Resuming in a new session

```
Read CLAUDE.md and docs/PROGRESS.md, then continue from "Next step". Same rules as before.
```

## 4. At each human checkpoint

- **A (after M1):** `git push` (or let Claude push when you say so) → GitHub Pages deploys →
  open the URL on your phone at the gym, do a real session, then tell Claude what felt off:
  ```
  Checkpoint A feedback: <what worked, what annoyed you, what you never used>.
  Update the spec if needed, log the decisions, then continue with M2.
  ```
- **B (after M3):** record videos per SPEC §5, drop them in `fixtures/videos/`, then:
  ```
  Fixtures are in fixtures/videos. Run npm run landmarks, commit the landmark JSON,
  and continue with M4.
  ```
- **C (after M5):** gym session with the camera, then report reps it miscounted and cues
  that were annoying or wrong. Claude tunes thresholds against the fixtures.

## 5. Tips

- Review the plan in PROGRESS.md before it starts building each milestone. It's the
  cheapest place to correct course.
- If it loops on a failure, say: "Stop. Use systematic-debugging, write up what you've tried."
- Use `/clear` between milestones to keep context small. PROGRESS.md carries the state.
