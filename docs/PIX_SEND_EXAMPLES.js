/**
 * Exemplos de Uso - Envio de Pix
 * 
 * Este arquivo contém exemplos de como usar o módulo de envio de Pix
 * em diferentes cenários e contextos.
 */

// ============================================================================
// EXEMPLO 1: Usando a Handler EFI Pix Diretamente
// ============================================================================

const { getEFIPixHandler } = require('./lambdas/proxy/handlers/efi-pix-handler');

async function exemplo1_envioDiretoViaHandler() {
  console.log('EXEMPLO 1: Envio direto via Handler\n');

  const handler = getEFIPixHandler();

  // Caso 1: Envio básico com chave Pix
  try {
    const result = await handler.sendPix('pix-exemplo-001', {
      valor: '12.34',
      pagador: {
        chave: '19974764017',
        infoPagador: 'Segue o pagamento da conta'
      },
      favorecido: {
        chave: 'joao@meuemail.com'
      }
    });

    console.log('✓ Sucesso:', result);
  } catch (error) {
    console.error('✗ Erro:', error.message);
  }
}

// ============================================================================
// EXEMPLO 2: Usando o Serviço Pix (Orquestração Completa)
// ============================================================================

const { sendPix } = require('./lambdas/proxy/pix-service');

async function exemplo2_viaServico() {
  console.log('\nEXEMPLO 2: Envio via Serviço de Orquestração\n');

  // Simular evento de API Gateway
  const event = {
    httpMethod: 'PUT',
    headers: {
      'content-type': 'application/json'
    },
    pathParameters: {
      idEnvio: 'pix-exemplo-002'
    },
    body: JSON.stringify({
      valor: '250.75',
      pagador: {
        chave: 'email@example.com',
        infoPagador: 'Pagamento referente à NF #001'
      },
      favorecido: {
        chave: 'empresa@banco.com'
      }
    }),
    requestContext: {
      httpMethod: 'PUT',
      authorizer: {
        tenantId: 'tenant-exemplo',
        activeGateway: 'efi'
      }
    }
  };

  try {
    const response = await sendPix(event);
    console.log('✓ Resposta HTTP:', response.statusCode);
    console.log('Corpo:', JSON.parse(response.body));
  } catch (error) {
    console.error('✗ Erro:', error.message);
  }
}

// ============================================================================
// EXEMPLO 3: Envio com Dados Bancários Completos
// ============================================================================

async function exemplo3_comDadosBancarios() {
  console.log('\nEXEMPLO 3: Envio com dados bancários do favorecido\n');

  const handler = getEFIPixHandler();

  try {
    const result = await handler.sendPix('pix-exemplo-003', {
      valor: '500.00',
      pagador: {
        chave: '12345678901', // CPF como chave
        infoPagador: 'Pagamento de salário'
      },
      favorecido: {
        contaBanco: {
          nome: 'Empresa XYZ Ltda',
          cnpj: '12345678000195',
          codigoBanco: '00000001', // ISPB do Banco do Brasil
          agencia: '1234',
          conta: '987654321',
          tipoConta: 'cacc'
        }
      }
    });

    console.log('✓ Resposta:', result);
  } catch (error) {
    console.error('✗ Erro:', error.message);
  }
}

// ============================================================================
// EXEMPLO 4: Consulta de Status
// ============================================================================

async function exemplo4_consultaStatus() {
  console.log('\nEXEMPLO 4: Consulta de status de Pix\n');

  const handler = getEFIPixHandler();

  try {
    const status = await handler.getPixStatus('pix-exemplo-001');
    
    console.log('✓ Status recuperado:');
    console.log(`  ID: ${status.id}`);
    console.log(`  Status: ${status.status}`);
    console.log(`  Criado em: ${status.createdAt}`);
    console.log(`  Atualizado em: ${status.updatedAt}`);
  } catch (error) {
    console.error('✗ Erro na consulta:', error.message);
  }
}

// ============================================================================
// EXEMPLO 5: Tratamento de Erros de Validação
// ============================================================================

async function exemplo5_errosValidacao() {
  console.log('\nEXEMPLO 5: Tratamento de erros de validação\n');

  const handler = getEFIPixHandler();

  // Caso 1: ID inválido (muito longo)
  try {
    await handler.sendPix(
      'id-muito-longo-que-excede-o-limite-de-35-caracteres-definido-na-api',
      {
        valor: '12.34',
        pagador: { chave: '19974764017' },
        favorecido: { chave: 'joao@email.com' }
      }
    );
  } catch (error) {
    console.log('✓ Erro capturado (ID inválido):', error.message);
  }

  // Caso 2: Valor com formato inválido
  try {
    await handler.sendPix('pix-error-001', {
      valor: '12,34', // Vírgula em vez de ponto
      pagador: { chave: '19974764017' },
      favorecido: { chave: 'joao@email.com' }
    });
  } catch (error) {
    console.log('✓ Erro capturado (formato valor):', error.message);
  }

  // Caso 3: Pagador sem chave
  try {
    await handler.sendPix('pix-error-002', {
      valor: '12.34',
      pagador: {
        infoPagador: 'Sem chave Pix' // Falta a chave!
      },
      favorecido: { chave: 'joao@email.com' }
    });
  } catch (error) {
    console.log('✓ Erro capturado (pagador incompleto):', error.message);
  }

  // Caso 4: Favorecido sem chave nem contaBanco
  try {
    await handler.sendPix('pix-error-003', {
      valor: '12.34',
      pagador: { chave: '19974764017' },
      favorecido: {} // Vazio!
    });
  } catch (error) {
    console.log('✓ Erro capturado (favorecido incompleto):', error.message);
  }
}

// ============================================================================
// EXEMPLO 6: Batch de Envios
// ============================================================================

async function exemplo6_envioEmLote() {
  console.log('\nEXEMPLO 6: Envio de múltiplos Pix em lote\n');

  const handler = getEFIPixHandler();

  const envios = [
    {
      idEnvio: 'batch-001',
      valor: '100.00',
      pagadorChave: 'email1@banco.com',
      favorecidoChave: 'receber1@banco.com'
    },
    {
      idEnvio: 'batch-002',
      valor: '200.50',
      pagadorChave: 'email2@banco.com',
      favorecidoChave: 'receber2@banco.com'
    },
    {
      idEnvio: 'batch-003',
      valor: '50.25',
      pagadorChave: 'email3@banco.com',
      favorecidoChave: 'receber3@banco.com'
    }
  ];

  const resultados = [];

  for (const envio of envios) {
    try {
      const result = await handler.sendPix(envio.idEnvio, {
        valor: envio.valor,
        pagador: { chave: envio.pagadorChave },
        favorecido: { chave: envio.favorecidoChave }
      });
      resultados.push({ ...envio, status: 'sucesso', result });
    } catch (error) {
      resultados.push({ ...envio, status: 'erro', erro: error.message });
    }
  }

  console.log('Resultados do lote:');
  console.log(JSON.stringify(resultados, null, 2));

  const sucessos = resultados.filter(r => r.status === 'sucesso').length;
  console.log(`\nResumo: ${sucessos}/${envios.length} sucessos`);
}

// ============================================================================
// EXEMPLO 7: Integração em Contexto de Express/Lambda
// ============================================================================

async function exemplo7_integracaoLambda() {
  console.log('\nEXEMPLO 7: Integração em handler Lambda\n');

  // Simular handler Lambda
  const { sendPix } = require('./lambdas/proxy/pix-service');

  // Event de uma requisição PUT /pix/{idEnvio}
  const lambdaEvent = {
    resource: '/pix/{idEnvio}',
    path: '/pix/pay-2025-001',
    httpMethod: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer token_jwt_aqui'
    },
    pathParameters: {
      idEnvio: 'pay-2025-001'
    },
    body: JSON.stringify({
      valor: '1250.00',
      pagador: {
        chave: 'empresa@banco.com',
        infoPagador: 'Fatura mensal'
      },
      favorecido: {
        chave: 'fornecedor@banco.com'
      }
    }),
    requestContext: {
      stage: 'prod',
      httpMethod: 'PUT',
      authorizer: {
        tenantId: 'tenant-abc-123',
        activeGateway: 'efi',
        userId: 'user@empresa.com'
      }
    }
  };

  try {
    const response = await sendPix(lambdaEvent);
    console.log('✓ Resposta Lambda:');
    console.log(`  Status Code: ${response.statusCode}`);
    console.log(`  Headers: ${JSON.stringify(response.headers)}`);
    console.log(`  Body: ${response.body}`);
  } catch (error) {
    console.error('✗ Erro na Lambda:', error);
  }
}

// ============================================================================
// EXEMPLO 8: Validação Manual de Payloads
// ============================================================================

async function exemplo8_validacaoManual() {
  console.log('\nEXEMPLO 8: Validação manual de payloads\n');

  const { 
    validatePixSendRequest, 
    validateIdEnvio,
    validatePixStatus 
  } = require('./shared/utils/pix-validators');

  // Validar payload completo
  const payload = {
    valor: '123.45',
    pagador: {
      chave: 'chave.pix@banco.com',
      infoPagador: 'Descrição'
    },
    favorecido: {
      chave: 'recebedor@banco.com'
    }
  };

  try {
    validatePixSendRequest(payload);
    console.log('✓ Payload válido');
  } catch (error) {
    console.log('✗ Payload inválido:', error.message);
  }

  // Validar ID
  try {
    validateIdEnvio('pix-2025-001');
    console.log('✓ ID válido');
  } catch (error) {
    console.log('✗ ID inválido:', error.message);
  }

  // Validar status
  try {
    validatePixStatus('REALIZADO');
    console.log('✓ Status válido');
  } catch (error) {
    console.log('✗ Status inválido:', error.message);
  }
}

// ============================================================================
// Main - Executar exemplos
// ============================================================================

async function main() {
  console.log('╔════════════════════════════════════════════════════════════════════╗');
  console.log('║          Exemplos de Uso - Módulo de Envio de Pix                 ║');
  console.log('╚════════════════════════════════════════════════════════════════════╝');

  // Descomente os exemplos que deseja executar:

  // await exemplo1_envioDiretoViaHandler();
  // await exemplo2_viaServico();
  // await exemplo3_comDadosBancarios();
  // await exemplo4_consultaStatus();
  // await exemplo5_errosValidacao();
  // await exemplo6_envioEmLote();
  // await exemplo7_integracaoLambda();
  // await exemplo8_validacaoManual();

  console.log('\n✓ Para executar exemplos específicos, descomente as chamadas em main()');
}

// Executar se chamado diretamente
if (require.main === module) {
  main().catch(err => {
    console.error('Erro ao executar exemplos:', err);
    process.exit(1);
  });
}

module.exports = {
  exemplo1_envioDiretoViaHandler,
  exemplo2_viaServico,
  exemplo3_comDadosBancarios,
  exemplo4_consultaStatus,
  exemplo5_errosValidacao,
  exemplo6_envioEmLote,
  exemplo7_integracaoLambda,
  exemplo8_validacaoManual
};
