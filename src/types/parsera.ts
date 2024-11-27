export interface BaseInput {
    url: string;
    apiKey: string;
    attributes: {
        name: string;
        description: string;
    }[];
    proxyCountry?: string;
    cookies?: {
        [key: string]: string;
        sameSite: "None" | "Lax" | "Strict";
    }[];
    precisionMode?: boolean;
}

export interface ParseraResponse {
    /** Array of extracted data objects */
    data: Record<string, string>[];
}

export interface ParseraError {
    /** Error message from the API */
    message: string;
    /** Error code for identifying the type of error */
    code: string;
}

export interface ParseraRequestBody {
    /** Target URL to extract data from */
    url: string;
    /** Array of attributes to extract */
    attributes: {
        name: string;
        description: string;
    }[];
    /** Country for proxy IP */
    proxy_country?: string;
    /** Cookies to inject into the request */
    cookies?: {
        [key: string]: string;
        sameSite: "None" | "Lax" | "Strict";
    }[];
    /** Extraction mode: "standard" or "precision" */
    mode?: "standard" | "precision";
}
