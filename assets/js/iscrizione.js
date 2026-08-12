/* =========================================================================
   iscrizione.js — modulo di pre-iscrizione.

   Ordine voluto: prima l'email, perche' se la persona risulta gia' iscritta
   e' inutile farle compilare tutto il resto per poi dirle di no. Finche'
   l'email non e' nuova e valida, il resto del modulo resta chiuso.

   Il server e' l'unica verita': nessuno stato ottimistico, nessun codice
   inventato qui, e in caso di errore si torna indietro dicendolo.
   ========================================================================= */

(function () {
  'use strict';

  var modulo = document.getElementById('modulo');
  if (!modulo) return;

  var campoEmail = document.getElementById('email');
  var campoTelefono = document.getElementById('telefono');
  var resto = document.getElementById('resto');
  var avvisoEsiste = document.getElementById('avviso-esiste');
  var altraEmail = document.getElementById('altra-email');
  var avvisoErrore = document.getElementById('avviso-errore');
  var erroreTesto = document.getElementById('errore-testo');
  var riprova = document.getElementById('riprova');
  var invia = document.getElementById('invia');
  var erroreConsensi = document.getElementById('errore-consensi');

  var emailApprovata = '';
  var inCorso = false;
  /* Lo stesso identificativo viene riusato a ogni tentativo della STESSA
     iscrizione: se il primo invio e' arrivato ma la risposta si e' persa,
     il server riconosce il doppione invece di crearne un altro. */
  var idInvio = null;

  /* ------------------------------------------------------- partecipanti */
  var persone = new Modulo.Partecipanti(
    document.getElementById('elenco-persone'),
    document.getElementById('modello-persona'),
    aggiornaTotale
  );
  persone.aggiungi();

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
  aggiornaTotale();

  /* ------------------------------------------------------------ gruppi */
  var gruppi = new Modulo.Gruppi(
    document.getElementById('chip-gruppi'),
    document.getElementById('campo-nuovo-gruppo')
  );
  gruppi.riempi([], '');

  API.chiama('getSquadre', {})
    .then(function (r) { gruppi.riempi(r.squadre || [], ''); })
    .catch(function () {
      /* Senza elenco restano "Nessun gruppo" e "Crea nuovo gruppo": si puo'
         comunque completare l'iscrizione. */
    });

  /* ------------------------------------------------------------- email */
  campoEmail.addEventListener('blur', verificaEmail);
  campoEmail.addEventListener('input', function () {
    if (campoEmail.value.trim().toLowerCase() !== emailApprovata) chiudiModulo();
  });

  altraEmail.addEventListener('click', function () {
    campoEmail.value = '';
    chiudiModulo();
    campoEmail.focus();
  });

  function chiudiModulo() {
    emailApprovata = '';
    resto.disabled = true;
    avvisoEsiste.hidden = true;
  }

  function apriModulo(email) {
    emailApprovata = email;
    resto.disabled = false;
    avvisoEsiste.hidden = true;
  }

  function verificaEmail() {
    var email = campoEmail.value.trim().toLowerCase();
    Modulo.mostraErroreCampo(campoEmail, '');

    if (!email) return;
    if (email === emailApprovata) return;

    /* Controllo di forma prima di disturbare il server. */
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      Modulo.mostraErroreCampo(campoEmail, 'Questo indirizzo non sembra corretto.');
      chiudiModulo();
      return;
    }

    campoEmail.setAttribute('aria-busy', 'true');

    API.chiama('verificaEmail', { email: email })
      .then(function (r) {
        if (r.valida === false) {
          Modulo.mostraErroreCampo(campoEmail, 'Questo indirizzo non sembra corretto.');
          chiudiModulo();
          return;
        }
        if (r.esiste === true) {
          chiudiModulo();
          avvisoEsiste.hidden = false;
          avvisoEsiste.scrollIntoView({ block: 'nearest' });
          return;
        }
        apriModulo(email);
      })
      .catch(function (e) {
        /* Il controllo non e' riuscito: non si blocca la persona, ma non si
           finge nemmeno che sia andato bene. Il doppione lo intercetta
           comunque il server all'invio. */
        Modulo.mostraErroreCampo(
          campoEmail,
          e.messaggio || 'Non siamo riusciti a controllare l’email. Puoi proseguire.'
        );
        apriModulo(email);
      })
      .finally(function () {
        campoEmail.removeAttribute('aria-busy');
      });
  }

  /* -------------------------------------------------------------- invio */
  riprova.addEventListener('click', function () { modulo.requestSubmit(); });

  modulo.addEventListener('submit', function (ev) {
    ev.preventDefault();
    if (inCorso) return;

    Modulo.pulisciErrori(modulo);
    avvisoErrore.hidden = true;

    var primoErrore = persone.valida();

    var okReg = document.getElementById('consenso-regolamento').checked;
    var okFoto = document.getElementById('consenso-foto').checked;
    if (!okReg || !okFoto) {
      erroreConsensi.hidden = false;
      erroreConsensi.textContent = 'Servono entrambi i consensi per completare l’iscrizione.';
      if (!primoErrore) primoErrore = document.getElementById('consenso-regolamento');
    } else {
      erroreConsensi.hidden = true;
    }

    if (primoErrore) {
      primoErrore.focus();
      primoErrore.scrollIntoView({ block: 'center' });
      return;
    }

    if (!idInvio) idInvio = API.nuovoId();

    var dati = {
      email: emailApprovata || campoEmail.value.trim().toLowerCase(),
      telefono: campoTelefono.value.trim(),
      squadra: gruppi.leggi(),
      consenso_regolamento: true,
      consenso_foto: true,
      partecipanti: persone.leggi()
    };

    occupato(true);

    API.chiama('creaPrenotazione', dati, { requestId: idInvio })
      .then(function (r) {
        if (!r.codice) throw new Error('Risposta senza codice');
        /* Si va alla conferma con i soli dati che vengono dal server. Nessun
           nome nell'indirizzo: solo codice, conteggi e importo. */
        var q = new URLSearchParams({
          codice: r.codice,
          n: String(r.n_partecipanti != null ? r.n_partecipanti : dati.partecipanti.length),
          tot: String(r.totale_dovuto != null ? r.totale_dovuto : ''),
          email: r.email_inviata ? '1' : '0'
        });
        window.location.href = '/conferma.html?' + q.toString();
      })
      .catch(function (e) {
        occupato(false);

        if (e.codice === 'EMAIL_DUPLICATA') {
          /* Il controllo iniziale puo' essere stato saltato o superato da una
             iscrizione fatta nel frattempo: si torna al bivio. */
          chiudiModulo();
          avvisoEsiste.hidden = false;
          avvisoEsiste.scrollIntoView({ block: 'center' });
          campoEmail.focus();
          return;
        }

        erroreTesto.textContent =
          e.messaggio || 'Si è verificato un problema. Riprova fra qualche istante.';
        avvisoErrore.hidden = false;
        avvisoErrore.scrollIntoView({ block: 'center' });
      });
  });

  function occupato(si) {
    inCorso = si;
    invia.disabled = si;
    invia.innerHTML = si
      ? '<span class="filatoio" aria-hidden="true"></span> Invio in corso…'
      : 'Completa l’iscrizione';
  }
})();
