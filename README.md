# Sponsor readiness kit

A static page that builds a sponsor's readiness kit from their answers to the Sponsor Experience Survey (https://slyguy7.github.io/sponsor-survey/).

The sponsor's answers arrive as short option codes after the `#` in the address, for example `https://slyguy7.github.io/sponsor-kit/#kit=1_4-0_5-0123450...`. Browsers never send that part to a server, and the codes contain no names, emails or free text. The page decodes them, builds the kit in the browser and sends nothing anywhere. Without a valid link the page explains that and links back to the survey.

The kit shows:

- **Priority actions** as numbered steps. Each step has tick boxes, a To do / In progress / Done status, and the header shows overall progress. Ticks are saved only in that browser (localStorage, one set per kit link) and are never sent anywhere.
- **Key dates** still ahead, each with a countdown, and an **Add to calendar** button that downloads them as an `.ics` file.
- **Who to contact**, and reference material for the next project (the items the sponsor picked come first and open).
- **Copy link** (the link holds no names or emails) and **Print or save as PDF**, which opens every section first; the printout carries the date and the link to reopen the kit.

It uses the survey's fonts (self-hosted in `assets/fonts/`) and colours, follows the system's light or dark mode, and works down to a 320px-wide phone.

## Files

- `index.html`, `assets/kit.css`, `assets/kit.js`: the page.
- `404.html`: shown by GitHub Pages for any address that does not exist.
- `assets/engine.js`: the rules and the link decoder. Based on `assets/readiness.js` in the survey repository, without its renderer.
- `assets/survey.json`, `assets/readiness.json`: **exact copies** of the same files in the survey repository.
- `check-sync.js`: compares those two copies with the live survey site.
- `serve.js`: a small local server for trying the page and for the tests.

## Keeping in step with the survey

A kit link stores the position of each chosen option, not its text. If the survey's questions or options change and the copies here do not, links from the survey are read wrong without any error message.

When the survey changes:

1. Copy `assets/survey.json` and `assets/readiness.json` from the survey repository into `assets/` here, unchanged.
2. If the survey's `assets/readiness.js` changed its `build`, `encode` or `decode` functions, make the same change in `assets/engine.js`.
3. Run `npm run check:sync` (should print `ok` twice) and `npm test`.

The **survey-sync** job in GitHub Actions runs the same check on every push and every Monday, and turns red when the copies are out of date.

## Run it locally

```
npm install
npm run serve
```

Then open `http://127.0.0.1:4173/` with a `#kit=` link from the survey on the end.

## Run the tests

```
npm install
npx playwright install chromium
npm test
```

## Publish

Repository settings > Pages > deploy from the `main` branch, root folder. The address is `https://slyguy7.github.io/sponsor-kit/`. Check that the Tests workflow is green before sharing a new version.
