/* =========================================================================
   modulo.js — pezzi comuni a iscrizione e modifica: elenco partecipanti,
   chip dei gruppi, data di nascita a tre tendine, calcolo del totale,
   validazione e messaggi.

   Qui non si parla con il server: quello lo fa api.js. Qui si costruisce
   e si legge il modulo, e basta.
   ========================================================================= */

window.Modulo = (function () {
  'use strict';

  var QUOTA = 8;
  /* Gratis i bambini fino a 6 anni compiuti: nati dal 14/09/2019 in poi. */
  var NATI_GRATIS_DA = '2019-09-14';

  var MESI = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
    'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'];
  var ANNO_MAX = 2026;
  var ANNO_MIN = 1915;

  function due(n) { return (n < 10 ? '0' : '') + n; }

  function euro(n) {
    return n.toLocaleString('it-IT', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0 });
  }

  function eGratis(dataNascita) {
    return !!dataNascita && dataNascita >= NATI_GRATIS_DA;
  }

  /* :has() copre quasi tutti i browser, ma un chip che non mostra di essere
     selezionato bloccherebbe la compilazione su un telefono vecchio: la
     classe e' la cintura di sicurezza. */
  function segnaScelti(radice) {
    radice.querySelectorAll('.chip input').forEach(function (i) {
      var etichetta = i.closest('.chip');
      if (etichetta) etichetta.classList.toggle('chip--scelto', i.checked);
    });
  }

  document.addEventListener('change', function (ev) {
    if (ev.target.closest && ev.target.closest('.chip')) segnaScelti(document);
  });

  /* ------------------------------------------------------- data a tendine
     Tre menu invece del calendario: per chi ha 70 anni, scegliere "1948" da
     un elenco e' molto piu' semplice che navigare all'indietro fra i mesi. */

  function preparaData(box) {
    var g = box.querySelector('[data-campo="giorno"]');
    var m = box.querySelector('[data-campo="mese"]');
    var a = box.querySelector('[data-campo="anno"]');
    if (!g || !m || !a || g.getAttribute('data-pronto')) return;

    m.innerHTML = '<option value="">Mese</option>' +
      MESI.map(function (nome, i) { return '<option value="' + (i + 1) + '">' + nome + '</option>'; }).join('');

    var anni = '';
    for (var y = ANNO_MAX; y >= ANNO_MIN; y--) anni += '<option value="' + y + '">' + y + '</option>';
    a.innerHTML = '<option value="">Anno</option>' + anni;

    function rifaiGiorni() {
      var scelto = g.value;
      /* Senza anno si usa un anno bisestile, cosi' il 29 febbraio resta
         disponibile; quando l'anno arriva, l'elenco si corregge da solo. */
      var quanti = m.value ? new Date(Number(a.value) || 2024, Number(m.value), 0).getDate() : 31;
      var o = '<option value="">Giorno</option>';
      for (var d = 1; d <= quanti; d++) o += '<option value="' + d + '">' + d + '</option>';
      g.innerHTML = o;
      if (scelto && Number(scelto) <= quanti) g.value = scelto;
    }

    m.addEventListener('change', rifaiGiorni);
    a.addEventListener('change', rifaiGiorni);
    rifaiGiorni();
    g.setAttribute('data-pronto', '1');
  }

  /* Ritorna 'YYYY-MM-DD', oppure '' se anche solo una tendina e' vuota:
     mezza data non e' una data. */
  function leggiData(box) {
    var g = box.querySelector('[data-campo="giorno"]');
    var m = box.querySelector('[data-campo="mese"]');
    var a = box.querySelector('[data-campo="anno"]');
    if (!g || !m || !a) return '';
    if (!g.value || !m.value || !a.value) return '';
    return a.value + '-' + due(Number(m.value)) + '-' + due(Number(g.value));
  }

  function impostaData(box, iso) {
    if (!iso) return;
    var p = String(iso).slice(0, 10).split('-');
    if (p.length !== 3) return;
    var g = box.querySelector('[data-campo="giorno"]');
    var m = box.querySelector('[data-campo="mese"]');
    var a = box.querySelector('[data-campo="anno"]');
    if (!g || !m || !a) return;
    a.value = String(Number(p[0]));
    m.value = String(Number(p[1]));
    m.dispatchEvent(new Event('change', { bubbles: true }));
    g.value = String(Number(p[2]));
  }

  /* ------------------------------------------------------------------ conti */
  function conta(persone) {
    var gratis = 0;
    persone.forEach(function (p) { if (eGratis(p.data_nascita)) gratis++; });
    var paganti = persone.length - gratis;
    return { totali: persone.length, gratis: gratis, paganti: paganti, importo: paganti * QUOTA };
  }

  function descriviTotale(c) {
    var pezzi = [c.totali + (c.totali === 1 ? ' partecipante' : ' partecipanti')];
    if (c.gratis > 0) pezzi.push(c.gratis + ' gratis');
    return pezzi.join(' · ');
  }

  /* ------------------------------------------------------------- messaggi */
  function mostraErroreCampo(campo, testo) {
    var box = campo.closest('.campo') || campo.parentElement;
    var e = box.querySelector('.campo__errore');
    if (!e) return;
    e.textContent = testo;
    e.hidden = !testo;
    campo.setAttribute('aria-invalid', testo ? 'true' : 'false');
  }

  function pulisciErrori(radice) {
    radice.querySelectorAll('.campo__errore').forEach(function (e) { e.hidden = true; e.textContent = ''; });
    radice.querySelectorAll('[aria-invalid="true"]').forEach(function (c) { c.setAttribute('aria-invalid', 'false'); });
  }

  /* --------------------------------------------------------- partecipanti */
  function Partecipanti(contenitore, modello, alCambio) {
    var self = this;
    this.contenitore = contenitore;
    this.modello = modello;
    this.alCambio = alCambio || function () {};

    contenitore.addEventListener('input', function () { self.rinumera(); self.alCambio(); });
    contenitore.addEventListener('change', function () { self.rinumera(); self.alCambio(); });
    contenitore.addEventListener('click', function (ev) {
      var via = ev.target.closest('.persona__via');
      if (!via) return;
      ev.preventDefault();
      if (self.contenitore.querySelectorAll('.persona').length <= 1) return;
      var p = via.closest('.persona');
      var dopo = p.nextElementSibling || p.previousElementSibling;
      p.remove();
      self.rinumera();
      self.alCambio();
      if (dopo) { var n = dopo.querySelector('input, select'); if (n) n.focus(); }
    });
  }

  Partecipanti.prototype.aggiungi = function (dati) {
    var nodo = this.modello.content.firstElementChild.cloneNode(true);
    var indice = this.contenitore.querySelectorAll('.persona').length;

    /* Un name per gruppo di scelta e per persona.
       Il suffisso casuale va calcolato UNA volta sola: se lo si calcola
       dentro il ciclo, ogni radio finisce in un gruppo tutto suo e le due
       opzioni smettono di escludersi — si potrebbero spuntare insieme
       Femmina e Maschio, e nessuna delle due si potrebbe piu' togliere. */
    var suffisso = indice + '-' + Math.random().toString(16).slice(2, 8);
    nodo.querySelectorAll('input[type="radio"]').forEach(function (r) {
      var campo = r.getAttribute('data-campo') || 'r';
      r.name = campo + '-' + suffisso;
    });

    this.contenitore.appendChild(nodo);
    preparaData(nodo);

    if (dati) {
      var v = function (sel, val) { var c = nodo.querySelector(sel); if (c && val) c.value = val; };
      v('[data-campo="nome"]', dati.nome);
      v('[data-campo="cognome"]', dati.cognome);
      impostaData(nodo, dati.data_nascita);
      if (dati.sesso) {
        var r = nodo.querySelector('[data-campo="sesso"][value="' + dati.sesso + '"]');
        if (r) { r.checked = true; segnaScelti(nodo); }
      }
    }

    this.rinumera();
    this.alCambio();
    return nodo;
  };

  Partecipanti.prototype.rinumera = function () {
    var persone = this.contenitore.querySelectorAll('.persona');
    persone.forEach(function (p, i) {
      var titolo = p.querySelector('.persona__nome');
      if (titolo) titolo.textContent = i === 0 ? 'I tuoi dati' : 'Partecipante ' + (i + 1);

      var via = p.querySelector('.persona__via');
      if (via) via.hidden = persone.length <= 1;

      aggiornaPillola(p);
    });
  };

  /* La pillola compare SOLO a data completa: dire "gratis" senza sapere
     quando e' nata la persona sarebbe una bugia.

     La scelta "Adulto / Bambino" serve solo a far capire la regola: il
     prezzo lo decide sempre la data di nascita, come fa il backend. Se le
     due cose non concordano si avvisa e si segue la data. */
  function aggiornaPillola(p) {
    var pill = p.querySelector('[data-pillola]');
    var nota = p.querySelector('[data-nota-quota]');
    var data = leggiData(p);
    var scelto = p.querySelector('[data-campo="tipo"]:checked');

    if (!data) {
      if (pill) pill.hidden = true;
      if (nota) nota.hidden = true;
      return;
    }

    var gratis = eGratis(data);

    if (pill) {
      pill.hidden = false;
      pill.textContent = gratis ? 'Gratis' : euro(QUOTA);
      pill.classList.toggle('pillola--gratis', gratis);
      pill.classList.toggle('pillola--quota', !gratis);
    }

    /* La scelta Adulto/Bambino si allinea da sola alla data: lasciarla sul
       valore sbagliato con accanto un avviso che dice il contrario e' un
       modo sicuro per confondere. Qui l'interruttore segue il fatto. */
    var atteso = gratis ? 'bambino' : 'adulto';
    var giusto = p.querySelector('[data-campo="tipo"][value="' + atteso + '"]');
    var correzione = !!scelto && scelto.value !== atteso;

    if (giusto && !giusto.checked) {
      giusto.checked = true;
      segnaScelti(p);
    }

    /* L'avviso spiega perche' la scelta e' cambiata, e resta finche' resta
       quella data: senza memoria sparirebbe al primo tasto premuto altrove,
       prima ancora di essere letto. */
    if (correzione) p.setAttribute('data-corretto', data);
    else if (p.getAttribute('data-corretto') !== data) p.removeAttribute('data-corretto');

    if (nota) {
      var testo = p.getAttribute('data-corretto') === data
        ? (gratis ? 'Ha meno di 6 anni: iscrizione gratuita.' : 'Ha più di 6 anni: quota intera ' + euro(QUOTA) + '.')
        : '';
      nota.textContent = testo;
      nota.hidden = !testo;
    }
  }

  Partecipanti.prototype.leggi = function () {
    var fuori = [];
    this.contenitore.querySelectorAll('.persona').forEach(function (p) {
      var val = function (sel) { var c = p.querySelector(sel); return c ? c.value.trim() : ''; };
      var sesso = p.querySelector('[data-campo="sesso"]:checked');
      fuori.push({
        nome: val('[data-campo="nome"]'),
        cognome: val('[data-campo="cognome"]'),
        data_nascita: leggiData(p),
        sesso: sesso ? sesso.value : ''
      });
    });
    return fuori;
  };

  /* Ritorna il primo campo non valido, oppure null. Segnala tutto. */
  Partecipanti.prototype.valida = function () {
    var primo = null;
    var oggi = new Date().toISOString().slice(0, 10);

    this.contenitore.querySelectorAll('.persona').forEach(function (p) {
      var controlla = function (sel, testo) {
        var c = p.querySelector(sel);
        if (!c) return;
        var vuoto = !c.value.trim();
        mostraErroreCampo(c, vuoto ? testo : '');
        if (vuoto && !primo) primo = c;
      };
      controlla('[data-campo="nome"]', 'Manca il nome.');
      controlla('[data-campo="cognome"]', 'Manca il cognome.');

      var boxData = p.querySelector('[data-errore="nascita"]');
      var data = leggiData(p);
      if (boxData) {
        var testo = '';
        if (!data) testo = 'Scegli giorno, mese e anno di nascita.';
        else if (data > oggi) testo = 'La data di nascita non puo’ essere nel futuro.';
        boxData.textContent = testo;
        boxData.hidden = !testo;
        if (testo && !primo) primo = p.querySelector('[data-campo="giorno"]');
      }

      var sesso = p.querySelector('[data-campo="sesso"]:checked');
      var boxSesso = p.querySelector('[data-errore="sesso"]');
      if (boxSesso) {
        boxSesso.hidden = !!sesso;
        boxSesso.textContent = sesso ? '' : 'Scegli Femmina o Maschio.';
      }
      if (!sesso && !primo) primo = p.querySelector('[data-campo="sesso"]');
    });

    return primo;
  };

  /* -------------------------------------------------------------- gruppi */
  function Gruppi(contenitore, campoNuovo, alCambio) {
    this.contenitore = contenitore;
    this.campoNuovo = campoNuovo;
    var self = this;
    contenitore.addEventListener('change', function () {
      var scelto = contenitore.querySelector('input[name="gruppo"]:checked');
      var nuovo = scelto && scelto.value === '__nuovo__';
      self.campoNuovo.hidden = !nuovo;
      if (nuovo) self.campoNuovo.querySelector('input').focus();
      if (alCambio) alCambio();
    });
  }

  Gruppi.prototype.riempi = function (squadre, selezionata) {
    var html = '';
    html += this.chip('', 'Nessun gruppo', !selezionata);
    (squadre || []).forEach(function (s) {
      var nome = typeof s === 'string' ? s : (s.nome_squadra || s.nome || '');
      if (nome) html += this.chip(nome, nome, nome === selezionata);
    }, this);
    html += this.chip('__nuovo__', 'Crea nuovo gruppo', false);
    this.contenitore.innerHTML = html;

    /* Un gruppo che arriva da una prenotazione ma non e' fra le squadre note
       va comunque mostrato, altrimenti salvando lo si perderebbe. */
    var gia = this.contenitore.querySelector('input[value="' + String(selezionata).replace(/"/g, '\\"') + '"]');
    if (selezionata && !gia) {
      this.contenitore.insertAdjacentHTML('beforeend', this.chip(selezionata, selezionata, true));
    }
    segnaScelti(this.contenitore);
  };

  Gruppi.prototype.chip = function (valore, etichetta, scelto) {
    return (
      '<label class="chip"><input type="radio" name="gruppo" value="' +
      String(valore).replace(/"/g, '&quot;') + '"' + (scelto ? ' checked' : '') + '> ' +
      String(etichetta).replace(/</g, '&lt;') + '</label>'
    );
  };

  Gruppi.prototype.leggi = function () {
    var scelto = this.contenitore.querySelector('input[name="gruppo"]:checked');
    if (!scelto) return '';
    if (scelto.value === '__nuovo__') {
      var c = this.campoNuovo.querySelector('input');
      return c ? c.value.trim() : '';
    }
    return scelto.value;
  };

  return {
    QUOTA: QUOTA,
    NATI_GRATIS_DA: NATI_GRATIS_DA,
    euro: euro,
    eGratis: eGratis,
    conta: conta,
    descriviTotale: descriviTotale,
    preparaData: preparaData,
    leggiData: leggiData,
    impostaData: impostaData,
    segnaScelti: segnaScelti,
    aggiornaPillola: aggiornaPillola,
    mostraErroreCampo: mostraErroreCampo,
    pulisciErrori: pulisciErrori,
    Partecipanti: Partecipanti,
    Gruppi: Gruppi
  };
})();
