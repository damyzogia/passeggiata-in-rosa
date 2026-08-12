/* =========================================================================
   modulo.js — pezzi comuni a iscrizione e modifica: elenco partecipanti,
   chip dei gruppi, calcolo del totale, validazione e messaggi.

   Qui non si parla con il server: quello lo fa api.js. Qui si costruisce
   e si legge il modulo, e basta.
   ========================================================================= */

window.Modulo = (function () {
  'use strict';

  var QUOTA = 8;
  /* Gratis i bambini fino a 6 anni compiuti: nati dal 14/09/2019 in poi,
     cioe' chi il giorno della camminata non ha ancora compiuto 7 anni. */
  var NATI_GRATIS_DA = '2019-09-14';

  function euro(n) {
    return n.toLocaleString('it-IT', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0 });
  }

  function eGratis(dataNascita) {
    return !!dataNascita && dataNascita >= NATI_GRATIS_DA;
  }


  /* :has() copre la quasi totalita dei browser, ma un chip che non mostra di
     essere selezionato bloccherebbe la compilazione su un telefono vecchio.
     La classe e la cintura di sicurezza. */
  function segnaScelti(radice) {
    radice.querySelectorAll(".chip input").forEach(function (i) {
      var etichetta = i.closest(".chip");
      if (etichetta) etichetta.classList.toggle("chip--scelto", i.checked);
    });
  }

  document.addEventListener("change", function (ev) {
    if (ev.target.closest && ev.target.closest(".chip")) segnaScelti(document);
  });

  /* ------------------------------------------------------------------ conti */
  function conta(persone) {
    var gratis = 0;
    persone.forEach(function (p) { if (eGratis(p.data_nascita)) gratis++; });
    var paganti = persone.length - gratis;
    return {
      totali: persone.length,
      gratis: gratis,
      paganti: paganti,
      importo: paganti * QUOTA
    };
  }

  function descriviTotale(c) {
    var pezzi = [c.totali + (c.totali === 1 ? ' partecipante' : ' partecipanti')];
    if (c.gratis > 0) pezzi.push(c.gratis + (c.gratis === 1 ? ' gratis' : ' gratis'));
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
      if (dopo) { var n = dopo.querySelector('input'); if (n) n.focus(); }
    });
  }

  Partecipanti.prototype.aggiungi = function (dati) {
    var nodo = this.modello.content.firstElementChild.cloneNode(true);
    var indice = this.contenitore.querySelectorAll('.persona').length;

    // I gruppi di radio del sesso devono avere un name diverso per persona,
    // altrimenti selezionarne uno deseleziona quello della persona prima.
    nodo.querySelectorAll('input[type="radio"]').forEach(function (r) {
      r.name = 'sesso-' + indice + '-' + Math.random().toString(16).slice(2, 8);
    });

    if (dati) {
      var v = function (sel, val) { var c = nodo.querySelector(sel); if (c && val) c.value = val; };
      v('[data-campo="nome"]', dati.nome);
      v('[data-campo="cognome"]', dati.cognome);
      v('[data-campo="data_nascita"]', dati.data_nascita);
      if (dati.sesso) {
        var r = nodo.querySelector('[data-campo="sesso"][value="' + dati.sesso + '"]');
        if (r) r.checked = true;
      }
    }

    this.contenitore.appendChild(nodo);
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

      var data = p.querySelector('[data-campo="data_nascita"]');
      var etichetta = p.querySelector('.gratis');
      if (etichetta) etichetta.hidden = !(data && eGratis(data.value));
    });
  };

  Partecipanti.prototype.leggi = function () {
    var fuori = [];
    this.contenitore.querySelectorAll('.persona').forEach(function (p) {
      var val = function (sel) { var c = p.querySelector(sel); return c ? c.value.trim() : ''; };
      var sesso = p.querySelector('[data-campo="sesso"]:checked');
      fuori.push({
        nome: val('[data-campo="nome"]'),
        cognome: val('[data-campo="cognome"]'),
        data_nascita: val('[data-campo="data_nascita"]'),
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
      controlla('[data-campo="data_nascita"]', 'Manca la data di nascita.');

      var data = p.querySelector('[data-campo="data_nascita"]');
      if (data && data.value && data.value > oggi) {
        mostraErroreCampo(data, 'La data di nascita non puo’ essere nel futuro.');
        if (!primo) primo = data;
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

    // Un gruppo che arriva da una prenotazione ma non e' fra le squadre note
    // va comunque mostrato, altrimenti salvando lo si perderebbe.
    if (selezionata && !this.contenitore.querySelector('input[value="' + CSS.escape(selezionata) + '"]')) {
      this.contenitore.insertAdjacentHTML('beforeend', this.chip(selezionata, selezionata, true));
    }
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
    segnaScelti: segnaScelti,
    mostraErroreCampo: mostraErroreCampo,
    pulisciErrori: pulisciErrori,
    Partecipanti: Partecipanti,
    Gruppi: Gruppi
  };
})();
