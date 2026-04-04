export class FileSystem {
    constructor() {
        this.entries = new Map();
        this.createFolder("/");
    }

    static now() {
        return new Date().toISOString();
    }

    normalizePath(path) {
        if (!path || typeof path !== "string") {
            throw new Error("Path must be a non-empty string.");
        }

        path = path.trim();

        if (!path.startsWith("/")) {
            path = "/" + path;
        }

        path = path.replace(/\/+/g, "/");

        if (path.length > 1 && path.endsWith("/")) {
            path = path.slice(0, -1);
        }

        return path;
    }

    getNameFromPath(path) {
        const normalized = this.normalizePath(path);
        if (normalized === "/") return "/";
        return normalized.split("/").pop();
    }

    getParentPath(path) {
        const normalized = this.normalizePath(path);
        if (normalized === "/") return null;

        const parts = normalized.split("/").filter(Boolean);
        parts.pop();

        return parts.length ? "/" + parts.join("/") : "/";
    }

    getExtensionFromPath(path) {
        const name = this.getNameFromPath(path);
        const dotIndex = name.lastIndexOf(".");
        if (dotIndex <= 0) return "";
        return name.slice(dotIndex + 1).toLowerCase();
    }

    exists(path) {
        return this.entries.has(this.normalizePath(path));
    }

    getEntry(path) {
        return this.entries.get(this.normalizePath(path)) || null;
    }

    createFolder(path, { tags = [], exportable = true } = {}) {
        const normalizedPath = this.normalizePath(path);

        if (this.entries.has(normalizedPath)) {
            const existing = this.entries.get(normalizedPath);
            if (existing.type !== "folder") {
                throw new Error(`A file already exists at ${normalizedPath}`);
            }
            return existing;
        }

        const parentPath = this.getParentPath(normalizedPath);

        if (normalizedPath !== "/" && parentPath && !this.entries.has(parentPath)) {
            this.createFolder(parentPath);
        }

        const now = FileSystem.now();

        const folder = {
            type: "folder",
            path: normalizedPath,
            created: now,
            modified: now,
            tags: Array.isArray(tags) ? tags : [],
            exportable: Boolean(exportable),
            encoding: "none",
            mimeType: "inode/directory",
            size: 0
        };

        this.entries.set(normalizedPath, folder);
        return folder;
    }

    createFile({
        path,
        tags = [],
        exportable = true,
        encoding = "utf-8",
        mimeType = "text/plain",
        size = 0,
        inlineText = null,
        blobKey = null
    }) {
        const normalizedPath = this.normalizePath(path);

        if (this.entries.has(normalizedPath)) {
            throw new Error(`Entry already exists: ${normalizedPath}`);
        }

        const parentPath = this.getParentPath(normalizedPath);

        if (parentPath && !this.entries.has(parentPath)) {
            this.createFolder(parentPath);
        }

        const parent = parentPath ? this.entries.get(parentPath) : null;
        if (parent && parent.type !== "folder") {
            throw new Error(`Parent is not a folder: ${parentPath}`);
        }

        const now = FileSystem.now();

        const file = {
            type: "file",
            path: normalizedPath,
            created: now,
            modified: now,
            tags: Array.isArray(tags) ? tags : [],
            exportable: Boolean(exportable),
            encoding,
            mimeType,
            size,
            inlineText,
            blobKey
        };

        this.entries.set(normalizedPath, file);

        if (parent) {
            parent.modified = FileSystem.now();
        }

        return file;
    }

    updateEntry(path, updates = {}) {
        const entry = this.getEntry(path);
        if (!entry) {
            throw new Error(`Entry not found: ${path}`);
        }

        if ("tags" in updates) {
            entry.tags = Array.isArray(updates.tags) ? updates.tags : [];
        }

        if ("exportable" in updates) {
            entry.exportable = Boolean(updates.exportable);
        }

        if (entry.type === "file") {
            if ("encoding" in updates) entry.encoding = updates.encoding;
            if ("mimeType" in updates) entry.mimeType = updates.mimeType;
            if ("size" in updates) entry.size = updates.size;
            if ("inlineText" in updates) entry.inlineText = updates.inlineText;
            if ("blobKey" in updates) entry.blobKey = updates.blobKey;
        }

        entry.modified = FileSystem.now();
        return entry;
    }

    renameEntry(oldPath, newPath) {
        const oldNormalized = this.normalizePath(oldPath);
        const newNormalized = this.normalizePath(newPath);

        if (oldNormalized === "/") {
            throw new Error("Cannot rename root folder.");
        }

        if (!this.entries.has(oldNormalized)) {
            throw new Error(`Entry not found: ${oldNormalized}`);
        }

        if (this.entries.has(newNormalized)) {
            throw new Error(`Target path already exists: ${newNormalized}`);
        }

        const parentPath = this.getParentPath(newNormalized);

        if (parentPath && !this.entries.has(parentPath)) {
            this.createFolder(parentPath);
        }

        const updates = [];

        for (const [path, item] of this.entries.entries()) {
            if (path === oldNormalized || path.startsWith(oldNormalized + "/")) {
                const nextPath = path.replace(oldNormalized, newNormalized);
                updates.push([path, nextPath, item]);
            }
        }

        for (const [oldPathKey] of updates) {
            this.entries.delete(oldPathKey);
        }

        for (const [, nextPath, item] of updates) {
            if (item.type === "file" && item.blobKey) {
                item.blobKey = `blob:${nextPath}`;
            }
            item.path = nextPath;
            item.modified = FileSystem.now();
            this.entries.set(nextPath, item);
        }

        return this.getEntry(newNormalized);
    }

    deleteEntry(path) {
        const normalizedPath = this.normalizePath(path);

        if (normalizedPath === "/") {
            throw new Error("Cannot delete root folder.");
        }

        const entry = this.getEntry(normalizedPath);
        if (!entry) return [];

        const deleted = [];

        for (const [key, value] of this.entries.entries()) {
            if (key === normalizedPath || key.startsWith(normalizedPath + "/")) {
                deleted.push(structuredClone(value));
            }
        }

        for (const item of deleted) {
            this.entries.delete(item.path);
        }

        return deleted;
    }

    listEntries() {
        return Array.from(this.entries.values()).sort((a, b) => {
            if (a.path === "/") return -1;
            if (b.path === "/") return 1;
            return a.path.localeCompare(b.path);
        });
    }

    getChildren(folderPath) {
        const normalized = this.normalizePath(folderPath);
        const children = [];

        for (const entry of this.entries.values()) {
            if (entry.path === normalized) continue;
            if (this.getParentPath(entry.path) === normalized) {
                children.push(entry);
            }
        }

        children.sort((a, b) => {
            if (a.type !== b.type) {
                return a.type === "folder" ? -1 : 1;
            }
            return this.getNameFromPath(a.path).localeCompare(this.getNameFromPath(b.path));
        });

        return children;
    }

    buildTree(path = "/") {
        const entry = this.getEntry(path);
        if (!entry) return null;

        return {
            ...entry,
            name: this.getNameFromPath(entry.path),
            children: entry.type === "folder"
                ? this.getChildren(entry.path).map(child => this.buildTree(child.path))
                : []
        };
    }

    loadEntries(entries) {
        this.entries = new Map();

        for (const entry of entries) {
            this.entries.set(entry.path, structuredClone(entry));
        }

        if (!this.entries.has("/")) {
            this.createFolder("/");
        }
    }
}