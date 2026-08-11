# CLAUDE.md — Passeggiata in Rosa

Contesto e regole di progetto. **Leggi tutto questo file prima di scrivere codice.**

## Cos'è
Sito della **6ª Passeggiata in Rosa**, camminata benefica non competitiva (ricavato allo IOV di Padova per la ricerca sul tumore al seno). Tre parti:
1. **Sito pubblico** — landing con info, percorso, regolamento, sponsor, privacy.
2. **Pre-iscrizione** — form pubblico + pagina di conferma con QR.
3. **Gestionale + cassa veloce** — area interna dietro autenticazione (fase successiva, non ora).

Realizzazione a cura di **Heneti** (heneti.it).

## Stack (NON cambiarlo)
- **Frontend:** HTML/CSS/JS statico, deploy su **Cloudflare Pages** (collegato al repo GitHub `damyzogia/…`, deploy automatico ad ogni push).
- **Backend:** **Google Apps Script** Web App (già attivo). NON riscrivere il backend in altro; è la nostra API verso il foglio.
- **Database:** **Google Sheets** (database vivo).
- Dominio: **passeggiatainrosa.it** (DNS su Cloudflare).

## API (Apps Script)
- Endpoint: `https://script.google.com/macros/s/AKfycbzxtzaSxcJweIyyUX5i1MyU0hc0X3chlmxlWbgi4iJV1cTBHnSTnD6jdfEu__waES8/exec`
- **Come chiamarla dal frontend:** `fetch(URL, { method:'POST', headers:{'Content-Type':'text/plain;charset=utf-8'}, body: JSON.stringify({action, ...}) })`. Il `text/plain` evita il preflight CORS; Apps Script risponde JSON leggibile cross-origin. NON usare `application/json` (scatena il preflight che Apps Script non gestisce).
- Risposte: `{ ok:true, ... }` oppure `{ ok:false, error:'...' }`.
- Azioni pubbliche disponibili: `creaPrenotazione`, `getSquadre`. (Ricerca/checkin/report saranno in un progetto separato dietro login Google.)

### Payload `creaPrenotazione`
```json
{
  "action": "creaPrenotazione",
  "nome_capofila": "…", "cognome_capofila": "…",
  "email": "…", "telefono": "…(opz)",
  "squadra": "…(opz)",
  "consenso": true,
  "partecipanti": [
    { "nome":"…", "cognome":"…", "data_nascita":"YYYY-MM-DD", "sesso":"F|M|Altro" }
  ]
}
```
Risposta: `{ ok:true, codice:"PR-XXXX", n_partecipanti:N, totale_dovuto:€, email_inviata:bool }`.
Il capofila è il partecipante n.1. Il `codice` restituito è il contenuto del QR.

## REGOLE ANTI-ERRORE (imparate da progetti precedenti — rispettarle sempre)
1. **Il server è l'unica verità.** Dopo ogni scrittura, mostra all'utente ciò che l'API ha restituito, non la tua ipotesi locale. Niente stato "ottimistico" che diverge: se una chiamata fallisce, dillo e torna indietro esplicitamente. (In passato "spunte che tornavano indietro" nascevano proprio da UI ottimistica non riconciliata.)
2. **Scritture atomiche, mai per-campo.** Una prenotazione = **una** chiamata sola con tutto il payload. Niente autosave a debounce che genera chiamate sovrapposte.
3. **Idempotenza.** Genera lato client un `request_id` e non ripetere l'invio se è già in corso: doppio click / singhiozzo di rete NON deve creare doppioni. Disabilita il bottone durante l'invio.
4. **Letture fresche.** Su eventuali GET, aggiungi un parametro cache-buster (`&_=${Date.now()}`) per non leggere risposte in cache.
5. **Deploy:** ricorda all'utente che ogni modifica al codice Apps Script richiede una **"Nuova versione"** della distribuzione, altrimenti serve la versione vecchia.

## Modello dati (Google Sheets — 3 tabelle + Config)
- **Squadre:** `nome_squadra | referente | note` — lista canonica per i chip di scelta gruppo.
- **Prenotazioni:** `codice | timestamp | nome_capofila | cognome_capofila | email | telefono | squadra | n_partecipanti | totale_dovuto | totale_pagato | stato | consenso_privacy | timestamp_checkin | note`
- **Partecipanti:** `id | codice_prenotazione | nome | cognome | data_nascita | sesso | squadra | capofila | stato | timestamp_checkin`
- **Config:** coppie chiave/valore (quota, nome_evento, ecc.).

Relazione: una **Squadra** raccoglie più **Prenotazioni**; una **Prenotazione** contiene più **Partecipanti**.

## Form — due velocità (una sola logica)
- **Pre-iscrizione online (questa fase):** per **ogni** partecipante sono **obbligatori** nome, cognome, data di nascita, sesso. **Facoltativo solo il gruppo.** Del capofila serve anche l'**email** (per la conferma), telefono facoltativo.
- **Iscrizione veloce al banco (fase gestionale, dopo):** versione magra — nome di riferimento + gruppo + numero paganti + eventuale "di cui bambini gratis". Data di nascita solo quando serve. Il sistema salva i dati presenti e lascia vuoto il resto.

### Da fare nella fase form (NON ora)
- **Controllo email duplicata.** Se l'email inserita ha già una prenotazione, non creare un doppione: avvisare l'utente e offrirgli di **modificare quella esistente**. Richiede due cose che oggi non ci sono: un **endpoint di ricerca per email** lato Apps Script e un **flusso di modifica** lato frontend (recupero prenotazione → modifica partecipanti → salvataggio atomico). Vale anche qui la regola 3: il controllo non sostituisce il `request_id`, lo affianca.

## Quota
€ **8,00** a partecipante. **Gratis i bambini fino a 6 anni compiuti** = nati **dal 14/09/2019 in poi**. Totale = (partecipanti paganti) × 8. Chi non ha data di nascita è considerato pagante.

## Dati evento (fatti — usare questi)
- **Nome:** 6ª Passeggiata in Rosa
- **Data:** domenica 13 settembre 2026
- **Ritrovo:** Piazzale della Chiesa di Santa Margherita d'Adige — Piazza Giovanni Battista Graziato / Via Roma 15, Borgo Veneto (PD)
- **Programma:** 8:00 apertura iscrizioni e consegna gadget · 8:30 riscaldamento (Greta Nicoletti PT) · 9:00 partenza
- **Percorso:** ~8 km per le vie di Borgo Veneto, sosta ristoro a Megliadino San Fidenzio
- **Finalità:** ricavato interamente devoluto allo IOV – Istituto Oncologico Veneto di Padova (ricerca tumore al seno)
- **Premi:** partecipante più anziano, più giovane, gruppo più numeroso
- **Iscrizione online:** entro le 24:00 del 10 settembre 2026 · **In loco:** 13/09 dalle 8:00 alle 9:00
- **Organizzatori:** Parrocchia di Santa Margherita d'Adige · NOI Associazione San Biagio APS
- **Patrocini:** IOV Padova · Comune di Borgo Veneto · Provincia di Padova

## Brand
- **Colori:** rosa `#ed6ea7` · grigio `#706f6f`. Sono i valori presi dal logo vettoriale, che è la fonte autorevole.
  - Il rosa del brand su bianco dà 2,8:1 di contrasto: è **solo decorativo**. Per testo, link e bottoni pieni si usa `#bf2268` (5,8:1, AA) e `#a51d5a` per gli hover. Tutti i valori vivono in `assets/css/base.css`.
- **Motivo:** nel logo "la strada grigia incornicia il cuore rosa" — riproporlo come elemento grafico (percorso/strada grigia che accompagna il rosa).
- **Logo:** `loghi/logo-passeggiata-rosa.pdf` (vettoriale).
- **Tono:** caldo, femminile ma non stucchevole, pulito, mobile-first.

## Contatti / social (footer)
- Email: info@passeggiatainrosa.it · passeggiatainrosa@gmail.com
- Facebook: https://www.facebook.com/passeggiatainrosa/ · Instagram: @passeggiata.in.rosa
- Firma: "Sito e automazioni a cura di Heneti — heneti.it"

## Struttura cartella
```
loghi/       logo passeggiata + patrocini (IOV, Comune, Provincia)
sponsor/     main/  normali/  ristoro/  associazioni/   (loghi sponsor)
foto/        foto edizioni passate
contenuti/   REGOLAMENTO.md, PRIVACY.md, testi chi-siamo
config.txt   dominio, URL API, colori, username GitHub
```
