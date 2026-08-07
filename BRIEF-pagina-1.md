# Brief — Consegna 1: Landing + Form di pre-iscrizione + Conferma

> Leggi prima `CLAUDE.md`. Questo brief riguarda solo la prima consegna. Gestionale e cassa veloce sono una fase successiva.

## Obiettivo
Un sito statico su Cloudflare Pages con: (A) una landing pubblica accattivante, (B) il form di pre-iscrizione collegato all'API, (C) la pagina di conferma con QR. Deploy via GitHub → Pages.

## Direzione grafica
- Palette rosa `#F24DAE` + grigio `#646262`, sfondi chiari, tanto respiro.
- Riprendi il motivo "strada grigia che incornicia il cuore rosa" del logo come filo grafico (es. una linea-percorso che attraversa le sezioni).
- Elegante, caldo, mobile-first. Tipografia con un serif espressivo per i titoli + un sans pulito per il testo. Micro-animazioni leggere, niente eccessi.
- Usa il logo vettoriale in `loghi/`.

## A) Landing (one-page a sezioni)
1. **Hero:** logo, "6ª Passeggiata in Rosa", data e luogo, sottotitolo benefico (IOV), bottone **"Pre-iscriviti"** che porta al form.
2. **L'evento:** cos'è (camminata non competitiva aperta a tutti) e la finalità benefica.
3. **Info pratiche:** data, programma orari (8:00 / 8:30 / 9:00), ritrovo con indirizzo, percorso ~8 km + sosta Megliadino San Fidenzio, quota 8 € (gratis fino a 6 anni compiuti). Includi una **mappa** con pin sul ritrovo (Piazza G.B. Graziato, Borgo Veneto) e link "porta all'itinerario".
4. **Come iscriversi:** online (entro 10/09) vs in loco (13/09 8:00–9:00).
5. **Regolamento:** contenuto da `contenuti/REGOLAMENTO.md` (accordion o pagina dedicata).
6. **Sponsor:** sezione predisposta a griglia di loghi per livelli (main / normali / ristoro / associazioni). Per ora placeholder se i loghi non ci sono ancora.
7. **Chi siamo:** placeholder breve (i testi arrivano dopo).
8. **Footer:** social, patrocini/organizzatori, link privacy, firma Heneti.

## B) Form di pre-iscrizione
- **Capofila:** è il partecipante n.1. Campi contatto: **email (obbligatoria)**, telefono (facoltativo).
- **Partecipanti (1..N):** per ciascuno **nome, cognome, data di nascita, sesso** — tutti obbligatori. Bottone "Aggiungi partecipante" / rimuovi.
- **Gruppo (facoltativo):** scelta tra le squadre esistenti come **chip cliccabili** (da `getSquadre`), **oppure** campo "crea nuovo gruppo". NON un menu a tendina.
- **Totale live:** € 8 × paganti; i nati dal 14/09/2019 in poi sono gratis e non contano nel totale. Mostra il totale che aggiorna mentre si compila.
- **Consensi (2 checkbox obbligatorie per inviare):**
  1. Accettazione Regolamento + informativa privacy.
  2. Autorizzazione riprese foto/video e pubblicazione.
- **Invio:** una sola chiamata `creaPrenotazione` (vedi payload in CLAUDE.md). `nome_capofila`/`cognome_capofila` = dati del partecipante n.1. Disabilita il bottone durante l'invio, usa un `request_id` per evitare doppioni.

## C) Pagina di conferma
- Mostra ciò che l'API restituisce (codice, n. partecipanti, totale). **Il codice viene dal server, non generarlo lato client.**
- Genera il **QR** dal `codice` (libreria client, es. qrcode).
- Messaggio: "Presenta questo codice al banco il giorno dell'evento per ritirare il gadget e versare la quota. Il pagamento è di persona."
- Indica che è stata inviata un'email di conferma (se `email_inviata`).

## Regole tecniche (dal CLAUDE.md, qui ribadite perché critiche)
- Chiamate API in `POST` con `Content-Type: text/plain;charset=utf-8`.
- Server = unica verità; nessuna UI ottimistica che diverge; errori mostrati chiaramente con possibilità di ritentare.
- Nessun uso di localStorage/sessionStorage (non necessari qui).

## Deploy
- Crea il repo su GitHub (`gh repo create`), push, e collega a Cloudflare Pages (una tantum). Ad ogni push successivo il deploy è automatico.
- Ricorda: se tocchi l'Apps Script, va ripubblicata una "Nuova versione".

## Fuori scope (fase successiva)
Ricerca prenotazioni, modifica, check-in, cassa veloce col QR, report (più giovane/anziano/gruppo più numeroso), iscrizione veloce al banco. Non costruirli ora.
