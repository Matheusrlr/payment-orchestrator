# Webhook Receiver Lambda

Recebe webhooks de gateways de pagamento e os coloca em fila para processamento assíncrono.

## Responsabilidades

- ✅ Validar origem do webhook (gateway)
- ✅ Validar estrutura do payload
- ✅ Enfileirar webhook para processamento
- ✅ Retornar 202 Accepted imediatamente
- ✅ Logger estruturado de todas as operações

## Fluxo de Processamento

```
1. Receber webhook
   ├─ Extrair gateway da URL (/webhooks/{gateway})
   ├─ Validar gateway é conhecido
   ├─ Parsear JSON do body
   └─ Validar payload não está vazio

2. Enfileirar para Processamento
   ├─ Criar mensagem estruturada
   ├─ Enviar para fila SQS
   ├─ Configurar atributos de roteamento
   └─ Confirmar enfileiramento

3. Retornar Resposta
   ├─ Status 202 Accepted
   ├─ Confirmar recebimento
   └─ Indicar processamento assíncrono
```

## Estrutura de Arquivos

```
lambdas/webhook-receiver/
├── index.js                    # Handler Lambda
├── service.js                  # Lógica de processamento
├── handlers/
│   └── response-handler.js     # Formatação HTTP
├── package.json                # Dependências
└── README.md                   # Este arquivo
```

## Dependências

```json
{
  "@aws-sdk/client-sqs": "^3.0.0"
}
```

## Variáveis de Ambiente

| Variável | Descrição | Exemplo |
|----------|-----------|---------|
| `WEBHOOK_QUEUE_URL` | URL da fila SQS | `https://sqs.us-east-1.amazonaws.com/123/webhook-queue` |
| `DEBUG` | Ativar logs de debug | `true` / `false` |

## Exemplos

### Webhook EFI (Pix)

```bash
curl -X POST https://api.example.com/webhooks/efi \
  -H "Content-Type: application/json" \
  -d '{
    "pix": [
      {
        "txid": "...",
        "valor": 99.99,
        "status": "RECEBIDA",
        "horario": "2024-02-26T10:30:00Z"
      }
    ]
  }'
```

### Webhook Stripe

```bash
curl -X POST https://api.example.com/webhooks/stripe \
  -H "Content-Type: application/json" \
  -d '{
    "type": "payment_intent.succeeded",
    "data": {
      "object": {
        "id": "pi_123",
        "status": "succeeded",
        "amount": 9999
      }
    }
  }'
```

### Resposta (202 Accepted)

```json
{
  "message": "Webhook accepted for processing"
}
```

### Resposta de Erro (400 Bad Request)

```json
{
  "error": "ValidationError",
  "message": "Gateway in URL path is required",
  "code": "VALIDATION_ERROR",
  "timestamp": "2024-02-26T10:30:00Z",
  "details": {
    "field": "gateway"
  }
}
```

## Códigos de Erro

### 202 Accepted
Webhook recebido e enfileirado com sucesso

### 400 Bad Request
- **VALIDATION_ERROR**: Gateway inválido ou payload mal formado

### 500 Internal Server Error
- **INTERNAL_ERROR**: Erro ao enfileirar na SQS

## Segurança

### Validações Implementadas

- ✅ Gateway existe em lista conhecida
- ✅ Payload não está vazio
- ✅ JSON é válido
- ✅ Mensagens SQS têm TTL

### Recomendações Adicionais

- Verificar assinatura do webhook (HMAC)
- Autenticar origem do IP
- Rate limiting por gateway
- Monitorar fila SQS

## Integração com Worker

O webhook é enfileirado com este formato:

```json
{
  "gateway": "efi",
  "payload": { /* dados originais */ },
  "receivedAt": "2024-02-26T10:30:00Z"
}
```

A Lambda `worker` consome essas mensagens e as processa.

## Monitoramento

Métricas em CloudWatch:

- `WebhookReceived`: Webhooks recebidos por gateway
- `WebhookQueued`: Webhooks enfileirados com sucesso
- `WebhookFailed`: Falhas ao enfileirar
- `SQSQueueDepth`: Profundidade da fila

## Troubleshooting

### Webhook não está sendo processado

1. Verificar fila SQS (profundidade > 0)
2. Verificar logs do worker
3. Verificar permissões IAM de SQS

### Muitos erros 400

1. Validar formato do webhook do gateway
2. Verificar se gateway é conhecido
3. Garantir JSON válido no body
