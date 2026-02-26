/**
 * Utilidades de Validação
 * Funções reutilizáveis para validar dados de entrada
 */

const { ValidationError } = require('./errors');

/**
 * Valida se um valor existe (não nulo e não undefined)
 * @param {*} value - Valor a validar
 * @param {string} fieldName - Nome do campo
 * @returns {*} O valor se válido
 * @throws {ValidationError} Se valor está vazio
 */
function required(value, fieldName) {
  if (value === null || value === undefined || value === '') {
    throw new ValidationError(`${fieldName} is required`, { field: fieldName });
  }
  return value;
}

/**
 * Valida se um valor é string
 * @param {*} value - Valor a validar
 * @param {string} fieldName - Nome do campo
 * @returns {string} O valor se válido
 * @throws {ValidationError} Se não é string
 */
function isString(value, fieldName) {
  if (typeof value !== 'string') {
    throw new ValidationError(`${fieldName} must be a string`, {
      field: fieldName,
      received: typeof value
    });
  }
  return value;
}

/**
 * Valida se um valor é objeto
 * @param {*} value - Valor a validar
 * @param {string} fieldName - Nome do campo
 * @returns {Object} O valor se válido
 * @throws {ValidationError} Se não é objeto
 */
function isObject(value, fieldName) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ValidationError(`${fieldName} must be an object`, {
      field: fieldName,
      received: Array.isArray(value) ? 'array' : typeof value
    });
  }
  return value;
}

/**
 * Valida se um valor é número
 * @param {*} value - Valor a validar
 * @param {string} fieldName - Nome do campo
 * @returns {number} O valor se válido
 * @throws {ValidationError} Se não é número
 */
function isNumber(value, fieldName) {
  if (typeof value !== 'number' || isNaN(value)) {
    throw new ValidationError(`${fieldName} must be a number`, {
      field: fieldName,
      received: typeof value
    });
  }
  return value;
}

/**
 * Valida se um número está em intervalo
 * @param {number} value - Valor a validar
 * @param {number} min - Valor mínimo (inclusive)
 * @param {number} max - Valor máximo (inclusive)
 * @param {string} fieldName - Nome do campo
 * @returns {number} O valor se válido
 * @throws {ValidationError} Se fora do intervalo
 */
function inRange(value, min, max, fieldName) {
  isNumber(value, fieldName);
  if (value < min || value > max) {
    throw new ValidationError(
      `${fieldName} must be between ${min} and ${max}`,
      { field: fieldName, min, max, received: value }
    );
  }
  return value;
}

/**
 * Valida se um valor corresponde a um padrão regex
 * @param {string} value - Valor a validar
 * @param {RegExp} pattern - Padrão regex
 * @param {string} fieldName - Nome do campo
 * @returns {string} O valor se válido
 * @throws {ValidationError} Se não corresponde
 */
function matches(value, pattern, fieldName) {
  isString(value, fieldName);
  if (!pattern.test(value)) {
    throw new ValidationError(
      `${fieldName} has invalid format`,
      { field: fieldName, pattern: pattern.toString() }
    );
  }
  return value;
}

/**
 * Valida se um valor está em um conjunto permitido
 * @param {*} value - Valor a validar
 * @param {Array} allowedValues - Valores permitidos
 * @param {string} fieldName - Nome do campo
 * @returns {*} O valor se válido
 * @throws {ValidationError} Se não está permitido
 */
function isOneOf(value, allowedValues, fieldName) {
  if (!allowedValues.includes(value)) {
    throw new ValidationError(
      `${fieldName} must be one of: ${allowedValues.join(', ')}`,
      { field: fieldName, allowed: allowedValues, received: value }
    );
  }
  return value;
}

/**
 * Valida um UUID v4
 * @param {string} value - Valor a validar
 * @param {string} fieldName - Nome do campo
 * @returns {string} O valor se válido
 * @throws {ValidationError} Se não é UUID válido
 */
function isUUID(value, fieldName) {
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return matches(value, uuidPattern, fieldName);
}

/**
 * Valida um email
 * @param {string} value - Valor a validar
 * @param {string} fieldName - Nome do campo
 * @returns {string} O valor se válido
 * @throws {ValidationError} Se não é email válido
 */
function isEmail(value, fieldName) {
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return matches(value, emailPattern, fieldName);
}

/**
 * Valida se uma string não está vazia e tem tamanho mínimo
 * @param {string} value - Valor a validar
 * @param {number} minLength - Comprimento mínimo
 * @param {string} fieldName - Nome do campo
 * @returns {string} O valor se válido
 * @throws {ValidationError} Se muito curto
 */
function minLength(value, minLength, fieldName) {
  isString(value, fieldName);
  if (value.length < minLength) {
    throw new ValidationError(
      `${fieldName} must have at least ${minLength} characters`,
      { field: fieldName, minLength, received: value.length }
    );
  }
  return value;
}

/**
 * Valida se uma string não excede tamanho máximo
 * @param {string} value - Valor a validar
 * @param {number} maxLength - Comprimento máximo
 * @param {string} fieldName - Nome do campo
 * @returns {string} O valor se válido
 * @throws {ValidationError} Se muito longo
 */
function maxLength(value, maxLength, fieldName) {
  isString(value, fieldName);
  if (value.length > maxLength) {
    throw new ValidationError(
      `${fieldName} must not exceed ${maxLength} characters`,
      { field: fieldName, maxLength, received: value.length }
    );
  }
  return value;
}

module.exports = {
  required,
  isString,
  isObject,
  isNumber,
  inRange,
  matches,
  isOneOf,
  isUUID,
  isEmail,
  minLength,
  maxLength
};
