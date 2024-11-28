import { Actor, log } from "apify";
import { validateInput } from "./utils/validation.js";
import { ExtractOptions, Parsera } from "./services/parsera.js";
import type { ParseraResponse } from "./types/parsera.js";

await Actor.init();

try {
    const input = await validateInput(await Actor.getInput());

    const parsera = new Parsera({
        apiKey: input.apiKey,
        timeout: 60000,
        retryOptions: {
            maxRetries: 3,
            backoffFactor: 2,
            initialDelay: 1000,
        },
        defaultProxyCountry: input.proxyCountry || "UnitedStates",
    });

    // Set up event handlers with proper typing
    parsera.on<ExtractOptions>("extract:start", (event) => {
        log.info("Starting extraction process", {
            url: event.data?.url,
            attributes: event.data?.attributes,
        });
    });

    parsera.on("request:retry", (event) => {
        log.warning("Retrying request", {
            attemptNumber: (event.retryCount ?? 0) + 1,
            timestamp: new Date(event.timestamp).toISOString(),
        });
    });

    parsera.on("rateLimit", () => {
        log.warning("Rate limit hit, backing off...");
    });

    parsera.on("request:error", (event) => {
        log.error("Request failed", {
            error: event.error?.message,
            timestamp: new Date(event.timestamp).toISOString(),
        });
    });

    parsera.on<ParseraResponse>("extract:complete", (event) => {
        log.info("Extraction completed successfully", {
            itemCount: event.data?.data?.length ?? 0,
            timestamp: new Date(event.timestamp).toISOString(),
        });
    });

    parsera.on("timeout", (event) => {
        log.warning("Request timed out", {
            error: event.error?.message,
            timestamp: new Date(event.timestamp).toISOString(),
        });
    });

    // Set up global timeout
    const controller = new AbortController();
    const timeout = setTimeout(() => {
        controller.abort();
        log.warning("Extraction timed out after 5 minutes");
    }, 5 * 60 * 1000);

    try {
        const extractedData = await parsera.extract({
            ...input,
            signal: controller.signal,
            precisionMode: false, // Default to false
        });

        await Actor.pushData(extractedData);

        log.info("Actor finished successfully", {
            extractedItemCount: extractedData.length,
            lastRunAt: new Date().toISOString(),
        });
    } finally {
        clearTimeout(timeout);
        parsera.removeAllListeners(); // Clean up event listeners
    }
} catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
        log.error("Extraction was aborted", {
            error: error.message,
            timestamp: new Date().toISOString(),
        });
    } else {
        log.error("Actor failed", {
            error: error instanceof Error ? error.message : "Unknown error",
            timestamp: new Date().toISOString(),
        });
    }
    throw error;
} finally {
    await Actor.exit();
}
