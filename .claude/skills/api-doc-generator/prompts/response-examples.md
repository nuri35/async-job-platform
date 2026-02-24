# Response Example Patterns

Use these patterns to generate realistic example values for Swagger documentation.
Match the pattern to the endpoint type and return structure.

## Single Resource Response

```json
{
  "id": 1,
  "name": "John Doe",
  "email": "john.doe@example.com",
  "role": "user",
  "createdAt": "2025-01-15T10:30:00Z",
  "updatedAt": "2025-01-15T10:30:00Z"
}
```

## Paginated List Response

```json
{
  "data": [
    {
      "id": 1,
      "name": "John Doe",
      "email": "john.doe@example.com"
    }
  ],
  "meta": {
    "total": 150,
    "page": 1,
    "limit": 10,
    "totalPages": 15
  }
}
```

## Auth Response (Login/Register)

```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expiresIn": 3600
}
```

## Error Response (NestJS Default)

```json
{
  "statusCode": 400,
  "message": [
    "email must be a valid email address",
    "password must be at least 8 characters"
  ],
  "error": "Bad Request"
}
```

## Delete Response (204 No Content)

No body — just status code 204.

## Example Values by Property Name

Use these realistic values based on common property names:

| Property Name | Example Value |
|---------------|---------------|
| id            | 1 |
| uuid          | "550e8400-e29b-41d4-a716-446655440000" |
| name          | "John Doe" |
| firstName     | "John" |
| lastName      | "Doe" |
| email         | "john.doe@example.com" |
| password      | "SecureP@ss123" |
| phone         | "+905551234567" |
| address       | "123 Main Street, Istanbul" |
| title         | "Senior Backend Developer" |
| description   | "Detailed description of the resource" |
| slug          | "my-resource-slug" |
| url           | "https://example.com/resource" |
| imageUrl      | "https://example.com/images/photo.jpg" |
| status        | "active" |
| role          | "user" |
| price         | 29.99 |
| quantity       | 5 |
| page          | 1 |
| limit         | 10 |
| total         | 150 |
| isActive      | true |
| isVerified    | true |
| createdAt     | "2025-01-15T10:30:00Z" |
| updatedAt     | "2025-01-15T14:45:00Z" |
| deletedAt     | null |
| startDate     | "2025-02-01" |
| endDate       | "2025-02-28" |
| token         | "eyJhbGciOiJIUzI1NiIs..." |
| code          | "PROMO2025" |
| amount        | 1500.00 |
| currency      | "TRY" |
| country       | "TR" |
| language      | "tr" |
| latitude      | 41.0082 |
| longitude     | 28.9784 |
