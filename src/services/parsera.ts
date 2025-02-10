import {
    ParseraError,
    ParseraRequestBody,
    ParseraResponse,
} from '../types/parsera.js';

export interface ParseraRetryOptions {
    /**
     * Maximum number of retry attempts for failed requests
     * Applies to network errors, timeouts, and rate limits
     * @default 3
     */
    maxRetries?: number;

    /**
     * Multiplier for exponential backoff between retries
     * Each retry will wait: initialDelay * (backoffFactor ^ retryCount)
     * Example: 1000ms, then 2000ms, then 4000ms
     * @default 2
     */
    backoffFactor?: number;

    /**
     * Initial delay (in milliseconds) before the first retry
     * This delay will be multiplied by backoffFactor for subsequent retries
     * @default 1000 (1 second)
     */
    initialDelay?: number;
}

export interface ParseraAttribute {
    /**
     * Name of the attribute to extract
     * This will be the key in the returned data object
     */
    name: string;

    /**
     * Natural language description of what to extract
     * Be as specific as possible about the data you want
     */
    description: string;
}

export interface ParseraCookie {
    /**
     * Cookie properties as key-value pairs
     */
    [key: string]: string;

    /**
     * SameSite attribute for the cookie
     * Controls how the cookie behaves with cross-site requests
     */
    sameSite: 'None' | 'Lax' | 'Strict';
}

export interface ParseraOptions {
    /**
     * Your Parsera API key
     * Required for authentication with the API
     */
    apiKey: string;

    /**
     * Base URL for the Parsera API
     * Only change this if you're using a custom API endpoint
     * @default "https://api.parsera.org/v1"
     */
    baseUrl?: string;

    /**
     * Default country code for proxy servers
     * Used when no specific proxyCountry is provided in the request
     * @example "random" | "UnitedStates" | "UnitedKingdom" | "Germany" | "Japan" | "France" | "Canada"
     * @default "UnitedStates"
     * @see https://api.parsera.org/v1/proxy-countries for full list of supported countries
     */
    defaultProxyCountry?: string;

    /**
     * Maximum time (in milliseconds) to wait for each API request
     * If a request takes longer, it will be aborted and retried
     * @default 30000 (30 seconds)
     */
    timeout?: number;

    /**
     * Configuration for retry behavior on failed requests
     * @see ParseraRetryOptions
     */
    retryOptions?: ParseraRetryOptions;
}

export interface ExtractOptions {
    /**
     * URL of the webpage to extract data from
     * Must be a valid HTTP/HTTPS URL
     */
    url: string;

    /**
     * Attributes to extract from the webpage
     * Can be either an array of ParseraAttribute objects
     * or a Record of name-description pairs
     */
    attributes: ParseraAttribute[] | Record<string, string>;

    /**
     * Country code for proxy server location
     * Overrides the defaultProxyCountry setting
     * @example "US" | "GB" | "DE" | "JP"
     */
    proxyCountry?: string;

    /**
     * Cookies to be sent with the request
     * Useful for accessing pages that require authentication
     */
    cookies?: ParseraCookie[];

    /**
     * Enable precision mode for more accurate extractions
     * May increase processing time
     * @default false
     */
    precisionMode?: boolean;

    /**
     * AbortSignal for request cancellation
     * Allows the request to be aborted if it exceeds timeout
     * or if cancellation is needed
     */
    signal?: AbortSignal;
}

export type ParseraEventType =
    | 'request:start'
    | 'request:end'
    | 'request:retry'
    | 'request:error'
    | 'extract:start'
    | 'extract:complete'
    | 'extract:error'
    | 'rateLimit'
    | 'timeout'
    | string; // Allow custom event types

export interface ParseraEvent<T = unknown> {
    type: ParseraEventType;
    timestamp: number;
    data?: T;
    error?: Error;
    retryCount?: number;
}

export type ParseraEventHandler<T = unknown> = (
    event: ParseraEvent<T>
) => void | Promise<void>;

export interface ParseraEventOptions {
    /**
     * Whether to handle the event asynchronously
     * When true, event handlers won't block the main execution
     * @default false
     */
    async?: boolean;

    /**
     * Whether to catch errors in event handlers
     * When true, errors in handlers won't affect the main execution
     * @default true
     */
    catchErrors?: boolean;
}

export class Parsera {
    private readonly apiKey: string;
    private readonly baseUrl: string;
    private readonly defaultProxyCountry: string;
    private readonly timeout: number;
    private readonly retryOptions: Required<ParseraRetryOptions>;
    private lastRequestTime: number = 0;
    private readonly minRequestInterval: number = 100; // 100ms between requests
    private readonly eventHandlers = new Map<
        ParseraEventType,
        Set<ParseraEventHandler<any>>
    >();

    private readonly eventOptions = new Map<
        ParseraEventType,
        ParseraEventOptions
    >();

    /**
     * Creates a new Parsera client instance.
     *
     * @example
     * ```typescript
     * const parsera = new Parsera({
     *     timeout: 60000, // 60 second timeout
     *     retryOptions: {
     *         maxRetries: 3,
     *         backoffFactor: 2,
     *         initialDelay: 1000,
     *     }
     * });
     * ```
     */
    constructor({
        apiKey,
        baseUrl = 'https://api.parsera.org/v1',
        defaultProxyCountry = 'US',
        timeout = 30000,
        retryOptions = {},
    }: ParseraOptions) {
        this.validateApiKey(apiKey);
        this.apiKey = apiKey;
        this.baseUrl = baseUrl;
        this.defaultProxyCountry = defaultProxyCountry;
        this.timeout = timeout;
        this.retryOptions = {
            maxRetries: retryOptions.maxRetries ?? 3,
            backoffFactor: retryOptions.backoffFactor ?? 2,
            initialDelay: retryOptions.initialDelay ?? 1000,
        };
    }

    private validateApiKey(apiKey: string): void {
        if (!apiKey || typeof apiKey !== 'string' || apiKey.length < 32) {
            throw new Error('Invalid API key format');
        }
    }

    private validateUrl(url: string): void {
        try {
            new URL(url);
        } catch {
            throw new Error('Invalid URL format');
        }
    }

    private async enforceRateLimit(): Promise<void> {
        const now = Date.now();
        const timeSinceLastRequest = now - this.lastRequestTime;

        if (timeSinceLastRequest < this.minRequestInterval) {
            await new Promise((resolve) => setTimeout(
                resolve,
                this.minRequestInterval - timeSinceLastRequest,
            ),
            );
        }
        this.lastRequestTime = Date.now();
    }

    private async fetchWithTimeout(
        url: string,
        options: RequestInit & { timeout?: number },
    ): Promise<Response> {
        const { timeout = this.timeout, ...fetchOptions } = options;

        const controller = new AbortController();
        if (options.signal) {
            options.signal.addEventListener('abort', () => controller.abort());
        }

        const timeoutId = setTimeout(() => controller.abort(), timeout);

        try {
            const response = await fetch(url, {
                ...fetchOptions,
                signal: controller.signal,
            });
            return response;
        } finally {
            clearTimeout(timeoutId);
        }
    }

    private async retryableRequest(
        requestFn: () => Promise<Response>,
        retryCount = 0,
    ): Promise<Response> {
        try {
            await this.enforceRateLimit();
            const response = await requestFn();

            if (
                response.status === 429
                && retryCount < this.retryOptions.maxRetries
            ) {
                await this.emit('rateLimit', { retryCount });
                await this.emit('request:retry', { retryCount });

                const delay = this.retryOptions.initialDelay
                    * this.retryOptions.backoffFactor ** retryCount;
                await new Promise((resolve) => setTimeout(resolve, delay));
                return this.retryableRequest(requestFn, retryCount + 1);
            }

            return response;
        } catch (error) {
            if (error instanceof Error) {
                if (error.name === 'AbortError') {
                    await this.emit('timeout', undefined, error);
                }
                await this.emit('request:error', undefined, error);

                if (
                    retryCount < this.retryOptions.maxRetries
                    && this.isRetryableError(error)
                ) {
                    await this.emit('request:retry', { retryCount });
                    const delay = this.retryOptions.initialDelay
                        * this.retryOptions.backoffFactor ** retryCount;
                    await new Promise((resolve) => setTimeout(resolve, delay));
                    return this.retryableRequest(requestFn, retryCount + 1);
                }
            }
            throw error;
        }
    }

    private isRetryableError(error: unknown): boolean {
        return (
            error instanceof Error
            && (error.message.includes('network')
                || error.message.includes('timeout')
                || error.message.includes('ECONNRESET'))
        );
    }

    /**
     * Converts a Record<string, string> to ParseraAttribute[]
     */
    private convertToAttributes(
        attrs: Record<string, string>,
    ): ParseraAttribute[] {
        return Object.entries(attrs).map(([name, description]) => ({
            name,
            description,
        }));
    }

    /**
     * Registers an event handler for a specific event type
     *
     * @param eventType - Type of event to listen for
     * @param handler - Function to handle the event
     * @param options - Configuration options for event handling
     *
     * @example
     * ```typescript
     * parsera.on('extract:complete', (event) => {
     *     console.log(`Extraction completed with ${event.data.length} items`);
     * });
     *
     * parsera.on('request:retry', (event) => {
     *     console.log(`Retrying request (attempt ${event.retryCount})`);
     * });
     *
     * // Custom event
     * parsera.on('my:custom:event', (event) => {
     *     console.log('Custom event data:', event.data);
     * });
     * ```
     */
    on<T = unknown>(
        eventType: ParseraEventType,
        handler: ParseraEventHandler<T>,
        options: ParseraEventOptions = {},
    ): void {
        if (!this.eventHandlers.has(eventType)) {
            this.eventHandlers.set(eventType, new Set());
        }
        this.eventHandlers
            .get(eventType)!
            .add(handler as ParseraEventHandler<any>);
        this.eventOptions.set(eventType, {
            async: options.async ?? false,
            catchErrors: options.catchErrors ?? true,
        });
    }

    /**
     * Removes an event handler for a specific event type
     */
    off<T = unknown>(
        eventType: ParseraEventType,
        handler: ParseraEventHandler<T>,
    ): void {
        const handlers = this.eventHandlers.get(eventType);
        if (handlers) {
            handlers.delete(handler as ParseraEventHandler<any>);
        }
    }

    /**
     * Removes all event handlers for a specific event type
     */
    removeAllListeners(eventType?: ParseraEventType): void {
        if (eventType) {
            this.eventHandlers.delete(eventType);
        } else {
            this.eventHandlers.clear();
        }
    }

    private async emit<T = unknown>(
        eventType: ParseraEventType,
        data?: T,
        error?: Error,
        retryCount?: number,
    ): Promise<void> {
        const handlers = this.eventHandlers.get(eventType);
        if (!handlers?.size) return;

        const event: ParseraEvent<T> = {
            type: eventType,
            timestamp: Date.now(),
            data,
            error,
            retryCount,
        };

        const options = this.eventOptions.get(eventType) ?? {
            async: false,
            catchErrors: true,
        };

        const handleEvent = async (handler: ParseraEventHandler<any>) => {
            try {
                await handler(event);
            } catch (error) {
                if (!options.catchErrors) {
                    throw error;
                }
                await this.emit('handler:error', undefined, error as Error);
            }
        };

        if (options.async) {
            handlers.forEach((handler) => {
                handleEvent(handler).catch(() => {});
            });
        } else {
            await Promise.all(
                Array.from(handlers).map((handler) => handleEvent(handler)),
            );
        }
    }

    /**
     * Extracts data from a webpage using the Parsera API.
     *
     * @param options - Configuration options for the extraction
     * @returns Promise resolving to an array of extracted data objects
     *
     * @throws {Error} When API key is invalid
     * @throws {Error} When URL is invalid
     * @throws {Error} When request times out
     * @throws {Error} When rate limit is exceeded (after retries)
     * @throws {Error} When no data is found
     *
     * @example
     * ```typescript
     * // Basic usage with attribute record
     * const results = await parsera.extract({
     *     url: "https://example.com/products",
     *     attributes: {
     *         title: "Extract the product title",
     *         price: "Get the product price",
     *     }
     * });
     *
     * // Advanced usage with all options
     * const results = await parsera.extract({
     *     url: "https://example.com/products",
     *     attributes: [
     *         { name: "title", description: "Extract the product title" },
     *         { name: "price", description: "Get the product price" }
     *     ],
     *     proxyCountry: "GB",
     *     cookies: [
     *         { name: "session", value: "abc123", sameSite: "Lax" }
     *     ],
     *     precisionMode: true,
     *     signal: abortController.signal
     * });
     *
     * // With request cancellation
     * const controller = new AbortController();
     * const promise = parsera.extract({
     *     url: "https://example.com",
     *     attributes: { title: "Extract the title" },
     *     signal: controller.signal
     * });
     *
     * // Cancel the request after 5 seconds
     * setTimeout(() => controller.abort(), 5000);
     * ```
     *
     * @example
     * // Example return value:
     * [
     *     {
     *         "title": "Product Name",
     *         "price": "$99.99"
     *     },
     *     {
     *         "title": "Another Product",
     *         "price": "$149.99"
     *     }
     * ]
     */
    async extract({
        url,
        attributes,
        proxyCountry,
        cookies,
        precisionMode,
        signal,
    }: ExtractOptions): Promise<Record<string, string>[]> {
        await this.emit('extract:start', {
            url,
            attributes,
            proxyCountry,
            cookies,
            precisionMode,
            signal,
        });

        this.validateUrl(url);

        try {
            const requestBody: ParseraRequestBody = {
                url,
                attributes: Array.isArray(attributes)
                    ? attributes
                    : this.convertToAttributes(attributes),
                proxy_country: proxyCountry || this.defaultProxyCountry,
            };

            if (cookies) {
                requestBody.cookies = cookies;
            }

            if (precisionMode) {
                requestBody.mode = 'precision';
            }

            const response = await this.retryableRequest(() => this.fetchWithTimeout(`${this.baseUrl}/extract`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-API-KEY': this.apiKey,
                },
                body: JSON.stringify(requestBody),
                signal,
            }),
            );

            if (!response.ok) {
                await this.handleError(response);
            }

            const data = (await response.json()) as ParseraResponse;

            await this.emit('extract:complete', data);
            return data.data;
        } catch (error) {
            if (error instanceof Error) {
                await this.emit('extract:error', undefined, error);
                throw new Error(`Failed to extract data: ${error.message}`);
            }
            throw new Error('Failed to extract data: Unknown error');
        }
    }

    /**
     * Alias for extract method to match Python library interface.
     *
     * @see {@link extract} for full documentation and examples
     *
     * @example
     * ```typescript
     * const results = await parsera.run({
     *     url: "https://example.com",
     *     attributes: { title: "Extract the title" }
     * });
     * ```
     */
    async run(options: ExtractOptions): Promise<Record<string, string>[]> {
        return this.extract(options);
    }

    /**
     * Alias for extract method to match Python library interface.
     *
     * @see {@link extract} for full documentation and examples
     *
     * @example
     * ```typescript
     * const results = await parsera.arun({
     *     url: "https://example.com",
     *     attributes: { title: "Extract the title" }
     * });
     * ```
     */
    async arun(options: ExtractOptions): Promise<Record<string, string>[]> {
        return this.extract(options);
    }

    private async handleError(response: Response): Promise<never> {
        const { status } = response;
        const errorData = (await response.json()) as ParseraError;

        switch (status) {
            case 401:
                throw new Error(
                    'Invalid Parsera API key. Please check your credentials.',
                );
            case 429:
                throw new Error('Rate limit exceeded. Please try again later.');
            case 400:
                throw new Error(
                    `Bad request: ${errorData?.message || 'Unknown error'}`,
                );
            default:
                throw new Error(
                    `Parsera API error: ${
                        errorData?.message || response.statusText
                    }`,
                );
        }
    }
}
