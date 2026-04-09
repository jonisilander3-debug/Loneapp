# Löneappen

Webbapplikation för lönehantering, projektuppföljning och dataregistrering.

## Funktioner

- **Inloggning** med användarnamn och lösenord
- **Anställdaregistrering** (admin) – namn, smeknamn, IBAN, e-post
- **Projekthantering** – skapa projekt och tilldela anställda
- **Datainmatning** – klistra in tab-separerad chatt- och affiliatedata direkt i ett kalkylbladsliknande gränssnitt
- **Löneöversikt** – automatiskt beräknad lön med manuella justeringar
- **Veckolåsning** – lås en vecka för att förhindra ändringar
- **CSV-export** – exportera löneöversikt för valfri vecka

## Krav

- Node.js 18+
- npm

## Installation

```bash
cd loneapp
npm install
```

## Starta

```bash
node server.js
```

Appen startar på **http://localhost:3000**

## Standardanvändare

Alla har lösenordet `changeme`:

| Användarnamn | Roll   |
|-------------|--------|
| joni        | admin  |
| daniel      | admin  |
| peter       | admin  |
| martin      | reader |
| per         | reader |
| kim         | reader |
| jaatak      | reader |
| dino        | reader |

## Teknikstack

- **Backend:** Node.js + Express
- **Databas:** SQLite (better-sqlite3)
- **Autentisering:** bcrypt + express-session
- **Frontend:** Ren HTML/CSS/JS (inget ramverk)
