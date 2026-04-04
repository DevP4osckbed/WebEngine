import { escapeHtml } from "./encoding.js";

const MAX_INLINE_TEXT_PREVIEW = 256 * 1024;
let activeObjectUrl = null;

function revokeActiveObjectUrl() {
    if (activeObjectUrl) {
        URL.revokeObjectURL(activeObjectUrl);
        activeObjectUrl = null;
    }
}

export function renderTree({ fs, selectedPath, fileTreeEl, onSelect }) {
    fileTreeEl.innerHTML = "";

    const root = fs.buildTree("/");
    if (!root) return;

    const ul = document.createElement("ul");
    renderNode(root, ul, selectedPath, onSelect);
    fileTreeEl.appendChild(ul);
}

function renderNode(node, parentElement, selectedPath, onSelect) {
    const li = document.createElement("li");

    const button = document.createElement("button");
    button.textContent = node.type === "folder"
        ? `[Folder] ${node.path}`
        : `[File] ${node.path}`;

    if (node.path === selectedPath) {
        button.disabled = true;
    }

    button.addEventListener("click", () => {
        onSelect(node.path);
    });

    li.appendChild(button);

    if (node.type === "folder" && node.children.length > 0) {
        const ul = document.createElement("ul");
        for (const child of node.children) {
            renderNode(child, ul, selectedPath, onSelect);
        }
        li.appendChild(ul);
    }

    parentElement.appendChild(li);
}

export async function renderEditor({
    fs,
    selectedPath,
    editorTitleEl,
    editorBodyEl,
    loadBlobForEntry,
    onChange
}) {
    revokeActiveObjectUrl();

    if (!selectedPath) {
        editorTitleEl.textContent = "No selection";
        editorBodyEl.innerHTML = "Select a file or folder.";
        return;
    }

    const entry = fs.getEntry(selectedPath);
    if (!entry) {
        editorTitleEl.textContent = "No selection";
        editorBodyEl.innerHTML = "Select a file or folder.";
        return;
    }

    editorTitleEl.textContent = entry.path;

    if (entry.type === "folder") {
        const children = fs.getChildren(entry.path);

        editorBodyEl.innerHTML = `
            <div>
                <p><strong>Type:</strong> folder</p>
                <p><strong>Path:</strong></p>
                <input id="entryPath" type="text" value="${escapeHtml(entry.path)}">
                <p><strong>Created:</strong> ${escapeHtml(entry.created)}</p>
                <p><strong>Modified:</strong> <span id="modifiedValue">${escapeHtml(entry.modified)}</span></p>
                <p><strong>Encoding:</strong> none</p>
                <p><strong>Mime Type:</strong> inode/directory</p>
                <p><strong>Tags:</strong></p>
                <input id="entryTags" type="text" value="${escapeHtml(entry.tags.join(", "))}">
                <p>
                    <label>
                        <input id="entryExportable" type="checkbox" ${entry.exportable ? "checked" : ""}>
                        Exportable
                    </label>
                </p>
                <p><strong>Children:</strong> ${children.length}</p>
            </div>
        `;

        bindCommonEditorEvents({ entry, selectedPath, onChange });
        return;
    }

    let bodyHtml = `
        <div>
            <p><strong>Type:</strong> file</p>
            <p><strong>Path:</strong></p>
            <input id="entryPath" type="text" value="${escapeHtml(entry.path)}">
            <p><strong>Extension:</strong> ${escapeHtml(fs.getExtensionFromPath(entry.path) || "(none)")}</p>
            <p><strong>Created:</strong> ${escapeHtml(entry.created)}</p>
            <p><strong>Modified:</strong> <span id="modifiedValue">${escapeHtml(entry.modified)}</span></p>
            <p><strong>Encoding:</strong> ${escapeHtml(entry.encoding)}</p>
            <p><strong>Mime Type:</strong> ${escapeHtml(entry.mimeType || "")}</p>
            <p><strong>Size:</strong> ${escapeHtml(String(entry.size || 0))} bytes</p>
            <p><strong>Tags:</strong></p>
            <input id="entryTags" type="text" value="${escapeHtml(entry.tags.join(", "))}">
            <p>
                <label>
                    <input id="entryExportable" type="checkbox" ${entry.exportable ? "checked" : ""}>
                    Exportable
                </label>
            </p>
    `;

    if (entry.encoding === "utf-8") {
        if ((entry.size || 0) <= MAX_INLINE_TEXT_PREVIEW) {
            bodyHtml += `
                <p><strong>Contents:</strong></p>
                <textarea id="entryContents" rows="20" cols="80">${escapeHtml(entry.inlineText || "")}</textarea>
            `;
        } else {
            bodyHtml += `
                <p><strong>Contents:</strong></p>
                <p>Text preview disabled because file is large.</p>
            `;
        }
    } else if (entry.encoding === "blob") {
        bodyHtml += `
            <div id="blobPreview">Loading blob preview...</div>
        `;
    } else {
        bodyHtml += `
            <p>No preview available.</p>
        `;
    }

    bodyHtml += `</div>`;
    editorBodyEl.innerHTML = bodyHtml;

    bindCommonEditorEvents({ entry, selectedPath, onChange });

    if (entry.encoding === "utf-8" && (entry.size || 0) <= MAX_INLINE_TEXT_PREVIEW) {
        const contentsInput = document.getElementById("entryContents");
        if (contentsInput) {
            contentsInput.addEventListener("input", () => {
                onChange({
                    type: "updateText",
                    path: selectedPath,
                    text: contentsInput.value
                });
            });
        }
        return;
    }

    if (entry.encoding === "blob") {
        const previewEl = document.getElementById("blobPreview");

        try {
            const blob = await loadBlobForEntry(entry);

            if (!blob) {
                previewEl.innerHTML = `<p>Blob not found.</p>`;
                return;
            }

            const objectUrl = URL.createObjectURL(blob);
            activeObjectUrl = objectUrl;

            if ((entry.mimeType || "").startsWith("audio/")) {
                previewEl.innerHTML = `
                    <p><strong>Audio Preview:</strong></p>
                    <audio controls src="${objectUrl}"></audio>
                `;
                return;
            }

            if ((entry.mimeType || "").startsWith("image/")) {
                previewEl.innerHTML = `
                    <p><strong>Image Preview:</strong></p>
                    <img src="${objectUrl}" alt="${escapeHtml(entry.path)}" style="max-width: 100%; max-height: 500px;">
                `;
                return;
            }

            if ((entry.mimeType || "").startsWith("video/")) {
                previewEl.innerHTML = `
                    <p><strong>Video Preview:</strong></p>
                    <video controls src="${objectUrl}" style="max-width: 100%; max-height: 500px;"></video>
                `;
                return;
            }

            previewEl.innerHTML = `
                <p>Binary blob stored in IndexedDB.</p>
                <p>No inline preview for this mime type.</p>
            `;
        } catch (error) {
            previewEl.innerHTML = `<p>Failed to load blob preview: ${escapeHtml(error.message)}</p>`;
        }
    }
}

function bindCommonEditorEvents({ entry, selectedPath, onChange }) {
    const pathInput = document.getElementById("entryPath");
    const tagsInput = document.getElementById("entryTags");
    const exportableInput = document.getElementById("entryExportable");

    pathInput.addEventListener("change", () => {
        onChange({
            type: "rename",
            oldPath: selectedPath,
            newPath: pathInput.value.trim(),
            originalPath: entry.path
        });
    });

    tagsInput.addEventListener("change", () => {
        const tags = tagsInput.value
            .split(",")
            .map(tag => tag.trim())
            .filter(Boolean);

        onChange({
            type: "updateMeta",
            path: selectedPath,
            tags,
            exportable: exportableInput.checked
        });
    });

    exportableInput.addEventListener("change", () => {
        const tags = tagsInput.value
            .split(",")
            .map(tag => tag.trim())
            .filter(Boolean);

        onChange({
            type: "updateMeta",
            path: selectedPath,
            tags,
            exportable: exportableInput.checked
        });
    });
}