# Sponsor readiness kit

A static page that builds a sponsor's readiness kit. It is opened from the "Open my readiness kit" button at the end of the Sponsor Experience Survey (https://slyguy7.github.io/sponsor-survey/).

The sponsor's answers arrive as short option codes after the `#` in the address, for example `https://slyguy7.github.io/sponsor-kit/#kit=1_4-0_5-0123450...`. Browsers never send that part to a server, and the codes contain no names, emails or free text. The page decodes them, builds the kit in the browser and sends nothing anywhere. Without a valid link the page explains that and links back to the survey.

## Files

- `index.html`, `assets/kit.css`, `assets/kit.js`: the page.
- `assets/engine.js`: the rules and the link decoder. A copy of `assets/readiness.js` in the survey repository, without its old renderer.
- `assets/survey.json`, `assets/readiness.json`: **copies** from the survey repository. When the survey's options or the kit content change there, copy these three files across (`readiness.js` becomes `engine.js`, minus the rendering part) or the link will decode differently.

## Run the tests

```
npm install
npx playwright install chromium
npm test
```

## Publish

Repository settings > Pages > deploy from the `main` branch, root folder. The address is `https://slyguy7.github.io/sponsor-kit/`.
