import { anthropic } from "@ai-sdk/anthropic";
import { google } from "@ai-sdk/google";
import { groq } from "@ai-sdk/groq";
import { openai } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";

// Helper to get the appropriate model based on model ID
export function getModel(modelId: string): LanguageModel {
	if (modelId.startsWith("claude-")) {
		return anthropic(modelId);
	}
	if (modelId.startsWith("gemini-")) {
		return google(modelId);
	}
	if (modelId.startsWith("llama-") || modelId.startsWith("mixtral-")) {
		return groq(modelId);
	}
	// Default to OpenAI
	return openai(modelId);
}
