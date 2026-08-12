/* =========================================================================
   attesa.js — velo di attesa sopra l'area coinvolta da una chiamata.

   Si usa quasi sempre con durante(), che lega il velo alla promessa: cosi'
   sparisce sia quando la risposta arriva sia quando la chiamata fallisce.
   Un velo che resta appeso e' peggio di nessun velo, perche' blocca la
   pagina senza spiegare perche'.

   Il velo e' chiaro, non nero: sopra un modulo bianco un fondo scuro
   sembrerebbe un errore. Con prefers-reduced-motion la rotella sparisce e
   resta il solo testo.
   ========================================================================= */

window.Attesa = (function () {
  'use strict';

  var TESTO = 'Attendi un attimo…';

  function mostra(host, testo) {
    if (!host || host.querySelector(':scope > .velo-attesa')) return;

    host.classList.add('in-attesa');
    host.setAttribute('aria-busy', 'true');

    var velo = document.createElement('div');
    velo.className = 'velo-attesa';
    /* Il testo va annunciato: chi usa un lettore di schermo non vede la
       rotella. */
    velo.setAttribute('role', 'status');
    velo.innerHTML =
      '<div class="velo-attesa__corpo">' +
      '<span class="velo-attesa__rotella" aria-hidden="true"></span>' +
      '<span class="velo-attesa__testo"></span>' +
      '</div>';
    velo.querySelector('.velo-attesa__testo').textContent = testo || TESTO;

    /* Su un modulo lungo il centro sta molto sotto la piega: chi ha appena
       toccato "invia" vedrebbe solo il velo, senza capire perche'. In quel
       caso il messaggio si aggancia alla vista invece che al centro. */
    if (host.getBoundingClientRect().height > window.innerHeight * 0.9) {
      velo.classList.add('velo-attesa--lungo');
    }

    host.appendChild(velo);

    /* Blocca anche la tastiera, non solo il tocco. Se inert non c'e', resta
       comunque il velo a fermare il puntatore. */
    if ('inert' in HTMLElement.prototype) {
      Array.prototype.forEach.call(host.children, function (figlio) {
        if (figlio !== velo) figlio.inert = true;
      });
    }
  }

  function nascondi(host) {
    if (!host) return;
    var velo = host.querySelector(':scope > .velo-attesa');

    if ('inert' in HTMLElement.prototype) {
      Array.prototype.forEach.call(host.children, function (figlio) {
        if (figlio !== velo) figlio.inert = false;
      });
    }

    if (velo) velo.remove();
    host.classList.remove('in-attesa');
    host.removeAttribute('aria-busy');
  }

  /* Il modo consigliato: il velo vive esattamente quanto la chiamata. */
  function durante(host, promessa, testo) {
    mostra(host, testo);
    return promessa.finally(function () { nascondi(host); });
  }

  return { mostra: mostra, nascondi: nascondi, durante: durante, TESTO: TESTO };
})();
