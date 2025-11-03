import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { generateContent } from "./services/ai-generator";
import { GoogleGenerativeAI } from "@google/generative-ai";

const app = new Hono();

// Middleware
app.use("*", logger());
app.use(
    "*",
    cors({
        origin: "*", // Update this in production to specific origins
        credentials: true,
    })
);

// Health check
app.get("/health", (c) => {
    return c.json({ status: "ok", service: "CMS AI Service" });
});

// Test API key and list models
app.get("/api/test-models", async (c) => {
    try {
        const genAI = new GoogleGenerativeAI(process.env.CMS_AI_API_KEY!);
        const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-exp" });

        const result = await model.generateContent("Hello, respond with 'API Working'");
        const text = result.response.text();

        return c.json({
            success: true,
            message: "API Key is valid",
            response: text,
            apiKey: process.env.CMS_AI_API_KEY?.substring(0, 10) + "...",
        });
    } catch (error: any) {
        return c.json({
            success: false,
            error: error.message,
            apiKey: process.env.CMS_AI_API_KEY?.substring(0, 10) + "...",
        }, 500);
    }
});

// Generate content endpoint
app.post("/api/ai/generate-content", async (c) => {
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

        return c.json({
            success: true,
            content,
            html: content,
        });
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

const port = process.env.PORT || 3001;

console.log(`🚀 AI Service running on http://localhost:${port}`);

export default {
    port,
    fetch: app.fetch,
};
