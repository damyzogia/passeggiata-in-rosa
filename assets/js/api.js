/* =========================================================================
   api.js — unico punto di contatto con la Web App Apps Script.

   REGOLE DI CASA, tutte concentrate qui dentro cosi' non possono essere
   sbagliate a meta' progetto:

   - POST con Content-Type "text/plain;charset=utf-8". NON application/json:
     scatenerebbe la richiesta di preflight CORS, che Apps Script non gestisce.
   - request_id generato dal client e allegato a ogni chiamata. Se una
     scrittura viene ritentata, il chiamante DEVE riusare lo stesso id: e'
     cosi' che un doppio tocco o un singhiozzo di rete non creano doppioni.
   - il server e' l'unica verita': qui non si inventano risposte, non si
     ritenta da soli una scrittura e non si finge che sia andata bene.
   - timeout esplicito: senza, una rete che non risponde lascia il bottone
     bloccato per sempre.
   ========================================================================= */

window.API = (function () {
  'use strict';

  var INDIRIZZO =
    'https://script.google.com/macros/s/AKfycbzxtzaSxcJweIyyUX5i1MyU0hc0X3chlmxlWbgi4iJV1cTBHnSTnD6jdfEu__waES8/exec';

  var ATTESA_MAX = 30000;

  /* Identificativo di richiesta. crypto.randomUUID non c'e' ovunque, quindi
     c'e' un ripiego basato su valori casuali veri. */
  function nuovoId() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
      return window.crypto.randomUUID();
    }
    if (window.crypto && window.crypto.getRandomValues) {
      var b = new Uint8Array(16);
      window.crypto.getRandomValues(b);
      b[6] = (b[6] & 0x0f) | 0x40;
      b[8] = (b[8] & 0x3f) | 0x80;
      var s = [];
      for (var i = 0; i < 16; i++) s.push((b[i] + 0x100).toString(16).slice(1));
      return (
        s.slice(0, 4).join('') + '-' + s.slice(4, 6).join('') + '-' +
        s.slice(6, 8).join('') + '-' + s.slice(8, 10).join('') + '-' +
        s.slice(10, 16).join('')
      );
    }
    return 'id-' + Date.now() + '-' + Math.random().toString(16).slice(2);
  }

  /* Errore con un codice leggibile dal chiamante, per distinguere "la rete
     non va" da "il server dice di no". */
  function erroreApi(codice, messaggio) {
    var e = new Error(messaggio || codice);
    e.codice = codice;
    e.messaggio = messaggio || messaggio;
    return e;
  }

  var MESSAGGI = {
    RETE: 'Non riusciamo a contattare il server. Controlla la connessione e riprova.',
    TIMEOUT: 'Il server ci sta mettendo troppo. Riprova fra qualche istante.',
    RISPOSTA_ILLEGGIBILE: 'Il server ha risposto in modo inatteso. Riprova fra qualche istante.'
  };

  /**
   * Chiama una azione della Web App.
   * @param {string} azione
   * @param {object} dati    campi del payload (senza action)
   * @param {object} [opz]   { requestId } per ritentare la STESSA scrittura
   * @returns {Promise<object>} il corpo della risposta, con ok === true
   */
  function chiama(azione, dati, opz) {
    opz = opz || {};
    var corpo = Object.assign({}, dati || {}, {
      action: azione,
      request_id: opz.requestId || nuovoId()
    });

    var taglia = null;
    var segnale;
    if (typeof AbortController === 'function') {
      var ctrl = new AbortController();
      segnale = ctrl.signal;
      taglia = setTimeout(function () { ctrl.abort(); }, ATTESA_MAX);
    }

    return fetch(INDIRIZZO, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(corpo),
      signal: segnale
    })
      .catch(function (e) {
        if (e && e.name === 'AbortError') throw erroreApi('TIMEOUT', MESSAGGI.TIMEOUT);
        throw erroreApi('RETE', MESSAGGI.RETE);
      })
      .then(function (r) {
        return r.text().then(function (testo) {
          var corpoRisposta;
          try {
            corpoRisposta = JSON.parse(testo);
          } catch (e) {
            throw erroreApi('RISPOSTA_ILLEGGIBILE', MESSAGGI.RISPOSTA_ILLEGGIBILE);
          }
          if (!r.ok) {
            throw erroreApi('HTTP_' + r.status, corpoRisposta.messaggio || MESSAGGI.RISPOSTA_ILLEGGIBILE);
          }
          if (!corpoRisposta || corpoRisposta.ok !== true) {
            // Il server preferisce "messaggio" quando c'e' qualcosa da dire
            // a una persona; "error" e' il codice per noi.
            throw erroreApi(
              (corpoRisposta && corpoRisposta.error) || 'ERRORE',
              (corpoRisposta && corpoRisposta.messaggio) || null
            );
          }
          return corpoRisposta;
        });
      })
      .finally(function () {
        if (taglia) clearTimeout(taglia);
      });
  }

  return { chiama: chiama, nuovoId: nuovoId, indirizzo: INDIRIZZO };
})();
