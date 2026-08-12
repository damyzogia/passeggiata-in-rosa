/* =========================================================================
   modifica.js — recupero e modifica di una pre-iscrizione esistente.

   Due tempi: prima si ritrova la prenotazione (email + data di nascita),
   poi si modifica lo stesso modulo dell'iscrizione, precompilato con quello
   che il server ha restituito. Nessun dato viene tenuto altrove: se si
   ricarica la pagina si ricomincia dall'accesso.
   ========================================================================= */

(function () {
  'use strict';

  var moduloAccesso = document.getElementById('modulo-accesso');
  if (!moduloAccesso) return;

  var accesso = document.getElementById('accesso');
  var scheda = document.getElementById('scheda');
  var accEmail = document.getElementById('acc-email');
  var accData = document.getElementById('acc-data');
  var accInvia = document.getElementById('acc-invia');
  var accAvviso = document.getElementById('acc-avviso');
  var accAvvisoTitolo = document.getElementById('acc-avviso-titolo');
  var accAvvisoTesto = document.getElementById('acc-avviso-testo');

  var moduloModifica = document.getElementById('modulo-modifica');
  var salva = document.getElementById('salva');
  var avvisoErrore = document.getElementById('avviso-errore');
  var erroreTesto = document.getElementById('errore-testo');
  var riprova = document.getElementById('riprova');

  /* Quello che il server ci ha dato: e' l'unica verita' su cui lavoriamo. */
  var prenotazione = null;
  var idSalvataggio = null;
  var inCorso = false;

  var persone = new Modulo.Partecipanti(
    document.getElementById('elenco-persone'),
    document.getElementById('modello-persona'),
    aggiornaTotale
  );

  var gruppi = new Modulo.Gruppi(
    document.getElementById('chip-gruppi'),
    document.getElementById('campo-nuovo-gruppo')
  );

  document.getElementById('aggiungi').addEventListener('click', function () {
    var nodo = persone.aggiungi();
    var primo = nodo.querySelector('input');
    if (primo) primo.focus();
  });

  function aggiornaTotale() {
    var c = Modulo.conta(persone.leggi());
    document.getElementById('totale-voce').textContent = Modulo.descriviTotale(c);
    document.getElementById('totale-cifra').textContent = Modulo.euro(c.importo);
  }

  /* ------------------------------------------------------------ accesso */
  moduloAccesso.addEventListener('submit', function (ev) {
    ev.preventDefault();
    if (inCorso) return;

    Modulo.pulisciErrori(moduloAccesso);
    accAvviso.hidden = true;

    var email = accEmail.value.trim().toLowerCase();
    var data = accData.value;
    var primoErrore = null;

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      Modulo.mostraErroreCampo(accEmail, 'Scrivi l’email con cui ti sei iscritto.');
      primoErrore = accEmail;
    }
    if (!data) {
      Modulo.mostraErroreCampo(accData, 'Serve la data di nascita.');
      if (!primoErrore) primoErrore = accData;
    }
    if (primoErrore) { primoErrore.focus(); return; }

    occupato(accInvia, true, 'Cerco…', 'Trova la mia iscrizione');

    API.chiama('caricaPerModifica', { email: email, data_nascita: data })
      .then(function (r) {
        prenotazione = r.prenotazione || r;
        mostraScheda(email, data);
      })
      .catch(function (e) {
        if (e.codice === 'NON_TROVATA') {
          accAvvisoTitolo.textContent = 'Non abbiamo trovato l’iscrizione';
          accAvvisoTesto.textContent =
            e.messaggio ||
            'Controlla l’email e la data di nascita: devono essere quelle usate al momento dell’iscrizione.';
        } else {
          accAvvisoTitolo.textContent = 'Non siamo riusciti a cercare';
          accAvvisoTesto.textContent =
            e.messaggio || 'Si è verificato un problema. Riprova fra qualche istante.';
        }
        accAvviso.hidden = false;
        accAvviso.scrollIntoView({ block: 'center' });
      })
      .finally(function () {
        occupato(accInvia, false, 'Cerco…', 'Trova la mia iscrizione');
      });
  });

  function mostraScheda(email, data) {
    prenotazione.email = prenotazione.email || email;
    prenotazione.data_nascita = prenotazione.data_nascita || data;

    document.getElementById('codice-trovato').textContent = prenotazione.codice || '—';

    var elenco = prenotazione.partecipanti || [];
    if (!elenco.length) elenco = [{}];
    elenco.forEach(function (p) { persone.aggiungi(p); });

    var squadra = prenotazione.squadra || '';
    gruppi.riempi([], squadra);
    API.chiama('getSquadre', {})
      .then(function (r) { gruppi.riempi(r.squadre || [], squadra); })
      .catch(function () { /* si resta con le sole voci di base */ });

    accesso.hidden = true;
    scheda.hidden = false;
    aggiornaTotale();
    scheda.scrollIntoView({ block: 'start' });
  }

  /* ---------------------------------------------------------- salvataggio */
  riprova.addEventListener('click', function () { moduloModifica.requestSubmit(); });

  moduloModifica.addEventListener('submit', function (ev) {
    ev.preventDefault();
    if (inCorso || !prenotazione) return;

    Modulo.pulisciErrori(moduloModifica);
    avvisoErrore.hidden = true;

    var primoErrore = persone.valida();
    if (primoErrore) {
      primoErrore.focus();
      primoErrore.scrollIntoView({ block: 'center' });
      return;
    }

    if (!idSalvataggio) idSalvataggio = API.nuovoId();

    var dati = {
      codice: prenotazione.codice,
      email: prenotazione.email,
      data_nascita: prenotazione.data_nascita,
      squadra: gruppi.leggi(),
      partecipanti: persone.leggi()
    };

    occupato(salva, true, 'Salvo…', 'Salva le modifiche');

    API.chiama('aggiornaPrenotazione', dati, { requestId: idSalvataggio })
      .then(function (r) {
        var c = Modulo.conta(dati.partecipanti);
        var q = new URLSearchParams({
          codice: r.codice || dati.codice,
          n: String(r.n_partecipanti != null ? r.n_partecipanti : c.totali),
          tot: String(r.totale_dovuto != null ? r.totale_dovuto : c.importo),
          email: r.email_inviata ? '1' : '0'
        });
        window.location.href = '/conferma-modifica.html?' + q.toString();
      })
      .catch(function (e) {
        occupato(salva, false, 'Salvo…', 'Salva le modifiche');
        erroreTesto.textContent =
          e.messaggio || 'Si è verificato un problema. Riprova fra qualche istante.';
        avvisoErrore.hidden = false;
        avvisoErrore.scrollIntoView({ block: 'center' });
      });
  });

  function occupato(bottone, si, testoAttesa, testoNormale) {
    inCorso = si;
    bottone.disabled = si;
    bottone.innerHTML = si
      ? '<span class="filatoio" aria-hidden="true"></span> ' + testoAttesa
      : testoNormale;
  }
})();
