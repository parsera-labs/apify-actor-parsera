import axios, { AxiosError } from "axios";
import { log } from "apify";
import {
    PARSERA_API_BASE_URL,
    DEFAULT_PROXY_COUNTRY,
} from "../config/constants.js";
import {
    BaseInput,
    ParseraError,
    ParseraRequestBody,
    ParseraResponse,
} from "../types/parsera.js";

/**
 * Handles errors from the Parsera API and throws appropriate error messages
 * @param error - The Axios error response from Parsera API
 * @throws {Error} With a user-friendly error message
 * @internal
 */
export const handleParseraError = (error: AxiosError<ParseraError>) => {
    const status = error.response?.status;
    const errorData = error.response?.data;

    switch (status) {
        case 401:
            throw new Error(
                "Invalid Parsera API key. Please check your credentials."
            );
        case 429:
            throw new Error("Rate limit exceeded. Please try again later.");
        case 400:
            throw new Error(
                `Bad request: ${errorData?.message || "Unknown error"}`
            );
        default:
            throw new Error(
                `Parsera API error: ${errorData?.message || error.message}`
            );
    }
};

/**
 * Extracts data from a webpage using the Parsera API
 * @param params - Input configuration for the extraction
 * @returns Promise resolving to an array of extracted data objects
 * @throws {Error} If extraction fails or API returns an error
 */
export const extractData = async ({
    url,
    apiKey,
    attributes,
    proxyCountry,
    cookies,
    precisionMode,
}: BaseInput): Promise<Record<string, string>[]> => {
    try {
        log.info("Starting data extraction", { url, proxyCountry });

        const requestBody: ParseraRequestBody = {
            url,
            attributes,
            proxy_country: proxyCountry || DEFAULT_PROXY_COUNTRY,
        };

        if (cookies) {
            requestBody.cookies = cookies;
        }

        if (precisionMode) {
            requestBody.mode = "precision";
        }

        const response = await axios.post<ParseraResponse>(
            `${PARSERA_API_BASE_URL}/extract`,
            requestBody,
            {
                headers: {
                    "Content-Type": "application/json",
                    "X-API-KEY": apiKey,
                },
                timeout: 30000,
            }
        );

        log.info("Data extraction successful", {
            url,
            itemCount: response.data.data.length,
            proxyCountry: requestBody.proxy_country,
        });

        return response.data.data;
    } catch (error) {
        if (axios.isAxiosError(error) && error.response) {
            handleParseraError(error);
        }
        throw new Error(
            `Failed to extract data: ${
                error instanceof Error ? error.message : "Unknown error"
            }`
        );
    }
};
