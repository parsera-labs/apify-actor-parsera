import { z } from "zod";
import { BaseInput } from "../types/parsera.js";
import { createInputSchema } from "../schemas/input.js";

/**
 * Validates the input configuration for the Actor using Zod
 * @param input - The input object to validate
 * @throws {Error} If any validation fails with detailed error messages
 * @returns The validated input object
 */
export const validateInput = async (input: unknown): Promise<BaseInput> => {
    try {
        const schema = await createInputSchema();
        return schema.parse(input) as BaseInput;
    } catch (error) {
        if (error instanceof z.ZodError) {
            const errorMessages = error.errors
                .map((err) => `${err.path.join(".")}: ${err.message}`)
                .join("\n");
            throw new Error(`Input validation failed:\n${errorMessages}`);
        }
        throw error;
    }
};
