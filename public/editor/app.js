import { EditorFS } from "./EditorFS.js";
import { EditorState } from 'https://esm.sh/@codemirror/state';
import { EditorView, basicSetup } from 'https://esm.sh/codemirror';
import { javascript } from 'https://esm.sh/@codemirror/lang-javascript';
import { oneDark } from 'https://esm.sh/@codemirror/theme-one-dark';
import { keymap } from 'https://esm.sh/@codemirror/view';
import { indentWithTab } from 'https://esm.sh/@codemirror/commands';
import { indentUnit } from 'https://esm.sh/@codemirror/language';

const isoAPICompletions = (context) => {
    let word = context.matchBefore(/IsoAPI\.\w*/);
    if (!word) return null;
    if (word.from === word.to && !context.explicit) return null;
    return {
        from: word.text.includes('.') ? word.from + 7 : word.from,
        options: [
            { label: "gl", type: "property", detail: "WebGL2 Context" },
            { label: "ctx", type: "property", detail: "Canvas2D Context" },
            { label: "render", type: "function", detail: "Main render hook" },
            { label: "update", type: "function", detail: "Logic update hook" },
            { label: "postMessage", type: "function", detail: "Send data to main thread" }
        ]
    };
};

const fs = await new EditorFS({
    onStatus: (msg) => console.log(`[FS]: ${msg}`)
}).init();

class App {
    constructor() {
        this.path = null;
        this.ctxPath = null;
        this.activeWorker = null;
        this.blobUrls = new Map();
        this.editor = null;

        this.tabs = new Map();
        this.openPaths = [];

        this.isRunning = false;
        this.lastTime = performance.now();
        this.frameCount = 0;
        this.displayedFps = 0;

        this.els = {
            sidebar: document.getElementById("sidebar"),
            editorContainer: document.getElementById("editor-container"),
            previewContainer: document.getElementById("preview-container"),
            playerContainer: document.getElementById("player-container"),
            console: document.getElementById("console"),
            pathLab: document.getElementById("path-label"),
            ctx: document.getElementById("ctx"),
            canvas: document.getElementById("game-canvas"),
            runBtn: document.getElementById("run-btn-main"),
            stopBtn: document.getElementById("stop-btn-main"),
            fileTabs: document.getElementById("file-tabs")
        };

        this.ctx = this.els.canvas.getContext('2d');
        this.init();
    }

    async init() {
        this.editor = new EditorView({
            state: this.createEditorState("// Select a file to start coding", "none"),
            parent: this.els.editorContainer
        });

        this.bindEvents();
        await this.refresh();
    }

    getFileName(path = "") {
        return path.split('/').pop() || path;
    }

    getExtension(path = "") {
        const name = this.getFileName(path);
        const dot = name.lastIndexOf('.');
        return dot >= 0 ? name.slice(dot + 1).toLowerCase() : "";
    }

    isPreviewableFile(path, mimeType = "") {
        return this.getPreviewKind(path, mimeType) !== null;
    }

    getPreviewKind(path, mimeType = "") {
        const ext = this.getExtension(path);
        const lowerMime = (mimeType || "").toLowerCase();

        if (lowerMime.startsWith("image/") || ["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg", "ico", "avif"].includes(ext)) {
            return "image";
        }

        if (lowerMime.startsWith("video/") || ["mp4", "webm", "ogg", "mov", "m4v"].includes(ext)) {
            return "video";
        }

        if (lowerMime.startsWith("audio/") || ["mp3", "wav", "ogg", "m4a", "aac", "flac"].includes(ext)) {
            return "audio";
        }

        if (lowerMime === "application/pdf" || ext === "pdf") {
            return "pdf";
        }

        if (lowerMime === "text/html" || ["html", "htm"].includes(ext)) {
            return "html";
        }

        return null;
    }
    getFileIcon(path, mimeType = "", isFolder = false) {
        if (isFolder) return "lucide:folder";

        const ext = this.getExtension(path);
        const mime = (mimeType || "").toLowerCase();

        if (mime.startsWith("image/") || ["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "ico", "avif"].includes(ext)) {
            return "lucide:image";
        }

        if (mime.startsWith("video/") || ["mp4", "webm", "mov", "m4v", "ogg"].includes(ext)) {
            return "lucide:film";
        }

        if (mime.startsWith("audio/") || ["mp3", "wav", "ogg", "m4a", "aac", "flac"].includes(ext)) {
            return "lucide:music-4";
        }

        if (mime === "application/pdf" || ext === "pdf") {
            return "lucide:file-text";
        }

        if (mime === "text/html" || ["html", "htm"].includes(ext)) {
            return "lucide:globe";
        }

        if (["js", "mjs", "cjs", "ts", "jsx", "tsx"].includes(ext)) {
            return "lucide:file-code-2";
        }

        if (["json"].includes(ext)) {
            return "lucide:braces";
        }

        if (["css", "scss", "sass"].includes(ext)) {
            return "lucide:paintbrush-2";
        }

        if (["md"].includes(ext)) {
            return "lucide:file-text";
        }

        if (["txt", "log", "xml", "yaml", "yml"].includes(ext)) {
            return "lucide:file";
        }

        return "lucide:file";
    }
    getFolderIcon(isOpen = false) {
        return isOpen ? "lucide:folder-open" : "lucide:folder";
    }
    createEditorState(content, filePath) {
        return EditorState.create({
            doc: content,
            extensions: [
                basicSetup,
                javascript(),
                oneDark,
                EditorView.lineWrapping,
                keymap.of([indentWithTab]),
                indentUnit.of("    "),
                javascript().language.data.of({ autocomplete: isoAPICompletions }),
                EditorView.updateListener.of((update) => {
                    if (update.docChanged && this.tabs.has(filePath)) {
                        const tab = this.tabs.get(filePath);
                        if (!tab.dirty) {
                            tab.dirty = true;
                            this.renderTabs();
                        }
                    }
                })
            ]
        });
    }

    renderTabs() {
        this.els.fileTabs.innerHTML = "";

        this.openPaths.forEach(path => {
            const tabData = this.tabs.get(path);
            const name = this.getFileName(path);
            const isActive = this.path === path;

            const tab = document.createElement("div");
            tab.className = `file-tab ${isActive ? 'active' : ''}`;
            tab.style.cssText = `
                padding: 8px 12px;
                font-size: 12px;
                cursor: pointer;
                border-right: 1px solid var(--border);
                display: flex;
                align-items: center;
                gap: 8px;
                background: ${isActive ? 'var(--bg)' : 'transparent'};
                color: ${isActive ? 'var(--accent)' : '#888'};
                min-width: 100px;
            `;

            tab.innerHTML = `
                <span style="flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${name}</span>
                <span class="tab-icon" style="font-size: 10px; width: 12px; text-align: center;">${tabData?.dirty ? "●" : "✕"}</span>
            `;

            tab.onclick = () => this.open(path);
            tab.querySelector('.tab-icon').onclick = (e) => {
                e.stopPropagation();
                this.closeTab(path);
            };

            this.els.fileTabs.appendChild(tab);
        });
    }

    async open(path) {
        if (this.path && this.tabs.has(this.path)) {
            const currentTab = this.tabs.get(this.path);
            if (!currentTab.isPreview) {
                currentTab.state = this.editor.state;
            }
        }

        if (!this.tabs.has(path)) {
            const fileMeta = fs.getFile(path);
            if (!fileMeta) {
                this.log(`Could not open file: ${path}`, "#f44747");
                return;
            }

            const previewKind = this.getPreviewKind(path, fileMeta.mimeType);
            const isPreview = !!previewKind;

            if (isPreview) {
                const blob = await fs.readBlob(path);
                const url = blob ? URL.createObjectURL(blob) : null;
                this.tabs.set(path, {
                    isPreview: true,
                    previewKind,
                    url,
                    mimeType: fileMeta.mimeType || "application/octet-stream",
                    dirty: false
                });
            } else {
                const content = await fs.readText(path);
                this.tabs.set(path, {
                    isPreview: false,
                    state: this.createEditorState(content || "", path),
                    mimeType: fileMeta.mimeType || "text/plain",
                    dirty: false
                });
            }

            this.openPaths.push(path);
        }

        this.path = path;
        const activeTab = this.tabs.get(path);

        if (activeTab.isPreview) {
            this.els.editorContainer.style.display = "none";
            this.els.previewContainer.style.display = "flex";
            this.renderPreview(activeTab, path);
        } else {
            this.els.editorContainer.style.display = "block";
            this.els.previewContainer.style.display = "none";
            this.editor.setState(activeTab.state);
        }

        this.els.pathLab.textContent = path;
        this.renderTabs();
        await this.refresh();
    }

    renderPreview(tab, path) {
        const container = this.els.previewContainer;
        container.innerHTML = "";

        const kind = tab.previewKind;
        const mime = tab.mimeType || "";
        const url = tab.url;

        if (!url) {
            container.innerHTML = `<div style="text-align:center;"><div style="font-size:50px;">⚠️</div><p>Could not preview ${this.getFileName(path)}</p></div>`;
            return;
        }

        if (kind === "image") {
            const img = document.createElement("img");
            img.src = url;
            img.alt = this.getFileName(path);
            img.style.cssText = "max-width: 95%; max-height: 95%; object-fit: contain; box-shadow: 0 0 30px rgba(0,0,0,0.5);";
            container.appendChild(img);
            return;
        }

        if (kind === "video") {
            const vid = document.createElement("video");
            vid.src = url;
            vid.controls = true;
            vid.preload = "metadata";
            vid.style.cssText = "max-width: 95%; max-height: 95%; background: #000;";
            container.appendChild(vid);
            return;
        }

        if (kind === "audio") {
            const wrap = document.createElement("div");
            wrap.style.cssText = "display:flex; flex-direction:column; align-items:center; gap:16px;";
            wrap.innerHTML = `<div style="font-size:64px;">🎵</div><div style="opacity:.75;">${this.getFileName(path)}</div>`;
            const aud = document.createElement("audio");
            aud.src = url;
            aud.controls = true;
            aud.preload = "metadata";
            aud.style.width = "min(700px, 90vw)";
            wrap.appendChild(aud);
            container.appendChild(wrap);
            return;
        }

        if (kind === "pdf") {
            const frame = document.createElement("iframe");
            frame.src = url;
            frame.title = this.getFileName(path);
            frame.style.cssText = "width: 100%; height: 100%; border: none; background: white;";
            container.appendChild(frame);
            return;
        }

        if (kind === "html") {
            const frame = document.createElement("iframe");
            frame.src = url;
            frame.sandbox = "allow-scripts allow-same-origin";
            frame.title = this.getFileName(path);
            frame.style.cssText = "width: 100%; height: 100%; border: none; background: white;";
            container.appendChild(frame);
            return;
        }

        container.innerHTML = `
            <div style="text-align:center; max-width: 600px; padding: 24px;">
                <div style="font-size:50px;">📦</div>
                <p>No visual preview available.</p>
                <p style="opacity:.7; font-size:12px;">${this.getFileName(path)}<br>${mime || 'unknown mime type'}</p>
            </div>
        `;
    }

    closeTab(path) {
        const tab = this.tabs.get(path);
        if (!tab) return;

        if (tab.dirty && !confirm("Discard unsaved changes?")) return;

        if (tab.isPreview && tab.url) {
            URL.revokeObjectURL(tab.url);
        }

        this.tabs.delete(path);
        this.openPaths = this.openPaths.filter(p => p !== path);

        if (this.path === path) {
            this.path = this.openPaths[0] || null;
            if (this.path) {
                this.open(this.path);
            } else {
                this.els.editorContainer.style.display = "block";
                this.els.previewContainer.style.display = "none";
                this.editor.setState(this.createEditorState("// Open a file", "none"));
                this.els.pathLab.textContent = "No file selected";
            }
        }

        this.renderTabs();
    }

    bindEvents() {
        document.querySelectorAll(".menu-btn").forEach(btn => {
            btn.onclick = (e) => {
                const parent = btn.parentElement;
                if (parent.classList.contains("menu")) {
                    const isOpen = parent.classList.contains("open");
                    document.querySelectorAll(".menu").forEach(m => m.classList.remove("open"));
                    if (!isOpen) parent.classList.add("open");
                    e.stopPropagation();
                }
            };
        });

        document.querySelectorAll(".tab-btn").forEach(btn => {
            btn.onclick = () => this.switchTab(btn.dataset.tab);
        });

        document.addEventListener("click", (e) => {
            const action = e.target.dataset.action;
            if (action) this.handleAction(action);
            if (!e.target.closest(".menu")) {
                document.querySelectorAll(".menu").forEach(m => m.classList.remove("open"));
            }
            this.els.ctx.style.display = "none";
        });

        this.els.sidebar.oncontextmenu = (e) => {
            const item = e.target.closest(".file-item");
            if (!item) return;
            e.preventDefault();
            this.ctxPath = item.dataset.path;
            this.els.ctx.style.display = "block";
            this.els.ctx.style.left = e.clientX + "px";
            this.els.ctx.style.top = e.clientY + "px";
        };

        window.onkeydown = (e) => {
            if (e.ctrlKey && e.key === 's') {
                e.preventDefault();
                this.handleAction('save-file');
            }
        };

        this.bindInputEvents();
    }

    bindInputEvents() {
        const canvas = this.els.canvas;
        const proxyEvent = (e) => {
            if (!this.isRunning || !this.activeWorker) return;
            if (document.activeElement?.closest?.('.cm-editor')) return;

            this.activeWorker.postMessage({
                type: 'INPUT',
                event: {
                    type: e.type,
                    key: e.key,
                    code: e.code,
                    button: e.button,
                    movementX: e.movementX || 0,
                    movementY: e.movementY || 0
                }
            });

            if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) {
                e.preventDefault();
            }
        };

        document.addEventListener('pointerlockchange', () => {
            const isLocked = document.pointerLockElement === this.els.canvas;
            if (this.activeWorker) {
                this.activeWorker.postMessage({ type: 'INPUT', event: { type: 'LOCK_STATE_CHANGE', value: isLocked } });
            }
        });

        window.addEventListener('keydown', proxyEvent);
        window.addEventListener('keyup', proxyEvent);
        canvas.addEventListener('mousedown', proxyEvent);
        canvas.addEventListener('mouseup', proxyEvent);
        canvas.addEventListener('mousemove', proxyEvent);
    }

    switchTab(tabId) {
        document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
        document.querySelectorAll(".tab-content").forEach(c => c.style.display = "none");
        const btn = document.querySelector(`.tab-btn[data-tab="${tabId}"]`);
        if (btn) btn.classList.add("active");
        const target = document.getElementById(`${tabId}-container`);
        if (target) target.style.display = (tabId === 'player' ? 'flex' : 'block');
    }

    async handleAction(action) {
        switch (action) {
            case "new-file": {
                const name = prompt("File name:");
                if (name) {
                    const parent = this.ctxPath || "/";
                    const fullPath = (parent.endsWith('/') ? parent + name : parent + '/' + name).replace(/\/+/g, '/');
                    await fs.createFile(fullPath);
                    await this.refresh();
                }
                break;
            }
            case "save-file": {
                if (this.path && this.tabs.has(this.path)) {
                    const tab = this.tabs.get(this.path);
                    if (tab.isPreview) return;
                    const content = this.editor.state.doc.toString();
                    await fs.writeText(this.path, content);
                    tab.dirty = false;
                    this.log(`Saved: ${this.path}`, "#4ec9b0");
                    this.renderTabs();
                }
                break;
            }
            case "delete": {
                if (this.ctxPath && confirm(`Delete ${this.ctxPath}?`)) {
                    await fs.deletePath(this.ctxPath);
                    if (this.tabs.has(this.ctxPath)) this.closeTab(this.ctxPath);
                    await this.refresh();
                }
                break;
            }
            case "run-project":
                await this.runProject();
                break;
            case "stop-project":
                this.stopProject();
                break;
            case "refresh":
                await this.refresh();
                break;
            case "upload-files":
                await fs.upload();
                await this.refresh();
                break;
        }

        this.ctxPath = null;
    }

    stopProject() {
        this.isRunning = false;
        if (this.activeWorker) {
            this.activeWorker.terminate();
            this.activeWorker = null;
        }
        this.els.runBtn.style.display = "inline-block";
        this.els.stopBtn.style.display = "none";
        this.ctx.clearRect(0, 0, 854, 480);
        this.log("Project stopped.", "#f44747");
        this.switchTab('editor');
    }

    async runProject() {
        for (const [p, data] of this.tabs) {
            if (!data.isPreview && data.dirty) {
                await fs.writeText(p, data.state.doc.toString());
                data.dirty = false;
            }
        }
        this.renderTabs();

        if (this.isRunning) this.stopProject();
        this.isRunning = true;
        this.log("Initializing IsoEngine...", "#9cdcfe");
        this.switchTab('player');
        this.els.runBtn.style.display = "none";
        this.els.stopBtn.style.display = "inline-block";

        try {
            const allFiles = await fs.getAllFiles();
            const sourceMap = {};
            const mimeMap = {};

            for (const file of allFiles) {
                mimeMap[file.path] = file.mimeType || "";
                if (this.isPreviewableFile(file.path, file.mimeType)) {
                    const blob = await fs.readBlob(file.path);
                    sourceMap[file.path] = URL.createObjectURL(blob);
                } else {
                    sourceMap[file.path] = await fs.readText(file.path);
                }
            }

            this.blobUrls.forEach(url => URL.revokeObjectURL(url));
            this.blobUrls.clear();

            const executableUrls = new Map();

            for (const path in sourceMap) {
                if (this.isPreviewableFile(path, mimeMap[path])) {
                    executableUrls.set(path, sourceMap[path]);
                    continue;
                }

                let code = sourceMap[path];
                if (typeof code !== 'string') continue;

                code = code.replace(/from\s+['"](\.\/[^'"]+)(['"])/g, (match, relPath) => {
                    const fileName = relPath.replace('./', '');
                    const currentDir = path.substring(0, path.lastIndexOf('/') + 1);
                    const targetPath = (currentDir + fileName).replace(/\/+/g, '/');
                    const targetSource = sourceMap[targetPath] ?? '';
                    return `from "${URL.createObjectURL(new Blob([targetSource], { type: 'application/javascript' }))}"`;
                });

                const url = URL.createObjectURL(new Blob([code], { type: 'application/javascript' }));
                executableUrls.set(path, url);
                this.blobUrls.set(path, url);
            }

            const entryPath = this.path || "/main.js";
            const entryUrl = executableUrls.get(entryPath);
            if (!entryUrl) {
                throw new Error(`No runnable entry file found for ${entryPath}`);
            }

            const apiPath = `${window.location.href.split('index.html')[0]}IsoAPI.js`;

            const bootstrapCode = `
                import { IsoAPI } from "${apiPath}";
                self.onmessage = async (e) => {
                    if (e.data.type === 'start') {
                        self.IsoAPI = new IsoAPI(self, 854, 480);
                        await import("${entryUrl}");
                        renderLoop();
                    }
                    if (e.data.type === 'INPUT' && self.IsoAPI) {
                        self.IsoAPI._handleInput(e.data.event);
                    }
                };
                function renderLoop() {
                    if (self.IsoAPI.update) self.IsoAPI.update();
                    self.IsoAPI.ctx.clearRect(0, 0, 854, 480);
                    if (self.IsoAPI.render) self.IsoAPI.render();
                    const bitmap = self.IsoAPI.getCombinedFrame();
                    self.postMessage({ type: 'FRAME', bitmap }, [bitmap]);
                    self.IsoAPI._clearInputDelta();
                    requestAnimationFrame(renderLoop);
                }
            `;

            this.activeWorker = new Worker(
                URL.createObjectURL(new Blob([bootstrapCode], { type: 'application/javascript' })),
                { type: 'module' }
            );

            this.activeWorker.onmessage = (e) => {
                if (e.data.type === 'FRAME') {
                    this.updateFps();
                    this.drawFrame(e.data.bitmap);
                } else if (e.data.type === 'log') {
                    this.log(e.data.data, e.data.color);
                } else if (e.data.type === 'LOCK_MOUSE') {
                    if (e.data.value) this.els.canvas.requestPointerLock();
                    else document.exitPointerLock();
                }
            };

            this.activeWorker.postMessage({ type: 'start' });
        } catch (err) {
            this.log(`Error: ${err.message}`, "#f44747");
            this.stopProject();
        }
    }

    updateFps() {
        const now = performance.now();
        this.frameCount++;
        if (now - this.lastTime >= 1000) {
            this.displayedFps = this.frameCount;
            this.frameCount = 0;
            this.lastTime = now;
        }
    }

    drawFrame(bitmap) {
        if (!this.isRunning) return;
        this.ctx.clearRect(0, 0, 854, 480);
        this.ctx.drawImage(bitmap, 0, 0);
        this.ctx.fillStyle = 'lime';
        this.ctx.font = '14px monospace';
        this.ctx.fillText(`FPS: ${this.displayedFps}`, 15, 25);
        bitmap.close();
    }

    async refresh() {
        const buildTree = async (dirPath, depth = 0) => {
            let html = "";
            const children = await fs.getChildren(dirPath);
            children.sort((a, b) => (b.type === "folder") - (a.type === "folder") || a.path.localeCompare(b.path));

            for (const item of children) {
                const isFolder = item.type === "folder";
                const name = this.getFileName(item.path);
                const active = item.path === this.path ? "active" : "";
                const icon = this.getFileIcon(item.path, item.mimeType, isFolder);

                html += `<div class="file-item ${active}" data-path="${item.path}" data-type="${item.type}" style="padding-left: ${depth * 15 + 10}px">
                    <span class="file-icon">
                        <iconify-icon icon="${icon}"></iconify-icon>
                    </span>
                    ${name}
                </div>`;
                if (isFolder) html += await buildTree(item.path, depth + 1);
            }
            return html;
        };

        this.els.sidebar.innerHTML = `<div class="file-item" style="font-weight:bold; color: #aaa;">/Project</div>` + await buildTree("/");
        this.els.sidebar.querySelectorAll('.file-item[data-type="file"]').forEach(el => {
            el.onclick = () => this.open(el.dataset.path);
        });
    }

    log(msg, color = "white") {
        const line = document.createElement("div");
        line.style.color = color;
        line.innerHTML = `<span style="color: #666; margin-right: 5px;">[${new Date().toLocaleTimeString()}]</span> ${msg}`;
        this.els.console.appendChild(line);
        this.els.console.scrollTop = this.els.console.scrollHeight;
    }
}

new App();