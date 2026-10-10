# Family Manager

A simple, colourful family app (PWA) with separate tabs for expenses, documents, locations and more.
Works on Android phones and Windows laptops, installs from the browser, and is built to work offline.

## Status
Installable PWA shell with sign-in, family set-up and approval. The Expenses tab is built mobile-first
(bottom bar, Day/Week/Month, own categories, receipt photos, budgets, repeating expenses, CSV).
Other tabs are placeholders until Expenses is finished. See `ROADMAP.md.txt`.

## Develop
```
npm install
npm run dev      # local dev server
npm run build    # type-check and production build
npm run lint
```

## Adding a tab
Register a module in `src/tabs/` with `registerTab({...})` (see `src/core/tabs.ts`).
