# Family Manager

A simple, colourful family app (PWA) with separate tabs for expenses, documents, locations and more.
Works on Android phones and Windows laptops, installs from the browser, and is built to work offline.

## Status
Foundation only: installable PWA shell, install and "new version" pop-ups, large-text theme, and a tab
registry with placeholder Expenses, Documents and Locations tabs. Login, roles and real tab content come next.

## Develop
```
npm install
npm run dev      # local dev server
npm run build    # type-check and production build
npm run lint
```

## Adding a tab
Register a module in `src/tabs/` with `registerTab({...})` (see `src/core/tabs.ts`).
