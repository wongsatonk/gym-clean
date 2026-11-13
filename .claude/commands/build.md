---
description: Run the Gym Clean agent team on the current milestone and keep going until a human checkpoint or a stop condition.
argument-hint: "[optional: milestone to work on, e.g. M4]"
---

You are the **orchestrator** for Gym Clean. Subagents can't start other subagents, so you
coordinate them all from this session. Target milestone: $ARGUMENTS (if empty, use the
current milestone in docs/PROGRESS.md).

## 0. Orient
Read `CLAUDE.md`, `docs/SPEC.md`, `docs/PROGRESS.md`. Run `git status` and `git branch`.
- If PROGRESS says **Waiting on human: yes**, stop and print exactly what's needed from Wongsaton.
- If the working tree has uncommitted work from an earlier session, review it against the plan
  (dispatch **reviewer**), then commit it in logical chunks before starting new tasks.
- Make sure you're on the milestone branch (`m<N>-<slug>`); create it from `main` if needed.

## 1. Plan
If the milestone has no task plan in PROGRESS.md (or the plan doesn't match the SPEC), dispatch
**planner**. Read the plan it wrote. If it lists open product questions that block the
milestone, stop and ask Wongsaton.

## 2. Build loop — repeat until every task is ticked
1. Pick the unblocked tasks (dependencies done).
2. Tasks tagged `[main]` (shared types, `src/ui/app.ts` routing, configs, package.json): do them
   yourself first, since others may depend on them.
3. Dispatch the remaining tasks to their owners — **independent tasks in parallel** (several
   Agent calls in one message), dependent ones in order. Give each subagent: the task text and
   its "Done when", the files it owns, relevant Decisions, and what earlier tasks produced. Tell
   it not to commit.
4. When they report back: integrate anything they asked for (wiring, shared types), then run
   `npm run check`.
5. Dispatch **reviewer** on the diff. Send BLOCKING findings back to the owning agent; repeat
   until PASS.
6. Commit the task (`git add` the task's files only, clear message, one task per commit), tick it
   in PROGRESS.md, and update Status / Decisions / Next step.
7. A failure that survives **3 different fix attempts** → stop, write what was tried under
   "Blockers / questions for Wongsaton", set Waiting on human: yes, and report.

## 3. Verify the milestone
Dispatch **verifier**. On FAIL, send each failure to its owner, fix, re-review, re-verify (the
3-attempt rule applies). On PASS, paste its evidence into PROGRESS.md → Verification evidence
and commit.

## 4. Finish the milestone
- Merge the branch into `main` locally (`git switch main && git merge --no-ff <branch>`).
- Ask Wongsaton before `git push` (CLAUDE.md rule). After pushing, check the CI run and the live
  Pages URL.
- If the SPEC milestone ends at a 🧍 checkpoint: set Waiting on human: yes, write precisely what
  to do (e.g. the fixture recording guide in SPEC §5), stop and report.
- Otherwise suggest `/clear` and `/build` to start the next milestone with a fresh context, or
  continue directly if context is still small.

## Report to Wongsaton (short)
Done (tasks, commits), evidence (test counts, screenshots), what's next, and anything you need
from him — with the phone URL to try.
