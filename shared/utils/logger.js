/**
 * Sistema de Logging Estruturado
 * Produz logs em formato JSON para melhor observabilidade
 */

const LOG_LEVELS = {
  DEBUG: 'DEBUG',
  INFO: 'INFO',
  WARN: 'WARN',
  ERROR: 'ERROR'
};

/**
 * Formata log estruturado em JSON
 * @param {string} level - Nível do log
 * @param {string} message - Mensagem principal
 * @param {Object} context - Contexto adicional
 * @returns {string} Log formatado em JSON
 */
function formatLog(level, message, context = {}) {
  return JSON.stringify({
    level,
    timestamp: new Date().toISOString(),
    message,
    ...context
  });
}

/**
 * Logger singleton centralizado
 */
const logger = {
  /**
   * Log de informação
   * @param {string} message - Mensagem
   * @param {Object} context - Contexto adicional
   */
  info: (message, context = {}) => {
    console.log(formatLog(LOG_LEVELS.INFO, message, context));
  },

  /**
   * Log de erro
   * @param {string} message - Mensagem
   * @param {Object} context - Contexto com erro
   */
  error: (message, context = {}) => {
    // Inclua informações do erro se presente
    const errorContext = context.error ? {
      ...context,
      error: {
        name: context.error.name,
        message: context.error.message,
        code: context.error.code,
        stack: context.error.stack
      }
    } : context;

    console.error(formatLog(LOG_LEVELS.ERROR, message, errorContext));
  },

  /**
   * Log de aviso
   * @param {string} message - Mensagem
   * @param {Object} context - Contexto adicional
   */
  warn: (message, context = {}) => {
    console.warn(formatLog(LOG_LEVELS.WARN, message, context));
  },

  /**
   * Log de debug
   * @param {string} message - Mensagem
   * @param {Object} context - Contexto adicional
   */
  debug: (message, context = {}) => {
    if (process.env.DEBUG === 'true') {
      console.log(formatLog(LOG_LEVELS.DEBUG, message, context));
    }
  },

  /**
   * Log com métrica de tempo
   * Útil para medir latência de operações
   * @param {string} operation - Nome da operação
   * @param {number} durationMs - Duração em milissegundos
   * @param {Object} context - Contexto adicional
   */
  performance: (operation, durationMs, context = {}) => {
    logger.info(`${operation} completed`, {
      operation,
      durationMs,
      ...context
    });
  }
};

module.exports = logger;
