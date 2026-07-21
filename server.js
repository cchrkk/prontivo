require('dotenv').config();
const express = require('express');
const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();

const app = express();
app.use(express.json({ limit: '50mb' }));

// Inizializzazione Database SQLite locale
const DB_PATH = path.join(__dirname, 'preventivi.db');
const db = new sqlite3.Database(DB_PATH, (err) => {
    if (err) console.error("Errore apertura DB:", err.message);
    else console.log("Database SQLite connesso con successo.");
});

// Creazione tabelle se non esistono
db.serialize(() => {
    // Tabella principale dei preventivi (l'ultimo stato salvato)
    db.run(`CREATE TABLE IF NOT EXISTS preventivi (
        id TEXT PRIMARY KEY,
        oggetto TEXT,
        data_doc TEXT,
        payload TEXT,
        ultimo_aggiornamento DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Tabella cronologia per la Edit History
    db.run(`CREATE TABLE IF NOT EXISTS cronologia (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        preventivo_id TEXT,
        oggetto TEXT,
        payload TEXT,
        data_salvataggio DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// API: Ottieni la lista di tutti i preventivi salvati (per il selettore)
app.get('/api/preventivi', (req, res) => {
    db.all(`SELECT id, oggetto, data_doc, ultimo_aggiornamento FROM preventivi ORDER BY ultimo_aggiornamento DESC`, [], (err, rows) => {
        if (err) return res.status(500).json({ errore: err.message });
        res.json(rows);
    });
});

// API: Ottieni un preventivo specifico tramite ID (ultimo stato)
app.get('/api/preventivi/:id', (req, res) => {
    db.get(`SELECT payload FROM preventivi WHERE id = ?`, [req.params.id], (err, row) => {
        if (err) return res.status(500).json({ errore: err.message });
        if (!row) return res.status(404).json({ errore: "Preventivo non trovato" });
        res.json(JSON.parse(row.payload));
    });
});

// API: Ottieni la cronologia delle modifiche di un preventivo
app.get('/api/preventivi/:id/history', (req, res) => {
    db.all(`SELECT id, oggetto, data_salvataggio FROM cronologia WHERE preventivo_id = ? ORDER BY data_salvataggio DESC`, [req.params.id], (err, rows) => {
        if (err) return res.status(500).json({ errore: err.message });
        res.json(rows);
    });
});

// API: Carica una versione specifica dalla cronologia
app.get('/api/history/:historyId', (req, res) => {
    db.get(`SELECT payload FROM cronologia WHERE id = ?`, [req.params.historyId], (err, row) => {
        if (err) return res.status(500).json({ errore: err.message });
        if (!row) return res.status(404).json({ errore: "Versione storica non trovata" });
        res.json(JSON.parse(row.payload));
    });
});

// API: Salva o Aggiorna un preventivo e aggiungi un punto alla Edit History
app.post('/api/preventivi/salva', (req, res) => {
    const dati = req.body;
    // Generiamo un ID univoco basato sull'oggetto normalizzato se non presente
    const id = dati.id || dati.oggetto.trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '') || 'preventivo_generico';
    dati.id = id; // Assicuriamoci che l'ID sia nel payload

    const payloadString = JSON.stringify(dati);

    db.serialize(() => {
        // 1. Inserisci o aggiorna la tabella principale
        db.run(`INSERT INTO preventivi (id, oggetto, data_doc, payload, ultimo_aggiornamento) 
                VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(id) DO UPDATE SET 
                    oggetto=excluded.oggetto, 
                    data_doc=excluded.data_doc, 
                    payload=excluded.payload, 
                    ultimo_aggiornamento=CURRENT_TIMESTAMP`, 
            [id, dati.oggetto, dati.data, payloadString], 
            function(err) {
                if (err) return res.status(500).json({ errore: err.message });
                
                // 2. Inserisci un record nella cronologia (Edit History)
                db.run(`INSERT INTO cronologia (preventivo_id, oggetto, payload) VALUES (?, ?, ?)`,
                    [id, dati.oggetto, payloadString],
                    function(err2) {
                        if (err2) return res.status(500).json({ errore: err2.message });
                        res.json({ messaggio: "Salvato nel DB e archiviato nella cronologia!", id: id });
                    }
                );
            }
        );
    });
});

// API: Elimina un intero preventivo dalla DB + cronologia
app.delete('/api/preventivi/:id', (req, res) => {
    db.serialize(() => {
        db.run(`DELETE FROM cronologia WHERE preventivo_id = ?`, [req.params.id], function(err) {
            if (err) return res.status(500).json({ errore: err.message });
            db.run(`DELETE FROM preventivi WHERE id = ?`, [req.params.id], function(err2) {
                if (err2) return res.status(500).json({ errore: err2.message });
                res.json({ messaggio: "Preventivo eliminato." });
            });
        });
    });
});

// API: Elimina una singola versione dalla cronologia
app.delete('/api/history/:historyId', (req, res) => {
    db.run(`DELETE FROM cronologia WHERE id = ?`, [req.params.historyId], function(err) {
        if (err) return res.status(500).json({ errore: err.message });
        res.json({ messaggio: "Versione eliminata." });
    });
});

// Logo UI
app.get('/api/logo-ui', (req, res) => {
    const logoPath = path.join(__dirname, 'logo.png');
    if (fs.existsSync(logoPath)) {
        const logoBuffer = fs.readFileSync(logoPath);
        const logoBase64 = `data:image/png;base64,${logoBuffer.toString('base64')}`;
        return res.json({ logo: logoBase64 });
    }
    res.status(404).json({ logo: null });
});

// API: Configurazione default (dati da .env, mai esposti al client-side direttamente)
app.get('/api/config', (req, res) => {
    res.json({
        company_name: process.env.COMPANY_NAME || '',
        company_person: process.env.COMPANY_PERSON || '',
        company_logo_text: process.env.COMPANY_LOGO_TEXT || 'company',
        default_object: process.env.DEFAULT_OBJECT || '',
        default_intro: process.env.DEFAULT_INTRO || '',
        default_notes: (process.env.DEFAULT_NOTES || '').split('\\n'),
    });
});

// PDF Generation endpoint
app.post('/api/preventivo', async (req, res) => {
    let browser;
    try {
        const dati = req.body;
        let logoBase64 = null;
        const logoPath = path.join(__dirname, 'logo.png');
        if (fs.existsSync(logoPath)) {
            const logoBuffer = fs.readFileSync(logoPath);
            logoBase64 = `data:image/png;base64,${logoBuffer.toString('base64')}`;
        }

        if (!Array.isArray(dati.note)) {
            dati.note = typeof dati.note === 'string' ? dati.note.split('\n').filter(n => n.trim()) : [];
        }
        if (!Array.isArray(dati.articoli)) {
            dati.articoli = [];
        }
        const htmlContent = generaHtmlDinamico(dati, logoBase64);
        browser = await puppeteer.launch({ headless: true, args: ['--allow-file-access-from-files'] });
        const page = await browser.newPage();
        await page.setContent(htmlContent, { waitUntil: 'networkidle0' });

        await page.evaluate(async () => {
            const selectors = Array.from(document.querySelectorAll('img'));
            await Promise.all(selectors.map(img => {
                if (img.complete) return;
                return new Promise((resolve) => {
                    img.addEventListener('load', resolve);
                    img.addEventListener('error', resolve);
                });
            }));
        });

        const pdfBuffer = await page.pdf({
            format: 'A4', margin: { top: '15mm', right: '15mm', bottom: '15mm', left: '15mm' }, printBackground: true
        });
        await browser.close();
        res.setHeader('Content-Type', 'application/pdf');
        res.send(pdfBuffer);
    } catch (error) {
        console.error("Errore PDF:", error.message);
        if (browser) await browser.close();
        res.status(500).send("Errore durante la generazione del PDF");
    }
});

function generaHtmlDinamico(dati, logoBase64) {
    let headerLogoHtml = `<div class="logo-text">${process.env.COMPANY_LOGO_TEXT || 'company'}</div>`;
    if (logoBase64) headerLogoHtml = `<img src="${logoBase64}" class="logo-img" alt="Logo">`;
    const formattaTesto = (t) => t ? t.replace(/\n/g, '<br>') : '';

    const coloriSezioni = ['#1e3a60', '#5c4033', '#2e5436', '#4a2863', '#1a5450', '#8b4513', '#2c3e50'];

    // Raggruppa articoli per tipo (categoria libera), mantenendo l'ordine di inserimento
    const categorieOrdine = [];
    const mappaCategorie = {};
    dati.articoli.forEach(a => {
        const cat = (a.tipo || '').trim();
        const catLower = cat.toLowerCase();
        if (!catLower) return;
        if (!mappaCategorie[catLower]) {
            mappaCategorie[catLower] = { titolo: cat, articoli: [] };
            categorieOrdine.push(catLower);
        }
        mappaCategorie[catLower].articoli.push(a);
    });

    // Articoli senza categoria vanno in "Altro"
    const senzaCategoria = dati.articoli.filter(a => !(a.tipo || '').trim());
    if (senzaCategoria.length > 0) {
        mappaCategorie['altro'] = { titolo: 'Altro', articoli: senzaCategoria };
        categorieOrdine.push('altro');
    }

    let htmlSezioni = '';
    let coloreIndex = 0;
    categorieOrdine.forEach(catKey => {
        const sezione = mappaCategorie[catKey];
        const colore = coloriSezioni[coloreIndex % coloriSezioni.length];
        coloreIndex++;
        const haConfezione = sezione.articoli.some(a => a.confezione);

        if (haConfezione) {
            // Tabella con colonna confezione
            htmlSezioni += `
        <div class="section-card">
            <div class="section-header" style="background-color: ${colore};">${sezione.titolo}</div>
            <table class="product-table">
                <thead>
                    <tr class="product-row-h">
                        <th class="product-cell" style="width: 15%; text-align: center;">Foto</th>
                        <th class="product-cell" style="width: 35%;">Prodotto</th>
                        <th class="product-cell" style="width: 15%; text-align: right;">Confezione</th>
                        <th class="product-cell cell-price" style="width: 12%;">Listino</th>
                        <th class="product-cell cell-discount" style="width: 10%;">Sconto</th>
                        <th class="product-cell cell-final" style="width: 13%;">Prezzo</th>
                    </tr>
                </thead>
                <tbody>
                    ${sezione.articoli.map(a => `
                    <tr class="product-row-b">
                        <td class="product-cell text-center" style="text-align: center; padding: 12px 8px;">
                            ${a.foto ? `<img src="${a.foto}" class="product-img" />` : `<span style="color:#ccc; font-size:8pt;">No foto</span>`}
                        </td>
                        <td class="product-cell">
                            <div class="config-title">${formattaTesto(a.titolo)}</div>
                            <div class="config-desc">${formattaTesto(a.descrizione)}</div>
                        </td>
                        <td class="product-cell" style="text-align: right; color: #555;">${a.confezione || '-'}</td>
                        <td class="product-cell cell-price"><span class="old-price">${a.listino ? '€ ' + a.listino : ''}</span></td>
                        <td class="product-cell cell-discount">${a.sconto ? `<span class="badge-discount">${a.sconto}</span>` : ''}</td>
                        <td class="product-cell cell-final">€ ${a.scontato}</td>
                    </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>`;
        } else {
            // Tabella classica senza confezione
            htmlSezioni += `
        <div class="section-card">
            <div class="section-header" style="background-color: ${colore};">${sezione.titolo}</div>
            <table class="product-table">
                <thead>
                    <tr class="product-row-h">
                        <th class="product-cell" style="width: 18%; text-align: center;">Foto</th>
                        <th class="product-cell" style="width: 42%;">Configurazione</th>
                        <th class="product-cell cell-price" style="width: 14%;">Listino</th>
                        <th class="product-cell cell-discount" style="width: 12%;">Sconto</th>
                        <th class="product-cell cell-final" style="width: 14%;">Prezzo</th>
                    </tr>
                </thead>
                <tbody>
                    ${sezione.articoli.map(a => `
                    <tr class="product-row-b">
                        <td class="product-cell text-center" style="text-align: center; padding: 12px 8px;">
                            ${a.foto ? `<img src="${a.foto}" class="product-img" />` : `<span style="color:#ccc; font-size:8pt;">No foto</span>`}
                        </td>
                        <td class="product-cell">
                            <div class="config-title">${formattaTesto(a.titolo)}</div>
                            <div class="config-desc">${formattaTesto(a.descrizione)}</div>
                        </td>
                        <td class="product-cell cell-price"><span class="old-price">${a.listino ? '€ ' + a.listino : ''}</span></td>
                        <td class="product-cell cell-discount">${a.sconto ? `<span class="badge-discount">${a.sconto}</span>` : ''}</td>
                        <td class="product-cell cell-final">€ ${a.scontato}</td>
                    </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>`;
        }
    });

    return `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <meta name="author" content="${dati.firma_azienda || ''}">
        <meta name="keywords" content="preventivo, quotazione, ${dati.oggetto || ''}">
        <title>${dati.oggetto || 'Preventivo'}</title>
        <style>
            @page { size: A4; margin: 15mm 15mm; @bottom-right { content: "Pagina " counter(page) " di " counter(pages); font-family: Arial, sans-serif; font-size: 8pt; color: #888; } }
            body { font-family: Arial, sans-serif; color: #333; margin: 0; line-height: 1.5; font-size: 10pt; }
            .header-table { width: 100%; display: table; margin-bottom: 15px; border-bottom: 2px solid #f0f0f0; padding-bottom: 15px; }
            .header-row { display: table-row; }
            .header-logo { display: table-cell; vertical-align: middle; width: 60%; }
            .logo-text { font-size: 26pt; font-weight: 300; color: #222; letter-spacing: -1px; }
            .logo-text bold { font-weight: 800; color: #cc181e; }
            .logo-img { max-height: 120px; max-width: 320px; object-fit: contain; display: block; }
            .header-meta { display: table-cell; vertical-align: middle; text-align: right; width: 40%; font-size: 9.5pt; color: #555; }
            .meta-label { font-weight: bold; color: #222; }
            .titolo-oggetto { font-size: 13pt; font-weight: bold; color: #1e3a60; margin: 20px 0 10px 0; line-height: 1.3; border-left: 4px solid #cc181e; padding-left: 8px; }
            .intro-text { margin-bottom: 20px; font-size: 10.5pt; }
            .section-card { border: 1px solid #e3e8ee; border-radius: 6px; margin-bottom: 20px; overflow: hidden; }
            .section-header { color: white; padding: 10px 15px; font-size: 11pt; font-weight: bold; }
            .product-table { width: 100%; border-collapse: collapse; }
            .product-row-h { background-color: #f7f9fa; font-weight: bold; font-size: 8.5pt; color: #666; border-bottom: 1px solid #e3e8ee; text-transform: uppercase; }
            .product-row-b { border-bottom: 1px solid #f0f2f5; page-break-inside: avoid; }
            .product-cell { padding: 10px; vertical-align: middle; text-align: left; }
            .text-center { text-align: center; }
            .product-img { max-width: 90px; max-height: 90px; object-fit: contain; border-radius: 4px; display: inline-block; }
            .cell-price { text-align: right; }
            .cell-discount { text-align: center; }
            .cell-final { text-align: right; font-weight: bold; color: #2e7d32; }
            .old-price { text-decoration: line-through; color: #a0a0a0; }
            .badge-discount { background-color: #ffebee; color: #c62828; padding: 2px 6px; border-radius: 4px; font-weight: bold; font-size: 9pt; }
            .config-title { font-weight: bold; font-size: 10.5pt; color: #222; }
            .config-desc { font-size: 9pt; color: #666; margin-top: 2px; }
            .notes-card { background-color: #f8f9fa; border-left: 4px solid #cc181e; padding: 15px; margin-bottom: 20px; border-radius: 0 6px 6px 0; page-break-inside: avoid; }
            .notes-title { font-weight: bold; color: #222; margin-bottom: 8px; text-transform: uppercase; }
            .notes-list { margin: 0; padding-left: 20px; }
            .notes-list li { margin-bottom: 5px; color: #444; }
            .closing-section { margin-top: 20px; page-break-inside: avoid; }
            .signature-block { margin-top: 20px; font-size: 10.5pt; }
            .signature-name { font-weight: bold; color: #222; }
            .company-name { color: #666; font-style: italic; }
        </style>
    </head>
    <body>
        <div class="header-table">
            <div class="header-row">
                <div class="header-logo">${headerLogoHtml}</div>
                <div class="header-meta">
                    <div><span class="meta-label">Data:</span> ${dati.data}</div>
                </div>
            </div>
        </div>
        <div class="titolo-oggetto">Oggetto: ${dati.oggetto}</div>
        <div class="intro-text">Buongiorno,<br>${dati.testo_intro}</div>
        ${htmlSezioni}
        <div class="notes-card">
            <div class="notes-title">Note e Condizioni di Vendita</div>
            <ul class="notes-list">
                ${dati.note.map(n => `<li>${n}</li>`).join('')}
            </ul>
        </div>
        <div class="closing-section">
            Restiamo a disposizione per eventuali necessità o domande.
            <div class="signature-block">
                Cordiali saluti,<br>
                <span class="signature-name">${dati.firma_nome}</span><br>
                <span class="company-name">${dati.firma_azienda}</span>
            </div>
        </div>
        <div style="position:absolute; left:0; top:0; font-size:0.5pt; color:transparent; opacity:0; pointer-events:none;">
PREVENTIVO_JSON_START
${JSON.stringify(dati)}
PREVENTIVO_JSON_END
        </div>
    </body>
    </html>
    `;
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`WebUI attiva su http://localhost:${PORT}`));