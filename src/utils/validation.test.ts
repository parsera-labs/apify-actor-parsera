import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';
import { validateInput } from './validation.js';
import { createInputSchema } from '../schemas/input.js';

vi.mock('../schemas/input.js', () => ({
    createInputSchema: vi.fn(),
}));

const createMockSchema = () => {
    const CookieSchema = z
        .object({
            sameSite: z.enum(['None', 'Lax', 'Strict']),
        })
        .catchall(z.string());

    return z.object({
        url: z.string().url(),
        attributes: z
            .array(
                z.object({
                    name: z.string().min(1, 'Name must not be empty'),
                    description: z
                        .string()
                        .min(1, 'Description must not be empty'),
                }),
            )
            .min(1, 'At least one attribute is required'),
        proxyCountry: z.string().optional(),
        cookies: z.array(CookieSchema).optional(),
        precisionMode: z.boolean().optional(),
    });
};

describe('validateInput', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should validate correct minimal input successfully', async () => {
        const validInput = {
            url: 'https://example.com',
            attributes: [
                {
                    name: 'title',
                    description: 'The title of the page',
                },
            ],
        };

        const mockSchema = createMockSchema();
        vi.mocked(createInputSchema).mockResolvedValue(mockSchema);

        const result = await validateInput(validInput);
        expect(result).toEqual(validInput);
    });

    it('should validate input with all optional fields', async () => {
        const validInput = {
            url: 'https://example.com',
            attributes: [
                {
                    name: 'title',
                    description: 'The title of the page',
                },
            ],
            proxyCountry: 'us',
            cookies: [{ sameSite: 'Lax', name: 'test', value: 'value' }],
            precisionMode: true,
        };

        const mockSchema = createMockSchema();
        vi.mocked(createInputSchema).mockResolvedValue(mockSchema);

        const result = await validateInput(validInput);
        expect(result).toEqual(validInput);
    });

    it('should throw error for missing required fields', async () => {
        const invalidInput = {
            url: 'https://example.com',
            attributes: [],
        };

        const mockSchema = createMockSchema();
        vi.mocked(createInputSchema).mockResolvedValue(mockSchema);

        await expect(validateInput(invalidInput)).rejects.toThrow();
    });

    it('should throw error for invalid URL format', async () => {
        const invalidInput = {
            url: 'not-a-url',
            attributes: [
                {
                    name: 'title',
                    description: 'The title of the page',
                },
            ],
        };

        const mockSchema = createMockSchema();
        vi.mocked(createInputSchema).mockResolvedValue(mockSchema);

        await expect(validateInput(invalidInput)).rejects.toThrow();
    });

    it('should throw error with formatted message for empty attributes array', async () => {
        const invalidInput = {
            url: 'https://example.com',
            attributes: [],
        };

        const mockSchema = createMockSchema();
        vi.mocked(createInputSchema).mockResolvedValue(mockSchema);

        await expect(async () => {
            await validateInput(invalidInput);
        }).rejects.toThrow('Input validation failed');

        await expect(async () => {
            await validateInput(invalidInput);
        }).rejects.toThrow('At least one attribute is required');
    });

    it('should throw error with formatted message for empty strings', async () => {
        const invalidInput = {
            url: 'https://example.com',
            attributes: [{ name: '', description: '' }],
        };

        const mockSchema = createMockSchema();
        vi.mocked(createInputSchema).mockResolvedValue(mockSchema);

        await expect(async () => {
            await validateInput(invalidInput);
        }).rejects.toThrow('Input validation failed');

        await expect(async () => {
            await validateInput(invalidInput);
        }).rejects.toThrow('Name must not be empty');

        await expect(async () => {
            await validateInput(invalidInput);
        }).rejects.toThrow('Description must not be empty');
    });

    it('should validate input with invalid cookie format', async () => {
        const invalidInput = {
            url: 'https://example.com',
            attributes: [{ name: 'title', description: 'test' }],
            cookies: [{ sameSite: 'Invalid' }], // Invalid sameSite value
        };

        const mockSchema = createMockSchema();
        vi.mocked(createInputSchema).mockResolvedValue(mockSchema);

        await expect(validateInput(invalidInput)).rejects.toThrow();
    });

    it('should handle multiple attributes correctly', async () => {
        const validInput = {
            url: 'https://example.com',
            attributes: [
                {
                    name: 'title',
                    description: 'The title of the page',
                },
                {
                    name: 'price',
                    description: 'Product price',
                },
                {
                    name: 'description',
                    description: 'Product description',
                },
            ],
        };

        const mockSchema = createMockSchema();
        vi.mocked(createInputSchema).mockResolvedValue(mockSchema);

        const result = await validateInput(validInput);
        expect(result).toEqual(validInput);
    });

    it('should handle multiple cookies correctly', async () => {
        const validInput = {
            url: 'https://example.com',
            attributes: [{ name: 'title', description: 'test' }],
            cookies: [
                { sameSite: 'Lax', name: 'session', value: '123' },
                { sameSite: 'Strict', name: 'preference', value: 'dark' },
                { sameSite: 'None', name: 'tracking', value: 'allowed' },
            ],
        };

        const mockSchema = createMockSchema();
        vi.mocked(createInputSchema).mockResolvedValue(mockSchema);

        const result = await validateInput(validInput);
        expect(result).toEqual(validInput);
    });

    it('should validate extremely long URLs', async () => {
        const longUrl = `https://example.com/${'a'.repeat(2000)}`;
        const validInput = {
            url: longUrl,
            attributes: [{ name: 'title', description: 'test' }],
        };

        const mockSchema = createMockSchema();
        vi.mocked(createInputSchema).mockResolvedValue(mockSchema);

        const result = await validateInput(validInput);
        expect(result).toEqual(validInput);
    });

    it('should handle unicode characters in attributes', async () => {
        const validInput = {
            url: 'https://example.com',
            attributes: [
                {
                    name: 'título',
                    description: '描述 - 説明 - 설명',
                },
            ],
        };

        const mockSchema = createMockSchema();
        vi.mocked(createInputSchema).mockResolvedValue(mockSchema);

        const result = await validateInput(validInput);
        expect(result).toEqual(validInput);
    });

    it('should validate all proxy country options', async () => {
        const validInputs = [
            {
                url: 'https://example.com',
                attributes: [{ name: 'title', description: 'test' }],
                proxyCountry: 'us',
            },
            {
                url: 'https://example.com',
                attributes: [{ name: 'title', description: 'test' }],
                proxyCountry: 'random',
            },
        ];

        const mockSchema = createMockSchema();
        vi.mocked(createInputSchema).mockResolvedValue(mockSchema);

        for (const input of validInputs) {
            const result = await validateInput(input);
            expect(result).toEqual(input);
        }
    });

    it('should handle boolean precision mode values correctly', async () => {
        const validInputs = [
            {
                url: 'https://example.com',
                attributes: [{ name: 'title', description: 'test' }],
                precisionMode: true,
            },
            {
                url: 'https://example.com',
                attributes: [{ name: 'title', description: 'test' }],
                precisionMode: false,
            },
        ];

        const mockSchema = createMockSchema();
        vi.mocked(createInputSchema).mockResolvedValue(mockSchema);

        for (const input of validInputs) {
            const result = await validateInput(input);
            expect(result).toEqual(input);
        }
    });
});
