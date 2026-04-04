import { FileSystem } from "./filesystem.js";
import { renderTree, renderEditor } from "./ui.js";
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

const fs = new FileSystem();

let selectedPath = null;
let renderToken = 0;

const fileTreeEl = document.getElementById("fileTree");
const editorTitleEl = document.getElementById("editorTitle");
const editorBodyEl = document.getElementById("editorBody");

const newFolderBtn = document.getElementById("newFolderBtn");
const newFileBtn = document.getElementById("newFileBtn");
const uploadBtn = document.getElementById("uploadBtn");
const importBtn = document.getElementById("importBtn");
const uploadInput = document.getElementById("uploadInput");
const importInput = document.getElementById("importInput");
const deleteBtn = document.getElementById("deleteBtn");
const exportBtn = document.getElementById("exportBtn");
const uploadStatusEl = document.getElementById("uploadStatus");

function setStatus(message) {
    if (uploadStatusEl) {
        uploadStatusEl.textContent = message;
    }
    console.log("[editor]", message);
}

function nextFrame() {
    return new Promise(resolve => requestAnimationFrame(resolve));
}

async function rerender() {
    const token = ++renderToken;

    renderTree({
        fs,
        selectedPath,
        fileTreeEl,
        onSelect(path) {
            selectedPath = path;
            rerender();
        }
    });

    await renderEditor({
        fs,
        selectedPath,
        editorTitleEl,
        editorBodyEl,
        loadBlobForEntry: entry => loadBlob(entry.blobKey),
        onChange: handleEditorChange
    });

    if (token !== renderToken) return;
}

async function handleEditorChange(action) {
    try {
        if (action.type === "rename") {
            const originalEntry = fs.getEntry(action.oldPath);
            if (!originalEntry) return;

            const oldBlobKey = originalEntry.blobKey || null;
            const wasBlob = originalEntry.encoding === "blob";

            const renamed = fs.renameEntry(action.oldPath, action.newPath);
            selectedPath = renamed.path;

            if (wasBlob && oldBlobKey) {
                const blob = await loadBlob(oldBlobKey);
                if (blob) {
                    await saveBlob(renamed.blobKey, blob);
                    await deleteBlob(oldBlobKey);
                }
            }

            const affected = fs.listEntries().filter(entry =>
                entry.path === renamed.path || entry.path.startsWith(renamed.path + "/")
            );

            await saveEntries(affected);
            await rerender();
            return;
        }

        if (action.type === "updateMeta") {
            const updated = fs.updateEntry(action.path, {
                tags: action.tags,
                exportable: action.exportable
            });

            await saveEntry(updated);
            await rerender();
            return;
        }

        if (action.type === "updateText") {
            const path = action.path;
            const existing = fs.getEntry(path);
            if (!existing || existing.type !== "file") return;

            const text = action.text;
            const updated = fs.updateEntry(path, {
                inlineText: text,
                size: new Blob([text], { type: existing.mimeType || "text/plain" }).size,
                encoding: "utf-8"
            });

            await saveEntry(updated);

            const modifiedValue = document.getElementById("modifiedValue");
            if (modifiedValue) {
                modifiedValue.textContent = updated.modified;
            }

            return;
        }
    } catch (error) {
        alert(error.message);
        await rerender();
    }
}

function seedProject() {
    fs.createFolder("/assets");
    fs.createFolder("/worlds");
    fs.createFolder("/uploads");

    fs.createFile({
        path: "/assets/readme.txt",
        tags: ["info"],
        encoding: "utf-8",
        mimeType: "text/plain",
        size: "Put imported files here.".length,
        inlineText: "Put imported files here.",
        blobKey: null,
        exportable: true
    });

    fs.createFile({
        path: "/worlds/test-world.json",
        tags: ["world"],
        encoding: "utf-8",
        mimeType: "application/json",
        size: `{
  "name": "Test World",
  "gravity": 9.8
}`.length,
        inlineText: `{
  "name": "Test World",
  "gravity": 9.8
}`,
        blobKey: null,
        exportable: true
    });
}

async function initialize() {
    try {
        const storedEntries = await loadEntries();

        if (storedEntries && storedEntries.length > 0) {
            fs.loadEntries(storedEntries);
            setStatus("Loaded project from IndexedDB");
        } else {
            seedProject();
            await saveEntries(fs.listEntries());
            setStatus("Created new project");
        }

        await rerender();
    } catch (error) {
        console.error(error);
        seedProject();
        setStatus(`Initialization fallback: ${error.message}`);
        await rerender();
    }
}

async function createFolderPrompt() {
    const path = prompt("Enter folder path:", "/new-folder");
    if (!path) return;

    try {
        const folder = fs.createFolder(path);
        selectedPath = folder.path;
        await saveEntry(folder);
        await rerender();
    } catch (error) {
        alert(error.message);
    }
}

async function createFilePrompt() {
    const path = prompt("Enter file path:", "/new-file.txt");
    if (!path) return;

    try {
        const mimeType = guessMimeTypeFromPath(path);

        const file = fs.createFile({
            path,
            encoding: "utf-8",
            mimeType,
            size: 0,
            inlineText: "",
            blobKey: null,
            tags: [],
            exportable: true
        });

        selectedPath = file.path;
        await saveEntry(file);
        await rerender();
    } catch (error) {
        alert(error.message);
    }
}

async function uploadFiles(fileList) {
    const totalFiles = fileList.length;

    for (let index = 0; index < totalFiles; index++) {
        const file = fileList[index];

        try {
            if (!fs.exists("/uploads")) {
                const uploadsFolder = fs.createFolder("/uploads");
                await saveEntry(uploadsFolder);
            }

            let finalPath = "/uploads/" + file.name;
            let counter = 1;

            while (fs.exists(finalPath)) {
                const dot = file.name.lastIndexOf(".");
                const base = dot > 0 ? file.name.slice(0, dot) : file.name;
                const ext = dot > 0 ? file.name.slice(dot) : "";
                finalPath = `/uploads/${base}-${counter}${ext}`;
                counter++;
            }

            const mimeType = file.type || guessMimeTypeFromPath(file.name);

            setStatus(`Uploading ${file.name} (${index + 1}/${totalFiles})...`);

            if (isTextMimeType(mimeType) && file.size <= 512 * 1024) {
                const text = await file.text();

                const entry = fs.createFile({
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
                selectedPath = finalPath;
                await rerender();
            } else {
                const blobKey = `blob:${finalPath}`;

                const entry = fs.createFile({
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

                selectedPath = finalPath;
                await rerender();
            }

            setStatus(`Saved ${file.name} to ${finalPath}`);
            await nextFrame();
        } catch (error) {
            console.error(error);
            setStatus(`Upload failed for ${file.name}: ${error.message}`);
            alert(error.message);
        }
    }

    setStatus(`Done. Uploaded ${totalFiles} file${totalFiles === 1 ? "" : "s"}.`);
}

async function deleteSelectedEntry() {
    if (!selectedPath) {
        alert("Select a file or folder first.");
        return;
    }

    try {
        const yes = confirm(`Delete ${selectedPath}?`);
        if (!yes) return;

        const deleted = fs.deleteEntry(selectedPath);

        for (const item of deleted) {
            await deleteEntryRecord(item.path);

            if (item.type === "file" && item.blobKey) {
                await deleteBlob(item.blobKey);
            }
        }

        selectedPath = null;
        setStatus("Entry deleted");
        await rerender();
    } catch (error) {
        alert(error.message);
    }
}

function blobToBase64(blob) {
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

async function exportProject() {
    const exportEntries = [];
    const blobFiles = [];

    for (const entry of fs.listEntries()) {
        if (!entry.exportable) continue;

        if (entry.type === "file" && entry.encoding === "blob" && entry.blobKey) {
            const blob = await loadBlob(entry.blobKey);
            if (!blob) continue;

            const base64 = await blobToBase64(blob);

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
    a.download = "webengine-project.json";
    a.click();

    URL.revokeObjectURL(url);
    setStatus("Project exported");
}

async function importProjectFile(file) {
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

    setStatus("Clearing current project...");
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

    fs.loadEntries(importedEntries);
    await saveEntries(fs.listEntries());

    selectedPath = "/";
    setStatus("Project imported");
    await rerender();
}

newFolderBtn.addEventListener("click", createFolderPrompt);
newFileBtn.addEventListener("click", createFilePrompt);

uploadBtn.addEventListener("click", () => {
    setStatus("Opening upload picker...");
    uploadInput.click();
});

importBtn.addEventListener("click", () => {
    setStatus("Opening import picker...");
    importInput.click();
});

uploadInput.addEventListener("change", async () => {
    const files = Array.from(uploadInput.files || []);
    if (files.length === 0) {
        setStatus("No file selected");
        return;
    }

    setStatus(`Starting upload of ${files.length} file${files.length === 1 ? "" : "s"}...`);
    await uploadFiles(files);
    uploadInput.value = "";
});

importInput.addEventListener("change", async () => {
    const file = importInput.files?.[0];
    if (!file) {
        setStatus("No import file selected");
        return;
    }

    try {
        setStatus(`Importing ${file.name}...`);
        await importProjectFile(file);
    } catch (error) {
        console.error(error);
        setStatus(`Import failed: ${error.message}`);
        alert(error.message);
    } finally {
        importInput.value = "";
    }
});

deleteBtn.addEventListener("click", deleteSelectedEntry);
exportBtn.addEventListener("click", exportProject);

initialize();

window.fs = fs;