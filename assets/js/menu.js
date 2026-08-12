/* =========================================================================
   menu.js — navigazione mobile a tutta pagina.

   Stessa impostazione della lightbox: <dialog> + showModal(). Il browser
   mette top layer, trappola del fuoco, inertizzazione del resto della
   pagina e chiusura con Esc; qui restano solo apertura, chiusura e il
   ritorno del fuoco al bottone.

   Il bottone del menu e' nascosto dal CSS e viene mostrato solo quando
   questo file gira e <dialog> esiste: un bottone che non apre nulla
   sarebbe peggio di nessun bottone.
   ========================================================================= */

(function () {
  'use strict';

  var menu = document.querySelector('dialog.menu');
  var bottone = document.querySelector('.menu-bottone');
  if (!menu || !bottone || typeof menu.showModal !== 'function') return;

  document.documentElement.classList.add('js-menu');

  var chiudiBtn = menu.querySelector('.menu__chiudi');
  var scorrimento = 0;

  bottone.addEventListener('click', apri);
  chiudiBtn.addEventListener('click', chiudi);

  // Esc: lo gestiamo noi, cosi' la chiusura passa sempre dallo stesso punto
  // e lo sblocco dello scorrimento non dipende dall'evento 'close'.
  menu.addEventListener('keydown', function (ev) {
    if (ev.key !== 'Escape') return;
    ev.preventDefault();
    chiudi();
  });

  menu.addEventListener('click', function (ev) {
    // Tap fuori dal pannello: con <dialog> il bersaglio e' il dialog stesso.
    if (ev.target === menu) { chiudi(); return; }

    var link = ev.target.closest('a[href]');
    if (!link) return;

    var meta = link.getAttribute('href');
    chiudi();

    // Per le ancore interne il salto va fatto DOPO la chiusura, altrimenti
    // avverrebbe mentre il dialog copre ancora tutto e non si vedrebbe.
    if (meta.charAt(0) === '#') {
      ev.preventDefault();
      setTimeout(function () { location.hash = meta; }, 0);
    }
  });

  // Rete di sicurezza per qualunque altra via di chiusura.
  menu.addEventListener('close', ripristina);

  function apri() {
    scorrimento = window.scrollY;
    document.documentElement.style.scrollBehavior = 'auto';
    document.documentElement.style.overflow = 'hidden';
    bottone.setAttribute('aria-expanded', 'true');
    menu.showModal();
  }

  function chiudi() {
    if (menu.open) menu.close();
    ripristina();
    bottone.focus();
  }

  // Idempotente: chiamarla due volte non fa danni.
  function ripristina() {
    bottone.setAttribute('aria-expanded', 'false');
    if (document.documentElement.style.overflow !== 'hidden') return;
    document.documentElement.style.overflow = '';
    window.scrollTo(0, scorrimento);
    document.documentElement.style.scrollBehavior = '';
  }
})();
