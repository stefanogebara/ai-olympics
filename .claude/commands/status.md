# AI Olympics Status

Give a quick status overview of the AI Olympics project.

## Gather

1. Git status: `!git status --short`
2. Current branch: `!git branch --show-current`
3. Recent commits: `!git log --oneline -5`
4. Test count: `!grep -r "it(" src/ --include="*.test.ts" | wc -l`
5. TypeScript errors: `!npx tsc --noEmit 2>&1 | tail -1`

## Report

Summarize the project state concisely: branch, uncommitted changes, recent work, test health.
