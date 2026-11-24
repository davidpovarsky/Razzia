evidence="work/ci-e2e/tadazz-show"
mapfile -t files < "$evidence/selectors.txt"
pnpm test:e2e --config="playwright.tadazz-show.config.ts" "${files[@]}" --reporter=list,json,github
