# Parsera Actor

Extract structured data from any website using [Parsera's](https://parsera.org) AI-powered data extraction API.

## 🔑 Getting Started

1. Get your Parsera API key at [parsera.org/apify](https://parsera.org/apify) (20 free credits)
2. Add your API key to the actor input

[Screenshot placeholder: Adding API key to actor input]

## 📝 Input Configuration

The actor accepts the following input parameters:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `url` | String | Yes | The target URL to extract data from |
| `apiKey` | String | Yes | Your Parsera API key |
| `attributes` | Array | Yes | List of data attributes to extract |
| `proxyCountry` | String | No | Country for proxy IP (defaults to United States) |
| `cookies` | Array | No | Cookies to inject into the request |
| `precisionMode` | Boolean | No | Enable high-precision extraction mode |

### Attributes Structure

Each attribute in the `attributes` array should have:

- `name`: Identifier for the extracted data
- `description`: Natural language description of what to extract

## 💡 Tips

- Use precise, detailed descriptions in your attributes for better extraction accuracy
- Enable `precisionMode` for highest accuracy (uses more credits)
- Test your extraction pattern on a few pages before running large-scale scrapes

## 📊 Usage Limits

- Each successful extraction consumes 1 Parsera credit (2 credits with `precisionMode`)
- Check your credit balance at [parsera.org/dashboard](https://parsera.org/app)
- Need more credits? Visit [parsera.org/pricing](https://parsera.org/pricing)

## 🤝 Support

- Documentation: [docs.parsera.org](https://docs.parsera.org)
- Email: <support@parsera.org>
- Discord: [Join our community](https://discord.gg/parsera)
