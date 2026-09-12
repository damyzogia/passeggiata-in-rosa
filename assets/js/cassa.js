/* =========================================================================
   cassa.js — banco del giorno evento: entrare, cercare, registrare.

   La ricerca legge; il bottone Registra e' l'unica cosa che scrive. In
   mezzo c'e' la lista viva: si tolgono e si aggiungono persone e si sceglie
   la tariffa di ognuna, e a ogni tocco il totale dovuto si rifa'.

   Quella lista pero' resta una proposta, non un fatto: finche' non si preme
   Registra nel foglio non cambia niente. Il totale che ricalcola e' un
   suggerimento per l'operatore, e infatti smette di comandare il campo
   Incassato appena qualcuno lo scrive a mano.

   Due regole che qui contano piu' che altrove:

   - il server e' l'unica verita'. La scheda mostra i campi che ha risposto
     l'API, mai un valore ricostruito a mano. Se la chiamata fallisce non
     resta in pagina una scheda vecchia che sembra ancora buona.
   - il token vive in sessionStorage, non in localStorage: chiusa la
     finestra la sessione e' finita. Su un PC di banco, condiviso e lasciato
     acceso, una sessione che sopravvive e' un problema, non una comodita'.

   La scadenza salvata accanto al token serve solo a evitare una chiamata
   inutile: a dire se un token vale davvero e' sempre e solo il server, con
   NON_AUTORIZZATO.
   ========================================================================= */

(function () {
  'use strict';

  var moduloAccesso = document.getElementById('modulo-accesso');
  if (!moduloAccesso) return;

  var CHIAVE_TOKEN = 'cassa_token';
  var CHIAVE_SCADENZA = 'cassa_scadenza';
  var CHIAVE_QUOTA = 'cassa_quota';

  var accesso = document.getElementById('accesso');
  var pin = document.getElementById('pin');
  var entra = document.getElementById('entra');
  var accessoAvviso = document.getElementById('accesso-avviso');
  var accessoAvvisoTesto = document.getElementById('accesso-avviso-testo');

  var ricerca = document.getElementById('ricerca');
  var moduloRicerca = document.getElementById('modulo-ricerca');
  var codice = document.getElementById('codice');
  var cerca = document.getElementById('cerca');
  var ricercaAvviso = document.getElementById('ricerca-avviso');
  var ricercaAvvisoTesto = document.getElementById('ricerca-avviso-testo');
  var scheda = document.getElementById('scheda');
  var esci = document.getElementById('esci');

  var inCorso = false;

  /* ------------------------------------------------------------ sessione */

  function leggiToken() {
    try {
      return sessionStorage.getItem(CHIAVE_TOKEN) || '';
    } catch (e) {
      /* Navigazione privata o cookie bloccati: si lavora comunque, solo
         senza ricordare nulla oltre il ricaricamento della pagina. */
      return '';
    }
  }

  function salvaSessione(token, scadenza) {
    try {
      sessionStorage.setItem(CHIAVE_TOKEN, token);
      if (scadenza) sessionStorage.setItem(CHIAVE_SCADENZA, String(scadenza));
    } catch (e) { /* vedi sopra: non e' un motivo per fermarsi */ }
  }

  function dimenticaSessione() {
    try {
      sessionStorage.removeItem(CHIAVE_TOKEN);
      sessionStorage.removeItem(CHIAVE_SCADENZA);
      sessionStorage.removeItem(CHIAVE_QUOTA);
    } catch (e) { /* niente da rimuovere */ }
  }

  /* La quota la manda il backend dentro la prenotazione, ma una iscrizione
     nuova al banco una prenotazione non ce l'ha. Quindi ce la si ricorda
     dall'ultima ricerca (e dal login, se un giorno la mandera' anche li').

     Se non e' mai arrivata, il suggerimento resta vuoto e l'importo lo
     scrive l'operatore: continuiamo a non inventare un numero. */
  function ricordaQuota(v) {
    var n = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.'));
    if (isNaN(n) || n <= 0) return;
    try { sessionStorage.setItem(CHIAVE_QUOTA, String(n)); } catch (e) { /* pazienza */ }
  }

  function quotaRicordata() {
    var grezza;
    try { grezza = sessionStorage.getItem(CHIAVE_QUOTA); } catch (e) { return null; }
    if (!grezza) return null;
    var n = parseFloat(grezza);
    return isNaN(n) ? null : n;
  }

  /* Vera solo quando la scadenza e' nota E gia' passata: se non sappiamo
     quando scade, non ce lo inventiamo e lasciamo rispondere il server. */
  function scaduta() {
    var grezza;
    try {
      grezza = sessionStorage.getItem(CHIAVE_SCADENZA);
    } catch (e) {
      return false;
    }
    if (!grezza) return false;
    var t = /^\d+$/.test(grezza) ? Number(grezza) : Date.parse(grezza);
    if (!t || isNaN(t)) return false;
    /* Una scadenza in secondi diventa millisecondi: sotto il 2001 in ms
       siamo certi che non fosse una data. */
    if (t < 1e11) t = t * 1000;
    return t <= Date.now();
  }

  /* ------------------------------------------------------- schermate */

  function mostraAccesso(messaggio) {
    dimenticaSessione();
    /* Fuori dalla sessione non c'e' niente da tenere caldo. */
    spegniRiscaldamento();
    /* Uscendo dalla ricerca la fotocamera non resta accesa: una anteprima
       viva sotto un'altra schermata e' solo una spia accesa in tasca. */
    fermaScanner();
    ricerca.hidden = true;
    /* Anche il modulo di nuova iscrizione sparisce: alla schermata del PIN
       non deve restare a schermo un nome gia' battuto da qualcun altro. */
    if (sezioneNuova) sezioneNuova.hidden = true;
    if (sezioneRiepilogo) sezioneRiepilogo.hidden = true;
    /* Anche i conteggi della giornata se ne vanno con la sessione: erano il
       riepilogo di chi era entrato prima. */
    if (riepCorpo) riepCorpo.textContent = '';
    esci.hidden = true;
    scheda.hidden = true;
    scheda.textContent = '';
    ricercaAvviso.hidden = true;
    if (scannerAvviso) scannerAvviso.hidden = true;
    codice.value = '';
    /* Anche il nome cercato da chi c’era prima: alla schermata del PIN non
       deve restare a schermo l’elenco di qualcun altro. */
    svuotaRisultatiNome();
    accesso.hidden = false;
    pin.value = '';

    if (messaggio) {
      accessoAvvisoTesto.textContent = messaggio;
      accessoAvviso.hidden = false;
    } else {
      accessoAvviso.hidden = true;
    }
    pin.focus();
  }

  function mostraRicerca() {
    accesso.hidden = true;
    /* Lo scanner si scalda adesso: al momento del tocco resta da accendere
       solo la fotocamera. Un CDN irraggiungibile qui non disturba nessuno. */
    caricaLibreria().catch(function () { /* si ritenta al tocco */ });
    accessoAvviso.hidden = true;
    if (sezioneNuova) sezioneNuova.hidden = true;
    if (sezioneRiepilogo) sezioneRiepilogo.hidden = true;
    ricerca.hidden = false;
    esci.hidden = false;
    codice.focus();
  }

  function occupato(bottone, si, testoAttesa, testoNormale) {
    inCorso = si;
    bottone.disabled = si;
    if (si) {
      bottone.textContent = '';
      var rotella = document.createElement('span');
      rotella.className = 'filatoio';
      rotella.setAttribute('aria-hidden', 'true');
      bottone.appendChild(rotella);
      bottone.appendChild(document.createTextNode(' ' + testoAttesa));
    } else {
      bottone.textContent = testoNormale;
    }
  }

  /* Un errore di rete non tocca la sessione: il token e' ancora buono, e' la
     linea che manca. Solo NON_AUTORIZZATO riporta all'accesso. */
  function messaggioDiRete(e) {
    if (e.codice === 'RETE') return 'Connessione assente, riprova.';
    if (e.codice === 'TIMEOUT') return 'Il server non risponde, riprova.';
    return e.messaggio || 'Si è verificato un problema, riprova.';
  }

  /* ------------------------------------------------------------ accesso */

  moduloAccesso.addEventListener('submit', function (ev) {
    ev.preventDefault();
    if (inCorso) return;

    var valore = pin.value.trim();
    if (!valore) { pin.focus(); return; }

    accessoAvviso.hidden = true;
    occupato(entra, true, 'Entro…', 'Entra');

    API.chiama('gestLogin', { pin: valore })
      .then(function (r) {
        if (!r.token) {
          /* ok:true senza token non e' una sessione: non fingiamo che lo sia. */
          throw { codice: 'RISPOSTA_INATTESA', messaggio: null };
        }
        salvaSessione(r.token, r.scadenza || r.scade_il || r.expires || '');
        /* Se un giorno il login mandera' anche la quota, la si prende da
           subito: cosi' la nuova iscrizione funziona senza dover prima
           cercare una prenotazione qualsiasi. */
        ricordaQuota(r.quota);
        pin.value = '';
        mostraRicerca();
        /* Il server si sveglia adesso, mentre l’operatore guarda la
           schermata di ricerca: cosi' la prima persona della coda non paga
           l'attesa del risveglio di Apps Script. */
        accendiRiscaldamento();
      })
      .catch(function (e) {
        var testo;
        if (e.codice === 'PIN_ERRATO') {
          testo = e.messaggio || 'PIN errato. Riprova.';
        } else if (e.codice === 'PIN_NON_CONFIGURATO') {
          testo = e.messaggio || 'Nessun PIN impostato sul foglio. Avvisa chi gestisce il gestionale.';
        } else if (e.codice === 'TROPPI_TENTATIVI') {
          testo = e.messaggio || 'Troppi tentativi. Aspetta qualche minuto e riprova.';
        } else {
          testo = messaggioDiRete(e);
        }
        accessoAvvisoTesto.textContent = testo;
        accessoAvviso.hidden = false;
        pin.value = '';
        pin.focus();
      })
      .finally(function () {
        occupato(entra, false, 'Entro…', 'Entra');
      });
  });

  /* ------------------------------------------------------------ ricerca */

  /* Il campo tiene solo la parte dopo "PR-", che sta stampata accanto. Se
     qualcuno incolla il codice intero, o lo detta col prefisso, il doppione
     si toglie qui. Il taglio scatta solo quando resta abbastanza testo,
     altrimenti un codice che comincia davvero per PR verrebbe mutilato. */
  function codiceDalCampo() {
    var g = codice.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (g.length > 4 && g.slice(0, 2) === 'PR') g = g.slice(2);
    return g ? 'PR-' + g : '';
  }

  function scriviCodiceNelCampo(cod) {
    codice.value = testo(cod).toUpperCase().replace(/^PR-?/, '');
  }

  /* Il codice arriva da tre strade — battuto a mano, letto dal QR, scelto
     fra i risultati per nome — ma la chiamata e la scheda restano una sola.
     Reinventarne una seconda vorrebbe dire avere due check-in diversi che
     col tempo divergono. */
  function cercaCodice(cod) {
    if (inCorso) return;
    if (!cod) { codice.focus(); return; }

    var token = leggiToken();
    if (!token || scaduta()) {
      mostraAccesso('Sessione scaduta, rifai l’accesso.');
      return;
    }

    /* La scheda di prima sparisce PRIMA della chiamata: se la ricerca va
       male, non deve restare a schermo un risultato che non c'entra piu'
       col codice appena cercato. */
    ricercaAvviso.hidden = true;
    scheda.hidden = true;
    scheda.textContent = '';
    occupato(cerca, true, 'Cerco…', 'Cerca');

    API.chiama('gestCerca', { token: token, codice: cod })
      .then(function (r) {
        if (r.trovata === false) {
          avvisaRicerca('Nessuna prenotazione con questo codice: ' + cod);
          codice.select();
          return;
        }
        /* Ogni ricerca e' anche l'occasione di imparare la quota in corso,
           che al form di nuova iscrizione serve e li' non arriverebbe. */
        if (r.prenotazione) ricordaQuota(r.prenotazione.quota);

        /* Alla scheda va la risposta INTERA, non il solo sotto-oggetto
           prenotazione: nel contratto reale l'elenco e' una chiave sorella,
           non un campo interno. */
        disegnaScheda(r);
      })
      .catch(function (e) {
        if (e.codice === 'NON_AUTORIZZATO') {
          mostraAccesso('Sessione scaduta, rifai l’accesso.');
          return;
        }
        avvisaRicerca(messaggioDiRete(e));
        codice.focus();
      })
      .finally(function () {
        occupato(cerca, false, 'Cerco…', 'Cerca');
      });
  }

  moduloRicerca.addEventListener('submit', function (ev) {
    ev.preventDefault();
    cercaCodice(codiceDalCampo());
  });

  /* Si riparte da capo: via la scheda, via i risultati per nome, e la
     schermata torna in cima dove c'e' il bottone del QR, che e' quasi sempre
     il gesto successivo. Il tasto "indietro" del browser qui non c'entra
     niente: tutto si muove con i bottoni della pagina. */
  function nuovaRicerca() {
    scheda.hidden = true;
    scheda.textContent = '';
    ricercaAvviso.hidden = true;
    /* Via anche l’avviso della fotocamera: e' la conseguenza di un tocco
       andato male, non uno stato della pagina. Lasciandolo, su un PC del
       banco senza webcam basterebbe un tocco per sbaglio e resterebbe li'
       per tutta la mattina come un errore fisso. */
    if (scannerAvviso) scannerAvviso.hidden = true;
    codice.value = '';
    svuotaRisultatiNome();
    if (apriScannerBtn) apriScannerBtn.scrollIntoView({ block: 'start' });
    /* Il fuoco sul campo solo dove c'e' una tastiera vera: da telefono la
       tastiera virtuale coprirebbe proprio il bottone appena portato in
       cima. */
    if (window.matchMedia && window.matchMedia('(pointer: fine)').matches) {
      codice.focus();
    }
  }

  function avvisaRicerca(testo) {
    ricercaAvvisoTesto.textContent = testo;
    ricercaAvviso.hidden = false;
  }

  esci.addEventListener('click', function () {
    mostraAccesso();
  });

  /* ------------------------------------------------------- formattazione */

  function testo(v) {
    return v === null || v === undefined || v === '' ? '' : String(v).trim();
  }

  /* Da "AAAA-MM-GG" (o da una data ISO completa, come le rende il foglio)
     a "gg/mm/aaaa". Se non e' riconoscibile si stampa com'e': meglio un
     valore grezzo che una data inventata. */
  function dataIt(v) {
    var s = testo(v);
    if (!s) return '';
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
    if (m) return m[3] + '/' + m[2] + '/' + m[1];
    var d = new Date(s);
    if (!isNaN(d.getTime())) {
      return ('0' + d.getDate()).slice(-2) + '/' +
             ('0' + (d.getMonth() + 1)).slice(-2) + '/' + d.getFullYear();
    }
    return s;
  }

  function dataOraIt(v) {
    var s = testo(v);
    if (!s) return '';
    var d = new Date(s);
    if (isNaN(d.getTime())) return s;
    return dataIt(s) + ' alle ' +
      ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);
  }

  function euro(v) {
    var n = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.'));
    if (isNaN(n)) return testo(v) || '—';
    return n.toFixed(2).replace('.', ',') + ' €';
  }

  function vero(v) {
    return v === true || v === 'SI' || v === 'SÌ' || v === 'si' || v === 'sì' || v === 1;
  }

  /* ------------------------------------------------------------- scheda */

  function el(tag, classe, contenuto) {
    var n = document.createElement(tag);
    if (classe) n.className = classe;
    /* Sempre textContent: i dati vengono da un foglio compilato a mano e
       non devono poter diventare markup. */
    if (contenuto !== undefined) n.textContent = contenuto;
    return n;
  }

  /* dt e dd vanno avvolti insieme: nella griglia devono valere una cella
     sola, o il valore finisce sotto l'etichetta della colonna accanto. */
  function voceDato(etichetta, valore) {
    var v = el('div', 'scheda-p__voce');
    v.appendChild(el('dt', null, etichetta));
    v.appendChild(el('dd', null, valore || '—'));
    return v;
  }

  /* ==================================================================== */
  /* SCHEDA                                                               */
  /* ==================================================================== */

  /* Quota unitaria: la manda il backend dentro la prenotazione, letta dalla
     Config. Si usa quella e basta.

     Nessun ripiego a 8 e nessuna deduzione da totale_dovuto/paganti: erano
     due modi diversi di inventare un numero. Se la quota cambiasse in Config
     e qui restasse l'8 scritto a mano, il banco incasserebbe la cifra
     sbagliata senza che niente lo segnali. Se il campo non arriva il totale
     viene zero: sbagliato, ma visibilmente sbagliato. */
  function quotaUnitaria(p) {
    var q = typeof p.quota === 'number'
      ? p.quota
      : parseFloat(String(p.quota).replace(',', '.'));
    if (!isNaN(q)) return q;

    /* Ripiego su quella imparata al login: e' la stessa quota della stessa
       Config, non un numero di comodo. Se manca pure quella si resta a zero,
       che si vede. */
    var q2 = quotaRicordata();
    return q2 === null ? 0 : q2;
  }

  /* Importo pronto per essere riscritto a mano: due decimali e la virgola,
     come lo batte chi sta in cassa. */
  function importoCampo(v) {
    var n = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.'));
    if (isNaN(n)) return '';
    return n.toFixed(2).replace('.', ',');
  }

  /* Il campo accetta sia la virgola sia il punto. Vuoto non e' un errore:
     per l'incassato vuol dire "tieni il suggerito", per un ridotto vale 0. */
  function leggiImporto(grezzo) {
    var t = String(grezzo || '').trim();
    if (!t) return { vuoto: true };
    var n = parseFloat(t.replace(/\s/g, '').replace(',', '.'));
    if (isNaN(n) || n < 0) return { errore: true };
    return { valore: n };
  }

  /* gestCerca incapsula la prenotazione in un sotto-oggetto; per gestCheckin
     i campi sono documentati al primo livello. Si guardano tutti e due
     invece di indovinare, ma senza inventare: se il campo non c'e' da
     nessuna parte resta undefined e a video finisce un trattino. */
  function campoRisposta(r, nome) {
    if (r && r[nome] !== undefined) return r[nome];
    if (r && r.prenotazione && r.prenotazione[nome] !== undefined) return r.prenotazione[nome];
    return undefined;
  }

  /* ---------------------------------------------------- modello vivo */

  var contatoreRighe = 0;

  function rigaDaPartecipante(q) {
    return {
      id: ++contatoreRighe,
      aggiunto: false,
      /* pagante:"NO" vuol dire gratis per eta': per noi e' un bambino, e i
         bambini non hanno tariffa da scegliere. */
      bambino: String(q.pagante).toUpperCase() === 'NO',
      nome: testo(q.nome),
      cognome: testo(q.cognome),
      data_nascita: testo(q.data_nascita),
      sesso: testo(q.sesso),
      tariffa: 'intero',
      importoRidotto: '',
      escluso: false
    };
  }

  function rigaNuova(bambino) {
    return {
      id: ++contatoreRighe,
      aggiunto: true,
      bambino: !!bambino,
      nome: '',
      cognome: '',
      data_nascita: '',
      sesso: '',
      tariffa: 'intero',
      importoRidotto: '',
      escluso: false
    };
  }

  /* Somma di cio' che risulta dovuto adesso, riga per riga. Escluso, gratis
     e bambino valgono zero; ridotto vale quello che c'e' scritto. */
  function totaleSuggerito(ctx) {
    var somma = 0;
    ctx.righe.forEach(function (riga) {
      if (riga.escluso || riga.bambino) return;
      if (riga.tariffa === 'gratis') return;
      if (riga.tariffa === 'ridotto') {
        somma += leggiImporto(riga.importoRidotto).valore || 0;
        return;
      }
      somma += ctx.quota;
    });
    return Math.round(somma * 100) / 100;
  }

  /* Legge dalle tendine, se la riga le ha; altrimenti tiene il valore che
     aveva gia' (le righe del check-in non si toccano). */
  function dataDellaRiga(riga) {
    if (riga.boxData && window.Modulo && typeof Modulo.leggiData === 'function') {
      return Modulo.leggiData(riga.boxData);
    }
    return testo(riga.data_nascita);
  }

  /* Data e sesso sono facoltativi ma vanno in coppia: una data senza sesso
     non serve alla classifica, e un sesso senza data nemmeno. Chi non
     compila niente passa senza domande.

     Il controllo vive sulla riga e si rifa' a ogni cambio dei suoi campi:
     l'avviso compare mentre si compila, non dopo aver premuto Registra, e
     sparisce da solo appena il secondo campo arriva. */
  function verificaLegame(riga) {
    if (!riga.erroreRiga) return true;

    function spegni() {
      riga.erroreRiga.hidden = true;
      if (riga.nodo) riga.nodo.classList.remove('persona-viva--incompleta');
      return true;
    }

    if (riga.escluso) return spegni();

    var haData = !!dataDellaRiga(riga);
    var haSesso = !!testo(riga.sesso);
    if (haData === haSesso) return spegni();

    riga.erroreRiga.textContent = haData
      ? 'Manca il sesso: con la data di nascita serve anche quello.'
      : 'Manca la data di nascita: con il sesso serve anche quella.';
    riga.erroreRiga.hidden = false;
    if (riga.nodo) riga.nodo.classList.add('persona-viva--incompleta');
    return false;
  }

  /* Al Registra si guardano tutte le righe insieme: quelle incomplete
     restano tutte accese, non una per volta. */
  function controllaRighe(ctx) {
    var primo = null;
    var quante = 0;

    ctx.righe.forEach(function (riga) {
      if (!riga.erroreRiga) return;
      if (verificaLegame(riga)) return;
      quante++;
      if (!primo) {
        primo = {
          riga: riga,
          indice: ctx.righe.indexOf(riga) + 1,
          manca: dataDellaRiga(riga) ? 'il sesso' : 'la data di nascita'
        };
      }
    });

    if (!primo) return null;
    primo.quante = quante;
    return primo;
  }

  /* Cio' che parte davvero: solo le righe non escluse. */
  function partecipantiPerInvio(ctx) {
    return ctx.righe
      .filter(function (riga) { return !riga.escluso; })
      .map(function (riga) {
        var q = {
          nome: testo(riga.nome),
          cognome: testo(riga.cognome),
          data_nascita: dataDellaRiga(riga),
          sesso: testo(riga.sesso),
          tariffa: riga.bambino ? 'gratis' : riga.tariffa,
          bambino: !!riga.bambino
        };
        if (!riga.bambino && riga.tariffa === 'ridotto') {
          q.importo_ridotto = leggiImporto(riga.importoRidotto).valore || 0;
        }
        return q;
      });
  }

  /* ------------------------------------------------------------ scheda */

  /* Riceve la risposta intera di gestCerca, che ha questa forma:
       { ok, trovata, prenotazione: {...}, partecipanti: [...] }
     La testata e i totali stanno in "prenotazione", l'elenco e' una chiave
     sorella. Tenerli separati qui e' l'unico punto in cui il contratto va
     rispettato: sbagliarlo svuota la lista senza dare errore. */
  function disegnaScheda(r) {
    var p = r.prenotazione || {};
    var annullata = vero(p.annullata);

    /* Tutto cio' che le varie sezioni si scambiano sta qui: la lista viva
       la costruisce una sezione, il totale lo mostra un'altra e l'incassato
       lo pre-riempie una terza. */
    var ctx = {
      r: r,
      p: p,
      quota: quotaUnitaria(p),
      righe: (Array.isArray(r.partecipanti) ? r.partecipanti : []).map(rigaDaPartecipante),
      cifraDovuto: null,
      campoIncassato: null,
      /* Finche' e' falso l'incassato segue il suggerimento. Al primo tocco
         diventa vero e non lo tocca piu' nessuno: una cifra battuta a mano
         e' un'offerta, e cancellarla in automatico sarebbe un danno. */
      incassatoToccato: false,
      ricalcola: function () {}
    };

    ctx.ricalcola = function () {
      var t = totaleSuggerito(ctx);
      if (ctx.cifraDovuto) ctx.cifraDovuto.textContent = euro(t);
      if (ctx.campoIncassato && !ctx.incassatoToccato) {
        ctx.campoIncassato.value = importoCampo(t);
      }
    };

    scheda.textContent = '';

    /* --- stati: prima di tutto il resto --- */
    var stati = el('div', 'stati');

    if (annullata) {
      var bAnn = el('p', 'badge badge--annullata');
      bAnn.appendChild(el('span', 'badge__segno', '✕'));
      bAnn.appendChild(document.createTextNode('PRENOTAZIONE ANNULLATA'));
      stati.appendChild(bAnn);
    }

    if (vero(p.gia_checkin)) {
      var quando = dataOraIt(p.timestamp_checkin);
      var bReg = el('p', 'badge badge--registrato');
      bReg.appendChild(el('span', 'badge__segno', '✓'));
      bReg.appendChild(document.createTextNode(
        quando ? 'GIÀ REGISTRATO il ' + quando : 'GIÀ REGISTRATO'
      ));
      stati.appendChild(bReg);
    }

    if (stati.childNodes.length) scheda.appendChild(stati);

    /* --- testata: codice e capofila --- */
    var testata = el('header', 'scheda-p__testata');
    testata.appendChild(el('p', 'scheda-p__codice', testo(p.codice) || '—'));

    var capofila = (testo(p.nome_capofila) + ' ' + testo(p.cognome_capofila)).trim();
    testata.appendChild(el('p', 'scheda-p__capofila', capofila || '—'));
    scheda.appendChild(testata);

    /* --- dati --- */
    var sezDati = el('div', 'scheda-p__sezione');
    var dl = el('dl', 'scheda-p__dati');
    dl.appendChild(voceDato('Gruppo', testo(p.squadra) || 'Nessun gruppo'));
    dl.appendChild(voceDato('Telefono', testo(p.telefono)));
    dl.appendChild(voceDato('Partecipanti', testo(p.n_partecipanti)));
    sezDati.appendChild(dl);
    scheda.appendChild(sezDati);

    /* --- partecipanti --- */
    scheda.appendChild(sezionePartecipanti(ctx, { annullata: annullata }));

    /* --- conti --- */
    var sezConti = el('div', 'scheda-p__sezione');
    var conti = el('div', 'conti');

    var dovuto = el('div', 'conti__voce');
    dovuto.appendChild(el('p', 'conti__etichetta', 'Totale dovuto'));
    ctx.cifraDovuto = el('p', 'conti__cifra', euro(p.totale_dovuto));
    dovuto.appendChild(ctx.cifraDovuto);
    conti.appendChild(dovuto);

    var pagato = el('div', 'conti__voce conti__voce--pagato');
    pagato.appendChild(el('p', 'conti__etichetta', 'Già pagato'));
    var cifraPagato = el('p', 'conti__cifra', euro(p.totale_pagato));
    pagato.appendChild(cifraPagato);
    conti.appendChild(pagato);

    sezConti.appendChild(conti);
    scheda.appendChild(sezConti);

    /* --- registrazione --- */
    /* Su una prenotazione annullata non si registra: niente importo, niente
       kit, niente bottone. Non un comando disabilitato, proprio assente:
       un bottone grigio invita a chiedersi perche' non funziona. */
    if (!annullata) {
      scheda.appendChild(sezioneRegistra(ctx, cifraPagato));
      /* Primo calcolo: allinea dovuto e incassato allo stato della lista,
         che su una prenotazione appena cercata coincide col server. */
      ctx.ricalcola();
    }

    /* --- azioni --- */
    var azioni = el('div', 'cassa__azioni');
    var nuova = el('button', 'btn btn--secondario', 'Nuova ricerca');
    nuova.type = 'button';
    nuova.addEventListener('click', nuovaRicerca);
    azioni.appendChild(nuova);
    scheda.appendChild(azioni);

    scheda.hidden = false;
    scheda.scrollIntoView({ block: 'nearest' });
  }

  /* ------------------------------------------------- lista partecipanti */

  /* opz: { annullata, dettagli }
     "dettagli" accende cognome, data di nascita e sesso su ogni riga: al
     check-in quei dati ci sono gia' e non si toccano, al banco invece si
     raccolgono da zero. */
  function sezionePartecipanti(ctx, opz) {
    opz = opz || {};
    var annullata = !!opz.annullata;

    var sez = el('div', 'scheda-p__sezione');
    sez.appendChild(el('p', 'scheda-p__etichetta', 'Partecipanti'));

    var vuoto = el('p', 'tenue', 'Nessun partecipante in elenco.');
    var ul = el('ul', 'elenco-p');
    sez.appendChild(vuoto);
    sez.appendChild(ul);

    function aggiornaVuoto() {
      var quanti = ctx.righe.length;
      vuoto.hidden = quanti > 0;
      ul.hidden = quanti === 0;
    }

    function rinumera() {
      ctx.righe.forEach(function (riga, i) {
        if (riga.numero) riga.numero.textContent = String(i + 1) + '.';
      });
    }

    function togliRiga(riga) {
      var i = ctx.righe.indexOf(riga);
      if (i >= 0) ctx.righe.splice(i, 1);
      if (riga.nodo && riga.nodo.parentNode) riga.nodo.parentNode.removeChild(riga.nodo);
      rinumera();
      aggiornaVuoto();
      ctx.ricalcola();
    }

    ctx.righe.forEach(function (riga) {
      ul.appendChild(costruisciRiga(ctx, riga, opz, togliRiga, ctx.ricalcola));
    });
    rinumera();
    aggiornaVuoto();

    /* Su una prenotazione annullata la lista resta quella che e': niente
       da aggiungere, niente da togliere. */
    if (annullata) return sez;

    var aggiunte = el('div', 'aggiungi-persona');
    aggiunte.appendChild(el('span', 'aggiungi-persona__etichetta', 'Aggiungi al banco:'));

    function bottoneAggiungi(testoBottone, bambino) {
      var b = el('button', 'btn btn--secondario btn--piccolo', testoBottone);
      b.type = 'button';
      b.addEventListener('click', function () {
        var riga = rigaNuova(bambino);
        ctx.righe.push(riga);
        /* Il gancio va chiamato PRIMA di costruire la riga: chi eredita il
           nome del referente deve averlo gia' addosso quando nasce il campo,
           o il campo esce vuoto. */
        if (opz.suRigaAggiunta) opz.suRigaAggiunta(riga, ctx.righe.length - 1);
        ul.appendChild(costruisciRiga(ctx, riga, opz, togliRiga, ctx.ricalcola));
        rinumera();
        aggiornaVuoto();
        ctx.ricalcola();
        if (riga.campoNome) riga.campoNome.focus();
      });
      return b;
    }

    aggiunte.appendChild(bottoneAggiungi('+ Adulto', false));
    aggiunte.appendChild(bottoneAggiungi('+ Bambino', true));
    sez.appendChild(aggiunte);

    return sez;
  }

  function costruisciRiga(ctx, riga, opz, togliRiga, ricalcola) {
    opz = opz || {};
    var annullata = !!opz.annullata;
    var dettagli = !!opz.dettagli;

    var li = el('li', 'elenco-p__voce persona-viva');
    if (dettagli) li.classList.add('persona-viva--dettagli');
    riga.nodo = li;

    riga.numero = el('span', 'elenco-p__numero', '');
    li.appendChild(riga.numero);

    var corpo = el('div', 'persona-viva__corpo');

    /* Nome: scritto a mano solo per chi si aggiunge al banco. Di chi era
       gia' iscritto non si riscrive nulla da qui. */
    if (riga.aggiunto) {
      var campoNome = document.createElement('input');
      campoNome.type = 'text';
      campoNome.className = 'persona-viva__nome-campo';
      campoNome.placeholder = riga.bambino ? 'Nome del bambino' : 'Nome';
      campoNome.setAttribute('aria-label',
        riga.bambino ? 'Nome del bambino aggiunto' : 'Nome della persona aggiunta');
      campoNome.autocomplete = 'off';
      campoNome.value = riga.nome;
      /* Scrivere a mano qui rompe l'eredita' dal referente: da quel momento
         il nome e' dell'operatore e non lo tocca piu' nessuno. Vale solo per
         cio' che si digita: assegnare .value da codice non scatena "input". */
      campoNome.addEventListener('input', function () {
        riga.nome = campoNome.value;
        riga.ereditata = false;
      });
      riga.campoNome = campoNome;
      corpo.appendChild(campoNome);

      if (dettagli) {
        var campoCognome = document.createElement('input');
        campoCognome.type = 'text';
        campoCognome.className = 'persona-viva__nome-campo';
        campoCognome.placeholder = 'Cognome';
        campoCognome.setAttribute('aria-label', 'Cognome, facoltativo');
        campoCognome.autocomplete = 'off';
        campoCognome.value = riga.cognome;
        campoCognome.addEventListener('input', function () {
          riga.cognome = campoCognome.value;
          riga.ereditata = false;
        });
        riga.campoCognome = campoCognome;
        corpo.appendChild(campoCognome);
      }
    } else {
      var nome = (testo(riga.nome) + ' ' + testo(riga.cognome)).trim();
      corpo.appendChild(el('span', 'elenco-p__nome', nome || '—'));

      var meta = [];
      var nascita = dataIt(riga.data_nascita);
      if (nascita) meta.push(nascita);
      if (testo(riga.sesso)) meta.push(testo(riga.sesso));
      if (meta.length) corpo.appendChild(el('span', 'elenco-p__meta', meta.join(' · ')));
    }

    /* Data di nascita e sesso: facoltativi, ma legati fra loro. La verifica
       del legame sta in controllaRighe, al momento dell'invio. */
    if (dettagli) corpo.appendChild(dettagliAnagrafici(riga));

    /* I bambini non scelgono tariffa: sono gratis e basta. */
    var tariffe = null;
    if (riga.bambino) {
      corpo.appendChild(el('span', 'pillola pillola--gratis', 'gratis'));
    } else if (!annullata) {
      tariffe = selettoreTariffa(riga, ricalcola);
      corpo.appendChild(tariffe);
    }

    li.appendChild(corpo);

    if (annullata) return li;

    /* Una riga gia' iscritta si barra e si puo' rimettere; una aggiunta al
       banco si toglie e basta, perche' "ripristinare" una riga appena
       digitata non vuol dire niente. */
    var via = el('button', 'persona-viva__via', '');
    via.type = 'button';

    function aggiornaStato() {
      li.classList.toggle('persona-viva--fuori', riga.escluso);
      via.classList.toggle('persona-viva__via--ripristina', riga.escluso);
      via.textContent = riga.escluso ? 'Ripristina' : '✕';
      via.setAttribute('aria-label', riga.escluso
        ? 'Rimetti nel conteggio ' + (testo(riga.nome) || 'questa persona')
        : 'Togli dal conteggio ' + (testo(riga.nome) || 'questa persona'));

      /* Chi e' fuori non ha tariffa: mostrare tre scelte spente accanto a un
         nome barrato e' rumore, e fa pure andare a capo la riga. */
      if (tariffe) tariffe.hidden = riga.escluso;

      /* Escluso vuol dire escluso: non si modifica cio' che non parte. */
      Array.prototype.forEach.call(corpo.querySelectorAll('input'), function (n) {
        n.disabled = riga.escluso;
      });
    }

    via.addEventListener('click', function () {
      if (riga.aggiunto) { togliRiga(riga); return; }
      riga.escluso = !riga.escluso;
      aggiornaStato();
      ricalcola();
    });

    aggiornaStato();
    li.appendChild(via);
    return li;
  }

  /* Data di nascita a tre tendine e sesso. Le tendine sono quelle del modulo
     pubblico, preparate da Modulo.preparaData: al banco si iscrive la stessa
     gente che si iscrive da casa, e un calendario a comparsa su un portatile
     condiviso e' peggio di tre elenchi. */
  function dettagliAnagrafici(riga) {
    var box = el('div', 'anagrafica');

    /* Niente classe tre-tendine: quella del modulo pubblico stira ogni
       tendina al 100% della colonna, e qui dentro le manderebbe a capo una
       sotto l'altra. Stessa struttura, larghezze da banco. */
    var data = el('div', 'anagrafica__data');
    ['giorno', 'mese', 'anno'].forEach(function (quale) {
      var s = document.createElement('select');
      s.setAttribute('data-campo', quale);
      s.setAttribute('aria-label', quale.charAt(0).toUpperCase() + quale.slice(1) + ' di nascita');
      s.innerHTML = '<option value="">' + quale.charAt(0).toUpperCase() + quale.slice(1) + '</option>';
      /* Il controllo scatta al cambio, non a ogni tasto: la data e' completa
         solo quando ci sono tutte e tre le tendine, e prima di allora vale
         come vuota. */
      s.addEventListener('change', function () { verificaLegame(riga); });
      data.appendChild(s);
    });

    if (window.Modulo && typeof Modulo.preparaData === 'function') {
      Modulo.preparaData(data);
    }
    riga.boxData = data;
    box.appendChild(data);

    /* Sesso: due sole scelte perche' sono quelle che finiscono in classifica
       (piu' anziano, piu' giovane), non un censimento. Si puo' non scegliere. */
    var sessi = el('div', 'anagrafica__sesso');
    var gruppo = 'sesso-' + riga.id;
    [['F', 'F'], ['M', 'M']].forEach(function (s) {
      var lab = el('label', 'chip chip--sesso');
      var radio = document.createElement('input');
      radio.type = 'radio';
      radio.name = gruppo;
      radio.value = s[0];
      radio.checked = riga.sesso === s[0];
      radio.addEventListener('change', function () {
        if (!radio.checked) return;
        riga.sesso = s[0];
        verificaLegame(riga);
      });
      lab.appendChild(radio);
      lab.appendChild(el('span', null, s[1]));
      sessi.appendChild(lab);
    });
    riga.boxSesso = sessi;
    box.appendChild(sessi);

    /* Il messaggio del legame data/sesso vive sulla riga che lo ha rotto,
       non in cima al modulo: cosi' si vede subito quale sistemare. */
    riga.erroreRiga = el('p', 'anagrafica__errore');
    riga.erroreRiga.hidden = true;
    box.appendChild(riga.erroreRiga);

    return box;
  }

  function selettoreTariffa(riga, ricalcola) {
    var box = el('div', 'tariffe');
    var gruppo = 'tariffa-' + riga.id;

    var campoRidotto = document.createElement('input');
    campoRidotto.type = 'text';
    campoRidotto.className = 'tariffe__importo';
    campoRidotto.setAttribute('inputmode', 'decimal');
    campoRidotto.setAttribute('aria-label', 'Quanto paga questa persona, in euro');
    campoRidotto.placeholder = '€';
    campoRidotto.autocomplete = 'off';
    campoRidotto.value = riga.importoRidotto;

    function aggiornaRidotto() {
      campoRidotto.hidden = riga.tariffa !== 'ridotto';
    }

    [['intero', 'Intero'], ['ridotto', 'Ridotto'], ['gratis', 'Gratis']].forEach(function (t) {
      var lab = el('label', 'chip chip--tariffa');
      var radio = document.createElement('input');
      radio.type = 'radio';
      radio.name = gruppo;
      radio.value = t[0];
      radio.checked = riga.tariffa === t[0];
      radio.addEventListener('change', function () {
        if (!radio.checked) return;
        riga.tariffa = t[0];
        aggiornaRidotto();
        if (t[0] === 'ridotto') campoRidotto.focus();
        ricalcola();
      });
      lab.appendChild(radio);
      lab.appendChild(el('span', null, t[1]));
      box.appendChild(lab);
    });

    campoRidotto.addEventListener('input', function () {
      riga.importoRidotto = campoRidotto.value;
      ricalcola();
    });

    aggiornaRidotto();
    box.appendChild(campoRidotto);
    return box;
  }

  /* ------------------------------------------------------ registrazione */

  /* Importo incassato e consegna del kit: identici al check-in e alla nuova
     iscrizione, quindi stanno in un posto solo.
     opz: { suffisso, giaFatta, valoreIniziale, kitIniziale } */
  function controlliIncasso(ctx, opz) {
    var riga = el('div', 'registra__riga');

    var idImporto = 'incassato-' + opz.suffisso;
    var campo = el('div', 'campo');
    var etichetta = el('label', null, 'Incassato €');
    etichetta.htmlFor = idImporto;
    campo.appendChild(etichetta);

    var incassato = document.createElement('input');
    incassato.type = 'text';
    incassato.id = idImporto;
    incassato.className = 'cassa__importo';
    /* decimal, non numeric: servono la virgola e il punto. */
    incassato.setAttribute('inputmode', 'decimal');
    incassato.autocomplete = 'off';
    ctx.campoIncassato = incassato;

    /* Su una gia' registrata il campo parte da cio' che risulta incassato e
       ci resta: e' una cifra vera, non un suggerimento, e il ricalcolo
       della lista non deve sovrascriverla. */
    if (opz.valoreIniziale !== null && opz.valoreIniziale !== undefined) {
      incassato.value = importoCampo(opz.valoreIniziale);
      ctx.incassatoToccato = true;
    }

    campo.appendChild(incassato);

    var NOTA_NUOVA = 'Segue il totale dovuto. Cambialo se incassi una cifra diversa.';
    var NOTA_MANO = 'Scritto a mano: non cambia più da solo.';
    var NOTA_FATTA = 'Già registrato. Cambialo solo se stai correggendo.';
    /* Senza quota nota il totale non si puo' suggerire: meglio dirlo che
       lasciare uno zero da interpretare. */
    var NOTA_SENZA_QUOTA = 'Quota non disponibile: scrivi tu l’importo incassato.';

    var testoIniziale = opz.giaFatta ? NOTA_FATTA
      : (ctx.quota > 0 ? NOTA_NUOVA : NOTA_SENZA_QUOTA);
    var notaCampo = el('p', 'campo__nota', testoIniziale);
    campo.appendChild(notaCampo);

    /* Il primo tocco a mano stacca il campo dal suggerimento, e la dicitura
       lo dice: da qui in poi quella cifra e' dell'operatore, non nostra. */
    incassato.addEventListener('input', function () {
      ctx.incassatoToccato = true;
      notaCampo.textContent = NOTA_MANO;
    });

    riga.appendChild(campo);

    var kitEtichetta = el('label', 'interruttore');
    var kit = document.createElement('input');
    kit.type = 'checkbox';
    kit.id = 'kit-' + opz.suffisso;
    /* Il kit si consegna quasi sempre insieme al pagamento: parte spuntato,
       e chi fa l'eccezione lo toglie. */
    kit.checked = !!opz.kitIniziale;
    kitEtichetta.appendChild(kit);
    kitEtichetta.appendChild(el('span', 'interruttore__testo', 'Kit consegnato'));
    riga.appendChild(kitEtichetta);

    return {
      nodo: riga,
      incassato: incassato,
      kit: kit,
      notaCampo: notaCampo,
      NOTA_FATTA: NOTA_FATTA
    };
  }

  function sezioneRegistra(ctx, cifraPagato) {
    var p = ctx.p;
    var giaFatta = vero(p.gia_checkin);

    var sez = el('div', 'scheda-p__sezione');
    sez.appendChild(el('p', 'scheda-p__etichetta', 'Registrazione'));

    /* Detto una volta sola e sottovoce: chi corregge deve sapere che sta
       riscrivendo, non che sta registrando da capo. */
    var nota = el('p', 'registra__nota', 'Stai modificando una registrazione già fatta.');
    nota.hidden = !giaFatta;
    sez.appendChild(nota);

    var incasso = controlliIncasso(ctx, {
      suffisso: 'checkin',
      giaFatta: giaFatta,
      valoreIniziale: giaFatta ? p.totale_pagato : null,
      kitIniziale: giaFatta ? String(p.kit_consegnato).toUpperCase() === 'SI' : true
    });
    var incassato = incasso.incassato;
    var kit = incasso.kit;
    var notaCampo = incasso.notaCampo;
    var NOTA_FATTA = incasso.NOTA_FATTA;
    sez.appendChild(incasso.nodo);

    var avviso = el('div', 'avviso avviso--errore cassa__messaggio');
    avviso.setAttribute('role', 'alert');
    var avvisoTesto = el('p', null, '');
    avviso.appendChild(avvisoTesto);
    avviso.hidden = true;
    sez.appendChild(avviso);

    var esito = el('div', 'esito');
    esito.setAttribute('role', 'status');
    esito.hidden = true;
    sez.appendChild(esito);

    var azioni = el('div', 'registra__azioni');
    var bottone = el('button', 'btn btn--primario btn--banco', 'Registra');
    bottone.type = 'button';
    azioni.appendChild(bottone);
    sez.appendChild(azioni);

    function avvisaRegistra(t) {
      avvisoTesto.textContent = t;
      avviso.hidden = false;
    }

    /* A schermo va solo cio' che ha risposto il server: nessun campo qui
       viene riempito con quello che avevamo mandato noi. */
    function mostraEsito(risposta) {
      var pagatoConf = campoRisposta(risposta, 'totale_pagato');
      var quando = dataOraIt(campoRisposta(risposta, 'timestamp_checkin'));
      var kitConf = campoRisposta(risposta, 'kit_consegnato');
      if (kitConf === undefined) kitConf = campoRisposta(risposta, 'kit');

      var kitDetto = kitConf === undefined
        ? '—'
        : (String(kitConf).toUpperCase() === 'SI' ? 'Sì' : 'No');

      esito.textContent = '';
      var testata = el('p', 'badge badge--fatto');
      testata.appendChild(el('span', 'badge__segno', '✓'));
      testata.appendChild(document.createTextNode('REGISTRATO'));
      esito.appendChild(testata);

      var dati = el('dl', 'scheda-p__dati esito__dati');
      dati.appendChild(voceDato('Incassato', euro(pagatoConf)));
      dati.appendChild(voceDato('Kit', kitDetto));
      dati.appendChild(voceDato('Ora', quando));
      esito.appendChild(dati);
      esito.hidden = false;

      /* La scheda passa a stato registrato con i valori del server. Da qui
         in poi l'incassato e' una cifra registrata, non un suggerimento:
         resta fermo anche se la lista cambia ancora. */
      if (pagatoConf !== undefined) {
        cifraPagato.textContent = euro(pagatoConf);
        incassato.value = importoCampo(pagatoConf);
        ctx.incassatoToccato = true;
      }
      if (kitConf !== undefined) kit.checked = String(kitConf).toUpperCase() === 'SI';
      nota.hidden = false;
      notaCampo.textContent = NOTA_FATTA;

      avviso.hidden = true;
      esito.scrollIntoView({ block: 'nearest' });
    }

    bottone.addEventListener('click', function () {
      if (inCorso) return;

      var token = leggiToken();
      if (!token || scaduta()) {
        mostraAccesso('Sessione scaduta, rifai l’accesso.');
        return;
      }

      var letto = leggiImporto(incassato.value);
      if (letto.errore) {
        avvisaRegistra('Importo non valido. Scrivi solo cifre, per esempio 8,00.');
        incassato.focus();
        incassato.select();
        return;
      }

      var dati = {
        token: token,
        codice: testo(p.codice),
        incassato: letto.vuoto ? '' : letto.valore,
        kit: kit.checked ? 'SI' : 'NO',
        partecipanti: partecipantiPerInvio(ctx)
      };

      avviso.hidden = true;

      /* Un id nuovo a ogni click. Il doppio tocco lo ferma il bottone
         disabilitato qui sotto; l'id fresco serve al caso opposto, la
         correzione voluta piu' tardi, che deve poter riscrivere. */
      var idInvio = API.nuovoId();
      occupato(bottone, true, 'Registro…', 'Registra');

      API.chiama('gestCheckin', dati, { requestId: idInvio })
        .then(mostraEsito)
        .catch(function (e) {
          if (e.codice === 'NON_AUTORIZZATO') {
            mostraAccesso('Sessione scaduta, rifai l’accesso.');
            return;
          }
          if (e.codice === 'ANNULLATA') {
            avvisaRegistra('Prenotazione annullata: non registrabile.');
            return;
          }
          /* Il campo non si tocca: l'importo battuto a mano non deve sparire
             per colpa della rete. */
          avvisaRegistra(messaggioDiRete(e));
        })
        .finally(function () {
          occupato(bottone, false, 'Registro…', 'Registra');
        });
    });

    return sez;
  }

  /* =================================================================== */
  /* NUOVA ISCRIZIONE AL BANCO                                           */
  /*                                                                     */
  /* La corsia veloce: qui non si cerca niente, si crea una prenotazione */
  /* da zero per chi si presenta senza pre-iscrizione. Riusa la stessa   */
  /* lista viva del check-in, accesa in modalita' "dettagli" perche' qui */
  /* nome, data e sesso vanno raccolti invece che letti.                 */
  /* =================================================================== */

  var sezioneNuova = document.getElementById('nuova');
  var moduloNuova = document.getElementById('modulo-nuova');
  var apriNuovaBtn = document.getElementById('apri-nuova');
  var annullaNuovaBtn = document.getElementById('nuova-annulla');
  var squadreCaricate = false;
  var squadreNote = [];
  /* Un'istanza sola per tutta la vita della pagina: Modulo.Gruppi attacca i
     suoi ascoltatori al contenitore, e ricrearla a ogni apertura del modulo
     li accumulerebbe. */
  var gruppi = null;

  function mostraNuova() {
    ricerca.hidden = true;
    /* Uscendo dalla ricerca la fotocamera non resta accesa: una anteprima
       viva sotto un'altra schermata e' solo una spia accesa in tasca. */
    fermaScanner();
    sezioneNuova.hidden = false;
    preparaNuova();
    var primo = document.getElementById('rif-nome');
    if (primo) primo.focus();
  }

  function tornaARicerca() {
    sezioneNuova.hidden = true;
    ricerca.hidden = false;
    codice.focus();
  }

  /* I gruppi arrivano dopo, e i chip si rifanno quando arrivano. Se la
     chiamata non riesce restano comunque "Nessun gruppo" e "Crea nuovo
     gruppo": si puo' lavorare lo stesso. */
  function caricaGruppi() {
    if (squadreCaricate) return;
    squadreCaricate = true;
    API.chiama('getSquadre', {})
      .then(function (r) {
        squadreNote = r.squadre || [];
        if (gruppi) gruppi.riempi(squadreNote, '');
      })
      .catch(function () { squadreCaricate = false; });
  }

  /* Il valore da mandare: '' per "Nessun gruppo", il nome scritto a mano se
     si sta creando, altrimenti la squadra scelta. Lo decide Gruppi.leggi. */
  function gruppoScelto() {
    return gruppi ? gruppi.leggi() : '';
  }

  function preparaNuova() {
    if (!moduloNuova) return;

    var ctx = {
      quota: quotaRicordata() || 0,
      righe: [],
      cifraDovuto: null,
      campoIncassato: null,
      incassatoToccato: false,
      ricalcola: function () {}
    };

    ctx.ricalcola = function () {
      var t = totaleSuggerito(ctx);
      if (ctx.cifraDovuto) ctx.cifraDovuto.textContent = euro(t);
      /* Senza quota nota non si suggerisce niente: il campo resta vuoto e lo
         riempie l'operatore, invece di mostrare uno zero credibile. */
      if (ctx.campoIncassato && !ctx.incassatoToccato) {
        ctx.campoIncassato.value = ctx.quota > 0 ? importoCampo(t) : '';
      }
    };

    /* --- il referente e la prima riga ---
       Chi sta al banco dice il proprio nome una volta sola: la prima persona
       della lista e' quasi sempre lui. La riga 1 lo eredita, e continua a
       seguirlo finche' nessuno la corregge a mano; al primo tocco si stacca
       e da li' in poi comanda l'operatore. */
    var rifNome = document.getElementById('rif-nome');
    var rifCognome = document.getElementById('rif-cognome');

    function ereditaSuPrima(riga, indice) {
      /* Solo la prima riga, e solo se e' un adulto: il referente non e' il
         bambino che si sta aggiungendo. */
      if (indice !== 0 || riga.bambino) return;
      riga.nome = rifNome.value.trim();
      riga.cognome = rifCognome.value.trim();
      riga.ereditata = true;
    }

    function seguiRiferimento() {
      var prima = ctx.righe[0];
      if (!prima || !prima.ereditata) return;
      prima.nome = rifNome.value.trim();
      prima.cognome = rifCognome.value.trim();
      if (prima.campoNome) prima.campoNome.value = prima.nome;
      if (prima.campoCognome) prima.campoCognome.value = prima.cognome;
    }

    rifNome.addEventListener('input', seguiRiferimento);
    rifCognome.addEventListener('input', seguiRiferimento);

    /* --- gruppo a pillole --- */
    if (!gruppi && window.Modulo && typeof Modulo.Gruppi === 'function') {
      gruppi = new Modulo.Gruppi(
        document.getElementById('chip-gruppi'),
        document.getElementById('campo-nuovo-gruppo')
      );
    }
    if (gruppi) {
      /* azzera prima di riempire: senza, riempi() conserverebbe la scelta
         della persona precedente, e la seconda iscrizione partirebbe col
         gruppo della prima. */
      gruppi.azzera();
      gruppi.riempi(squadreNote, '');
    }

    /* --- persone --- */
    var boxPersone = document.getElementById('nuova-persone');
    boxPersone.textContent = '';
    boxPersone.appendChild(sezionePartecipanti(ctx, {
      dettagli: true,
      suRigaAggiunta: ereditaSuPrima
    }));

    /* --- totale --- */
    var boxConti = document.getElementById('nuova-conti');
    boxConti.textContent = '';
    var sezConti = el('div', 'scheda-p__sezione');
    var conti = el('div', 'conti');
    var dovuto = el('div', 'conti__voce');
    dovuto.appendChild(el('p', 'conti__etichetta', 'Totale dovuto'));
    ctx.cifraDovuto = el('p', 'conti__cifra', euro(0));
    dovuto.appendChild(ctx.cifraDovuto);
    conti.appendChild(dovuto);
    sezConti.appendChild(conti);
    boxConti.appendChild(sezConti);

    /* --- incasso e invio --- */
    var boxIncasso = document.getElementById('nuova-incasso');
    boxIncasso.textContent = '';

    var sez = el('div', 'scheda-p__sezione');
    sez.appendChild(el('p', 'scheda-p__etichetta', 'Incasso'));

    var incasso = controlliIncasso(ctx, {
      suffisso: 'nuova',
      giaFatta: false,
      valoreIniziale: null,
      kitIniziale: true
    });
    sez.appendChild(incasso.nodo);

    var avviso = el('div', 'avviso avviso--errore cassa__messaggio');
    avviso.setAttribute('role', 'alert');
    var avvisoTesto = el('p', null, '');
    avviso.appendChild(avvisoTesto);
    avviso.hidden = true;
    sez.appendChild(avviso);

    var esito = el('div', 'esito');
    esito.setAttribute('role', 'status');
    esito.hidden = true;
    sez.appendChild(esito);

    var azioni = el('div', 'registra__azioni');
    var bottone = el('button', 'btn btn--primario btn--banco', 'Registra iscrizione');
    bottone.type = 'button';
    azioni.appendChild(bottone);
    sez.appendChild(azioni);

    boxIncasso.appendChild(sez);

    function avvisa(t) {
      avvisoTesto.textContent = t;
      avviso.hidden = false;
    }

    ctx.ricalcola();

    bottone.addEventListener('click', function () {
      if (inCorso) return;

      var token = leggiToken();
      if (!token || scaduta()) {
        mostraAccesso('Sessione scaduta, rifai l’accesso.');
        return;
      }

      var rifNome = document.getElementById('rif-nome');
      var nomeRif = rifNome.value.trim();
      if (!nomeRif) {
        avvisa('Serve almeno il nome di riferimento.');
        rifNome.focus();
        return;
      }

      if (!ctx.righe.filter(function (q) { return !q.escluso; }).length) {
        avvisa('Aggiungi almeno una persona con + Adulto o + Bambino.');
        return;
      }

      var guasto = controllaRighe(ctx);
      if (guasto) {
        avvisa(guasto.quante > 1
          ? 'Ci sono ' + guasto.quante + ' persone da completare: data di nascita e ' +
            'sesso vanno insieme, oppure lasciali entrambi vuoti. Le trovi segnate qui sopra.'
          : 'Persona ' + guasto.indice + ': manca ' + guasto.manca +
            '. Data di nascita e sesso vanno insieme, oppure lasciali entrambi vuoti.');
        if (guasto.riga.nodo) guasto.riga.nodo.scrollIntoView({ block: 'center' });
        return;
      }

      var letto = leggiImporto(incasso.incassato.value);
      if (letto.errore) {
        avvisa('Importo non valido. Scrivi solo cifre, per esempio 8,00.');
        incasso.incassato.focus();
        incasso.incassato.select();
        return;
      }

      var dati = {
        token: token,
        rif_nome: nomeRif,
        rif_cognome: document.getElementById('rif-cognome').value.trim(),
        squadra: gruppoScelto(),
        telefono: document.getElementById('rif-telefono').value.trim(),
        incassato: letto.vuoto ? '' : letto.valore,
        kit: incasso.kit.checked ? 'SI' : 'NO',
        partecipanti: partecipantiPerInvio(ctx)
      };

      avviso.hidden = true;
      var idInvio = API.nuovoId();
      occupato(bottone, true, 'Registro…', 'Registra iscrizione');

      API.chiama('gestNuovaIscrizione', dati, { requestId: idInvio })
        .then(function (risposta) { mostraEsitoNuova(esito, risposta); })
        .catch(function (e) {
          if (e.codice === 'NON_AUTORIZZATO') {
            mostraAccesso('Sessione scaduta, rifai l’accesso.');
            return;
          }
          /* NOME_MANCANTE e LISTA_VUOTA li abbiamo gia' fermati qui sopra;
             se il server li rimanda ha ragione lui, e si mostra il suo
             messaggio invece di riscriverlo. */
          avvisa(messaggioDiRete(e));
        })
        .finally(function () {
          occupato(bottone, false, 'Registro…', 'Registra iscrizione');
        });
    });
  }

  /* Il codice generato e' l'unica cosa che l'operatore deve poter leggere a
     voce e annotare: grande, e preso dalla risposta, non costruito qui. */
  function mostraEsitoNuova(esito, risposta) {
    var codiceNuovo = testo(campoRisposta(risposta, 'codice'));
    var pagatoConf = campoRisposta(risposta, 'totale_pagato');
    if (pagatoConf === undefined) pagatoConf = campoRisposta(risposta, 'incassato');
    var kitConf = campoRisposta(risposta, 'kit_consegnato');
    if (kitConf === undefined) kitConf = campoRisposta(risposta, 'kit');

    esito.textContent = '';

    var testata = el('p', 'badge badge--fatto');
    testata.appendChild(el('span', 'badge__segno', '✓'));
    testata.appendChild(document.createTextNode('ISCRIZIONE REGISTRATA'));
    esito.appendChild(testata);

    var box = el('div', 'esito__codice');
    box.appendChild(el('p', 'esito__codice-etichetta', 'Codice della prenotazione'));
    box.appendChild(el('p', 'esito__codice-valore', codiceNuovo || '—'));
    esito.appendChild(box);

    var dati = el('dl', 'scheda-p__dati esito__dati');
    dati.appendChild(voceDato('Incassato', euro(pagatoConf)));
    dati.appendChild(voceDato('Kit', kitConf === undefined
      ? '—'
      : (String(kitConf).toUpperCase() === 'SI' ? 'Sì' : 'No')));
    esito.appendChild(dati);

    var azioni = el('div', 'cassa__azioni esito__azioni');
    var altra = el('button', 'btn btn--primario', 'Nuova iscrizione');
    altra.type = 'button';
    altra.addEventListener('click', function () {
      moduloNuova.reset();
      preparaNuova();
      document.getElementById('rif-nome').focus();
    });
    var indietro = el('button', 'btn btn--secondario', 'Torna alla ricerca');
    indietro.type = 'button';
    indietro.addEventListener('click', tornaARicerca);
    azioni.appendChild(altra);
    azioni.appendChild(indietro);
    esito.appendChild(azioni);

    esito.hidden = false;
    esito.scrollIntoView({ block: 'center' });
  }

  if (apriNuovaBtn) {
    apriNuovaBtn.addEventListener('click', function () {
      caricaGruppi();
      mostraNuova();
    });
  }
  if (annullaNuovaBtn) annullaNuovaBtn.addEventListener('click', tornaARicerca);

  /* =================================================================== */
  /* RIEPILOGO                                                           */
  /*                                                                     */
  /* Due usi in uno: durante la giornata dice come sta andando (persone, */
  /* incasso, kit), e alla fine serve i quattro nomi da chiamare al      */
  /* microfono e i gruppi piu' numerosi. Da qui non si scrive niente:    */
  /* si legge e basta.                                                   */
  /*                                                                     */
  /* Tutto quello che si vede arriva da gestRiepilogo. Nessun numero e'  */
  /* ricalcolato qui: se il server non manda un campo, a video finisce   */
  /* un trattino, non una stima. E prima di ogni chiamata il riquadro si */
  /* svuota, cosi' se la richiesta va male non resta a schermo un        */
  /* conteggio vecchio che sembra ancora buono.                          */
  /* =================================================================== */

  var sezioneRiepilogo = document.getElementById('riepilogo');
  var apriRiepilogoBtn = document.getElementById('apri-riepilogo');
  var riepIndietroBtn = document.getElementById('riepilogo-indietro');
  var riepAggiornaBtn = document.getElementById('riepilogo-aggiorna');
  var riepEvento = document.getElementById('riepilogo-evento');
  var riepAggiornato = document.getElementById('riepilogo-aggiornato');
  var riepAvviso = document.getElementById('riepilogo-avviso');
  var riepAvvisoTesto = document.getElementById('riepilogo-avviso-testo');
  var riepCorpo = document.getElementById('riepilogo-corpo');

  var GIORNI = ['Domenica', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato'];
  var MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno',
              'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];

  /* Da "2026-09-13" a "Domenica 13 settembre 2026". I nomi sono scritti qui
     invece di chiederli a toLocaleDateString: la lingua della pagina e' una
     sola e non deve dipendere da come e' configurato il PC del banco.
     Il giorno della settimana si calcola in UTC, altrimenti il fuso puo'
     spostare la data indietro di un giorno e far leggere "Sabato 12". */
  function dataLunga(v) {
    var s = testo(v);
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
    if (!m) return s;
    var d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
    if (isNaN(d.getTime())) return s;
    return GIORNI[d.getUTCDay()] + ' ' + Number(m[3]) + ' ' +
           MESI[Number(m[2]) - 1] + ' ' + m[1];
  }

  /* Un conteggio. Se non e' un numero non diventa zero: uno zero inventato
     al microfono si legge come un fatto. */
  function conteggio(v) {
    var n = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.'));
    if (isNaN(n)) return '—';
    return String(n);
  }

  /* Gli importi del cruscotto si leggono da lontano: i centesimi si
     scrivono solo quando ci sono davvero. */
  function euroCorto(v) {
    var n = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.'));
    if (isNaN(n)) return '—';
    return (n % 1 === 0 ? String(n) : n.toFixed(2).replace('.', ',')) + ' €';
  }

  /* Il backend manda i premiati come "Anna Verdi (15-06-1970)": a video il
     nome e la data vanno su due righe, perche' il nome si legge da lontano
     e la data serve solo a chi controlla. Se la forma fosse un'altra, il
     valore si stampa intero invece di essere tagliato a caso. */
  function premiato(v) {
    var s = testo(v);
    if (!s || s === '-' || s === '—') return { nome: '—', data: '' };
    var m = /^(.*?)\s*\(([^)]*)\)\s*$/.exec(s);
    if (m && m[1]) return { nome: m[1], data: m[2] };
    return { nome: s, data: '' };
  }

  /* "(nessun gruppo)" non e' un gruppo: e' il mucchio di chi non ne ha
     scelto uno. Sul podio non ci va, ma il suo numero serve lo stesso. */
  function senzaGruppo(nome) {
    var s = testo(nome);
    return !s || /^\(?\s*nessun gruppo\s*\)?$/i.test(s);
  }

  /* La lista arriva gia' ordinata per numerosita' decrescente: qui si
     normalizza la forma, non si riordina. */
  function coppieGruppi(lista) {
    if (!lista || !lista.length) return [];
    var fuori = [];
    for (var i = 0; i < lista.length; i++) {
      var riga = lista[i];
      if (!riga) continue;
      var nome = Array.isArray(riga) ? riga[0] : riga.nome;
      var n = Array.isArray(riga) ? riga[1] : riga.n;
      /* Terzo posto della terna: i nomi di quel gruppo. Arrivano gia' con la
         risposta, quindi aprire una riga non costa una chiamata. Se non
         arrivassero, la riga resta quella di prima e non si apre: meglio
         niente che un elenco vuoto che sembra un guasto. */
      var nomi = Array.isArray(riga) ? riga[2] : riga.nomi;
      if (nome === undefined && n === undefined) continue;
      fuori.push({
        nome: testo(nome),
        n: n,
        senza: senzaGruppo(nome),
        nomi: Array.isArray(nomi) ? nomi : []
      });
    }
    return fuori;
  }

  /* ------------------------------------------------------------ mattoni */

  function riepSezione(titolo, classe) {
    var s = el('section', 'riep__sezione' + (classe ? ' ' + classe : ''));
    if (titolo) s.appendChild(el('h2', 'riep__sezione-titolo', titolo));
    return s;
  }

  /* Un numerone del cruscotto: la cifra prima, l'etichetta sotto, e una riga
     piccola facoltativa per il confronto (l'atteso accanto al reale). */
  function numerone(valore, etichetta, nota, modificatore) {
    var c = el('div', 'riep__numerone' + (modificatore ? ' ' + modificatore : ''));
    c.appendChild(el('p', 'riep__numerone__cifra', valore));
    c.appendChild(el('p', 'riep__numerone__voce', etichetta));
    if (nota) c.appendChild(el('p', 'riep__numerone__nota', nota));
    return c;
  }

  /* Coppia etichetta/valore dei dettagli. dt e dd stanno dentro lo stesso
     contenitore, come nella scheda: in griglia devono valere una cella sola. */
  function datoPiccolo(etichetta, valore) {
    var v = el('div', 'riep__dato');
    v.appendChild(el('dt', null, etichetta));
    v.appendChild(el('dd', null, valore));
    return v;
  }

  /* L'elenco dei nomi di un gruppo. Solo i nomi, come li manda il server:
     al microfono servono quelli, non date o importi. */
  function elencoNomi(nomi) {
    var ul = el('ul', 'riep__nomi');
    ul.hidden = true;
    nomi.forEach(function (v) {
      ul.appendChild(el('li', 'riep__nome', testo(v) || '—'));
    });
    return ul;
  }

  /* Rende apribile una riga: il bottone porta la freccia e comanda
     l'elenco, che sta li' sotto gia' costruito. Niente animazioni di
     altezza: al banco conta che compaia subito. */
  function rendiApribile(bottone, elenco) {
    bottone.type = 'button';
    bottone.setAttribute('aria-expanded', 'false');
    bottone.appendChild(el('span', 'riep__freccia'));
    bottone.lastChild.setAttribute('aria-hidden', 'true');
    bottone.addEventListener('click', function () {
      var aperto = bottone.getAttribute('aria-expanded') === 'true';
      bottone.setAttribute('aria-expanded', aperto ? 'false' : 'true');
      elenco.hidden = aperto;
    });
  }

  function rigaGruppo(nome, n, nomi, classe) {
    var r = el('li', 'riep__gruppo' + (classe ? ' ' + classe : ''));
    var testa = el('button', 'riep__gruppo__testa');
    testa.appendChild(el('span', 'riep__gruppo__nome', nome || '—'));
    testa.appendChild(el('span', 'riep__gruppo__n', conteggio(n)));
    r.appendChild(testa);

    /* Senza nomi non c'e' niente da aprire: la riga resta una riga. */
    if (!nomi || !nomi.length) {
      testa.disabled = true;
      testa.classList.add('riep__gruppo__testa--ferma');
      return r;
    }

    var elenco = elencoNomi(nomi);
    rendiApribile(testa, elenco);
    r.appendChild(elenco);
    return r;
  }

  function persone(n) {
    return String(n) === '1' ? 'persona' : 'persone';
  }

  /* ------------------------------------------------------------- disegno */

  function disegnaRiepilogo(r) {
    riepCorpo.textContent = '';

    /* Da qui in poi c’e' qualcosa da portarsi via: la stampa e l'Excel
       lavorano su questa risposta, senza richiamare il server. */
    ultimoRiepilogo = r;
    preparaCarta(r);
    esportabile(true);

    var pres = r.presentati || {};
    var pre = r.preiscritti || {};

    /* --- intestazione: evento, data, luogo --- */
    var pezzi = [];
    if (testo(r.nome_evento)) pezzi.push(testo(r.nome_evento));
    if (testo(r.data_evento)) pezzi.push(dataLunga(r.data_evento));
    if (testo(r.luogo)) pezzi.push(testo(r.luogo));
    riepEvento.textContent = pezzi.join(' · ');
    riepAggiornato.textContent = testo(r.aggiornato)
      ? 'Aggiornato alle ' + testo(r.aggiornato)
      : 'Il server non ha indicato l’ora dei conteggi.';

    /* --- cruscotto: i tre numeri che si guardano di continuo --- */
    var cruscotto = el('div', 'riep__cruscotto');
    cruscotto.appendChild(numerone(conteggio(pres.persone), 'Persone presentate'));
    cruscotto.appendChild(numerone(
      euroCorto(pres.incasso_reale),
      'Incasso reale',
      'atteso: ' + euroCorto(pres.incasso_atteso),
      'riep__numerone--soldi'
    ));
    cruscotto.appendChild(numerone(conteggio(pres.kit_consegnati), 'Kit consegnati'));
    riepCorpo.appendChild(cruscotto);

    /* --- premiazione: la ragione per cui questa pagina viene aperta --- */
    var premi = riepSezione('Premiazione', 'riep__premiazione');
    var grigliaPremi = el('div', 'riep__premi');
    [
      ['Più anziana', 'F', pres.piu_anziana_f],
      ['Più giovane', 'F', pres.piu_giovane_f],
      ['Più anziano', 'M', pres.piu_anziano_m],
      ['Più giovane', 'M', pres.piu_giovane_m]
    ].forEach(function (p) {
      var dati = premiato(p[2]);
      var vuoto = dati.nome === '—';
      var carta = el('div', 'riep__premio' + (vuoto ? ' riep__premio--vuoto' : ''));
      var et = el('p', 'riep__premio__voce');
      et.appendChild(document.createTextNode(p[0] + ' '));
      et.appendChild(el('span', 'riep__premio__sesso', p[1]));
      carta.appendChild(et);
      carta.appendChild(el('p', 'riep__premio__nome', dati.nome));
      carta.appendChild(el('p', 'riep__premio__data',
        vuoto ? 'nessun presentato' : (dati.data || '')));
      grigliaPremi.appendChild(carta);
    });
    premi.appendChild(grigliaPremi);
    riepCorpo.appendChild(premi);

    /* --- gruppi presentati: podio e coda --- */
    var gruppiPres = coppieGruppi(pres.per_gruppo);
    var premiabili = gruppiPres.filter(function (g) { return !g.senza; });
    var mucchio = gruppiPres.filter(function (g) { return g.senza; });

    var podio = riepSezione('Gruppi presentati', 'riep__gruppi');
    if (!premiabili.length) {
      podio.appendChild(el('p', 'riep__vuoto', 'Nessun gruppo fra i presentati.'));
    } else {
      /* Lista ordinata: l'ordine di lettura e' gia' la classifica, e la
         grandezza decrescente fa il resto. Niente 2-1-3 da palco: su un
         telefono in verticale quella disposizione si legge al contrario. */
      var primi = premiabili.slice(0, 3);
      var tre = el('ol', 'riep__podio riep__podio--' + primi.length);
      primi.forEach(function (g, i) {
        var posto = el('li', 'riep__posto riep__posto--' + (i + 1));
        /* Tutta la card e' il bottone: sul telefono si prende col pollice
           senza mirare. */
        var testa = el('button', 'riep__posto__testa');
        testa.appendChild(el('span', 'riep__posto__rango', (i + 1) + '°'));
        testa.appendChild(el('span', 'riep__posto__nome', g.nome || '—'));
        var quanti = el('span', 'riep__posto__n');
        quanti.appendChild(el('strong', null, conteggio(g.n)));
        quanti.appendChild(document.createTextNode(' ' + persone(g.n)));
        testa.appendChild(quanti);
        posto.appendChild(testa);

        if (g.nomi && g.nomi.length) {
          var elenco = elencoNomi(g.nomi);
          rendiApribile(testa, elenco);
          posto.appendChild(elenco);
        } else {
          testa.disabled = true;
          testa.classList.add('riep__posto__testa--ferma');
        }
        tre.appendChild(posto);
      });
      podio.appendChild(tre);

      var resto = premiabili.slice(3);
      if (resto.length) {
        var lista = el('ul', 'riep__gruppi-lista');
        resto.forEach(function (g) {
          lista.appendChild(rigaGruppo(g.nome, g.n, g.nomi));
        });
        podio.appendChild(lista);
      }
    }

    /* Il mucchio senza gruppo resta visibile, ma in coda e dichiarato: da
       solo sarebbe quasi sempre il numero piu' alto della lista, e sul podio
       non ci va perche' non e' un gruppo. */
    if (mucchio.length) {
      var coda = el('ul', 'riep__gruppi-lista riep__gruppi-lista--coda');
      mucchio.forEach(function (g) {
        coda.appendChild(rigaGruppo('Senza gruppo', g.n, g.nomi, 'riep__gruppo--senza'));
      });
      podio.appendChild(coda);
      podio.appendChild(el('p', 'riep__nota',
        'Chi non ha scelto un gruppo non concorre al premio del gruppo più numeroso.'));
    }
    riepCorpo.appendChild(podio);

    /* --- dettaglio dei presentati --- */
    var dettaglio = riepSezione('Dettaglio presentati', 'riep__dettaglio');
    var dati = el('dl', 'riep__dati');
    dati.appendChild(datoPiccolo('Femmine', conteggio(pres.femmine)));
    dati.appendChild(datoPiccolo('Maschi', conteggio(pres.maschi)));
    dati.appendChild(datoPiccolo('Interi', conteggio(pres.interi)));
    dati.appendChild(datoPiccolo('Ridotti', conteggio(pres.ridotti)));
    dati.appendChild(datoPiccolo('Gratis adulti', conteggio(pres.gratis_adulti)));
    dati.appendChild(datoPiccolo('Bambini gratis', conteggio(pres.bambini)));
    dettaglio.appendChild(dati);
    riepCorpo.appendChild(dettaglio);

    /* --- pre-iscritti: contesto, non protagonista --- */
    var contesto = riepSezione('Pre-iscritti online', 'riep__contesto');
    contesto.appendChild(el('p', 'riep__nota',
      'Quanti erano attesi. I numeri della giornata sono quelli sopra.'));

    var datiPre = el('dl', 'riep__dati riep__dati--piccoli');
    datiPre.appendChild(datoPiccolo('Prenotazioni attive', conteggio(pre.prenotazioni_attive)));
    datiPre.appendChild(datoPiccolo('Partecipanti attivi', conteggio(pre.partecipanti_attivi)));
    datiPre.appendChild(datoPiccolo('Paganti', conteggio(pre.paganti)));
    datiPre.appendChild(datoPiccolo('Gratis', conteggio(pre.gratis)));
    datiPre.appendChild(datoPiccolo('Femmine', conteggio(pre.femmine)));
    datiPre.appendChild(datoPiccolo('Maschi', conteggio(pre.maschi)));
    var anziano = premiato(pre.piu_anziano);
    var giovane = premiato(pre.piu_giovane);
    datiPre.appendChild(datoPiccolo('Più anziano',
      anziano.nome + (anziano.data ? ' (' + anziano.data + ')' : '')));
    datiPre.appendChild(datoPiccolo('Più giovane',
      giovane.nome + (giovane.data ? ' (' + giovane.data + ')' : '')));
    contesto.appendChild(datiPre);

    var gruppiPre = coppieGruppi(pre.per_gruppo);
    if (gruppiPre.length) {
      contesto.appendChild(el('p', 'riep__sotto-titolo', 'Gruppi pre-iscritti'));
      /* Anche qui il mucchio senza gruppo scende in fondo: in cima sarebbe
         il numero piu' alto della lista senza essere un gruppo. */
      var ordinati = gruppiPre.filter(function (g) { return !g.senza; })
        .concat(gruppiPre.filter(function (g) { return g.senza; }));
      var listaPre = el('ul', 'riep__gruppi-lista');
      ordinati.forEach(function (g) {
        listaPre.appendChild(rigaGruppo(
          g.senza ? 'Senza gruppo' : g.nome,
          g.n,
          g.nomi,
          g.senza ? 'riep__gruppo--senza' : null
        ));
      });
      contesto.appendChild(listaPre);
    }
    riepCorpo.appendChild(contesto);
  }

  /* ------------------------------------------------------------ chiamata */

  function caricaRiepilogo() {
    if (inCorso) return;

    var token = leggiToken();
    if (!token || scaduta()) {
      mostraAccesso('Sessione scaduta, rifai l’accesso.');
      return;
    }

    /* Si svuota PRIMA della chiamata: durante l'attesa non deve restare a
       schermo il conteggio di prima, che sembrerebbe quello nuovo. */
    riepAvviso.hidden = true;
    /* I numeri di prima non valgono piu': finche' non arrivano i nuovi non
       si stampa e non si esporta niente. */
    ultimoRiepilogo = null;
    esportabile(false);
    riepCorpo.textContent = '';
    riepEvento.textContent = '';
    riepAggiornato.textContent = '';
    riepCorpo.appendChild(el('p', 'riep__attesa', 'Sto leggendo i conteggi…'));
    occupato(riepAggiornaBtn, true, 'Aggiorno…', 'Aggiorna');

    API.chiama('gestRiepilogo', { token: token })
      .then(function (r) {
        disegnaRiepilogo(r);
      })
      .catch(function (e) {
        if (e.codice === 'NON_AUTORIZZATO') {
          mostraAccesso('Sessione scaduta, rifai l’accesso.');
          return;
        }
        riepCorpo.textContent = '';
        riepAvvisoTesto.textContent = messaggioDiRete(e) +
          ' I conteggi non sono stati letti: premi Aggiorna per riprovare.';
        riepAvviso.hidden = false;
      })
      .finally(function () {
        occupato(riepAggiornaBtn, false, 'Aggiorno…', 'Aggiorna');
      });
  }

  function mostraRiepilogo() {
    ricerca.hidden = true;
    /* Uscendo dalla ricerca la fotocamera non resta accesa: una anteprima
       viva sotto un'altra schermata e' solo una spia accesa in tasca. */
    fermaScanner();
    if (sezioneNuova) sezioneNuova.hidden = true;
    sezioneRiepilogo.hidden = false;
    caricaRiepilogo();
  }

  if (apriRiepilogoBtn) apriRiepilogoBtn.addEventListener('click', mostraRiepilogo);
  if (riepAggiornaBtn) riepAggiornaBtn.addEventListener('click', caricaRiepilogo);
  if (riepIndietroBtn) riepIndietroBtn.addEventListener('click', mostraRicerca);

  /* =================================================================== */
  /* RICERCA PER NOME                                                    */
  /*                                                                     */
  /* Chi ha perso il codice ha sempre il proprio nome. Si digita e la     */
  /* lista si rifa' da sola, ma con una pausa: Apps Script e' lento e una */
  /* chiamata per tasto lo intaserebbe senza rendere niente. Parte una    */
  /* sola richiesta quando le dita si fermano, e le risposte arrivate     */
  /* fuori ordine si buttano.                                            */
  /*                                                                     */
  /* Cliccare un risultato non apre una scheda nuova: rimette il codice   */
  /* nel campo e passa per cercaCodice, la stessa strada del QR e del     */
  /* codice battuto a mano.                                              */
  /* =================================================================== */

  var campoNome = document.getElementById('nome-q');
  var statoNome = document.getElementById('nome-stato');
  var boxRisultati = document.getElementById('nome-risultati');

  var ATTESA_NOME = 350;
  var MINIMO_NOME = 3;

  var timerNome = null;
  /* L'ultima domanda a cui c'e' gia' una risposta a schermo: ribatterla
     identica non merita un'altra chiamata. */
  var ultimaNome = '';
  /* Numero di turno: se l'operatore continua a digitare, la risposta della
     richiesta precedente arriva quando non serve piu' e va scartata,
     altrimenti a schermo finisce l'elenco della parola di prima. */
  var turnoNome = 0;

  function diciNome(messaggio) {
    statoNome.textContent = messaggio;
    statoNome.hidden = false;
  }

  function svuotaRisultatiNome() {
    if (timerNome) { clearTimeout(timerNome); timerNome = null; }
    turnoNome++;
    ultimaNome = '';
    if (campoNome) campoNome.value = '';
    if (boxRisultati) boxRisultati.textContent = '';
    if (statoNome) statoNome.hidden = true;
  }

  function digitatoNome() {
    var q = campoNome.value.trim();
    if (timerNome) { clearTimeout(timerNome); timerNome = null; }

    if (q.length < MINIMO_NOME) {
      /* Qui il server non si chiama: la risposta la sappiamo gia'. Il turno
         avanza lo stesso, cosi' una richiesta ancora in volo non riempie la
         lista dopo che il campo e' stato cancellato. */
      turnoNome++;
      ultimaNome = '';
      boxRisultati.textContent = '';
      if (q.length) diciNome('Scrivi almeno 3 lettere.');
      else statoNome.hidden = true;
      return;
    }

    timerNome = setTimeout(function () {
      timerNome = null;
      cercaPerNome(q);
    }, ATTESA_NOME);
  }

  /* Volutamente fuori da occupato()/inCorso: e' una lettura che accompagna
     la digitazione, e bloccare il resto della schermata a ogni parola
     renderebbe la pagina inservibile. A tenere a bada le chiamate ci
     pensano la pausa e il numero di turno. */
  function cercaPerNome(q) {
    if (q === ultimaNome) return;

    var token = leggiToken();
    if (!token || scaduta()) {
      mostraAccesso('Sessione scaduta, rifai l’accesso.');
      return;
    }

    var mio = ++turnoNome;
    ultimaNome = q;
    diciNome('Cerco…');

    API.chiama('gestCercaNome', { token: token, q: q })
      .then(function (r) {
        if (mio !== turnoNome) return;
        disegnaRisultatiNome(r);
      })
      .catch(function (e) {
        if (mio !== turnoNome) return;
        if (e.codice === 'NON_AUTORIZZATO') {
          mostraAccesso('Sessione scaduta, rifai l’accesso.');
          return;
        }
        /* Un errore non e' una risposta: la stessa parola deve poter essere
           ritentata, quindi non resta segnata come gia' cercata. */
        ultimaNome = '';
        boxRisultati.textContent = '';
        diciNome(messaggioDiRete(e));
      });
  }

  function disegnaRisultatiNome(r) {
    boxRisultati.textContent = '';

    if (r.troppo_corto) {
      diciNome('Scrivi almeno 3 lettere.');
      return;
    }

    var lista = Array.isArray(r.risultati) ? r.risultati : [];
    if (!lista.length) {
      diciNome('Nessuna prenotazione trovata.');
      return;
    }
    statoNome.hidden = true;

    var ul = el('ul', 'risultati');
    lista.forEach(function (v) { ul.appendChild(rigaRisultato(v)); });
    boxRisultati.appendChild(ul);

    /* Il server ne manda al massimo otto: dirlo e' meglio che lasciar
       credere che gli altri non esistano. */
    if (r.troncato) {
      boxRisultati.appendChild(el('p', 'risultati__nota',
        'Ci sono altri risultati, aggiungi il cognome per restringere.'));
    }
  }

  function rigaRisultato(v) {
    var li = el('li', 'risultati__voce');
    var annullata = vero(v.annullata);

    var b = el('button', 'risultato' + (annullata ? ' risultato--annullata' : ''));
    b.type = 'button';

    var testa = el('span', 'risultato__testa');
    testa.appendChild(el('span', 'risultato__nome', testo(v.riferimento) || '—'));
    testa.appendChild(el('span', 'risultato__codice', testo(v.codice) || '—'));
    b.appendChild(testa);

    var meta = el('span', 'risultato__meta');
    if (testo(v.gruppo)) meta.appendChild(el('span', 'risultato__gruppo', testo(v.gruppo)));
    meta.appendChild(el('span', 'risultato__n',
      conteggio(v.n_partecipanti) + ' ' + persone(v.n_partecipanti)));

    /* Uno stato solo per riga, quello che conta: annullata batte tutto. */
    if (annullata) {
      meta.appendChild(el('span', 'segno segno--annullata', 'annullata'));
    } else if (vero(v.presentata)) {
      meta.appendChild(el('span', 'segno segno--registrato', 'già registrato'));
    }
    b.appendChild(meta);

    /* Anche le annullate si aprono, ma la scheda per quelle e' in sola
       lettura: niente tariffe, niente bottone Registra. Impedirne del tutto
       l'apertura toglierebbe all'operatore l'unico modo di spiegare alla
       persona davanti a lui che cosa e' successo. */
    b.addEventListener('click', function () {
      scriviCodiceNelCampo(v.codice);
      cercaCodice(codiceDalCampo());
    });

    li.appendChild(b);
    return li;
  }

  if (campoNome) campoNome.addEventListener('input', digitatoNome);

  /* =================================================================== */
  /* SCANNER QR                                                          */
  /*                                                                     */
  /* Il QR contiene il codice e basta (PR-XXXX, testo puro). Appena letto */
  /* la fotocamera si spegne e si riparte dalla stessa cercaCodice delle  */
  /* altre due strade.                                                   */
  /*                                                                     */
  /* La camera si accende solo al tocco del bottone: Safari su iPhone non */
  /* la concede senza un gesto, e accenderla al caricamento sarebbe       */
  /* comunque sbagliato su una pagina che sta aperta tutta la mattina.    */
  /* =================================================================== */

  var LIBRERIA_QR =
    'https://cdnjs.cloudflare.com/ajax/libs/html5-qrcode/2.3.8/html5-qrcode.min.js';

  var apriScannerBtn = document.getElementById('apri-scanner');
  var chiudiScannerBtn = document.getElementById('chiudi-scanner');
  var scanner = document.getElementById('scanner');
  var scannerNota = document.getElementById('scanner-nota');
  var scannerAvviso = document.getElementById('scanner-avviso');
  var scannerAvvisoTesto = document.getElementById('scanner-avviso-testo');

  var lettore = null;
  var scansioneAttiva = false;
  var promessaLibreria = null;

  /* La libreria si scarica una volta sola, e si comincia appena la
     schermata di ricerca compare: al momento del tocco e' gia' in cache e
     resta da accendere solo la camera. Se il CDN non risponde non succede
     niente finche' qualcuno non preme il bottone, e li' si vede il
     messaggio. */
  function caricaLibreria() {
    if (window.Html5Qrcode) return Promise.resolve();
    if (promessaLibreria) return promessaLibreria;

    promessaLibreria = new Promise(function (ok, ko) {
      var s = document.createElement('script');
      s.src = LIBRERIA_QR;
      s.async = true;
      s.onload = function () {
        if (window.Html5Qrcode) ok();
        else { promessaLibreria = null; ko(new Error('LIBRERIA')); }
      };
      s.onerror = function () {
        promessaLibreria = null;
        ko(new Error('LIBRERIA'));
      };
      document.head.appendChild(s);
    });
    return promessaLibreria;
  }

  function avvisaScanner(e) {
    var nome = (e && (e.name || e.message)) || '';
    var messaggio = 'Fotocamera non disponibile, digita il codice qui sotto.';
    if (/NotAllowed|Permission|Denied/i.test(nome)) {
      messaggio = 'Permesso fotocamera negato. Digita il codice qui sotto, ' +
                  'oppure consenti la fotocamera nelle impostazioni del browser.';
    } else if (/LIBRERIA/.test(nome)) {
      messaggio = 'Lo scanner non si è caricato (connessione?). ' +
                  'Digita il codice qui sotto.';
    }
    scannerAvvisoTesto.textContent = messaggio;
    scannerAvviso.hidden = false;
  }

  /* Spegnere davvero la camera conta: su iPhone un'anteprima lasciata viva
     tiene la spia accesa e consuma batteria anche a riquadro nascosto. */
  function fermaScanner() {
    scansioneAttiva = false;
    if (scanner) scanner.hidden = true;
    if (!lettore) return;

    var l = lettore;
    lettore = null;
    try {
      var f = l.stop();
      if (f && f.then) {
        f.then(function () { try { l.clear(); } catch (e) { /* gia' pulito */ } },
               function () { /* non era in funzione */ });
      }
    } catch (e) { /* mai partita: niente da spegnere */ }
  }

  function codiceLetto(letto) {
    /* Il lettore continua a chiamare finche' il QR resta inquadrato: dopo il
       primo colpo qui non si rientra. */
    if (!scansioneAttiva) return;

    var grezzo = testo(letto).toUpperCase().replace(/\s+/g, '');
    /* Oggi il QR porta il solo codice. Se un domani ci finisse dentro un
       indirizzo, si prende comunque il pezzo che somiglia a un codice invece
       di mandare al server una riga che codice non e'. */
    var m = /PR-?[A-Z0-9]+/.exec(grezzo);
    if (m) grezzo = m[0];

    fermaScanner();
    /* Stessa normalizzazione del campo: il codice passa di li' e torna
       indietro in forma canonica, senza una seconda regola da tenere
       allineata. */
    scriviCodiceNelCampo(grezzo);
    cercaCodice(codiceDalCampo());
  }

  function apriScanner() {
    if (scansioneAttiva) return;
    scannerAvviso.hidden = true;

    /* Senza getUserMedia (browser vecchio, o pagina non in HTTPS) non si
       accende niente: si dice e si lascia lavorare il resto. */
    if (!(navigator.mediaDevices &&
          typeof navigator.mediaDevices.getUserMedia === 'function')) {
      avvisaScanner(new Error('NoCamera'));
      return;
    }

    scanner.hidden = false;
    scansioneAttiva = true;
    scannerNota.textContent = 'Accendo la fotocamera…';

    caricaLibreria()
      .then(function () {
        if (!scansioneAttiva) return null;   /* chiuso mentre caricava */
        lettore = new window.Html5Qrcode('scanner-vista');
        return lettore.start(
          /* La posteriore: il QR sta sul telefono di chi e' dall'altra parte
             del banco, non sulla faccia dell'operatore. */
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 240, height: 240 } },
          codiceLetto,
          function () { /* fotogramma senza QR: non e' un errore */ }
        );
      })
      .then(function () {
        if (scansioneAttiva) scannerNota.textContent = 'Inquadra il QR della prenotazione.';
      })
      .catch(function (e) {
        fermaScanner();
        avvisaScanner(e);
      });
  }

  if (apriScannerBtn) apriScannerBtn.addEventListener('click', apriScanner);
  if (chiudiScannerBtn) chiudiScannerBtn.addEventListener('click', fermaScanner);
  /* Pagina chiusa o mandata in fondo: la camera non resta accesa. */
  window.addEventListener('pagehide', fermaScanner);

  /* =================================================================== */
  /* ESPORTAZIONI DEL RIEPILOGO                                          */
  /*                                                                     */
  /* Due modi di portarsi via gli stessi numeri: un foglio da appendere  */
  /* o da allegare a un verbale (stampa), e un file che l'associazione   */
  /* puo' riaprire e rimaneggiare (Excel).                               */
  /*                                                                     */
  /* Nessuno dei due richiama il server: lavorano sull'ultima risposta   */
  /* gia' ricevuta. Se quella non c'e' — pagina appena aperta, chiamata  */
  /* fallita — i bottoni restano spenti, perche' non si esporta un       */
  /* foglio vuoto ne' i numeri di dieci minuti fa spacciati per adesso.  */
  /*                                                                     */
  /* Nemmeno uno dei due stampa l'elenco nome per nome: al microfono e   */
  /* in un allegato servono i totali, non l'anagrafica di 105 persone.   */
  /* =================================================================== */

  var stampaBtn = document.getElementById('riepilogo-stampa');
  var excelBtn = document.getElementById('riepilogo-excel');
  var stampaEvento = document.getElementById('stampa-evento');
  var stampaQuando = document.getElementById('stampa-quando');
  var stampaAggiornato = document.getElementById('stampa-aggiornato');

  /* L'ultima risposta buona di gestRiepilogo, esattamente com'e' arrivata. */
  var ultimoRiepilogo = null;

  function esportabile(si) {
    if (stampaBtn) stampaBtn.disabled = !si;
    if (excelBtn) excelBtn.disabled = !si;
  }

  /* La carta intestata della stampa: gli stessi tre dati dell'occhiello a
     schermo, ma su righe separate come si conviene a un documento. */
  function preparaCarta(r) {
    stampaEvento.textContent = testo(r.nome_evento) || 'Passeggiata in Rosa';
    var quando = [];
    if (testo(r.data_evento)) quando.push(dataLunga(r.data_evento));
    if (testo(r.luogo)) quando.push(testo(r.luogo));
    stampaQuando.textContent = quando.join(' · ');
    stampaAggiornato.textContent = testo(r.aggiornato)
      ? 'Riepilogo aggiornato alle ' + testo(r.aggiornato)
      : '';
  }

  /* ------------------------------------------------------------- stampa */

  /* Tutto il lavoro lo fa il foglio di stile: @media print rifa' la pagina
     come documento e nasconde barra, bottoni e sezioni non stampabili. Qui
     resta solo l'ordine di stampare. */
  function stampaRiepilogo() {
    if (!ultimoRiepilogo) return;
    window.print();
  }

  /* -------------------------------------------------------------- excel */

  var LIBRERIA_XLSX =
    'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
  var promessaXlsx = null;

  /* Come per lo scanner: la libreria si scarica la prima volta che serve
     davvero, non a ogni apertura della pagina. */
  function caricaXlsx() {
    if (window.XLSX) return Promise.resolve();
    if (promessaXlsx) return promessaXlsx;

    promessaXlsx = new Promise(function (ok, ko) {
      var s = document.createElement('script');
      s.src = LIBRERIA_XLSX;
      s.async = true;
      s.onload = function () {
        if (window.XLSX) ok();
        else { promessaXlsx = null; ko(new Error('LIBRERIA')); }
      };
      s.onerror = function () { promessaXlsx = null; ko(new Error('LIBRERIA')); };
      document.head.appendChild(s);
    });
    return promessaXlsx;
  }

  /* Nel foglio di calcolo un numero deve restare un numero, o l'associazione
     non ci puo' fare una somma. Se il campo non e' un numero la cella resta
     vuota: meglio un buco che uno zero inventato. */
  function numeroCella(v) {
    var n = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.'));
    return isNaN(n) ? null : n;
  }

  function righeGruppi(lista) {
    var righe = [];
    var g = coppieGruppi(lista);
    /* Stesso ordine della pagina: prima i gruppi veri, il mucchio senza
       gruppo in fondo e col suo nome per esteso. */
    g.filter(function (x) { return !x.senza; })
      .forEach(function (x) { righe.push([x.nome, numeroCella(x.n)]); });
    g.filter(function (x) { return x.senza; })
      .forEach(function (x) { righe.push(['Senza gruppo', numeroCella(x.n)]); });
    return righe;
  }

  function foglioRiepilogo(r) {
    var pres = r.presentati || {};
    var pre = r.preiscritti || {};
    var righe = [];

    righe.push([testo(r.nome_evento) || 'Passeggiata in Rosa']);
    righe.push([dataLunga(r.data_evento)]);
    if (testo(r.luogo)) righe.push([testo(r.luogo)]);
    if (testo(r.aggiornato)) righe.push(['Aggiornato alle ' + testo(r.aggiornato)]);
    righe.push([]);

    righe.push(['PRESENTATI']);
    righe.push(['Persone presentate', numeroCella(pres.persone)]);
    righe.push(['Incasso reale (€)', numeroCella(pres.incasso_reale)]);
    righe.push(['Incasso atteso (€)', numeroCella(pres.incasso_atteso)]);
    righe.push(['Kit consegnati', numeroCella(pres.kit_consegnati)]);
    righe.push(['Femmine', numeroCella(pres.femmine)]);
    righe.push(['Maschi', numeroCella(pres.maschi)]);
    righe.push(['Interi', numeroCella(pres.interi)]);
    righe.push(['Ridotti', numeroCella(pres.ridotti)]);
    righe.push(['Gratis adulti', numeroCella(pres.gratis_adulti)]);
    righe.push(['Bambini gratis', numeroCella(pres.bambini)]);
    righe.push([]);

    /* I premiati restano la stringa del server, nome e data insieme: in una
       cella e' la forma piu' comoda da leggere e da incollare altrove. */
    righe.push(['PREMIAZIONE']);
    righe.push(['Più anziana (F)', testo(pres.piu_anziana_f) || '—']);
    righe.push(['Più giovane (F)', testo(pres.piu_giovane_f) || '—']);
    righe.push(['Più anziano (M)', testo(pres.piu_anziano_m) || '—']);
    righe.push(['Più giovane (M)', testo(pres.piu_giovane_m) || '—']);
    righe.push([]);

    righe.push(['GRUPPI PRESENTATI']);
    righe.push(['Gruppo', 'Persone']);
    righe = righe.concat(righeGruppi(pres.per_gruppo));
    righe.push([]);

    righe.push(['PRE-ISCRITTI ONLINE']);
    righe.push(['Prenotazioni attive', numeroCella(pre.prenotazioni_attive)]);
    righe.push(['Partecipanti attivi', numeroCella(pre.partecipanti_attivi)]);
    righe.push(['Paganti', numeroCella(pre.paganti)]);
    righe.push(['Gratis', numeroCella(pre.gratis)]);
    righe.push(['Femmine', numeroCella(pre.femmine)]);
    righe.push(['Maschi', numeroCella(pre.maschi)]);
    righe.push(['Più anziano', testo(pre.piu_anziano) || '—']);
    righe.push(['Più giovane', testo(pre.piu_giovane) || '—']);
    righe.push([]);
    righe.push(['GRUPPI PRE-ISCRITTI']);
    righe.push(['Gruppo', 'Persone']);
    righe = righe.concat(righeGruppi(pre.per_gruppo));

    return righe;
  }

  /* Il nome porta la data dell'evento: fra due anni, in una cartella con
     dentro sei riepiloghi, e' l'unica cosa che li distingue. */
  function nomeFile(r) {
    var d = testo(r.data_evento);
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d);
    return 'riepilogo-passeggiata-in-rosa-' +
      (m ? m[1] + '-' + m[2] + '-' + m[3] : 'senza-data') + '.xlsx';
  }

  function scaricaExcel() {
    if (!ultimoRiepilogo || excelBtn.disabled) return;
    var r = ultimoRiepilogo;

    riepAvviso.hidden = true;
    occupato(excelBtn, true, 'Preparo…', 'Excel');

    caricaXlsx()
      .then(function () {
        var foglio = window.XLSX.utils.aoa_to_sheet(foglioRiepilogo(r));
        /* Due colonne larghe abbastanza da leggere le etichette senza
           allargarle a mano a ogni apertura. */
        foglio['!cols'] = [{ wch: 28 }, { wch: 22 }];
        var cartella = window.XLSX.utils.book_new();
        window.XLSX.utils.book_append_sheet(cartella, foglio, 'Riepilogo');
        window.XLSX.writeFile(cartella, nomeFile(r));
      })
      .catch(function () {
        riepAvvisoTesto.textContent =
          'Non sono riuscito a preparare il file Excel (connessione?). ' +
          'La stampa funziona lo stesso.';
        riepAvviso.hidden = false;
      })
      .finally(function () {
        occupato(excelBtn, false, 'Preparo…', 'Excel');
        /* occupato() riaccende il bottone solo se ci sono ancora dati. */
        esportabile(!!ultimoRiepilogo);
      });
  }

  if (stampaBtn) stampaBtn.addEventListener('click', stampaRiepilogo);
  if (excelBtn) excelBtn.addEventListener('click', scaricaExcel);

  /* =================================================================== */
  /* RISCALDAMENTO DEL BACKEND                                           */
  /*                                                                     */
  /* Apps Script, se non lo si chiama da un po', si riaddormenta: la     */
  /* prima chiamata dopo la pausa puo' metterci diversi secondi. Al      */
  /* banco quella pausa finisce sempre addosso alla persona sbagliata —  */
  /* la prima della coda, con dietro venti persone che aspettano.        */
  /*                                                                     */
  /* Quindi appena si entra si fa una chiamata leggera, e poi una ogni   */
  /* cinque minuti di silenzio. Sono chiamate che per chi guarda lo      */
  /* schermo non esistono: non bloccano niente, non scrivono niente, e   */
  /* se falliscono non lo dicono a nessuno. Un riscaldamento che si fa   */
  /* notare ha gia' fallito: l'operatore si fiderebbe meno di un errore  */
  /* vero, visto che ne vede uno ogni cinque minuti.                     */
  /* =================================================================== */

  var CALDO_OGNI = 5 * 60 * 1000;
  var CONTROLLO_OGNI = 60 * 1000;
  var timerCaldo = null;
  var ultimoContatto = 0;

  /* Le chiamate vere tengono sveglio il server da sole: sapere quando sono
     successe evita di aggiungere traffico mentre si sta gia' lavorando.
     L'involucro sta qui e non dentro api.js perche' riguarda questa pagina
     soltanto: il sito pubblico non ha niente da scaldare. */
  var chiamaDiretta = API.chiama;
  API.chiama = function (azione, dati, opz) {
    ultimoContatto = Date.now();
    return chiamaDiretta.call(API, azione, dati, opz);
  };

  /* getSquadre e' la piu' leggera che abbiamo e non tocca niente: legge un
     foglio di poche righe. Del risultato qui non importa nulla. */
  function scaldaOra() {
    API.chiama('getSquadre', {}).catch(function () {
      /* Silenzio voluto. Se il riscaldamento non riesce non e' successo
         niente che l'operatore debba sapere: a dire come sta la rete sara'
         la prima operazione vera, che un errore ce l'ha gia'. */
    });
  }

  function forseScalda() {
    /* Sessione chiusa: non c'e' piu' nessuno da servire. */
    if (!leggiToken() || scaduta()) return;
    /* Pagina in secondo piano o schermo spento: si dorme insieme al banco. */
    if (document.hidden) return;
    /* Si e' parlato col server da poco: e' gia' caldo. */
    if (Date.now() - ultimoContatto < CALDO_OGNI) return;
    scaldaOra();
  }

  /* La prima scaldata la fa caricaGruppi: e' la stessa getSquadre, ma il suo
     risultato serve davvero al modulo di nuova iscrizione. Cosi' la lista
     dei gruppi e' gia' in casa quando l'operatore apre il form, invece di
     caricarsi proprio mentre lui aspetta. */
  function accendiRiscaldamento() {
    caricaGruppi();
    if (timerCaldo) return;
    timerCaldo = setInterval(forseScalda, CONTROLLO_OGNI);
  }

  function spegniRiscaldamento() {
    if (!timerCaldo) return;
    clearInterval(timerCaldo);
    timerCaldo = null;
  }

  /* ---------------------------------------------------------- avvio */

  /* Un ricaricamento della pagina non deve rifare l'accesso se la scheda
     della sessione e' ancora aperta in questa finestra. */
  if (leggiToken() && !scaduta()) {
    mostraRicerca();
    accendiRiscaldamento();
  } else {
    mostraAccesso();
  }
})();
