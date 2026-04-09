# API Reference

This document covers the full API surface.

## Authentication

All API calls require authentication via bearer token.

```typescript
const client = new Client({
  token: 'your-token-here'
})
```

### Bearer Token

Pass the token in the Authorization header:

```http
Authorization: Bearer your-token-here
```

### API Key

Alternatively, use an API key:

```http
X-API-Key: your-key-here
```

## Endpoints

### GET /users

Returns a list of users.

```typescript
const users = await client.getUsers()
```

### POST /users

Create a new user.

```typescript
const user = await client.createUser({
  name: 'John',
  email: 'john@example.com'
})
```

## Error Handling

The API returns standard HTTP error codes.

| Code | Meaning |
|------|---------|
| 400  | Bad Request |
| 401  | Unauthorized |
| 404  | Not Found |
| 500  | Internal Server Error |
