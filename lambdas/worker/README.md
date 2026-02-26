# Webhook Worker Lambda

Processa webhooks enfileirados pela Lambda `webhook-receiver` e os entrega aos clientes.

## Responsabilidades

- ✅ Consumir mensagens de fila SQS
- ✅ Normalizar webhooks de diferentes gateways
- ✅ Obter URL de callback do cliente
- ✅ Entregar webhook ao cliente com retry automático
- ✅ Tratar erros e fazer backoff exponencial
- ✅ Retornar falhas para SQS fazer retry

## Fluxo de Processamento

```
1. Receber Lote de Mensagens SQS
   └─ Para cada mensagem:

2. Parsear Webhook
   ├─ Extrair gateway, payload, timestamp
   └─ Validar estrutura

3. Normalizar Webhook
   ├─ Mapear campos gateway-específicos
   ├─ Padronizar status
   └─ Estruturar metadados

4. Resolver Cliente
   ├─ Extrair ID do cliente do payload
   ├─ Buscar URL de callback registrada
   └─ Validar URL existência

5. Entregar com Retry
   ├─ Tentar POST com timeout
   ├─ Classificar erro (retentável ou não)
   ├─ Aplicar backoff exponencial
   └─ Máximo 3 tentativas

6. Retornar Status
   ├─ Se todas OK: confirmar processamento
   └─ Se algumas falharam: retornar para retry SQS
```

## Estrutura de Arquivos

```
lambdas/worker/
├── index.js                    # Handler Lambda
├── service.js                  # Lógica de processamento em batch
├── handlers/
│   ├── webhook-normalizer.js   # Normaliza webhooks
│   └── client-resolver.js      # Encontra URLs de callback
├── package.json                # Dependências
└── README.md                   # Este arquivo
```

## Dependências

```json
{
  "axios": "^1.6.0"
}
```

## Variáveis de Ambiente

| Variável | Descrição | Padrão |
|----------|-----------|--------|
| `DEBUG` | Ativar logs de debug | `false` |

## Fluxo de Dados

### Mensagem de Entrada (SQS)

```json
{
  "gateway": "efi",
  "payload": { /* dados brutos do webhook */ },
  "receivedAt": "2024-02-26T10:30:00Z"
}
```

### Webhook Normalizado

```json
{
  "event": "payment.updated",
  "gateway": "efi",
  "gateway_event_id": "txid_123",
  "payment_id": "txid_123",
  "status": "completed",
  "amount": 99.99,
  "currency": "BRL",
  "timestamp": "2024-02-26T10:30:00Z",
  "metadata": {
    "gateway_specific": { /* dados originais */ }
  }
}
```

## Tratamento de Erros

### Erros Retentáveis (com retry automático)

- `ECONNREFUSED`: Conexão recusada
- `ETIMEDOUT`: Timeout na conexão
- `ECONNABORTED`: Conexão abortada
- Status HTTP 5xx (erro de servidor)
- Status HTTP 429 (rate limited)

### Erros Não-Retentáveis (não fazem retry)

- Status HTTP 4xx (exceto 429)
- Erro de parsing JSON
- Webhook inválido

### Backoff Exponencial

- Tentativa 1: imediato
- Tentativa 2: aguarda 2s
- Tentativa 3: aguarda 4s

Máximo de 3 tentativas antes de falha permanente.

## Segurança

### Implementado

- ✅ Mascaramento de segredos em logs
- ✅ Validação de payload
- ✅ Timeout em requisições HTTP
- ✅ Headers de origem do webhook

### Recomendado

- Verificar assinatura HMAC de webhook
- Autenticar cliente por API Key
- Rate limiting por cliente
- DLQ para mensagens com falha permanente

## Extensibilidade

### Adicionar Novo Gateway

1. **Adicionar normalização em `webhook-normalizer.js`**:
   ```javascript
   case 'new-gateway':
     return normalizeNewGatewayWebhook(payload);
   ```

2. **Implementar função de normalização**:
   ```javascript
   function normalizeNewGatewayWebhook(payload) {
     // Mapear campos
     return {
       event: mapEventType(payload),
       status: mapStatus(payload),
       // ...
     };
   }
   ```

3. **Atualizar validação**:
   ```javascript
   function validateNewGatewayPayload(payload) {
     // Validar campos obrigatórios
   }
   ```

## Monitoramento

### Métricas CloudWatch

- `WebhookProcessed`: Webhooks processados com sucesso
- `WebhookFailed`: Falhas permanentes
- `DeliveryAttempts`: Número médio de tentativas
- `ClientNotFound`: Cliente não registrado

### Logs CloudWatch

Buscar por:
- `[webhook delivered successfully]`
- `[Failed to process webhook]`
- `[No callback URL found]`

### DLQ (Dead Letter Queue)

Configure DLQ para SQS capturar mensagens que falharam permanentemente:

```
SQS Main Queue -> Worker Lambda
                └-> (falha 3x) -> DLQ SQS
```

## Troubleshooting

### Webhooks não estão sendo entregues

1. **Verificar fila SQS**:
   - Profundidade de fila (deve estar diminuindo)
   - Logs de erro na Lambda

2. **Verificar URL de callback**:
   - Está registrada no banco de dados?
   - É acessível externamente?

3. **Verificar logs**:
   ```
   grep "No callback URL found" logs
   grep "Failed to deliver webhook" logs
   ```

### Muitas tentativas de retry

1. Aumentar DELIVERY_TIMEOUT_MS se cliente é lento
2. Consultar status do cliente callback
3. Verificar firewall/SG para bloqueios

### Mensagens em DLQ

1. Extrair payload de DLQ
2. Validar com `webhook-normalizer`
3. Corrigir dados e reenviar

## Performance

- **Processamento**: ~100-500ms por webhook
- **Batch size**: até 10 mensagens (padrão SQS)
- **Concorrência**: Múltiplas instâncias Lambda processam lotes em paralelo
- **Throughput**: Escalável conforme tamanho da fila

## Referências

- [AWS Lambda SQS Integration](https://docs.aws.amazon.com/lambda/latest/dg/with-sqs.html)
- [Exponential Backoff](https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter/)
- [Webhook Best Practices](https://webhook.cool/)
