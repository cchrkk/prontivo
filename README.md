<p align="center"><img src="prontivo.svg" width="120" alt="Prontivo"></p>

<h1 align="center">Prontivo</h1>

WebUI per la generazione di preventivi PDF professionali con database SQLite, cronologia versioni e drag & drop immagini.

[![Proudly Vibe Coded - Neon Flame](https://vibecoded.fyi/badges/flat/main/proudly-vibe-coded-neon-flame.svg)](https://vibecoded.fyi/)
## Setup

```bash
npm install
cp .env.example .env   # poi personalizza i dati
node server.js
```

La WebUI si apre su `http://localhost:8080`.

## Variabili d'ambiente (.env)

| Variabile | Descrizione |
|---|---|
| `PORT` | Porta del server (default: 8080) |
| `COMPANY_NAME` | Ragione sociale (es. `Acme S.R.L.`) |
| `COMPANY_PERSON` | Nome del firmatario |
| `COMPANY_LOGO_TEXT` | Testo logo fallback (senza immagine) |
| `DEFAULT_OBJECT` | Oggetto di default per nuovi preventivi |
| `DEFAULT_INTRO` | Testo di introduzione di default |
| `DEFAULT_NOTES` | Note di default (`\n` per andare a capo) |

## Funzionalita

- Generazione PDF via Puppeteer (headless Chromium)
- Database SQLite con CRUD completo
- Cronologia versioni (Edit History) con ripristino
- Drag & drop / clipboard per foto prodotti
- Categorie libere con raggruppamento automatico nel PDF
- Campi: Listino, Sconto, Confezione, Prezzo netto
- Logo personalizzabile (`logo.png` nella root)
- Date picker dinamico
- Compatibilita con record esistenti nel DB

## Stack

- Express.js
- Puppeteer
- SQLite3
- Tailwind CSS (CDN)
