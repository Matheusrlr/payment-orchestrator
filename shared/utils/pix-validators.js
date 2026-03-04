/**
 * Validadores para Operações de Pix
 * Validações específicas para Pix Send (Envio de Pix)
 */

const validators = require('./validators');
const { ValidationError } = require('./errors');

/**
 * Valida requisição de envio de Pix
 * Conforme documentação Efí: PUT /v3/gn/pix/:idEnvio
 * 
 * @param {Object} payload - Payload de envio de Pix
 * @throws {ValidationError} Se validação falhar
 */
function validatePixSendRequest(payload) {
  validators.isObject(payload, 'Pix send payload');

  // Validar campos obrigatórios
  validators.required(payload.valor, 'valor');
  validators.required(payload.pagador, 'pagador');
  validators.required(payload.favorecido, 'favorecido');

  // Validar valor
  validateValor(payload.valor);

  // Validar pagador
  validatePagador(payload.pagador);

  // Validar favorecido
  validateFavorecido(payload.favorecido);
}

/**
 * Valida idEnvio (identificador da transação)
 * Padrão: ^[a-zA-Z0-9]{1,35}$
 * 
 * @param {string} idEnvio - Identificador da transação
 * @throws {ValidationError} Se inválido
 */
function validateIdEnvio(idEnvio) {
  validators.isString(idEnvio, 'idEnvio');
  validators.minLength(idEnvio, 1, 'idEnvio');
  validators.maxLength(idEnvio, 35, 'idEnvio');
  
  if (!/^[a-zA-Z0-9]{1,35}$/.test(idEnvio)) {
    throw new ValidationError('idEnvio must contain only alphanumeric characters and be 1-35 characters long', {
      field: 'idEnvio',
      value: idEnvio
    });
  }
}

/**
 * Valida campo valor
 * Padrão: \d{1,10}\.\d{2}
 * Exemplo: "12.34"
 * 
 * @private
 * @param {string} valor - Valor monetário
 * @throws {ValidationError} Se inválido
 */
function validateValor(valor) {
  validators.isString(valor, 'valor');
  
  if (!/^\d{1,10}\.\d{2}$/.test(valor)) {
    throw new ValidationError('valor must be a monetary value in format "123.45" with exactly 2 decimal places', {
      field: 'valor',
      value: valor,
      pattern: '^\\d{1,10}\\.\\d{2}$'
    });
  }

  // Validar se é um número > 0
  const amount = parseFloat(valor);
  if (amount <= 0) {
    throw new ValidationError('valor must be greater than zero', {
      field: 'valor',
      value: valor
    });
  }
}

/**
 * Valida objeto pagador
 * 
 * @private
 * @param {Object} pagador - Dados do pagador
 * @throws {ValidationError} Se inválido
 */
function validatePagador(pagador) {
  validators.isObject(pagador, 'pagador');
  
  // Antes: campo chave é obrigatório
  validators.required(pagador.chave, 'pagador.chave');
  
  // Validar chave
  validators.isString(pagador.chave, 'pagador.chave');
  validators.maxLength(pagador.chave, 77, 'pagador.chave');

  // Validar infoPagador se presente
  if (pagador.infoPagador) {
    validators.isString(pagador.infoPagador, 'pagador.infoPagador');
    validators.maxLength(pagador.infoPagador, 140, 'pagador.infoPagador');
  }
}

/**
 * Valida objeto favorecido
 * 
 * @private
 * @param {Object} favorecido - Dados do favorecido
 * @throws {ValidationError} Se inválido
 */
function validateFavorecido(favorecido) {
  validators.isObject(favorecido, 'favorecido');
  
  // Chave é obrigatória (com validações de contaBanco, é alternativo)
  if (!favorecido.chave && !favorecido.contaBanco) {
    throw new ValidationError('favorecido must have either chave or contaBanco', {
      field: 'favorecido'
    });
  }

  // Se tem chave, validar
  if (favorecido.chave) {
    validators.isString(favorecido.chave, 'favorecido.chave');
    validators.maxLength(favorecido.chave, 77, 'favorecido.chave');
  }

  // Se tem cpf, validar
  if (favorecido.cpf) {
    validateCPF(favorecido.cpf, 'favorecido.cpf');
  }

  // Se tem cnpj, validar
  if (favorecido.cnpj) {
    validateCNPJ(favorecido.cnpj, 'favorecido.cnpj');
  }

  // Se tem contaBanco, validar
  if (favorecido.contaBanco) {
    validateContaBanco(favorecido.contaBanco);
  }
}

/**
 * Valida CPF
 * Padrão: ^[0-9]{11}$
 * 
 * @private
 * @param {string} cpf - CPF
 * @param {string} fieldName - Nome do campo para mensagem de erro
 * @throws {ValidationError} Se inválido
 */
function validateCPF(cpf, fieldName) {
  validators.isString(cpf, fieldName);
  
  if (!/^[0-9]{11}$/.test(cpf)) {
    throw new ValidationError('CPF must contain exactly 11 digits', {
      field: fieldName,
      value: cpf,
      pattern: '^[0-9]{11}$'
    });
  }
}

/**
 * Valida CNPJ
 * Padrão: ^[0-9]{14}$
 * 
 * @private
 * @param {string} cnpj - CNPJ
 * @param {string} fieldName - Nome do campo para mensagem de erro
 * @throws {ValidationError} Se inválido
 */
function validateCNPJ(cnpj, fieldName) {
  validators.isString(cnpj, fieldName);
  
  if (!/^[0-9]{14}$/.test(cnpj)) {
    throw new ValidationError('CNPJ must contain exactly 14 digits', {
      field: fieldName,
      value: cnpj,
      pattern: '^[0-9]{14}$'
    });
  }
}

/**
 * Valida objeto contaBanco
 * 
 * @private
 * @param {Object} contaBanco - Dados da conta bancária
 * @throws {ValidationError} Se inválido
 */
function validateContaBanco(contaBanco) {
  validators.isObject(contaBanco, 'favorecido.contaBanco');

  // Fields obrigatórios em contaBanco
  validators.required(contaBanco.nome, 'favorecido.contaBanco.nome');
  validators.required(contaBanco.codigoBanco, 'favorecido.contaBanco.codigoBanco');
  validators.required(contaBanco.agencia, 'favorecido.contaBanco.agencia');
  validators.required(contaBanco.conta, 'favorecido.contaBanco.conta');
  validators.required(contaBanco.tipoConta, 'favorecido.contaBanco.tipoConta');

  // Validar nome
  validators.isString(contaBanco.nome, 'favorecido.contaBanco.nome');
  validators.maxLength(contaBanco.nome, 200, 'favorecido.contaBanco.nome');

  // Validar codigoBanco (ISPB)
  validators.isString(contaBanco.codigoBanco, 'favorecido.contaBanco.codigoBanco');
  if (!/^[0-9]{8}$/.test(contaBanco.codigoBanco)) {
    throw new ValidationError('codigoBanco (ISPB) must contain exactly 8 digits', {
      field: 'favorecido.contaBanco.codigoBanco',
      value: contaBanco.codigoBanco
    });
  }

  // Validar agência
  validators.isString(contaBanco.agencia, 'favorecido.contaBanco.agencia');
  if (!/^[0-9]{1,4}$/.test(contaBanco.agencia)) {
    throw new ValidationError('agencia must contain 1-4 digits', {
      field: 'favorecido.contaBanco.agencia',
      value: contaBanco.agencia
    });
  }

  // Validar conta
  validators.isString(contaBanco.conta, 'favorecido.contaBanco.conta');
  if (!/^[0-9]+$/.test(contaBanco.conta)) {
    throw new ValidationError('conta must contain only digits', {
      field: 'favorecido.contaBanco.conta',
      value: contaBanco.conta
    });
  }

  // Validar tipoConta
  validators.isString(contaBanco.tipoConta, 'favorecido.contaBanco.tipoConta');
  validators.isOneOf(contaBanco.tipoConta, ['cacc', 'svgs'], 'favorecido.contaBanco.tipoConta');

  // Validar CPF ou CNPJ se presentes
  if (contaBanco.cpf) {
    validateCPF(contaBanco.cpf, 'favorecido.contaBanco.cpf');
  }

  if (contaBanco.cnpj) {
    validateCNPJ(contaBanco.cnpj, 'favorecido.contaBanco.cnpj');
  }
}

/**
 * Valida requisição de devolução de Pix
 * Conforme documentação Efí: POST /v3/gn/pix/{idEnvio}/devolucao/{reTxId}
 * 
 * @param {Object} payload - Payload de devolução de Pix
 * @throws {ValidationError} Se validação falhar
 */
function validatePixRefund(payload) {
  validators.isObject(payload, 'Pix refund payload');

  // Validar campos obrigatórios
  validators.required(payload.idDevolucao, 'idDevolucao');
  validators.required(payload.idEnvioOrigem, 'idEnvioOrigem');
  validators.required(payload.valor, 'valor');
  validators.required(payload.motivo, 'motivo');

  // Validar idDevolucao
  validateIdEnvio(payload.idDevolucao);

  // Validar idEnvioOrigem
  validateIdEnvio(payload.idEnvioOrigem);

  // Validar valor
  validateValor(payload.valor);

  // Validar motivo (enum)
  const validMotivos = ['SOLICITACAO_PAYER', 'SOLICITACAO_CREDOR', 'FALHA_NA_ENTREGA'];
  validators.isOneOf(payload.motivo, validMotivos, 'motivo');
}

/**
 * Valida status retornado no webhook
 * Valores aceitos: EM_PROCESSAMENTO, REALIZADO, NAO_REALIZADO
 * 
 * @param {string} status - Status do Pix
 * @throws {ValidationError} Se inválido
 */
function validatePixStatus(status) {
  const validStatuses = ['EM_PROCESSAMENTO', 'REALIZADO', 'NAO_REALIZADO'];
  validators.isOneOf(status, validStatuses, 'status');
}

module.exports = {
  validatePixSendRequest,
  validateIdEnvio,
  validateValor,
  validatePagador,
  validateFavorecido,
  validateCPF,
  validateCNPJ,
  validateContaBanco,
  validatePixStatus,
  validatePixRefund
};
