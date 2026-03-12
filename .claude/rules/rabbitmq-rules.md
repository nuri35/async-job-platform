# RabbitMQ Rules

## Topic Exchange

Tek exchange: `app_exchange` (type: topic). Publisher queue adını bilmez, routing key kullanır.

```
app_exchange (topic)
  email.# → email_queue
  job.#   → job_queue (ileride)
```

## Routing Keys

Yeni email type eklerken: `ROUTING_KEYS` constant'a ekle, `email.` prefix kullan. Exchange config'e dokunma — `email.#` binding otomatik yakalar.

```
email.lock      → lock notification
email.welcome   → welcome email (ileride)
email.verify    → verification email (ileride)
email.reset     → password reset email (ileride)
```

Constants: `libs/common/src/rabbitmq/rabbitmq.constants.ts`

## DLQ Pattern

3 retry (2s → 5s → 15s), sonra `email_queue_dlq`'ya taşı. Consumer'da manual ack/nack kullan (`noAck: false`).

```
Başarılı → channel.ack(message)
Retry < 3 → delay → channel.nack(message, false, true)   // requeue
Retry >= 3 → channel.nack(message, false, false)          // DLQ'ya
```

Retry count: `message.properties.headers['x-death'][0].count`

## Publisher Pattern

Fire-and-forget: `client.emit()` + `.subscribe({ error })`. Await KULLANMA — login/register response'u bloklar.

## Yeni Queue Ekleme

1. `rabbitmq.constants.ts` → QUEUE_NAMES, ROUTING_KEYS, RMQ_TOKENS ekle
2. İlgili module → `RabbitmqModule.forFeature(token, queueName)` import et
3. `main.ts` → yeni `connectMicroservice()` bloğu ekle (binding + DLQ arguments)
4. Consumer controller oluştur → `@EventPattern(ROUTING_KEY)` ile dinle

## Hybrid App

`main.ts` sırası önemli:
1. `connectMicroservice()` — RabbitMQ listener ekle
2. `startAllMicroservices()` — RabbitMQ dinlemeye başla
3. `listen()` — HTTP dinlemeye başla

Sırayı değiştirme.