---
title: Advanced Guide
tags: [advanced, guide]
---

# Advanced Topics

This guide covers advanced usage patterns.

## Custom Middleware

You can add custom middleware to the request pipeline:

```typescript
app.use(async (ctx, next) => {
  console.log('Request:', ctx.method, ctx.path)
  await next()
})
```

## Performance Tuning

For high-traffic applications, consider these optimizations:

- Enable connection pooling
- Use caching headers
- Implement rate limiting

```yaml
performance:
  pool_size: 10
  cache_ttl: 3600
  rate_limit: 100
```

## Plugins

The plugin system allows extending functionality:

```typescript
import { definePlugin } from 'my-package'

export default definePlugin({
  name: 'my-plugin',
  setup(app) {
    app.on('request', (req) => {
      // handle request
    })
  }
})
```
