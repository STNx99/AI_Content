import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { generateContent, generateContentStream } from "./services/ai-generator";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { stream } from "hono/streaming";

const app = new Hono();

app.use("*", cors());
app.use("*", logger());

// Generate content endpoint
app.post("/api/v1/ai/generate-content", async (c) => {
    try {
        const body = await c.req.json();
        const { prompt, context, tone, length, includeImages = true } = body;

        if (!prompt) {
            return c.json({ error: "Prompt is required" }, 400);
        }

        const content = await generateContent({
            prompt,
            context,
            tone: tone || "professional",
            length: length || "medium",
            includeImages,
        });

        return c.json({ success: true, content });
    } catch (error) {
        console.error("Error generating content:", error);
        return c.json(
            {
                success: false,
                error: error instanceof Error ? error.message : "Unknown error",
            },
            500
        );
    }
});

// Streaming endpoint with Server-Sent Events
app.post("/api/v1/ai/generate-content-stream", async (c) => {
    try {
        const body = await c.req.json();
        const { prompt, context, tone, length, includeImages = true } = body;

        if (!prompt) {
            return c.json({ error: "Prompt is required" }, 400);
        }

        return stream(c, async (stream) => {
            // Set headers for SSE
            c.header("Content-Type", "text/event-stream");
            c.header("Cache-Control", "no-cache");
            c.header("Connection", "keep-alive");

            try {
                const contentGenerator = generateContentStream({
                    prompt,
                    context,
                    tone: tone || "professional",
                    length: length || "medium",
                    includeImages,
                });

                for await (const chunk of contentGenerator) {
                    // Send each chunk as SSE
                    await stream.write(`data: ${JSON.stringify(chunk)}\n\n`);
                }

                // Send completion signal
                await stream.write(`data: [DONE]\n\n`);
            } catch (error) {
                console.error("Streaming error:", error);
                await stream.write(`data: ${JSON.stringify({
                    type: 'error',
                    error: error instanceof Error ? error.message : "Unknown error"
                })}\n\n`);
            }
        });
    } catch (error) {
        console.error("Error in streaming endpoint:", error);
        return c.json(
            {
                success: false,
                error: error instanceof Error ? error.message : "Unknown error",
            },
            500
        );
    }
});

const port = process.env.PORT || 3001;

console.log(`🚀 AI Service running on http://localhost:${port}`);

export default {
    port,
    fetch: app.fetch,
};