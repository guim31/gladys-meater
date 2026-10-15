// -----------------------------------------------------------------------------
// Integration configuration.
//
// Filled in by the user in Gladys, from the `config_schema` of
// `gladys-assistant-integration.json`. This module provides the defaults (they
// MUST stay equal to the manifest `default` values, test/manifest.test.js
// checks it) and normalizes the received object, so the rest of the code never
// deals with `undefined` or with numbers typed as strings.
// -----------------------------------------------------------------------------

/** The languages of the Gladys interface, the ones every text exists in. */
export const LANGUAGES = ['en', 'fr', 'de', 'es'];

/**
 * Refresh interval while a cook is in progress, in seconds (select values).
 * The MEATER Cloud allows 60 requests per minute and recommends 2: 30 s is the
 * recommended pace, 15 s stays far below the maximum.
 */
export const COOK_REFRESH_OPTIONS = ['15', '30', '60'];

/** Refresh interval with no cook in progress: the pace the API documentation advises. */
export const IDLE_REFRESH_MS = 60 * 1000;

export const DEFAULT_CONFIG = {
  email: '',
  password: '',
  // Feature names, texts produced by the container, and the language the
  // MEATER Cloud translates the cut names into.
  language: 'fr',
  cook_refresh: '30',
};

/**
 * Merge the user config with the defaults.
 * @param {Record<string, unknown>} [raw] config returned by the SDK
 */
export function normalizeConfig(raw = {}) {
  const language = String(raw.language ?? DEFAULT_CONFIG.language);
  const cookRefresh = String(raw.cook_refresh ?? DEFAULT_CONFIG.cook_refresh);
  return {
    email: String(raw.email ?? DEFAULT_CONFIG.email).trim(),
    // A password may begin or end with a space: kept as typed.
    password: String(raw.password ?? DEFAULT_CONFIG.password),
    language: LANGUAGES.includes(language) ? language : DEFAULT_CONFIG.language,
    cook_refresh: COOK_REFRESH_OPTIONS.includes(cookRefresh)
      ? cookRefresh
      : DEFAULT_CONFIG.cook_refresh,
  };
}

/**
 * The account can only be reached once both fields are set.
 * @param {ReturnType<typeof normalizeConfig>} config
 */
export function isConfigured(config) {
  return Boolean(config.email && config.password);
}

/**
 * Refresh interval while a cook is in progress, in milliseconds.
 * @param {ReturnType<typeof normalizeConfig>} config
 */
export function cookRefreshMs(config) {
  return Number(config.cook_refresh) * 1000;
}
