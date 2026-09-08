/* =========================================================================
   cassa.js — banco del giorno evento, primo passo: entrare e cercare.

   Questa pagina LEGGE e basta. Non registra arrivi, non incassa, non
   consegna kit: quelle sono scritture e arrivano dopo. Finche' non ci sono,
   non deve esserci nemmeno un bottone che le prometta.

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
    } catch (e) { /* niente da rimuovere */ }
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

  /* Riceve la risposta intera di gestCerca, che ha questa forma:
       { ok, trovata, prenotazione: {...}, partecipanti: [...] }
     La testata e i totali stanno in "prenotazione", l'elenco e' una chiave
     sorella. Tenerli separati qui e' l'unico punto in cui il contratto va
     rispettato: sbagliarlo svuota la lista senza dare errore. */
  function disegnaScheda(r) {
    var p = r.prenotazione || {};

    scheda.textContent = '';

    /* --- stati: prima di tutto il resto --- */
    var stati = el('div', 'stati');

    if (vero(p.annullata)) {
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
    /* Dalla risposta, non dalla prenotazione. Se manca o e' vuoto va bene
       cosi': le iscrizioni fatte al banco senza nominativi non hanno righe
       da mostrare, e "nessun partecipante" li' e' la verita', non un errore. */
    var elenco = Array.isArray(r.partecipanti) ? r.partecipanti : [];
    var sezElenco = el('div', 'scheda-p__sezione');
    sezElenco.appendChild(el('p', 'scheda-p__etichetta', 'Partecipanti'));

    if (!elenco.length) {
      sezElenco.appendChild(el('p', 'tenue', 'Nessun partecipante in elenco.'));
    } else {
      var ul = el('ul', 'elenco-p');
      elenco.forEach(function (q, i) {
        var li = el('li', 'elenco-p__voce');
        li.appendChild(el('span', 'elenco-p__numero', String(i + 1) + '.'));

        var nome = (testo(q.nome) + ' ' + testo(q.cognome)).trim();
        li.appendChild(el('span', 'elenco-p__nome', nome || '—'));

        var meta = [];
        var nascita = dataIt(q.data_nascita);
        if (nascita) meta.push(nascita);
        if (testo(q.sesso)) meta.push(testo(q.sesso));
        if (meta.length) li.appendChild(el('span', 'elenco-p__meta', meta.join(' · ')));

        /* "gratis" solo quando il server lo dice: un'eta' calcolata qui
           sarebbe una seconda verita' che prima o poi diverge. */
        if (String(q.pagante).toUpperCase() === 'NO') {
          li.appendChild(el('span', 'pillola pillola--gratis', 'gratis'));
        }

        ul.appendChild(li);
      });
      sezElenco.appendChild(ul);
    }
    scheda.appendChild(sezElenco);

    /* --- conti --- */
    var sezConti = el('div', 'scheda-p__sezione');
    var conti = el('div', 'conti');

    var dovuto = el('div', 'conti__voce');
    dovuto.appendChild(el('p', 'conti__etichetta', 'Totale dovuto'));
    dovuto.appendChild(el('p', 'conti__cifra', euro(p.totale_dovuto)));
    conti.appendChild(dovuto);

    var pagato = el('div', 'conti__voce conti__voce--pagato');
    pagato.appendChild(el('p', 'conti__etichetta', 'Già pagato'));
    pagato.appendChild(el('p', 'conti__cifra', euro(p.totale_pagato)));
    conti.appendChild(pagato);

    sezConti.appendChild(conti);
    scheda.appendChild(sezConti);

    /* --- azioni: in questo passo ce n'e' una sola --- */
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

  /* ---------------------------------------------------------- avvio */

  /* Un ricaricamento della pagina non deve rifare l'accesso se la scheda
     della sessione e' ancora aperta in questa finestra. */
  if (leggiToken() && !scaduta()) {
    mostraRicerca();
  } else {
    mostraAccesso();
  }
})();
