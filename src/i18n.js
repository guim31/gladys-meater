// -----------------------------------------------------------------------------
// Every text the container produces, in the four languages of the Gladys
// interface (test/i18n.test.js checks them). German says "du", Spanish
// "usted". Brands (MEATER, MEATER Cloud, MEATER Block) are never translated.
//
// The vocabulary follows the Gladys interface (front/src/config/i18n): the
// tabs are Devices / Discovery / Configuration, "Appareils / Découverte /
// Configuration", "Geräte / Entdecken / Konfiguration", "Dispositivos /
// Descubrir / Configuración".
// -----------------------------------------------------------------------------

/** Pick the text of one language, English when it is missing. */
export function localize(text, language) {
  return text[language] ?? text.en;
}

/** Feature names, by feature key (fixed by Gladys when the device is created). */
export const NAMES = {
  en: {
    internal_temperature: 'Internal temperature',
    ambient_temperature: 'Ambient temperature',
    target_temperature: 'Target temperature',
    peak_temperature: 'Peak temperature',
    cooking: 'Cook in progress',
    cook_name: 'Cook',
    cook_state: 'Cook state',
    elapsed_time: 'Elapsed time',
    remaining_time: 'Remaining time',
    connected: 'Probe connected',
  },
  fr: {
    internal_temperature: 'Température interne',
    ambient_temperature: 'Température ambiante',
    target_temperature: 'Température cible',
    peak_temperature: 'Température maximale atteinte',
    cooking: 'Cuisson en cours',
    cook_name: 'Cuisson',
    cook_state: 'État de la cuisson',
    elapsed_time: 'Temps écoulé',
    remaining_time: 'Temps restant',
    connected: 'Sonde connectée',
  },
  de: {
    internal_temperature: 'Kerntemperatur',
    ambient_temperature: 'Umgebungstemperatur',
    target_temperature: 'Zieltemperatur',
    peak_temperature: 'Höchste erreichte Temperatur',
    cooking: 'Garvorgang läuft',
    cook_name: 'Gargut',
    cook_state: 'Status des Garvorgangs',
    elapsed_time: 'Vergangene Zeit',
    remaining_time: 'Restzeit',
    connected: 'Fühler verbunden',
  },
  es: {
    internal_temperature: 'Temperatura interna',
    ambient_temperature: 'Temperatura ambiente',
    target_temperature: 'Temperatura objetivo',
    peak_temperature: 'Temperatura máxima alcanzada',
    cooking: 'Cocción en curso',
    cook_name: 'Cocción',
    cook_state: 'Estado de la cocción',
    elapsed_time: 'Tiempo transcurrido',
    remaining_time: 'Tiempo restante',
    connected: 'Sonda conectada',
  },
};

/** Device name, from the first 8 characters of the probe id (what the MEATER app shows nowhere, but stable). */
export const DEVICE_NAME = {
  en: (shortId) => `MEATER probe ${shortId}`,
  fr: (shortId) => `Sonde MEATER ${shortId}`,
  de: (shortId) => `MEATER-Fühler ${shortId}`,
  es: (shortId) => `Sonda MEATER ${shortId}`,
};

/** Cook states (src/cook.js keys), as the "Cook state" feature and the widget show them. */
export const STATE_LABELS = {
  en: {
    none: 'No cook',
    not_started: 'Not started',
    configured: 'Set up',
    started: 'Cooking',
    ready_for_resting: 'Remove from heat',
    resting: 'Resting',
    slightly_underdone: 'Slightly underdone',
    finished: 'Done',
    slightly_overdone: 'Slightly overdone',
    overcooked: 'Overcooked!',
    unknown: 'Unknown',
  },
  fr: {
    none: 'Aucune cuisson',
    not_started: 'Pas démarrée',
    configured: 'Préparée',
    started: 'En cuisson',
    ready_for_resting: 'À retirer du feu',
    resting: 'Au repos',
    slightly_underdone: 'Légèrement sous-cuite',
    finished: 'Terminée',
    slightly_overdone: 'Légèrement trop cuite',
    overcooked: 'Trop cuite !',
    unknown: 'Inconnu',
  },
  de: {
    none: 'Kein Garvorgang',
    not_started: 'Nicht gestartet',
    configured: 'Eingerichtet',
    started: 'Gart',
    ready_for_resting: 'Vom Feuer nehmen',
    resting: 'Ruht',
    slightly_underdone: 'Etwas zu wenig gegart',
    finished: 'Fertig',
    slightly_overdone: 'Etwas zu lange gegart',
    overcooked: 'Übergart!',
    unknown: 'Unbekannt',
  },
  es: {
    none: 'Sin cocción',
    not_started: 'Sin iniciar',
    configured: 'Preparada',
    started: 'Cocinando',
    ready_for_resting: 'Retirar del fuego',
    resting: 'En reposo',
    slightly_underdone: 'Un poco cruda',
    finished: 'Lista',
    slightly_overdone: 'Un poco pasada',
    overcooked: '¡Demasiado hecha!',
    unknown: 'Desconocido',
  },
};

/** The label of a cook state; an unknown API state shows as the API wrote it. */
export function stateLabel(key, language, rawState) {
  if (key === 'unknown' && rawState) {
    return rawState.slice(0, 40);
  }
  return (STATE_LABELS[language] ?? STATE_LABELS.en)[key] ?? STATE_LABELS.en.unknown;
}

/** Status of the Configuration screen, and messages of the "Test the connection" action. */
export const TEXT = {
  notConfigured: {
    en: 'Enter the e-mail address and the password of your MEATER Cloud account.',
    fr: "Saisissez l'adresse e-mail et le mot de passe de votre compte MEATER Cloud.",
    de: 'Gib die E-Mail-Adresse und das Passwort deines MEATER-Cloud-Kontos ein.',
    es: 'Introduzca la dirección de correo electrónico y la contraseña de su cuenta MEATER Cloud.',
  },
  badCredentials: {
    en: 'MEATER Cloud refused the e-mail address or the password: check them, then save the configuration again.',
    fr: "MEATER Cloud a refusé l'adresse e-mail ou le mot de passe : vérifiez-les, puis enregistrez de nouveau la configuration.",
    de: 'MEATER Cloud hat die E-Mail-Adresse oder das Passwort abgelehnt: Prüfe sie und speichere die Konfiguration erneut.',
    es: 'MEATER Cloud ha rechazado la dirección de correo electrónico o la contraseña: compruébelas y guarde de nuevo la configuración.',
  },
  rateLimited: {
    en: 'MEATER Cloud asks to slow down: the integration waits a few minutes, then tries again.',
    fr: "MEATER Cloud demande de ralentir : l'intégration attend quelques minutes, puis réessaie.",
    de: 'MEATER Cloud bittet darum, langsamer abzufragen: Die Integration wartet ein paar Minuten und versucht es erneut.',
    es: 'MEATER Cloud pide reducir el ritmo: la integración espera unos minutos y vuelve a intentarlo.',
  },
  unavailable: {
    en: 'MEATER Cloud cannot be reached: the integration tries again every few minutes.',
    fr: "MEATER Cloud est injoignable : l'intégration réessaie toutes les quelques minutes.",
    de: 'MEATER Cloud ist nicht erreichbar: Die Integration versucht es alle paar Minuten erneut.',
    es: 'No se puede acceder a MEATER Cloud: la integración lo vuelve a intentar cada pocos minutos.',
  },
  protocol: {
    en: 'MEATER Cloud sent an answer the integration cannot read: the API may have changed.',
    fr: "MEATER Cloud a envoyé une réponse que l'intégration ne sait pas lire : l'API a peut-être changé.",
    de: 'MEATER Cloud hat eine Antwort gesendet, die die Integration nicht lesen kann: Die API hat sich vielleicht geändert.',
    es: 'MEATER Cloud ha enviado una respuesta que la integración no puede leer: es posible que la API haya cambiado.',
  },
  initFailed: {
    en: 'The integration could not start: see its logs.',
    fr: "L'intégration n'a pas pu démarrer : consultez ses journaux.",
    de: 'Die Integration konnte nicht starten: Sieh dir ihre Protokolle an.',
    es: 'La integración no ha podido iniciarse: consulte sus registros.',
  },
  testNoProbe: {
    en: 'Connected to MEATER Cloud. No probe is visible right now: a probe only shows during a cook, while the MEATER app or Block is connected to it.',
    fr: "Connecté à MEATER Cloud. Aucune sonde n'est visible pour l'instant : une sonde n'apparaît que pendant une cuisson, quand l'application MEATER ou le Block y est connecté.",
    de: 'Mit MEATER Cloud verbunden. Gerade ist kein Fühler sichtbar: Ein Fühler erscheint nur während eines Garvorgangs, solange die MEATER-App oder der Block mit ihm verbunden ist.',
    es: 'Conectado a MEATER Cloud. Ahora mismo no se ve ninguna sonda: una sonda solo aparece durante una cocción, mientras la aplicación MEATER o el Block están conectados a ella.',
  },
};

/** "Test the connection" with probes in sight. */
export const TEST_OK = {
  en: (count) => `Connected to MEATER Cloud: ${count} probe(s) visible right now.`,
  fr: (count) => `Connecté à MEATER Cloud : ${count} sonde(s) visible(s) en ce moment.`,
  de: (count) => `Mit MEATER Cloud verbunden: ${count} Fühler gerade sichtbar.`,
  es: (count) => `Conectado a MEATER Cloud: ${count} sonda(s) visible(s) en este momento.`,
};

/** The four languages of a message built from one function per language. */
export function allLanguages(table, ...args) {
  return Object.fromEntries(Object.entries(table).map(([lang, render]) => [lang, render(...args)]));
}

/** The connection status message of a MeaterError kind. */
export function errorText(kind) {
  return (
    {
      auth: TEXT.badCredentials,
      rate_limit: TEXT.rateLimited,
      protocol: TEXT.protocol,
    }[kind] ?? TEXT.unavailable
  );
}

/** Texts of the "Cook" dashboard widget. */
export const WIDGET_TEXT = {
  internal: { en: 'Internal', fr: 'Interne', de: 'Kern', es: 'Interna' },
  ambient: { en: 'Ambient', fr: 'Ambiante', de: 'Umgebung', es: 'Ambiente' },
  target: { en: 'Target', fr: 'Cible', de: 'Ziel', es: 'Objetivo' },
  remaining: { en: 'Remaining', fr: 'Restant', de: 'Restzeit', es: 'Restante' },
  estimating: { en: 'Estimating', fr: 'Estimation', de: 'Schätzung', es: 'Estimando' },
  state: { en: 'State', fr: 'État', de: 'Status', es: 'Estado' },
  elapsed: { en: 'Elapsed', fr: 'Écoulé', de: 'Vergangen', es: 'Transcurrido' },
  probe: { en: 'Probe', fr: 'Sonde', de: 'Fühler', es: 'Sonda' },
  connected: { en: 'Connected', fr: 'Connectée', de: 'Verbunden', es: 'Conectada' },
  notSeen: { en: 'Not seen', fr: 'Non visible', de: 'Nicht sichtbar', es: 'No visible' },
  noProbe: {
    en: 'No MEATER probe added yet: start a cook in the MEATER app, then add the probe from the Discovery tab of the integration.',
    fr: "Aucune sonde MEATER ajoutée : lancez une cuisson dans l'application MEATER, puis ajoutez la sonde depuis l'onglet Découverte de l'intégration.",
    de: 'Noch kein MEATER-Fühler hinzugefügt: Starte einen Garvorgang in der MEATER-App und füge den Fühler dann im Tab Entdecken der Integration hinzu.',
    es: 'Aún no se ha añadido ninguna sonda MEATER: inicie una cocción en la aplicación MEATER y añada la sonda desde la pestaña Descubrir de la integración.',
  },
  notConfigured: {
    en: 'Enter your MEATER Cloud account in the Configuration tab of the integration.',
    fr: "Saisissez votre compte MEATER Cloud dans l'onglet Configuration de l'intégration.",
    de: 'Gib dein MEATER-Cloud-Konto im Tab Konfiguration der Integration ein.',
    es: 'Introduzca su cuenta MEATER Cloud en la pestaña Configuración de la integración.',
  },
  waiting: {
    en: 'Waiting for the first answer of MEATER Cloud.',
    fr: 'En attente de la première réponse de MEATER Cloud.',
    de: 'Warte auf die erste Antwort von MEATER Cloud.',
    es: 'Esperando la primera respuesta de MEATER Cloud.',
  },
};

/**
 * A duration in minutes, short enough for a widget tile (12 characters at
 * most): "45 min", "1 h 05". The abbreviations read the same in the four
 * languages.
 * @param {number} minutes
 */
export function formatMinutes(minutes) {
  const total = Math.max(0, Math.round(minutes));
  if (total < 60) {
    return `${total} min`;
  }
  const hours = Math.floor(total / 60);
  return `${hours} h ${String(total % 60).padStart(2, '0')}`;
}
