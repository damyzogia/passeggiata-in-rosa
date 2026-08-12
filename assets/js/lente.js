/* =========================================================================
   lente.js — lightbox riusabile, costruita su <dialog> nativo.

   PERCHE' <dialog> E NON UN DIV
   showModal() mette l'elemento nel "top layer": non puo' essere tagliato o
   spostato da overflow, transform o z-index degli antenati. In piu' il
   browser regala gratis backdrop, chiusura con Esc, trappola del fuoco e
   inertizzazione del resto della pagina. La versione precedente era un div
   reso overlay dal solo CSS, e chiamava focus() prima dell'apertura: il
   browser scrollava fino al bottone, e l'immagine finiva in fondo alla
   pagina, tagliata.

   COME SI AGGANCIA
   L'innesco e' un link all'immagine piena, marcato con data-lente:

     <a href="/percorso/immagine.jpg" data-lente
        data-nome="Didascalia"           (facoltativo)
        data-url="https://sito.it">      (facoltativo)

   Se <dialog> non esiste o il JavaScript non parte, il link resta un link:
   il visitatore apre l'immagine invece di trovare una pagina rotta.
   ========================================================================= */

(function () {
  'use strict';

  var lente = document.querySelector('dialog.lente');
  if (!lente || typeof lente.showModal !== 'function') return;

  var img = lente.querySelector('.lente__img');
  var didascalia = lente.querySelector('.lente__didascalia');
  var collegamento = lente.querySelector('.lente__link');
  var chiudi = lente.querySelector('.lente__chiudi');

  var scorrimento = 0;

  document.addEventListener('click', function (ev) {
    var innesco = ev.target.closest('[data-lente]');
    if (!innesco) return;

    var sorgente = innesco.getAttribute('href') || innesco.getAttribute('data-lente');
    if (!sorgente) return;

    // Solo ora togliamo il comportamento nativo del link: se qualcosa
    // fosse andato storto sopra, il link resta un link.
    ev.preventDefault();
    apri(innesco, sorgente);
  });

  // Tap sullo sfondo: con <dialog> il backdrop non e' un elemento, quindi
  // il bersaglio del click e' il dialog stesso.
  lente.addEventListener('click', function (ev) {
    if (ev.target === lente) chiudiLente();
  });

  chiudi.addEventListener('click', chiudiLente);

  // Esc: prendo io il controllo invece di lasciar fare al browser, cosi' la
  // chiusura passa sempre dallo stesso punto e lo sblocco dello scorrimento
  // non dipende dall'evento 'close'.
  lente.addEventListener('keydown', function (ev) {
    if (ev.key !== 'Escape') return;
    ev.preventDefault();
    chiudiLente();
  });

  // Rete di sicurezza: qualunque altra via di chiusura passa comunque di qui.
  lente.addEventListener('close', ripristina);

  function chiudiLente() {
    if (lente.open) lente.close();
    ripristina();
  }

  // Idempotente: chiamarla due volte non fa danni.
  function ripristina() {
    if (document.documentElement.style.overflow !== 'hidden') return;

    document.documentElement.style.overflow = '';
    // Prima si torna al punto giusto, POI si riattiva lo scorrimento fluido:
    // invertendo l'ordine il ritorno verrebbe animato e si vedrebbe la
    // pagina scorrere da sola.
    window.scrollTo(0, scorrimento);
    document.documentElement.style.scrollBehavior = '';

    img.removeAttribute('src');
    img.removeAttribute('width');
    img.removeAttribute('height');
    img.alt = '';
  }

  function apri(innesco, sorgente) {
    var nome = innesco.getAttribute('data-nome') || '';
    var url = innesco.getAttribute('data-url') || '';

    // Le proporzioni si prendono dalla miniatura, che e' gia' caricata: senza,
    // il riquadro nasce a dimensione zero e "scatta" alla misura giusta solo
    // quando l'immagine grande arriva.
    var miniatura = innesco.querySelector('img');
    if (miniatura && miniatura.naturalWidth) {
      img.width = miniatura.naturalWidth;
      img.height = miniatura.naturalHeight;
    }

    img.src = sorgente;
    img.alt = nome || 'Immagine ingrandita';

    didascalia.textContent = nome;
    didascalia.hidden = !nome;

    if (collegamento) {
      // Solo http/https: un indirizzo arbitrario non deve poter diventare
      // un href javascript:.
      var ammesso = /^https?:\/\//i.test(url);
      collegamento.hidden = !ammesso;
      if (ammesso) collegamento.href = url;
    }

    // Blocco dello scorrimento. Va fatto PRIMA di showModal(), altrimenti
    // il salto si vede. scrollBehavior a 'auto' evita che il ripristino
    // finale venga animato dallo scroll fluido della pagina.
    scorrimento = window.scrollY;
    document.documentElement.style.scrollBehavior = 'auto';
    document.documentElement.style.overflow = 'hidden';

    lente.showModal();
    // Nessun focus() manuale: showModal() sposta gia' il fuoco dentro il
    // dialog e lo mantiene lì.
  }
})();
