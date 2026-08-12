/* =========================================================================
   sponsor.js — arricchisce le tessere sponsor con i dati di legenda.csv.

   La griglia esiste gia' nell'HTML: funziona anche senza questo script e
   senza il file legenda.csv (testo alternativo generico, nessun nome nella
   lightbox). Qui si aggiungono solo il nome vero e l'eventuale sito.

   Formato di sponsor/legenda.csv, una riga per logo:
     cartella/file.png = Nome Azienda | https://sito.it
   Il sito dopo la barra e' facoltativo.

   Nota: il click su una tessera apre solo l'ingrandimento del logo. Il
   sito dello sponsor, anche se presente nel CSV, non viene usato: senza
   una legenda compilata sarebbe un link che non porta da nessuna parte.
   ========================================================================= */

(function () {
  'use strict';

  var tessere = document.querySelectorAll('[data-sorgente]');
  if (!tessere.length) return;

  // Cache-buster: la legenda si aggiorna a mano, non deve restare in cache.
  fetch('/sponsor/legenda.csv?_=' + Date.now(), { cache: 'no-store' })
    .then(function (r) {
      if (!r.ok) throw new Error('legenda assente');
      return r.text();
    })
    .then(function (testo) {
      var legenda = analizza(testo);
      if (!Object.keys(legenda).length) return;
      tessere.forEach(function (t) {
        applica(t, legenda[normalizza(t.getAttribute('data-sorgente'))]);
      });
    })
    .catch(function () {
      /* Nessuna legenda: va bene cosi', la griglia resta com'e'. */
    });

  function normalizza(p) {
    return String(p).trim().replace(/^\.?\//, '').toLowerCase();
  }

  function analizza(testo) {
    var mappa = {};
    testo.split(/\r?\n/).forEach(function (riga) {
      riga = riga.trim();
      if (!riga || riga.charAt(0) === '#') return;

      var taglio = riga.indexOf('=');
      if (taglio < 0) return;

      var percorso = normalizza(riga.slice(0, taglio));
      var resto = riga.slice(taglio + 1).trim();
      if (!percorso || !resto) return;

      var barra = resto.indexOf('|');
      var nome = (barra < 0 ? resto : resto.slice(0, barra)).trim();
      var url = barra < 0 ? '' : resto.slice(barra + 1).trim();

      // Solo http/https: un href preso da un file di testo non deve poter
      // diventare javascript: o data:.
      if (url && !/^https?:\/\//i.test(url)) url = '';
      if (nome) mappa[percorso] = { nome: nome, url: url };
    });
    return mappa;
  }

  function applica(tessera, voce) {
    if (!voce) return;
    var img = tessera.querySelector('img');
    if (img) img.alt = 'Logo ' + voce.nome;
    tessera.setAttribute('data-nome', voce.nome);
    // Il sito dello sponsor non viene usato: la tessera apre solo
    // l'ingrandimento del logo. La colonna resta nel CSV per il futuro.
  }
})();
