import { FileSystem } from "./filesystem.js";
import {
    saveEntry,
    saveEntries,
    loadEntries,
    deleteEntryRecord,
    saveBlob,
    loadBlob,
    deleteBlob,
    clearEntries,
    clearBlobs
} from "./storage.js";
import {
    guessMimeTypeFromPath,
    isTextMimeType,
    base64ToBlob
} from "./encoding.js";

export class EditorFS {
    constructor(options = {}) {
        this.fs = options.fs || new FileSystem();
        this.fileIndex = [];
        this.initialized = false;

        this.uploadDirectory = options.uploadDirectory || "/uploads";
        this.autoSeed = options.autoSeed ?? true;
        this.onStatus = typeof options.onStatus === "function" ? options.onStatus : null;

        this.elements = {
            uploadInput: null,
            importInput: null
        };

        this._boundUploadChange = null;
        this._boundImportChange = null;
    }

    async init() {
        if (!this.elements.uploadInput || !this.elements.importInput) {
            this.createHiddenInputs();
        }

        try {
            const storedEntries = await loadEntries();

            if (storedEntries && storedEntries.length > 0) {
                this.fs.loadEntries(storedEntries);
                this.setStatus("Loaded project from IndexedDB");
            } else if (this.autoSeed) {
                this.seedProject();
                await saveEntries(this.fs.listEntries());
                this.setStatus("Created new project");
            }

            this.updateFileIndex();
            this.initialized = true;
            return this;
        } catch (error) {
            console.error(error);

            if (this.autoSeed) {
                this.seedProject();
                await saveEntries(this.fs.listEntries());
            }

            this.updateFileIndex();
            this.initialized = true;
            this.setStatus(`Initialization fallback: ${error.message}`);
            return this;
        }
    }

    destroy() {
        if (this.elements.uploadInput?.parentNode) {
            this.elements.uploadInput.parentNode.removeChild(this.elements.uploadInput);
        }

        if (this.elements.importInput?.parentNode) {
            this.elements.importInput.parentNode.removeChild(this.elements.importInput);
        }

        this.elements.uploadInput = null;
        this.elements.importInput = null;
        this._boundUploadChange = null;
        this._boundImportChange = null;
    }

    createHiddenInputs() {
        const uploadInput = document.createElement("input");
        uploadInput.type = "file";
        uploadInput.multiple = true;
        uploadInput.style.display = "none";

        const importInput = document.createElement("input");
        importInput.type = "file";
        importInput.accept = "application/json,.json";
        importInput.style.display = "none";

        this._boundUploadChange = async () => {
            const files = Array.from(uploadInput.files || []);
            if (files.length === 0) {
                this.setStatus("No file selected");
                return;
            }

            await this.uploadFiles(files);
            uploadInput.value = "";
        };

        this._boundImportChange = async () => {
            const file = importInput.files?.[0];
            if (!file) {
                this.setStatus("No import file selected");
                return;
            }

            try {
                await this.importProjectFile(file);
            } finally {
                importInput.value = "";
            }
        };

        uploadInput.addEventListener("change", this._boundUploadChange);
        importInput.addEventListener("change", this._boundImportChange);

        document.body.appendChild(uploadInput);
        document.body.appendChild(importInput);

        this.elements.uploadInput = uploadInput;
        this.elements.importInput = importInput;
    }

    setStatus(message) {
        if (this.onStatus) {
            this.onStatus(message);
        }
        console.log("[EditorFS]", message);
    }

    updateFileIndex() {
        this.fileIndex = this.fs.listEntries()
            .map(entry => structuredClone(entry))
            .sort((a, b) => a.path.localeCompare(b.path));
    }

    normalizeDirPath(dirPath = "/") {
        if (!dirPath || dirPath === "/") return "/";
        return dirPath.endsWith("/") ? dirPath.slice(0, -1) : dirPath;
    }

    seedProject() {
        if (!this.fs.exists("/assets")) this.fs.createFolder("/assets");
        if (!this.fs.exists("/worlds")) this.fs.createFolder("/worlds");
        if (!this.fs.exists("/uploads")) this.fs.createFolder("/uploads");

        if (!this.fs.exists("/assets/readme.txt")) {
            this.fs.createFile({
                path: "/assets/readme.txt",
                tags: ["info"],
                encoding: "utf-8",
                mimeType: "text/plain",
                size: "Put imported files here.".length,
                inlineText: "Put imported files here.",
                blobKey: null,
                exportable: true
            });
        }

        if (!this.fs.exists("/worlds/test-world.json")) {
            const text = `{
  "name": "Test World",
  "gravity": 9.8
}`;

            this.fs.createFile({
                path: "/worlds/test-world.json",
                tags: ["world"],
                encoding: "utf-8",
                mimeType: "application/json",
                size: text.length,
                inlineText: text,
                blobKey: null,
                exportable: true
            });
        }
    }

    getAllEntries() {
        return this.fileIndex.map(entry => structuredClone(entry));
    }

    list() {
        return this.getAllEntries();
    }

    getAllFiles() {
        return this.fileIndex
            .filter(entry => entry.type === "file")
            .map(entry => structuredClone(entry));
    }

    getAllFolders() {
        return this.fileIndex
            .filter(entry => entry.type === "folder")
            .map(entry => structuredClone(entry));
    }

    getEntry(path) {
        const entry = this.fs.getEntry(path);
        return entry ? structuredClone(entry) : null;
    }

    getFile(path) {
        const entry = this.fs.getEntry(path);
        if (!entry || entry.type !== "file") return null;
        return structuredClone(entry);
    }

    getFolder(path) {
        const entry = this.fs.getEntry(path);
        if (!entry || entry.type !== "folder") return null;
        return structuredClone(entry);
    }

    getFiles(dirPath = "/", recursive = false) {
        const base = this.normalizeDirPath(dirPath);

        return this.fileIndex
            .filter(entry => entry.type === "file")
            .filter(entry => {
                if (base === "/") return true;

                if (recursive) {
                    return entry.path.startsWith(base + "/");
                }

                const parent = entry.path.slice(0, entry.path.lastIndexOf("/")) || "/";
                return parent === base;
            })
            .map(entry => structuredClone(entry));
    }

    getFolders(dirPath = "/", recursive = false) {
        const base = this.normalizeDirPath(dirPath);

        return this.fileIndex
            .filter(entry => entry.type === "folder")
            .filter(entry => entry.path !== base)
            .filter(entry => {
                if (base === "/") {
                    if (recursive) return true;
                    const parent = entry.path.slice(0, entry.path.lastIndexOf("/")) || "/";
                    return parent === "/";
                }

                if (recursive) {
                    return entry.path.startsWith(base + "/");
                }

                const parent = entry.path.slice(0, entry.path.lastIndexOf("/")) || "/";
                return parent === base;
            })
            .map(entry => structuredClone(entry));
    }

    getChildren(dirPath = "/") {
        const base = this.normalizeDirPath(dirPath);

        return this.fileIndex
            .filter(entry => entry.path !== base)
            .filter(entry => {
                const parent = entry.path.slice(0, entry.path.lastIndexOf("/")) || "/";
                return parent === base;
            })
            .map(entry => structuredClone(entry));
    }

    exists(path) {
        return this.fs.exists(path);
    }

    async createFolder(path) {
        const folder = this.fs.createFolder(path);
        await saveEntry(folder);
        this.updateFileIndex();
        return structuredClone(folder);
    }

    async createFile(path, options = {}) {
        const mimeType = options.mimeType || guessMimeTypeFromPath(path);
        const text = options.inlineText ?? "";
        const file = this.fs.createFile({
            path,
            encoding: "utf-8",
            mimeType,
            size: new Blob([text], { type: mimeType }).size,
            inlineText: text,
            blobKey: null,
            tags: options.tags || [],
            exportable: options.exportable ?? true
        });

        await saveEntry(file);
        this.updateFileIndex();
        return structuredClone(file);
    }

    async writeText(path, text, options = {}) {
        const existing = this.fs.getEntry(path);
        const mimeType = options.mimeType || existing?.mimeType || guessMimeTypeFromPath(path);

        if (existing) {
            this.fs.updateEntry(path, {
                inlineText: text,
                encoding: "utf-8",
                mimeType,
                size: new Blob([text], { type: mimeType }).size,
                blobKey: null
            });
        } else {
            this.fs.createFile({
                path,
                encoding: "utf-8",
                mimeType,
                size: new Blob([text], { type: mimeType }).size,
                inlineText: text,
                blobKey: null,
                tags: options.tags || [],
                exportable: options.exportable ?? true
            });
        }

        const saved = this.fs.getEntry(path);
        await saveEntry(saved);
        this.updateFileIndex();
        return structuredClone(saved);
    }

    async writeBlob(path, blob, options = {}) {
        const existing = this.fs.getEntry(path);
        const mimeType = options.mimeType || blob.type || existing?.mimeType || guessMimeTypeFromPath(path);
        const blobKey = `blob:${path}`;

        if (existing?.blobKey && existing.blobKey !== blobKey) {
            await deleteBlob(existing.blobKey);
        }

        if (existing) {
            this.fs.updateEntry(path, {
                encoding: "blob",
                mimeType,
                size: blob.size,
                inlineText: null,
                blobKey
            });
        } else {
            this.fs.createFile({
                path,
                encoding: "blob",
                mimeType,
                size: blob.size,
                inlineText: null,
                blobKey,
                tags: options.tags || [],
                exportable: options.exportable ?? true
            });
        }

        await saveBlob(blobKey, blob);
        await saveEntry(this.fs.getEntry(path));
        this.updateFileIndex();
        return this.getFile(path);
    }

    async readText(path) {
        const entry = this.fs.getEntry(path);
        if (!entry || entry.type !== "file") return null;

        if (entry.encoding === "utf-8") {
            return entry.inlineText ?? "";
        }

        if (entry.encoding === "blob" && entry.blobKey) {
            const blob = await loadBlob(entry.blobKey);
            if (!blob) return null;
            return await blob.text();
        }

        return null;
    }

    async readBlob(path) {
        const entry = this.fs.getEntry(path);
        if (!entry || entry.type !== "file") return null;

        if (entry.encoding === "blob" && entry.blobKey) {
            return await loadBlob(entry.blobKey);
        }

        if (entry.encoding === "utf-8") {
            return new Blob(
                [entry.inlineText ?? ""],
                { type: entry.mimeType || "text/plain" }
            );
        }

        return null;
    }

    async rename(oldPath, newPath) {
        const originalEntry = this.fs.getEntry(oldPath);
        if (!originalEntry) {
            throw new Error(`Path does not exist: ${oldPath}`);
        }

        const oldBlobKey = originalEntry.blobKey || null;
        const wasBlob = originalEntry.encoding === "blob";

        const renamed = this.fs.renameEntry(oldPath, newPath);

        if (wasBlob && oldBlobKey) {
            const blob = await loadBlob(oldBlobKey);
            if (blob) {
                await saveBlob(renamed.blobKey, blob);
                await deleteBlob(oldBlobKey);
            }
        }

        const affected = this.fs.listEntries().filter(entry =>
            entry.path === renamed.path || entry.path.startsWith(renamed.path + "/")
        );

        await saveEntries(affected);
        this.updateFileIndex();
        return structuredClone(renamed);
    }

    async deletePath(path) {
        const entry = this.fs.getEntry(path);
        if (!entry) return [];

        const deleted = this.fs.deleteEntry(path);

        for (const item of deleted) {
            await deleteEntryRecord(item.path);

            if (item.type === "file" && item.blobKey) {
                await deleteBlob(item.blobKey);
            }
        }

        this.updateFileIndex();
        return deleted.map(item => structuredClone(item));
    }

    async upload() {
        if (!this.elements.uploadInput) {
            this.createHiddenInputs();
        }

        this.elements.uploadInput.click();
    }

    async uploadFiles(fileList) {
        const totalFiles = fileList.length;

        if (!this.fs.exists(this.uploadDirectory)) {
            const uploadsFolder = this.fs.createFolder(this.uploadDirectory);
            await saveEntry(uploadsFolder);
        }

        for (let index = 0; index < totalFiles; index++) {
            const file = fileList[index];

            let finalPath = `${this.uploadDirectory}/${file.name}`;
            let counter = 1;

            while (this.fs.exists(finalPath)) {
                const dot = file.name.lastIndexOf(".");
                const base = dot > 0 ? file.name.slice(0, dot) : file.name;
                const ext = dot > 0 ? file.name.slice(dot) : "";
                finalPath = `${this.uploadDirectory}/${base}-${counter}${ext}`;
                counter++;
            }

            const mimeType = file.type || guessMimeTypeFromPath(file.name);

            this.setStatus(`Uploading ${file.name} (${index + 1}/${totalFiles})...`);

            if (isTextMimeType(mimeType) && file.size <= 512 * 1024) {
                const text = await file.text();

                const entry = this.fs.createFile({
                    path: finalPath,
                    encoding: "utf-8",
                    mimeType,
                    size: file.size,
                    inlineText: text,
                    blobKey: null,
                    tags: ["uploaded"],
                    exportable: true
                });

                await saveEntry(entry);
            } else {
                const blobKey = `blob:${finalPath}`;

                const entry = this.fs.createFile({
                    path: finalPath,
                    encoding: "blob",
                    mimeType,
                    size: file.size,
                    inlineText: null,
                    blobKey,
                    tags: ["uploaded"],
                    exportable: true
                });

                await saveEntry(entry);
                await saveBlob(blobKey, file);
            }
        }

        this.updateFileIndex();
        this.setStatus(`Done. Uploaded ${totalFiles} file${totalFiles === 1 ? "" : "s"}.`);
        return this.getFiles(this.uploadDirectory, false);
    }

    async importProject() {
        if (!this.elements.importInput) {
            this.createHiddenInputs();
        }

        this.elements.importInput.click();
    }

    async importProjectFile(file) {
        const text = await file.text();
        const data = JSON.parse(text);

        if (!data || typeof data !== "object") {
            throw new Error("Invalid project file.");
        }

        if (!Array.isArray(data.entries)) {
            throw new Error("Project file is missing entries.");
        }

        const blobFilesByPath = new Map();
        for (const item of data.blobFiles || []) {
            if (item && typeof item.path === "string" && typeof item.base64 === "string") {
                blobFilesByPath.set(item.path, item.base64);
            }
        }

        await clearEntries();
        await clearBlobs();

        const importedEntries = [];

        for (const rawEntry of data.entries) {
            const entry = structuredClone(rawEntry);

            if (entry.type === "file" && entry.encoding === "base64") {
                const base64 = blobFilesByPath.get(entry.path);

                if (!base64) {
                    throw new Error(`Missing blob data for ${entry.path}`);
                }

                entry.encoding = "blob";
                entry.inlineText = null;
                entry.blobKey = `blob:${entry.path}`;

                const blob = base64ToBlob(base64, entry.mimeType || "application/octet-stream");
                await saveBlob(entry.blobKey, blob);
            }

            importedEntries.push(entry);
        }

        this.fs.loadEntries(importedEntries);
        await saveEntries(this.fs.listEntries());
        this.updateFileIndex();
        this.setStatus("Project imported");
        return this.getAllEntries();
    }

    blobToBase64(blob) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();

            reader.addEventListener("load", () => {
                const result = reader.result;

                if (typeof result !== "string") {
                    reject(new Error("Failed to read blob as data URL."));
                    return;
                }

                const commaIndex = result.indexOf(",");
                if (commaIndex === -1) {
                    reject(new Error("Invalid blob data URL."));
                    return;
                }

                resolve(result.slice(commaIndex + 1));
            });

            reader.addEventListener("error", () => {
                reject(reader.error || new Error("Failed to read blob."));
            });

            reader.readAsDataURL(blob);
        });
    }

    async exportProject(downloadName = "webengine-project.json") {
        const exportEntries = [];
        const blobFiles = [];

        for (const entry of this.fs.listEntries()) {
            if (!entry.exportable) continue;

            if (entry.type === "file" && entry.encoding === "blob" && entry.blobKey) {
                const blob = await loadBlob(entry.blobKey);
                if (!blob) continue;

                const base64 = await this.blobToBase64(blob);

                exportEntries.push({
                    ...entry,
                    encoding: "base64",
                    inlineText: null,
                    blobKey: null
                });

                blobFiles.push({
                    path: entry.path,
                    base64
                });
            } else {
                exportEntries.push(structuredClone(entry));
            }
        }

        const payload = {
            version: 3,
            exportedAt: new Date().toISOString(),
            entries: exportEntries,
            blobFiles
        };

        const json = JSON.stringify(payload, null, 2);
        const blob = new Blob([json], { type: "application/json" });
        const url = URL.createObjectURL(blob);

        const a = document.createElement("a");
        a.href = url;
        a.download = downloadName;
        a.click();

        URL.revokeObjectURL(url);
        this.setStatus("Project exported");
        return payload;
    }
}