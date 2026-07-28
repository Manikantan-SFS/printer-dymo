# DYMO Printer

Standalone React demo for printing a generated label through the local DYMO Connect Desktop web API.

## Prerequisites

- Install DYMO Connect Desktop on the machine running the browser.
- Keep DYMO Connect Desktop running while testing.
- Install and connect a DYMO LabelWriter or compatible DYMO printer.

The app auto-detects the local DYMO service from common DYMO endpoints:

- `https://127.0.0.1:41951`
- `https://localhost:41951`
- `http://127.0.0.1:41951`
- `http://localhost:41951`

If needed, enter a custom DYMO service URL in the app. Chrome may show a local certificate warning the first time you open the HTTPS URL. Accept the local exception, then refresh the React app.

## Run

```bash
npm install
npm run dev
```

Open the Vite URL, select the DYMO printer, and click **Generate label**. The click handler builds label XML and calls:

```js
fetch('https://127.0.0.1:41951/DYMO/DLS/Printing/PrintLabel', {
  method: 'POST',
  body: new URLSearchParams({
    printerName: selectedPrinter,
    labelXml,
    labelSetXml: '',
    printParamsXml: '',
  }),
});
```

## GitHub Pages

This project is configured for:

```text
https://manikantan-sfs.github.io/printer-dymo/
```

In GitHub repository settings, set **Pages -> Build and deployment -> Source** to **GitHub Actions**. The workflow in `.github/workflows/deploy.yml` builds and publishes the Vite `dist` folder on every push to `main`.
