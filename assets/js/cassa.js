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
    ricerca.hidden = true;
    /* Anche il modulo di nuova iscrizione sparisce: alla schermata del PIN
       non deve restare a schermo un nome gia' battuto da qualcun altro. */
    if (sezioneNuova) sezioneNuova.hidden = true;
    esci.hidden = true;
    scheda.hidden = true;
    scheda.textContent = '';
    ricercaAvviso.hidden = true;
    codice.value = '';
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
    accessoAvviso.hidden = true;
    if (sezioneNuova) sezioneNuova.hidden = true;
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

  moduloRicerca.addEventListener('submit', function (ev) {
    ev.preventDefault();
    if (inCorso) return;

    var cod = codice.value.trim().toUpperCase();
    if (!cod) { codice.focus(); return; }

    var token = leggiToken();
    if (!token || scaduta()) {
      mostraAccesso('Sessione scaduta, rifai l’accesso.');
      return;
    }

    /* La scheda di prima sparisce PRIMA della chiamata: se la ricerca va
       male, non deve restare a schermo un risultato che non c'entra piu'
       col codice appena digitato. */
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
  });

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
    nuova.addEventListener('click', function () {
      scheda.hidden = true;
      scheda.textContent = '';
      ricercaAvviso.hidden = true;
      codice.value = '';
      codice.focus();
    });
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

  /* ---------------------------------------------------------- avvio */

  /* Un ricaricamento della pagina non deve rifare l'accesso se la scheda
     della sessione e' ancora aperta in questa finestra. */
  if (leggiToken() && !scaduta()) {
    mostraRicerca();
  } else {
    mostraAccesso();
  }
})();
