export function escapeHtml(value) {
    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;");
}

export function bytesToBase64(bytes) {
    let binary = "";
    const chunkSize = 0x8000;

    for (let i = 0; i < bytes.length; i += chunkSize) {
        const chunk = bytes.subarray(i, i + chunkSize);
        binary += String.fromCharCode(...chunk);
    }

    return btoa(binary);
}

export function base64ToBytes(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);

    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }

    return bytes;
}

export function textToBase64(text) {
    const encoder = new TextEncoder();
    return bytesToBase64(encoder.encode(text));
}

export function base64ToText(base64) {
    const bytes = base64ToBytes(base64);
    const decoder = new TextDecoder();
    return decoder.decode(bytes);
}

export function base64ToBlob(base64, mimeType = "application/octet-stream") {
    const bytes = base64ToBytes(base64);
    return new Blob([bytes], { type: mimeType });
}

export function fileToBase64WithProgress(file, onProgress) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.addEventListener("progress", event => {
            if (!event.lengthComputable) return;
            if (typeof onProgress === "function") {
                onProgress({
                    loaded: event.loaded,
                    total: event.total,
                    percent: Math.round((event.loaded / event.total) * 100)
                });
            }
        });

        reader.addEventListener("load", () => {
            const result = reader.result;

            if (typeof result !== "string") {
                reject(new Error("Failed to read file as data URL."));
                return;
            }

            const commaIndex = result.indexOf(",");
            if (commaIndex === -1) {
                reject(new Error("Invalid data URL format."));
                return;
            }

            resolve(result.slice(commaIndex + 1));
        });

        reader.addEventListener("error", () => {
            reject(reader.error || new Error("Failed to read file."));
        });

        reader.readAsDataURL(file);
    });
}

export function isTextMimeType(mimeType) {
    if (!mimeType) return false;

    return (
        mimeType.startsWith("text/") ||
        mimeType === "application/json" ||
        mimeType === "application/javascript" ||
        mimeType === "application/xml" ||
        mimeType === "application/x-sh" ||
        mimeType === "image/svg+xml"
    );
}

export function isImageMimeType(mimeType) {
    return typeof mimeType === "string" && mimeType.startsWith("image/");
}

export function isAudioMimeType(mimeType) {
    return typeof mimeType === "string" && mimeType.startsWith("audio/");
}

export function isVideoMimeType(mimeType) {
    return typeof mimeType === "string" && mimeType.startsWith("video/");
}

export function guessMimeTypeFromPath(path) {
    const lower = path.toLowerCase();

    if (lower.endsWith(".txt")) return "text/plain";
    if (lower.endsWith(".js") || lower.endsWith(".mjs")) return "application/javascript";
    if (lower.endsWith(".json")) return "application/json";
    if (lower.endsWith(".html")) return "text/html";
    if (lower.endsWith(".css")) return "text/css";
    if (lower.endsWith(".xml")) return "application/xml";
    if (lower.endsWith(".svg")) return "image/svg+xml";
    if (lower.endsWith(".md")) return "text/markdown";

    if (lower.endsWith(".mp3")) return "audio/mpeg";
    if (lower.endsWith(".wav")) return "audio/wav";
    if (lower.endsWith(".ogg")) return "audio/ogg";
    if (lower.endsWith(".m4a")) return "audio/mp4";
    if (lower.endsWith(".aac")) return "audio/aac";
    if (lower.endsWith(".flac")) return "audio/flac";

    if (lower.endsWith(".png")) return "image/png";
    if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
    if (lower.endsWith(".webp")) return "image/webp";
    if (lower.endsWith(".gif")) return "image/gif";
    if (lower.endsWith(".bmp")) return "image/bmp";
    if (lower.endsWith(".ico")) return "image/x-icon";
    if (lower.endsWith(".avif")) return "image/avif";

    if (lower.endsWith(".mp4")) return "video/mp4";
    if (lower.endsWith(".webm")) return "video/webm";
    if (lower.endsWith(".mov")) return "video/quicktime";
    if (lower.endsWith(".mkv")) return "video/x-matroska";
    if (lower.endsWith(".avi")) return "video/x-msvideo";
    if (lower.endsWith(".ogv")) return "video/ogg";

    return "application/octet-stream";
}