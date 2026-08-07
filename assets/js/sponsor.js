/* =========================================================================
   sponsor.js — arricchisce la griglia sponsor con i dati di legenda.csv.

   La griglia esiste gia' nell'HTML: funziona anche senza questo script e
   senza il file legenda.csv (alt generico, tessere non cliccabili). Qui si
   aggiungono solo il nome vero e l'eventuale link, quando ci sono.

   Formato di sponsor/legenda.csv, una riga per logo:
     cartella/file.png = Nome Azienda | https://sito.it
   Il sito dopo la barra e' facoltativo.
   ========================================================================= */

(function () {
  'use strict';

  var tessere = document.querySelectorAll('[data-sorgente]');
  if (!tessere.length) return;

  // Cache-buster: la legenda viene aggiornata a mano, non deve restare
  // in cache dopo una modifica.
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

      // Accetto solo http/https: un href arbitrario preso da un file di
      // testo non deve poter diventare javascript: o data:.
      if (url && !/^https?:\/\//i.test(url)) url = '';
      if (nome) mappa[percorso] = { nome: nome, url: url };
    });
    return mappa;
  }

  function applica(tessera, voce) {
    if (!voce) return;

    var img = tessera.querySelector('img');
    if (img) img.alt = 'Logo ' + voce.nome;

    if (!voce.url || tessera.tagName === 'A') return;

    var a = document.createElement('a');
    a.href = voce.url;
    a.className = tessera.className;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.title = voce.nome + ' — apre in una nuova scheda';
    a.setAttribute('data-sorgente', tessera.getAttribute('data-sorgente'));
    while (tessera.firstChild) a.appendChild(tessera.firstChild);
    tessera.parentNode.replaceChild(a, tessera);
  }
})();
