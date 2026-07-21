#!/bin/bash
set -e

echo ""
echo "  ========================================"
echo "   Prontivo"
echo "  ========================================"
echo ""

# Check Node.js
if ! command -v node &> /dev/null; then
    echo "  [!] Node.js non trovato. Installa da https://nodejs.org"
    exit 1
fi
echo "  Node.js: OK ($(node -v))"

# Check npm
if ! command -v npm &> /dev/null; then
    echo "  [!] npm non trovato. Installa Node.js da https://nodejs.org"
    exit 1
fi

# Installa/aggiorna dipendenze
echo "  Installazione dipendenze..."
npm install --no-audit --no-fund
echo ""

PORT=8080

echo "  Server in avvio sulla porta $PORT..."
echo ""

# Apri browser dopo 3 secondi (se disponibile)
(sleep 3 && (xdg-open "http://localhost:$PORT" 2>/dev/null || open "http://localhost:$PORT" 2>/dev/null || true)) &

node server.js
