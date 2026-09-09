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
    return isNaN(q) ? 0 : q;
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

  /* Cio' che parte davvero: solo le righe non escluse. */
  function partecipantiPerInvio(ctx) {
    return ctx.righe
      .filter(function (riga) { return !riga.escluso; })
      .map(function (riga) {
        var q = {
          nome: testo(riga.nome),
          cognome: testo(riga.cognome),
          data_nascita: testo(riga.data_nascita),
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
    scheda.appendChild(sezionePartecipanti(ctx, annullata));

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

  function sezionePartecipanti(ctx, annullata) {
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
      ul.appendChild(costruisciRiga(ctx, riga, annullata, togliRiga, ctx.ricalcola));
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
        ul.appendChild(costruisciRiga(ctx, riga, false, togliRiga, ctx.ricalcola));
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

  function costruisciRiga(ctx, riga, annullata, togliRiga, ricalcola) {
    var li = el('li', 'elenco-p__voce persona-viva');
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
      campoNome.addEventListener('input', function () { riga.nome = campoNome.value; });
      riga.campoNome = campoNome;
      corpo.appendChild(campoNome);
    } else {
      var nome = (testo(riga.nome) + ' ' + testo(riga.cognome)).trim();
      corpo.appendChild(el('span', 'elenco-p__nome', nome || '—'));

      var meta = [];
      var nascita = dataIt(riga.data_nascita);
      if (nascita) meta.push(nascita);
      if (testo(riga.sesso)) meta.push(testo(riga.sesso));
      if (meta.length) corpo.appendChild(el('span', 'elenco-p__meta', meta.join(' · ')));
    }

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

    var riga = el('div', 'registra__riga');

    /* --- importo --- */
    var campo = el('div', 'campo');
    var etichetta = el('label', null, 'Incassato €');
    etichetta.htmlFor = 'incassato';
    campo.appendChild(etichetta);

    var incassato = document.createElement('input');
    incassato.type = 'text';
    incassato.id = 'incassato';
    incassato.className = 'cassa__importo';
    /* decimal, non numeric: servono la virgola e il punto. */
    incassato.setAttribute('inputmode', 'decimal');
    incassato.autocomplete = 'off';
    ctx.campoIncassato = incassato;

    /* Su una gia' registrata il campo parte da cio' che risulta incassato e
       ci resta: e' una cifra vera, non un suggerimento, e il ricalcolo
       della lista non deve sovrascriverla. */
    if (giaFatta) {
      incassato.value = importoCampo(p.totale_pagato);
      ctx.incassatoToccato = true;
    }

    campo.appendChild(incassato);

    var NOTA_NUOVA = 'Segue il totale dovuto. Cambialo se incassi una cifra diversa.';
    var NOTA_MANO = 'Scritto a mano: non cambia più da solo.';
    var NOTA_FATTA = 'Già registrato. Cambialo solo se stai correggendo.';
    var notaCampo = el('p', 'campo__nota', giaFatta ? NOTA_FATTA : NOTA_NUOVA);
    campo.appendChild(notaCampo);

    /* Il primo tocco a mano stacca il campo dal suggerimento, e la dicitura
       lo dice: da qui in poi quella cifra e' dell'operatore, non nostra. */
    incassato.addEventListener('input', function () {
      ctx.incassatoToccato = true;
      notaCampo.textContent = NOTA_MANO;
    });

    riga.appendChild(campo);

    /* --- kit --- */
    var kitEtichetta = el('label', 'interruttore');
    var kit = document.createElement('input');
    kit.type = 'checkbox';
    kit.id = 'kit';
    /* Su una prenotazione nuova il kit si consegna quasi sempre insieme al
       pagamento: parte spuntato, e chi fa l'eccezione lo toglie. Su una gia'
       registrata vince cio' che risulta salvato. */
    kit.checked = giaFatta
      ? String(p.kit_consegnato).toUpperCase() === 'SI'
      : true;
    kitEtichetta.appendChild(kit);
    kitEtichetta.appendChild(el('span', 'interruttore__testo', 'Kit consegnato'));
    riga.appendChild(kitEtichetta);

    sez.appendChild(riga);

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

  /* ---------------------------------------------------------- avvio */

  /* Un ricaricamento della pagina non deve rifare l'accesso se la scheda
     della sessione e' ancora aperta in questa finestra. */
  if (leggiToken() && !scaduta()) {
    mostraRicerca();
  } else {
    mostraAccesso();
  }
})();
