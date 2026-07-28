import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AlertCircle, Printer, RefreshCw, Send } from 'lucide-react';
import './styles.css';

const SERVICE_URL_STORAGE_KEY = 'dymo-printer-service-url';
const DEFAULT_SERVICE_CANDIDATES = [
  'https://127.0.0.1:41951',
  'https://localhost:41951',
  'http://127.0.0.1:41951',
  'http://localhost:41951',
];

function escapeXml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function createAddressLabelXml(text) {
  return `<?xml version="1.0" encoding="utf-8"?>
<DieCutLabel Version="8.0" Units="twips">
  <PaperOrientation>Landscape</PaperOrientation>
  <Id>Address</Id>
  <PaperName>30252 Address</PaperName>
  <DrawCommands>
    <RoundRectangle X="0" Y="0" Width="1581" Height="5040" Rx="270" Ry="270" />
  </DrawCommands>
  <ObjectInfo>
    <AddressObject>
      <Name>Address</Name>
      <ForeColor Alpha="255" Red="0" Green="0" Blue="0" />
      <BackColor Alpha="0" Red="255" Green="255" Blue="255" />
      <LinkedObjectName />
      <Rotation>Rotation0</Rotation>
      <IsMirrored>False</IsMirrored>
      <IsVariable>True</IsVariable>
      <HorizontalAlignment>Left</HorizontalAlignment>
      <VerticalAlignment>Middle</VerticalAlignment>
      <TextFitMode>ShrinkToFit</TextFitMode>
      <UseFullFontHeight>True</UseFullFontHeight>
      <Verticalized>False</Verticalized>
      <StyledText>
        <Element>
          <String>${escapeXml(text)}</String>
          <Attributes>
            <Font Family="Arial" Size="12" Bold="False" Italic="False" Underline="False" Strikeout="False" />
            <ForeColor Alpha="255" Red="0" Green="0" Blue="0" />
          </Attributes>
        </Element>
      </StyledText>
      <ShowBarcodeFor9DigitZipOnly>False</ShowBarcodeFor9DigitZipOnly>
      <BarcodePosition>AboveAddress</BarcodePosition>
      <LineFonts>
        <Font Family="Arial" Size="12" Bold="False" Italic="False" Underline="False" Strikeout="False" />
        <Font Family="Arial" Size="12" Bold="False" Italic="False" Underline="False" Strikeout="False" />
        <Font Family="Arial" Size="12" Bold="False" Italic="False" Underline="False" Strikeout="False" />
      </LineFonts>
    </AddressObject>
    <Bounds X="332" Y="150" Width="4455" Height="1260" />
  </ObjectInfo>
</DieCutLabel>`;
}

function normalizeServiceUrl(value) {
  return value.trim().replace(/\/+$/, '');
}

async function checkService(serviceUrl) {
  const statusResponse = await fetch(`${serviceUrl}/dcd/api/check-api-status`);
  return statusResponse.ok && (await statusResponse.text()) === 'true';
}

function App() {
  const [printers, setPrinters] = useState([]);
  const [selectedPrinter, setSelectedPrinter] = useState('');
  const [environment, setEnvironment] = useState(null);
  const [serviceUrl, setServiceUrl] = useState(
    () => localStorage.getItem(SERVICE_URL_STORAGE_KEY) || 'Auto detect',
  );
  const [labelText, setLabelText] = useState(`Sample ID: SAMP-0001
Lot: LOT-2026-001
Collected: 2026-07-28
Status: Generated`);
  const [status, setStatus] = useState('Loading DYMO SDK...');
  const [error, setError] = useState('');
  const [isPrinting, setIsPrinting] = useState(false);

  const selectedPrinterInfo = useMemo(
    () => printers.find((printer) => printer.name === selectedPrinter),
    [printers, selectedPrinter],
  );

  async function resolveServiceUrl() {
    const customUrl = serviceUrl === 'Auto detect' ? '' : normalizeServiceUrl(serviceUrl);
    const candidates = [
      customUrl,
      localStorage.getItem(SERVICE_URL_STORAGE_KEY),
      ...DEFAULT_SERVICE_CANDIDATES,
    ]
      .filter(Boolean)
      .map(normalizeServiceUrl);
    const uniqueCandidates = [...new Set(candidates)];

    for (const candidate of uniqueCandidates) {
      try {
        if (await checkService(candidate)) {
          localStorage.setItem(SERVICE_URL_STORAGE_KEY, candidate);
          setServiceUrl(candidate);
          return candidate;
        }
      } catch {
        // Try the next candidate.
      }
    }

    throw new Error(`DYMO Connect local API was not found. Tried: ${uniqueCandidates.join(', ')}`);
  }

  async function refreshPrinters() {
    setError('');
    setStatus('Searching for DYMO printers...');

    try {
      const activeServiceUrl = await resolveServiceUrl();

      setEnvironment({
        isBrowserSupported: true,
        isFrameworkInstalled: true,
        isWebServicePresent: true,
      });

      const printersResponse = await fetch(`${activeServiceUrl}/dcd/api/get-printers`);
      if (!printersResponse.ok) {
        throw new Error(`DYMO printer lookup failed with HTTP ${printersResponse.status}.`);
      }

      const printersPayload = await printersResponse.json();
      if (!printersPayload.status) {
        throw new Error(printersPayload.error || 'DYMO printer lookup failed.');
      }

      const dymoPrinters = printersPayload.responseValue.map((printer) => ({
        ...printer,
        name: printer.name || printer.printerName || printer.PrinterName || printer.Name,
        modelName: printer.modelName || printer.printerType || printer.PrinterType,
      }));

      setPrinters(dymoPrinters);
      setSelectedPrinter((current) => current || dymoPrinters[0]?.name || '');
      setStatus(dymoPrinters.length ? 'Printer list ready.' : 'No DYMO printers found.');
    } catch (caughtError) {
      setError(caughtError.message || String(caughtError));
      setStatus('Unable to load printers.');
    }
  }

  async function generateAndPrintLabel() {
    if (!selectedPrinter) {
      setError('Select a DYMO printer before printing.');
      return;
    }

    setIsPrinting(true);
    setError('');
    setStatus('Generating label and sending to printer...');

    try {
      const activeServiceUrl = await resolveServiceUrl();
      const response = await fetch(`${activeServiceUrl}/DYMO/DLS/Printing/PrintLabel`, {
        method: 'POST',
        mode: 'cors',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
        },
        body: new URLSearchParams({
          printerName: selectedPrinter,
          labelXml: createAddressLabelXml(labelText),
          labelSetXml: '',
          printParamsXml: '',
        }),
      });

      if (!response.ok) {
        throw new Error(`DYMO print request failed with HTTP ${response.status}.`);
      }

      setStatus(`Print job sent to ${selectedPrinter}.`);
    } catch (caughtError) {
      setError(caughtError.message || String(caughtError));
      setStatus('Print failed.');
    } finally {
      setIsPrinting(false);
    }
  }

  useEffect(() => {
    let cancelled = false;

    refreshPrinters()
      .then(() => {
        if (cancelled) {
          return;
        }
      })
      .catch((caughtError) => {
        if (cancelled) {
          return;
        }

        setError(caughtError.message || String(caughtError));
        setStatus('DYMO SDK unavailable.');
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="app-shell">
      <section className="workspace">
        <div className="heading-block">
          <p className="eyebrow">DYMO Connect Framework</p>
          <h1>Sampling label printer</h1>
          <p className="subtle">
            Generate a label and send it directly to the selected DYMO LabelWriter printer.
          </p>
        </div>

        <div className="tool-grid">
          <section className="panel">
            <div className="panel-heading">
              <Printer aria-hidden="true" size={20} />
              <h2>Printer</h2>
            </div>

            <label className="field">
              <span>DYMO service URL</span>
              <input
                value={serviceUrl}
                onChange={(event) => setServiceUrl(event.target.value)}
                onBlur={(event) => {
                  const nextUrl = event.target.value.trim();
                  if (nextUrl && nextUrl !== 'Auto detect') {
                    localStorage.setItem(SERVICE_URL_STORAGE_KEY, normalizeServiceUrl(nextUrl));
                  }
                }}
                placeholder="Auto detect"
              />
            </label>

            <label className="field">
              <span>Installed DYMO printer</span>
              <select
                value={selectedPrinter}
                onChange={(event) => setSelectedPrinter(event.target.value)}
                disabled={!printers.length}
              >
                {!printers.length && <option value="">No printers detected</option>}
                {printers.map((printer) => (
                  <option key={printer.name} value={printer.name}>
                    {printer.name}
                  </option>
                ))}
              </select>
            </label>

            {selectedPrinterInfo && (
              <dl className="printer-detail">
                <div>
                  <dt>Model</dt>
                  <dd>{selectedPrinterInfo.modelName || 'Unknown'}</dd>
                </div>
                <div>
                  <dt>Connected</dt>
                  <dd>{String(selectedPrinterInfo.isConnected ?? 'Unknown')}</dd>
                </div>
                <div>
                  <dt>Local</dt>
                  <dd>{String(selectedPrinterInfo.isLocal ?? 'Unknown')}</dd>
                </div>
              </dl>
            )}

            <button className="secondary-button" type="button" onClick={() => refreshPrinters()}>
              <RefreshCw aria-hidden="true" size={18} />
              Refresh printers
            </button>
          </section>

          <section className="panel">
            <div className="panel-heading">
              <Send aria-hidden="true" size={20} />
              <h2>Label</h2>
            </div>

            <label className="field">
              <span>Label text</span>
              <textarea value={labelText} onChange={(event) => setLabelText(event.target.value)} rows={6} />
            </label>

            <button
              className="primary-button"
              type="button"
              onClick={generateAndPrintLabel}
              disabled={isPrinting || !environment?.isWebServicePresent || !selectedPrinter}
            >
              <Printer aria-hidden="true" size={18} />
              {isPrinting ? 'Printing...' : 'Generate label'}
            </button>
          </section>
        </div>

        <section className="preview-panel">
          <div className="panel-heading">
            <Printer aria-hidden="true" size={20} />
            <h2>Preview</h2>
          </div>

          <div className="label-preview-wrap">
            <div className="label-preview" aria-label="Generated label preview">
              {labelText.split('\n').map((line, index) => (
                <p key={`${line}-${index}`}>{line || '\u00a0'}</p>
              ))}
            </div>
          </div>
        </section>

        <section className="status-panel" aria-live="polite">
          {error ? <AlertCircle aria-hidden="true" size={19} /> : <Printer aria-hidden="true" size={19} />}
          <div>
            <strong>{status}</strong>
            {error && <p>{error}</p>}
            {environment && (
              <dl className="diagnostics">
                <div>
                  <dt>Browser supported</dt>
                  <dd>{String(environment.isBrowserSupported)}</dd>
                </div>
                <div>
                  <dt>DYMO API ready</dt>
                  <dd>{String(environment.isFrameworkInstalled)}</dd>
                </div>
                <div>
                  <dt>Web service present</dt>
                  <dd>{String(environment.isWebServicePresent)}</dd>
                </div>
              </dl>
            )}
          </div>
        </section>
      </section>
    </main>
  );
}

createRoot(document.getElementById('root')).render(<App />);
