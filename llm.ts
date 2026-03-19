import "dotenv/config";
import { ChatAnthropic } from "@langchain/anthropic";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ChatOpenAI } from "@langchain/openai";
import type { MessageContent } from "@langchain/core/messages";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Set the ${name} environment variable.`);
  }
  return value;
}

export function createLLM() {
  const provider = (process.env.LLM_PROVIDER || "google").toLowerCase();
  const model = process.env.LLM_MODEL || "gemini-2.5-flash";

  if (provider === "google") {
    const apiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("Set GOOGLE_API_KEY or GEMINI_API_KEY.");
    }

    return new ChatGoogleGenerativeAI({
      model,
      apiKey,
      temperature: 0.2,
    });
  }

  if (provider === "openai") {
    return new ChatOpenAI({
      model,
      apiKey: requireEnv("OPENAI_API_KEY"),
      temperature: 0.2,
    });
  }

  if (provider === "anthropic") {
    return new ChatAnthropic({
      model,
      apiKey: requireEnv("ANTHROPIC_API_KEY"),
      temperature: 0.2,
    });
  }

  throw new Error(`Invalid LLM_PROVIDER: ${provider}`);
}

export function extractMessageText(content: MessageContent): string {
  if (typeof content === "string") {
    return content.trim();
  }

  if (Array.isArray(content)) {
    return content
      .map((part) => (typeof part === "string" ? part : part?.text || ""))
      .join("")
      .trim();
  }

  return String(content || "").trim();
}
