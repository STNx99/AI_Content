import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.CMS_AI_API_KEY!);

interface GenerateContentOptions {
    prompt: string;
    context?: string;
    tone?: "professional" | "casual" | "formal" | "friendly";
    length?: "short" | "medium" | "long";
    includeImages?: boolean;
}

const lengthInstructions = {
    short: "Viết ngắn gọn, khoảng 100-200 từ.",
    medium: "Viết trung bình, khoảng 300-500 từ.",
    long: "Viết chi tiết, khoảng 700-1000 từ.",
};

const toneInstructions = {
    professional: "Giọng văn chuyên nghiệp, trang trọng.",
    casual: "Giọng văn thân thiện, gần gũi.",
    formal: "Giọng văn học thuật, chuẩn mực.",
    friendly: "Giọng văn tự nhiên, dễ hiểu.",
};

// Function to search images from Unsplash
async function searchImages(query: string, count: number = 3): Promise<string[]> {
    try {
        const accessKey = process.env.UNSPLASH_ACCESS_KEY;
        if (!accessKey || accessKey === 'your_unsplash_access_key_here') {
            console.warn("Unsplash API key not configured, using placeholder images");
            return Array(count).fill("https://images.unsplash.com/photo-1519389950473-47ba0277781c?w=800");
        }

        const response = await fetch(
            `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=${count}&orientation=landscape`,
            {
                headers: {
                    Authorization: `Client-ID ${accessKey}`,
                },
            }
        );

        if (!response.ok) {
            throw new Error("Failed to fetch images from Unsplash");
        }

        const data = await response.json();
        return data.results.map((img: any) => img.urls.regular);
    } catch (error) {
        console.error("Error fetching images:", error);
        // Return placeholder images if API fails
        return Array(count).fill("https://images.unsplash.com/photo-1519389950473-47ba0277781c?w=800");
    }
}

// Function to extract keywords for image search
async function extractKeywords(content: string): Promise<string[]> {
    try {
        const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-exp" });
        const prompt = `Từ nội dung sau, hãy trích xuất 3-5 từ khóa chính để tìm kiếm ảnh minh họa phù hợp. 
Chỉ trả về các từ khóa, cách nhau bởi dấu phẩy, không giải thích gì thêm.

Nội dung: ${content}`;

        const result = await model.generateContent(prompt);
        const keywords = result.response.text().split(",").map(k => k.trim());
        return keywords.slice(0, 3);
    } catch (error) {
        console.error("Error extracting keywords:", error);
        return ["technology", "business", "innovation"];
    }
}

export async function generateContent(
    options: GenerateContentOptions
): Promise<string> {
    const { prompt, context, tone = "professional", length = "medium", includeImages = true } = options;

    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-exp" });

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
        const result = await model.generateContent(input);
        let text = result.response.text();
        text = text.replace(/```html/g, "").replace(/```/g, "").trim();

        // If includeImages is true, replace placeholders with actual images
        if (includeImages) {
            // Extract keywords for image search
            const keywords = await extractKeywords(prompt);

            // Search for images
            const imageUrls = await searchImages(keywords.join(" "), 3);

            // Replace placeholders with actual image HTML
            let imageIndex = 0;
            text = text.replace(/\[IMAGE_PLACEHOLDER_\d+\]/g, () => {
                const imageUrl = imageUrls[imageIndex % imageUrls.length];
                imageIndex++;
                return `<img alt="" src="${imageUrl}" />`;
            });

            // If no placeholders were found, add images after each h2/h3
            if (imageIndex === 0 && imageUrls.length > 0) {
                let insertedImages = 0;
                text = text.replace(/(<\/h[23]>)/g, (match) => {
                    if (insertedImages < imageUrls.length) {
                        const imageUrl = imageUrls[insertedImages];
                        insertedImages++;
                        return `${match}\n<img alt="" src="${imageUrl}" />`;
                    }
                    return match;
                });
            }
        }

        return text;
    } catch (error) {
        console.error("Gemini API Error:", error);
        throw new Error("Failed to generate content from Gemini");
    }
}
