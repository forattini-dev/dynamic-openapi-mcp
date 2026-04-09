---
title: Getting Started
description: How to get started with the project
tags: [guide, setup, quickstart]
version: 2
draft: false
---

Welcome to the project! This is the preamble content before the first heading.

# Installation

Install the package using npm:

```bash
npm install my-package
```

Or with yarn:

```bash
yarn add my-package
```

## Configuration

Create a config file in your project root:

```json
{
  "name": "my-app",
  "port": 3000
}
```

See the [API Reference](api-reference.md) for more details.

## Environment Variables

Set the following environment variables:

- `API_KEY` - Your API key
- `DEBUG` - Enable debug mode

Check [the docs](https://example.com/docs) for more info.

# Usage

Here is a basic usage example:

```typescript
import { create } from 'my-package'

const app = create({ port: 3000 })
app.start()
```

## Advanced Usage

For advanced scenarios, see the [advanced guide](guides/advanced.md).
