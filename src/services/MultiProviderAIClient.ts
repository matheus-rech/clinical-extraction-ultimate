/**
 * MultiProviderAIClient
 * Unified AI client supporting Gemini, Anthropic, and OpenAI
 */

import { AIConfig, AIProvider } from '../config';
import { GoogleGenAI } from '@google/genai';
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';

// Current provider state (mutable)
let currentProvider: AIProvider = AIConfig.provider;

// Client instances (lazy initialized)
let geminiClient: GoogleGenAI | null = null;
let anthropicClient: Anthropic | null = null;
let openaiClient: OpenAI | null = null;

/**
 * Get or create Gemini client
 */
function getGeminiClient(): GoogleGenAI {
    if (!geminiClient) {
        const key = AIConfig.gemini.apiKey;
        if (!key) throw new Error('Gemini API key not configured');
        geminiClient = new GoogleGenAI({ apiKey: key });
    }
    return geminiClient;
}

/**
 * Get or create Anthropic client
 */
function getAnthropicClient(): Anthropic {
    if (!anthropicClient) {
        const key = AIConfig.anthropic.apiKey;
        if (!key) throw new Error('Anthropic API key not configured');
        anthropicClient = new Anthropic({ apiKey: key, dangerouslyAllowBrowser: true });
    }
    return anthropicClient;
}

/**
 * Get or create OpenAI client
 */
function getOpenAIClient(): OpenAI {
    if (!openaiClient) {
        const key = AIConfig.openai.apiKey;
        if (!key) throw new Error('OpenAI API key not configured');
        openaiClient = new OpenAI({ apiKey: key, dangerouslyAllowBrowser: true });
    }
    return openaiClient;
}

/**
 * Generic request/response types
 */
interface AIRequest {
    prompt: string;
    systemPrompt?: string;
    temperature?: number;
    maxTokens?: number;
}

interface AIResponse {
    text: string;
    provider: AIProvider;
    model: string;
    usage?: {
        inputTokens: number;
        outputTokens: number;
    };
}

/**
 * Main multi-provider client
 */
export const MultiProviderAIClient = {
    /**
     * Get current provider
     */
    getProvider(): AIProvider {
        return currentProvider;
    },

    /**
     * Set current provider
     */
    setProvider(provider: AIProvider): void {
        currentProvider = provider;
        console.log(`🔄 AI Provider switched to: ${provider}`);
    },

    /**
     * Check if provider is configured (has API key)
     */
    isProviderConfigured(provider: AIProvider): boolean {
        switch (provider) {
            case 'gemini':
                return !!AIConfig.gemini.apiKey;
            case 'anthropic':
                return !!AIConfig.anthropic.apiKey;
            case 'openai':
                return !!AIConfig.openai.apiKey;
            default:
                return false;
        }
    },

    /**
     * Get available providers (those with API keys configured)
     */
    getAvailableProviders(): AIProvider[] {
        const providers: AIProvider[] = [];
        if (AIConfig.gemini.apiKey) providers.push('gemini');
        if (AIConfig.anthropic.apiKey) providers.push('anthropic');
        if (AIConfig.openai.apiKey) providers.push('openai');
        return providers;
    },

    /**
     * Generate text using current provider
     */
    async generate(request: AIRequest): Promise<AIResponse> {
        const provider = currentProvider;

        switch (provider) {
            case 'gemini':
                return this.generateWithGemini(request);
            case 'anthropic':
                return this.generateWithAnthropic(request);
            case 'openai':
                return this.generateWithOpenAI(request);
            default:
                throw new Error(`Unknown provider: ${provider}`);
        }
    },

    /**
     * Generate with Gemini
     */
    async generateWithGemini(request: AIRequest): Promise<AIResponse> {
        const client = getGeminiClient();
        const model = AIConfig.gemini.model;

        const fullPrompt = request.systemPrompt
            ? `${request.systemPrompt}\n\n${request.prompt}`
            : request.prompt;

        const response = await client.models.generateContent({
            model,
            contents: fullPrompt,
            config: {
                temperature: request.temperature ?? AIConfig.temperature,
                maxOutputTokens: request.maxTokens ?? 8192,
            }
        });

        const text = response.text || '';

        return {
            text,
            provider: 'gemini',
            model,
            usage: response.usageMetadata ? {
                inputTokens: response.usageMetadata.promptTokenCount || 0,
                outputTokens: response.usageMetadata.candidatesTokenCount || 0,
            } : undefined
        };
    },

    /**
     * Generate with Anthropic
     */
    async generateWithAnthropic(request: AIRequest): Promise<AIResponse> {
        const client = getAnthropicClient();
        const model = AIConfig.anthropic.model;

        const response = await client.messages.create({
            model,
            max_tokens: request.maxTokens ?? 8192,
            temperature: request.temperature ?? AIConfig.temperature,
            system: request.systemPrompt || 'You are a helpful medical research assistant.',
            messages: [
                { role: 'user', content: request.prompt }
            ]
        });

        const text = response.content
            .filter(block => block.type === 'text')
            .map(block => (block as any).text)
            .join('');

        return {
            text,
            provider: 'anthropic',
            model,
            usage: {
                inputTokens: response.usage.input_tokens,
                outputTokens: response.usage.output_tokens,
            }
        };
    },

    /**
     * Generate with OpenAI
     */
    async generateWithOpenAI(request: AIRequest): Promise<AIResponse> {
        const client = getOpenAIClient();
        const model = AIConfig.openai.model;

        const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [];

        if (request.systemPrompt) {
            messages.push({ role: 'system', content: request.systemPrompt });
        }
        messages.push({ role: 'user', content: request.prompt });

        const response = await client.chat.completions.create({
            model,
            messages,
            temperature: request.temperature ?? AIConfig.temperature,
            max_tokens: request.maxTokens ?? 8192,
        });

        const text = response.choices[0]?.message?.content || '';

        return {
            text,
            provider: 'openai',
            model,
            usage: response.usage ? {
                inputTokens: response.usage.prompt_tokens,
                outputTokens: response.usage.completion_tokens,
            } : undefined
        };
    },

    /**
     * Extract tables from document text
     */
    async extractTables(pdfText: string): Promise<any> {
        const systemPrompt = `You are a medical research expert. Extract all tables from the document.
Return a JSON object with:
{
  "tables": [
    {
      "title": "Table title",
      "description": "Brief description",
      "data": [["Header1", "Header2"], ["Row1Col1", "Row1Col2"]]
    }
  ]
}`;

        const response = await this.generate({
            systemPrompt,
            prompt: pdfText,
            temperature: 0.1,
        });

        try {
            // Extract JSON from response
            const jsonMatch = response.text.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                return JSON.parse(jsonMatch[0]);
            }
            return { tables: [] };
        } catch {
            console.error('Failed to parse table extraction response');
            return { tables: [] };
        }
    },

    /**
     * Generate PICO summary
     */
    async generatePICO(pdfText: string): Promise<any> {
        const systemPrompt = `You are a medical research expert. Extract the PICO-T elements from this clinical study.
Return a JSON object with:
{
  "population": "Patient population characteristics",
  "intervention": "Main intervention studied",
  "comparator": "Control or comparison group",
  "outcomes": "Primary and secondary outcomes",
  "timeframe": "Study duration and follow-up period"
}`;

        const response = await this.generate({
            systemPrompt,
            prompt: pdfText,
            temperature: 0.2,
        });

        try {
            const jsonMatch = response.text.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                return JSON.parse(jsonMatch[0]);
            }
            return {};
        } catch {
            console.error('Failed to parse PICO response');
            return {};
        }
    },
};

export default MultiProviderAIClient;
