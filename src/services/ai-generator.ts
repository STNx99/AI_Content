import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.CMS_AI_API_KEY!);

interface GenerateContentOptions {
    prompt: string;
    context?: string;
    tone?: "professional" | "casual" | "formal" | "friendly";
    length?: "short" | "medium" | "long";
    includeImages?: boolean;
}

const toneInstructions: Record<string, string> = {
    professional: "Viết với giọng chuyên nghiệp, trang trọng.",
    casual: "Viết với giọng thân thiện, gần gũi.",
    formal: "Viết với giọng trang trọng, lịch sự.",
    friendly: "Viết với giọng thân thiện, vui vẻ."
};

const lengthInstructions: Record<string, string> = {
    short: "Viết ngắn gọn, súc tích.",
    medium: "Viết với độ dài trung bình.",
    long: "Viết chi tiết, đầy đủ."
};

async function retryWithBackoff<T>(fn: () => Promise<T>, retries = 3, delay = 1000): Promise<T> {
    let attempt = 0;
    while (attempt < retries) {
        try {
            return await fn();
        } catch (error) {
            if (attempt < retries - 1) {
                await new Promise((resolve) => setTimeout(resolve, delay));
                attempt++;
            } else {
                throw error;
            }
        }
    }
    throw new Error("Max retries reached");
}

async function extractKeywords(prompt: string): Promise<string[]> {
    // First, extract terms in quotes - these are products or main subjects for images
    const quotedTerms: string[] = [];
    const quoteRegex = /"([^"]+)"/g;
    let match;

    while ((match = quoteRegex.exec(prompt)) !== null) {
        quotedTerms.push(match[1].trim());
    }

    // If we have quoted terms, prioritize them
    if (quotedTerms.length > 0) {
        console.log(`Found quoted keywords for images: ${quotedTerms.join(', ')}`);
        return quotedTerms.slice(0, 3); // Use up to 3 quoted terms
    }

    // Otherwise, extract keywords from the prompt
    // Remove common Vietnamese stop words and get meaningful keywords
    const stopWords = ['của', 'và', 'là', 'có', 'một', 'được', 'cho', 'về', 'các', 'trong', 'để', 'với', 'này', 'đó', 'những', 'viết', 'giới', 'thiệu', 'bài'];

    // Split by spaces and filter
    const words = prompt
        .toLowerCase()
        .replace(/"[^"]+"/g, '') // Remove quoted terms from regular extraction
        .split(/[\s,\.]+/)
        .filter(word => word.length > 3 && !stopWords.includes(word))
        .slice(0, 5); // Get top 5 keywords

    return words.length > 0 ? words : ['technology', 'business'];
}

async function searchImages(keywords: string, count: number): Promise<string[]> {
    const accessKey = process.env.UNSPLASH_ACCESS_KEY;

    if (!accessKey) {
        console.warn("UNSPLASH_ACCESS_KEY not found, skipping image search");
        return [];
    }

    try {
        const query = encodeURIComponent(keywords);
        const url = `https://api.unsplash.com/search/photos?query=${query}&per_page=${count}&orientation=landscape`;

        const response = await fetch(url, {
            headers: {
                'Authorization': `Client-ID ${accessKey}`,
            },
        });

        if (!response.ok) {
            console.error(`Unsplash API error: ${response.status} ${response.statusText}`);
            return [];
        }

        const data = await response.json();

        if (!data.results || data.results.length === 0) {
            console.warn(`No images found for keywords: ${keywords}`);
            return [];
        }

        // Return regular quality URLs
        return data.results.map((photo: any) => photo.urls.regular);

    } catch (error) {
        console.error("Error searching images from Unsplash:", error);
        return [];
    }
}

export async function generateContent(
    options: GenerateContentOptions
): Promise<string> {
    const { prompt, context, tone = "professional", length = "medium", includeImages = true } = options;

    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" });

    const imageInstruction = includeImages
        ? `- Đánh dấu vị trí cần chèn ảnh bằng [IMAGE_PLACEHOLDER_N] (N là số thứ tự 1, 2, 3...)
  - Mỗi đoạn văn quan trọng nên có 1 ảnh minh họa
  - Đặt ảnh sau đoạn văn liên quan`
        : "";

    const systemPrompt = `
Bạn là AI chuyên viết nội dung HTML cho CMS.
${toneInstructions[tone]}
${lengthInstructions[length]}
Yêu cầu:
- Trả về HTML thuần, format đúng
- Dùng <h2>, <h3>, <p>, <ul>, <li>, <strong>, <em>, <a>
- Không dùng markdown
${imageInstruction}
`;

    const input = context
        ? `${systemPrompt}\n\nContext:\n${context}\n\nYêu cầu mới:\n${prompt}`
        : `${systemPrompt}\n\n${prompt}`;

    try {
        const result = await retryWithBackoff(() =>
            model.generateContent(input)
        );

        let fullText = result.response.text();

        // Clean up the accumulated text
        let cleanText = fullText.replace(/```html/g, "").replace(/```/g, "").trim();

        // If includeImages is true, replace placeholders with actual images
        if (includeImages) {
            const keywords = await extractKeywords(prompt);
            const imageUrls = await searchImages(keywords.join(" "), 3);

            let imageIndex = 0;
            cleanText = cleanText.replace(/\[IMAGE_PLACEHOLDER_\d+\]/g, () => {
                const imageUrl = imageUrls[imageIndex % imageUrls.length];
                imageIndex++;
                return `<img alt="" src="${imageUrl}" />`;
            });

            // If no placeholders were found, add images after each h2/h3
            if (imageIndex === 0 && imageUrls.length > 0) {
                let insertedImages = 0;
                cleanText = cleanText.replace(/(<\/h[23]>)/g, (match) => {
                    if (insertedImages < imageUrls.length) {
                        const imageUrl = imageUrls[insertedImages];
                        insertedImages++;
                        return `${match}\n<img alt="" src="${imageUrl}" />`;
                    }
                    return match;
                });
            }
        }

        return cleanText;

    } catch (error) {
        console.error("Gemini API Error:", error);
        throw new Error("Failed to generate content from Gemini");
    }
}

// Stream content generation with real-time updates
export async function* generateContentStream(
    options: GenerateContentOptions
): AsyncGenerator<{ type: 'chunk' | 'done' | 'error'; content?: string; error?: string }> {
    const { prompt, context, tone = "professional", length = "medium", includeImages = true } = options;

    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" });

    const imageInstruction = includeImages
        ? `- Đánh dấu vị trí cần chèn ảnh bằng [IMAGE_PLACEHOLDER_N] (N là số thứ tự 1, 2, 3...)
  - Mỗi đoạn văn quan trọng nên có 1 ảnh minh họa
  - Đặt ảnh sau đoạn văn liên quan`
        : "";

    const systemPrompt = `
Bạn là AI chuyên viết nội dung HTML cho CMS.
${toneInstructions[tone]}
${lengthInstructions[length]}
Yêu cầu:
- Trả về HTML thuần, format đúng
- Dùng <h2>, <h3>, <p>, <ul>, <li>, <strong>, <em>, <a>
- Không dùng markdown
${imageInstruction}
`;

    const input = context
        ? `${systemPrompt}\n\nContext:\n${context}\n\nYêu cầu mới:\n${prompt}`
        : `${systemPrompt}\n\n${prompt}`;

    try {
        // Stream the content from Gemini
        const result = await retryWithBackoff(() =>
            model.generateContentStream(input)
        );

        let fullText = "";

        // Stream chunks as they come
        for await (const chunk of result.stream) {
            const chunkText = chunk.text();
            fullText += chunkText;

            // Clean up the accumulated text
            let cleanText = fullText.replace(/```html/g, "").replace(/```/g, "").trim();

            yield {
                type: 'chunk',
                content: cleanText
            };
        }

        // Final cleanup
        let finalText = fullText.replace(/```html/g, "").replace(/```/g, "").trim();

        // If includeImages is true, replace placeholders with actual images
        if (includeImages) {
            const keywords = await extractKeywords(prompt);
            const imageUrls = await searchImages(keywords.join(" "), 3);

            let imageIndex = 0;
            finalText = finalText.replace(/\[IMAGE_PLACEHOLDER_\d+\]/g, () => {
                const imageUrl = imageUrls[imageIndex % imageUrls.length];
                imageIndex++;
                return `<img alt="" src="${imageUrl}" />`;
            });

            // If no placeholders were found, add images after each h2/h3
            if (imageIndex === 0 && imageUrls.length > 0) {
                let insertedImages = 0;
                finalText = finalText.replace(/(<\/h[23]>)/g, (match) => {
                    if (insertedImages < imageUrls.length) {
                        const imageUrl = imageUrls[insertedImages];
                        insertedImages++;
                        return `${match}\n<img alt="" src="${imageUrl}" />`;
                    }
                    return match;
                });
            }
        }

        // Send final version with images
        yield {
            type: 'done',
            content: finalText
        };

    } catch (error) {
        console.error("Gemini API Error:", error);
        yield {
            type: 'error',
            error: error instanceof Error ? error.message : "Failed to generate content from Gemini"
        };
    }
}