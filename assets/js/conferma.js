/* =========================================================================
   conferma.js — mostra l'esito che il server ha restituito.

   I valori arrivano nell'indirizzo perche' il sito non usa localStorage ne'
   sessionStorage: sono tutti dati che vengono dal server (codice, numero di
   partecipanti, importo), mai nomi o date di nascita. Cosi' la pagina si
   puo' ricaricare, salvare fra i preferiti e mostrare al banco.
   ========================================================================= */

(function () {
  'use strict';

  var radice = document.getElementById('conferma');
  if (!radice) return;

  var p = new URLSearchParams(window.location.search);
  var codice = (p.get('codice') || '').trim();
  var n = p.get('n');
  var tot = p.get('tot');
  var emailInviata = p.get('email') === '1';

  var senzaCodice = document.getElementById('senza-codice');

  if (!codice) {
    radice.hidden = true;
    if (senzaCodice) senzaCodice.hidden = false;
    return;
  }

  document.getElementById('codice').textContent = codice;

  /* --- QR --- */
  var contenitore = document.getElementById('qr');
  try {
    var qr = qrcode(0, 'M');
    qr.addData(codice);
    qr.make();
    contenitore.innerHTML = qr.createSvgTag({ cellSize: 6, margin: 0, scalable: true });
    var svg = contenitore.querySelector('svg');
    if (svg) {
      svg.setAttribute('role', 'img');
      svg.setAttribute('aria-label', 'Codice QR della prenotazione ' + codice);
    }
  } catch (e) {
    /* Se il QR non si genera, il codice scritto resta comunque valido: al
       banco possono cercarlo a mano. Meglio dirlo che lasciare un buco. */
    contenitore.innerHTML =
      '<p class="piccolo tenue">Non siamo riusciti a generare il codice QR. ' +
      'Mostra al banco il codice scritto qui sopra.</p>';
  }

  /* --- Riepilogo --- */
  var righe = document.getElementById('riepilogo');
  if (righe) {
    var voci = [];
    if (n) voci.push(['Partecipanti', n]);
    if (tot !== null && tot !== '') {
      var num = Number(tot);
      voci.push(['Totale da versare', isFinite(num)
        ? num.toLocaleString('it-IT', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0 })
        : tot]);
    }
    righe.innerHTML = voci
      .map(function (v) { return '<div><dt>' + v[0] + '</dt><dd>' + v[1] + '</dd></div>'; })
      .join('');
    righe.hidden = voci.length === 0;
  }

  /* --- Email --- */
  var avvisoEmail = document.getElementById('avviso-email');
  if (avvisoEmail) {
    avvisoEmail.textContent = emailInviata
      ? 'Ti abbiamo mandato un’email di conferma con questo codice.'
      : 'Non siamo riusciti a inviare l’email di conferma: conserva questa pagina o annota il codice.';
    avvisoEmail.hidden = false;
  }
})();
