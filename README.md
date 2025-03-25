<a href="https://apify.com/parsera-labs/parsera?fpr=czveg"><img src="https://apify.com/ext/run-on-apify.png" alt="Run Parsera Actor on Apify" width="126" height="28" /></a>

# Parsera Actor

Extract structured data from any website using [Parsera's](https://parsera.org) AI-powered data extraction API.
PS: Check out our AI Scraping Agents at Parsera.org! They extract data from URLs and HTML by generating scraping scripts and automatically adapting to changes on the data source side. 

## Example
Input url you want to scrape in `Basic Configuration` > `Target URL`, and list columns to extract in `Extraction Settings` > `Extraction Attributes`.
For example, you can extract list of articles from `https://news.ycombinator.com/` by putting this value into `Target URL` and filling `Extraction Attributes` with:
```json
[
    {
        "description": "News title",
        "name": "title"
    },
    {
        "description": "Number of points",
        "name": "points"
    },
    {
        "description": "Number of comments",
        "name": "nr_comments"
    }
]
```

At end you'll get a table that looks like this:
| nr_comments | points | title |
|-------|------|----------|
| 11 | 41 | The Inevitability of the Borrow Checker |
| 1 | 19 | When Louis Armstrong Conquered Chicago |
| 448 | 689 | Meta torrented & seeded 81.7 TB dataset containing copyrighted data |
| ... | ... | ... |


## 📝 Input Configuration

The actor accepts the following input parameters:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `url` | String | Yes | The target URL to extract data from |
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
- The speed of the response depends mainly on the LLM output so if you're collecting a lot of data, the response time will increase. We're working on a code generation sytem to provide back data instantly, so stay tuned and sign up for news at https://parsera.org!

## 📊 Usage Limits

- Each successful extraction consumes 1 Parsera credit (10 credits with `precisionMode`)
- Check your credit balance at [parsera.org/dashboard](https://parsera.org/app)
- Need more credits? Visit [parsera.org/pricing](https://parsera.org/pricing)

## 🤝 Support

- Documentation: [docs.parsera.org](https://docs.parsera.org)
- Email: <contact@parsera.org>
- Discord: [Join our community](https://discord.gg/parsera)
