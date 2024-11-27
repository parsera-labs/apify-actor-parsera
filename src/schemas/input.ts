import { z } from "zod";
import axios from "axios";
import { PARSERA_API_BASE_URL } from "../config/constants.js";
import { log } from "apify";

export const AttributeSchema = z.object({
    name: z.string().min(1, "Attribute name must not be empty"),
    description: z.string().min(1, "Attribute description must not be empty"),
});

export const CookieSchema = z
    .object({
        sameSite: z.enum(["None", "Lax", "Strict"]),
    })
    .catchall(z.string());

/**
 * Fetches the list of valid proxy countries from Parsera API
 * @returns A Zod enum schema of valid proxy countries
 */
export const getProxyCountriesSchema = async () => {
    try {
        const response = await axios.get<Record<string, string>>(
            `${PARSERA_API_BASE_URL}/proxy-countries`
        );
        const proxyCountries = Object.keys(response.data);
        return z.enum(["random", ...proxyCountries] as [string, ...string[]]);
    } catch (error) {
        log.warning(
            "Failed to fetch proxy countries. Using default validation.",
            { error }
        );
        // Fallback to basic string validation if API call fails
        return z.string();
    }
};

// Create the input schema with async proxy country validation
export const createInputSchema = async () => {
    const proxyCountriesSchema = await getProxyCountriesSchema();

    return z.object({
        url: z.string().url("Invalid URL format"),
        apiKey: z.string().min(1, "API key must not be empty"),
        attributes: z
            .array(AttributeSchema)
            .min(1, "At least one attribute is required"),
        proxyCountry: proxyCountriesSchema.optional(),
        cookies: z.array(CookieSchema).optional(),
        precisionMode: z.boolean().optional(),
    });
};
