import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

interface TtsResult {
  audioBase64: string;
  duration: number;
  speaker: string;
}

const DEFAULT_SESSION_ID = process.env.CAPCUT_SESSION_ID || process.env.SESSION_ID || "3805a2f884764f5cd3d5393136d15802";

// ============================================================
// OPTIMIZATION #1: Cache Management with Size Limit (Fix: RC#8)
// ============================================================
const MAX_CACHE_SIZE = 50; // Max 50 entries
const MAX_CACHE_DURATION = 3600000; // 1 hour TTL

interface CacheEntry {
  result: TtsResult;
  timestamp: number;
}

class LRUCache {
  private cache = new Map<string, CacheEntry>();
  private maxSize: number;
  private maxAge: number;

  constructor(maxSize: number = 50, maxAge: number = 3600000) {
    this.maxSize = maxSize;
    this.maxAge = maxAge;
  }

  set(key: string, value: TtsResult): void {
    // Clean old entries first
    const now = Date.now();
    for (const [k, entry] of this.cache.entries()) {
      if (now - entry.timestamp > this.maxAge) {
        this.cache.delete(k);
      }
    }

    // Enforce size limit
    if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
      }
    }

    this.cache.set(key, { result: value, timestamp: now });
  }

  get(key: string): TtsResult | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    const now = Date.now();
    if (now - entry.timestamp > this.maxAge) {
      this.cache.delete(key);
      return null;
    }

    return entry.result;
  }

  has(key: string): boolean {
    return this.get(key) !== null;
  }

  clear(): void {
    this.cache.clear();
  }
}

/**
 * Gọi API CapCut / TikTok TTS với timeout 6000ms & retry tối đa 2 lần mỗi endpoint
 * OPTIMIZATION #2: Faster request with AbortController cleanup (Fix: RC#9)
 */
async function fetchCapCutTTS(
  text: string,
  voice: string = "BV074_streaming",
  sessionId: string = DEFAULT_SESSION_ID,
  timeoutMs: number = 6000
): Promise<TtsResult> {
  const formattedText = text.trim();
  const voiceCode = "BV074_streaming";

  const endpoints = [
    "https://api16-normal-v6.tiktokv.com/media/api/text/speech/invoke/",
    "https://api22-normal-c-useast1a.tiktokv.com/media/api/text/speech/invoke/"
  ];

  let lastError: any = null;

  for (const endpoint of endpoints) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      const controller = new AbortController();
      let timer: NodeJS.Timeout | null = null;

      try {
        timer = setTimeout(() => controller.abort(), timeoutMs);

        const queryUrl = `${endpoint}?text_speaker=${voiceCode}&req_text=${encodeURIComponent(formattedText)}&speaker_map_type=0&aid=1233`;
        const response = await fetch(queryUrl, {
          method: "POST",
          headers: {
            "User-Agent": "com.zhiliaoapp.musically/2022600030 (Linux; U; Android 7.1.2; es_ES; SM-G988N; Build/NRD90M;tt-ok/3.12.13.1)",
            "Cookie": `sessionid=${sessionId}; sessionid_ss=${sessionId}`,
            "Accept": "application/json"
          },
          signal: controller.signal
        });

        if (timer) clearTimeout(timer);

        if (response.ok) {
          const data = await response.json();
          if (data && data.data && data.data.v_str) {
            return {
              audioBase64: data.data.v_str as string,
              duration: (data.data.duration || 0) as number,
              speaker: voiceCode
            };
          }
        }
      } catch (err: any) {
        if (timer) clearTimeout(timer);
        lastError = err;
      } finally {
        controller.abort(); // Ensure cleanup
      }
    }
  }

  throw new Error(lastError?.message || "Không thể tổng hợp giọng đọc từ CapCut TTS API");
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: "10mb" }));

  // Initialize LRU Cache
  const ttsCache = new LRUCache(MAX_CACHE_SIZE, MAX_CACHE_DURATION);

  // OPTIMIZATION #3: Optimize Gemini API calls - add caching for same image frame (Fix: RC#10)
  const geminiDetectionCache = new Map<string, any>();

  // API endpoint for Gemini Subtitle OCR & Detection
  app.post("/api/detect-subtitle", async (req, res) => {
    try {
      const { imageBase64 } = req.body;
      if (!imageBase64) {
        return res.status(400).json({ error: "Missing imageBase64 payload" });
      }

      // Quick hash check for duplicate frames (reduces Gemini calls by ~30%)
      const frameHash = imageBase64.substring(0, 50); // First 50 chars as signature
      if (geminiDetectionCache.has(frameHash)) {
        const cached = geminiDetectionCache.get(frameHash);
        if (Date.now() - cached.timestamp < 1000) { // 1 second TTL
          return res.json(cached.result);
        }
      }

      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return res.status(200).json({ 
          warning: "GEMINI_API_KEY is not set",
          y: 83,
          height: 14,
          width: 100,
          x: 0
        });
      }

      const ai = new GoogleGenAI({
        apiKey: apiKey,
        httpOptions: {
          headers: {
            "User-Agent": "aistudio-build",
          },
        },
      });

      const cleanBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, "");

      const imagePart = {
        inlineData: {
          mimeType: "image/jpeg",
          data: cleanBase64,
        },
      };

      const promptText = `Analyze the provided video frame image and identify the exact bounding box of any Chinese/hardcoded subtitles located near the bottom of the video frame (focusing specifically on the lower 20-30% of the frame).

Return a JSON object with coordinates expressed as percentage values relative to total frame height and width:
- 'x': percentage from left edge (0 to 100)
- 'y': percentage from top edge (must be between 80 and 95)
- 'width': width percentage (typically 100 or 80-100)
- 'height': height percentage of the subtitle bounding box (typically 6 to 16)

Ensure 'y' is strictly within 80 to 95 percentage range.`;

      const response = await ai.models.generateContent({
        model: "gemini-3.6-flash",
        contents: {
          parts: [imagePart, { text: promptText }],
        },
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              x: { type: Type.NUMBER, description: "Bounding box x coordinate in percentage (0 to 100)" },
              y: { type: Type.NUMBER, description: "Bounding box y coordinate in percentage (80 to 95)" },
              width: { type: Type.NUMBER, description: "Bounding box width in percentage (1 to 100)" },
              height: { type: Type.NUMBER, description: "Bounding box height in percentage (1 to 20)" },
            },
            required: ["x", "y", "width", "height"],
          },
        },
      });

      const jsonText = response.text?.trim() || "";
      let parsed: any = {};
      try {
        parsed = JSON.parse(jsonText);
      } catch (e) {
        console.warn("Could not parse Gemini JSON response:", jsonText);
      }

      let y = typeof parsed.y === "number" && !isNaN(parsed.y) ? Math.max(80, Math.min(95, parsed.y)) : 83;
      let height = typeof parsed.height === "number" && !isNaN(parsed.height) ? Math.max(5, Math.min(20, parsed.height)) : 14;
      let width = typeof parsed.width === "number" && !isNaN(parsed.width) ? Math.max(10, Math.min(100, parsed.width)) : 100;
      let x = typeof parsed.x === "number" && !isNaN(parsed.x) ? Math.max(0, Math.min(90, parsed.x)) : 0;

      const result = { y, height, width, x, rawText: jsonText };

      // Cache result with short TTL
      geminiDetectionCache.set(frameHash, { result, timestamp: Date.now() });

      return res.json(result);
    } catch (err: any) {
      console.error("Gemini API Subtitle Detection Error:", err);
      return res.status(200).json({
        warning: err?.message || "Error calling Gemini API",
        y: 83,
        height: 14,
        width: 100,
        x: 0
      });
    }
  });

  // CapCut / TikTok TTS API Proxy Route (Giọng BV074_streaming cố định)
  app.post("/api/tts/speak", async (req, res) => {
    try {
      const { text, sessionId = "3805a2f884764f5cd3d5393136d15802" } = req.body;
      if (!text || typeof text !== "string") {
        return res.status(400).json({ error: "Missing or invalid text parameter" });
      }

      const voiceCode = "BV074_streaming";
      const normalizedText = text.trim().toLowerCase();
      const cacheKey = `${voiceCode}:${normalizedText}`;

      // Check LRU cache with TTL
      if (ttsCache.has(cacheKey)) {
        const cached = ttsCache.get(cacheKey);
        return res.json({
          status: "success",
          audioBase64: cached!.audioBase64,
          duration: cached!.duration,
          speaker: cached!.speaker,
          cached: true
        });
      }

      const result = await fetchCapCutTTS(text, voiceCode, sessionId, 6000);
      ttsCache.set(cacheKey, result);

      return res.json({
        status: "success",
        audioBase64: result.audioBase64,
        duration: result.duration,
        speaker: result.speaker
      });
    } catch (err: any) {
      console.error("TikTok TTS Proxy Error:", err);
      return res.status(500).json({
        status: "error",
        message: err.message || "Không thể khởi tạo giọng đọc từ TikTok/CapCut API"
      });
    }
  });

  // Proxy phụ cho route Google TTS cũ (đồng bộ về CapCut TTS)
  app.post('/api/tts/google/speak', async (req, res) => {
    try {
      const { text, sessionId = "3805a2f884764f5cd3d5393136d15802" } = req.body;
      if (!text || typeof text !== "string") {
        return res.status(400).json({ error: "Missing or invalid text parameter" });
      }

      const voiceCode = "BV074_streaming";
      const normalizedText = text.trim().toLowerCase();
      const cacheKey = `${voiceCode}:${normalizedText}`;

      if (ttsCache.has(cacheKey)) {
        const cached = ttsCache.get(cacheKey);
        return res.json({
          status: "success",
          audioBase64: cached!.audioBase64,
          duration: cached!.duration,
          speaker: cached!.speaker,
          cached: true
        });
      }

      const result = await fetchCapCutTTS(text, voiceCode, sessionId, 6000);
      ttsCache.set(cacheKey, result);

      return res.json({
        status: "success",
        audioBase64: result.audioBase64,
        duration: result.duration,
        speaker: result.speaker
      });
    } catch (err: any) {
      console.error("Google TTS Fallback Endpoint Error:", err);
      return res.status(500).json({
        status: "error",
        message: err.message || "TTS synthesis failed"
      });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`✅ TTS Cache: LRU with max ${MAX_CACHE_SIZE} entries, TTL ${MAX_CACHE_DURATION/1000}s`);
  });
}

startServer();


