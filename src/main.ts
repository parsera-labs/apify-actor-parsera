import { Actor, log } from "apify";
import { validateInput } from "./utils/validation.js";
import { extractData } from "./services/parsera.js";

// The init() call configures the Actor for its environment
await Actor.init();

try {
    // Validate input
    const input = await validateInput(await Actor.getInput());

    // Extract data using Parsera API
    const extractedData = await extractData(input);

    // Save extracted data to Dataset
    await Actor.pushData(extractedData);

    log.info("Actor finished successfully", {
        extractedItemCount: extractedData.length,
    });
} catch (error) {
    log.error("Actor failed", {
        error: error instanceof Error ? error.message : "Unknown error",
    });
    throw error;
} finally {
    // Gracefully exit the Actor process
    await Actor.exit();
}
