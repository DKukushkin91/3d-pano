# Examples

`playground/` is a Vite app with two pages that consume the **built** package through its real `exports`:

- `/` — the framework-agnostic core
- `/react.html` — the React adapter

Run from the repository root with the package rebuilding on change:

```bash
pnpm build:watch
pnpm dev
```

`doc-snippets/` is not an app: `pnpm check:docs` copies every TypeScript example from `README.md` and `docs/` into it and type-checks them against the built package. Values a host would provide (`container`, `tour`, `viewer` and so on) are declared once in `doc-snippets/globals.d.ts`.

The playground uses local panoramas that are not part of the repository. Put two 2:1 equirectangular images into `playground/public/local/` (ignored by git):

- `balcony.jpg`
- `hotel-room.png`

Without them the pages show a hint instead of the tour.
