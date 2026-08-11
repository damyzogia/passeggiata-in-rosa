/* =========================================================================
   sito.js — comportamenti della landing e della pagina sponsor.

   Regole di casa:
   - la pagina deve funzionare ed essere leggibile anche senza questo file:
     qui si aggiunge solo movimento e comodita', mai contenuto;
   - prefers-reduced-motion viene rispettato ovunque;
   - niente localStorage.
   ========================================================================= */

(function () {
  'use strict';

  var motoRidotto = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ------------------------------------------------ 1. Ombra dell'intestazione */
  var testata = document.querySelector('.intestazione');
  if (testata) {
    var aggiornaTestata = function () {
      testata.classList.toggle('intestazione--staccata', window.scrollY > 8);
    };
    aggiornaTestata();
    window.addEventListener('scroll', aggiornaTestata, { passive: true });
  }

  /* ------------------------------------------------ 2. Rivelazione allo scroll */
  var daRivelare = document.querySelectorAll('[data-rivela]');

  if (!('IntersectionObserver' in window) || motoRidotto) {
    // Senza osservatore o con movimento ridotto: tutto visibile subito.
    daRivelare.forEach(function (e) { e.classList.add('e-visibile'); });
  } else {
    var osservatore = new IntersectionObserver(
      function (voci) {
        voci.forEach(function (v) {
          if (!v.isIntersecting) return;
          v.target.classList.add('e-visibile');
          osservatore.unobserve(v.target);
        });
      },
      { rootMargin: '0px 0px -12% 0px', threshold: 0.08 }
    );

    daRivelare.forEach(function (e) {
      // Lo sfalsamento si dichiara nell'HTML con data-rivela="1", "2"...
      var passo = parseInt(e.getAttribute('data-rivela'), 10);
      if (passo > 0) e.style.setProperty('--ritardo', Math.min(passo, 8) * 85 + 'ms');
      osservatore.observe(e);
    });
  }

  /* ------------------------------------------------ 3. Contatori animati
     Il valore finale e' gia' scritto nell'HTML: se il JS non parte, o se il
     movimento e' ridotto, il numero resta quello giusto.                     */
  var cifre = document.querySelectorAll('[data-conta]');

  if (cifre.length && 'IntersectionObserver' in window && !motoRidotto) {
    var osservaCifre = new IntersectionObserver(
      function (voci) {
        voci.forEach(function (v) {
          if (!v.isIntersecting) return;
          anima(v.target);
          osservaCifre.unobserve(v.target);
        });
      },
      { threshold: 0.5 }
    );
    cifre.forEach(function (c) { osservaCifre.observe(c); });
  }

  function anima(el) {
    var meta = parseInt(el.getAttribute('data-conta'), 10);
    if (!isFinite(meta)) return;
    var testoFinale = el.textContent;
    var durata = 1400;
    var avvio = null;

    function passo(ora) {
      if (avvio === null) avvio = ora;
      var t = Math.min((ora - avvio) / durata, 1);
      // Decelerazione: parte veloce e si posa.
      var e = 1 - Math.pow(1 - t, 3);
      if (t < 1) {
        el.textContent = Math.round(meta * e).toLocaleString('it-IT');
        requestAnimationFrame(passo);
      } else {
        el.textContent = testoFinale;
      }
    }
    requestAnimationFrame(passo);
  }

  /* ------------------------------------------------ 4. Barra CTA in basso
     Compare quando l'hero esce di scena: nell'hero il bottone c'e' gia'.     */
  var barra = document.querySelector('.barra-pollice');
  var hero = document.querySelector('.hero');

  if (barra) {
    document.body.classList.add('con-barra-pollice');

    if (hero && 'IntersectionObserver' in window) {
      new IntersectionObserver(
        function (voci) {
          barra.classList.toggle('barra-pollice--visibile', !voci[0].isIntersecting);
        },
        { threshold: 0.12 }
      ).observe(hero);
    } else {
      barra.classList.add('barra-pollice--visibile');
    }
  }

  /* ------------------------------------------------ 5. Lightbox
     Usata sia dalla galleria sia dai loghi sponsor.                          */
  var lente = document.querySelector('.lente');
  if (!lente) return;

  var img = lente.querySelector('img');
  var didascalia = lente.querySelector('.lente__didascalia');
  var chiudi = lente.querySelector('.lente__chiudi');
  var collegamento = lente.querySelector('.lente__link');
  var chiHaAperto = null;

  document.addEventListener('click', function (ev) {
    var innesco = ev.target.closest('[data-lente]');
    if (innesco) { apri(innesco); return; }
    // Tap fuori dal telaio: chiude.
    if (lente.classList.contains('e-aperta') && !ev.target.closest('.lente__telaio')) chiudiLente();
  });

  chiudi.addEventListener('click', chiudiLente);

  document.addEventListener('keydown', function (ev) {
    if (!lente.classList.contains('e-aperta')) return;
    if (ev.key === 'Escape') { chiudiLente(); return; }
    // Trappola del fuoco: dentro la lente ci sono al massimo due comandi.
    if (ev.key === 'Tab') {
      var fuocabili = [chiudi].concat(
        collegamento && collegamento.hidden === false ? [collegamento] : []
      );
      var i = fuocabili.indexOf(document.activeElement);
      ev.preventDefault();
      var prossimo = ev.shiftKey ? i - 1 : i + 1;
      if (prossimo < 0) prossimo = fuocabili.length - 1;
      if (prossimo >= fuocabili.length) prossimo = 0;
      fuocabili[prossimo].focus();
    }
  });

  function apri(innesco) {
    var sorgente = innesco.getAttribute('data-lente');
    if (!sorgente) return;

    chiHaAperto = innesco;
    img.src = sorgente;
    img.alt = innesco.getAttribute('data-nome') || 'Immagine ingrandita';

    var nome = innesco.getAttribute('data-nome');
    didascalia.textContent = nome || '';
    didascalia.hidden = !nome;

    var url = innesco.getAttribute('data-url');
    if (collegamento) {
      collegamento.hidden = !url;
      if (url) { collegamento.href = url; }
    }

    lente.classList.add('e-aperta');
    document.body.style.overflow = 'hidden';
    chiudi.focus();
  }

  function chiudiLente() {
    lente.classList.remove('e-aperta');
    document.body.style.overflow = '';
    img.removeAttribute('src');
    if (chiHaAperto) { chiHaAperto.focus(); chiHaAperto = null; }
  }
})();
