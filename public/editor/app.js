import { EditorFS } from "./EditorFS.js";
// Import core CodeMirror components from esm.sh
import { EditorView, basicSetup } from 'https://esm.sh/codemirror';
import { javascript } from 'https://esm.sh/@codemirror/lang-javascript';
import { oneDark } from 'https://esm.sh/@codemirror/theme-one-dark';
import { keymap } from 'https://esm.sh/@codemirror/view';
import { indentWithTab } from 'https://esm.sh/@codemirror/commands';
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
        
        this.els = {
            sidebar: document.getElementById("sidebar"),
            container: document.getElementById("editor-container"),
            console: document.getElementById("console"),
            pathLab: document.getElementById("path-label"),
            ctx: document.getElementById("ctx")
        };
        this.init();
    }

    async init() {
        // Initialize CodeMirror 6
        this.editor = new EditorView({
            doc: "// WebEngine Ready\n// Select a file to begin...",
            extensions: [
                basicSetup,
                javascript(),
                oneDark,
                EditorView.lineWrapping,
                // 2. Add the keymap extension here:
                keymap.of([indentWithTab]) 
            ],
            parent: this.els.container
        });

        this.bindEvents();
        this.refresh();
    }   

    bindEvents() {
        // Menubar handling
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
    }

    async handleAction(action) {
        switch (action) {
            case "new-file":
                const name = prompt("File name (e.g. main.js):");
                if (name) {
                    const parent = this.ctxPath || "/";
                    const fullPath = (parent.endsWith('/') ? parent + name : parent + '/' + name).replace(/\/+/g, '/');
                    await fs.createFile(fullPath);
                    this.refresh();
                }
                break;
            case "new-folder":
                const fName = prompt("Folder name:");
                if (fName) {
                    const parent = this.ctxPath || "/";
                    const fullPath = (parent.endsWith('/') ? parent + fName : parent + '/' + fName).replace(/\/+/g, '/');
                    await fs.createFolder(fullPath);
                    this.refresh();
                }
                break;
            case "save-file":
                if (this.path && this.editor) {
                    const content = this.editor.state.doc.toString();
                    await fs.writeText(this.path, content);
                    this.log(`Saved: ${this.path}`, "#4ec9b0");
                }
                break;
            case "delete":
                if (this.ctxPath && confirm(`Delete ${this.ctxPath}?`)) {
                    await fs.deletePath(this.ctxPath);
                    if (this.path === this.ctxPath) {
                        this.path = null;
                        this.setEditorValue("");
                    }
                    this.refresh();
                }
                break;
            case "run-project": await this.runProject(); break;
            case "refresh": this.refresh(); break;
            case "upload-files": await fs.upload(); this.refresh(); break;
            case "import-project": await fs.importProject(); this.refresh(); break;
            case "export-project": await fs.exportProject(); break;
        }
        this.ctxPath = null;
    }

    setEditorValue(text) {
        if (!this.editor) return;
        this.editor.dispatch({
            changes: { from: 0, to: this.editor.state.doc.length, insert: text || "" }
        });
    }

    async runProject() {
        if (this.activeWorker) this.activeWorker.terminate();
        this.log("Building project...", "#9cdcfe");

        try {
            const allFiles = await fs.getAllFiles();
            const sourceMap = {};
            for (const file of allFiles) {
                sourceMap[file.path] = await fs.readText(file.path);
            }

            // Clean up old Blobs to prevent memory leaks
            this.blobUrls.forEach(url => URL.revokeObjectURL(url));
            this.blobUrls.clear();

            // First pass: Create standard Blobs
            for (const path in sourceMap) {
                const blob = new Blob([sourceMap[path]], { type: 'application/javascript' });
                this.blobUrls.set(path, URL.createObjectURL(blob));
            }

            // Second pass: Linker logic for internal imports
            const finalBlobs = new Map();
            for (const path in sourceMap) {
                let code = sourceMap[path];
                code = code.replace(/from\s+['"](\.\/[^'"]+)(['"])/g, (match, relPath, q2) => {
                    const fileName = relPath.replace('./', '');
                    const currentDir = path.substring(0, path.lastIndexOf('/') + 1);
                    const targetPath = (currentDir + fileName).replace(/\/+/g, '/');
                    const targetUrl = this.blobUrls.get(targetPath);
                    return targetUrl ? `from "${targetUrl}"` : match;
                });
                finalBlobs.set(path, URL.createObjectURL(new Blob([code], { type: 'application/javascript' })));
            }

            const oldUrls = Array.from(this.blobUrls.values());
            this.blobUrls = finalBlobs;
            
            let entryPath = this.path || "/scripts/main.js"; // Standardized default
            if (!this.blobUrls.has(entryPath)) entryPath = Array.from(this.blobUrls.keys())[0];

            const entryUrl = this.blobUrls.get(entryPath);
            if (!entryUrl) throw new Error("No valid JS file found to run.");

            // Standardize path for IsoAPI
            const apiPath = `${window.location.href.split('index.html')[0]}IsoAPI.js`;

            const bootstrapCode = `
                import { IsoAPI } from "${apiPath}";
                const logToUI = (data, color = "white") => self.postMessage({ type: 'log', data, color });
                try {
                    self.iso = new IsoAPI(self);
                    self.console.log = (...args) => logToUI(args.join(' '));
                    self.console.error = (...args) => logToUI(args.join(' '), "#f44747");
                    await import("${entryUrl}");
                } catch (e) {
                    logToUI("Runtime Error: " + e.message, "#f44747");
                }
            `;

            const bootstrapUrl = URL.createObjectURL(new Blob([bootstrapCode], { type: 'application/javascript' }));
            this.activeWorker = new Worker(bootstrapUrl, { type: 'module' });
            
            this.activeWorker.onmessage = (e) => { 
                if (e.data.type === 'log') this.log(e.data.data, e.data.color); 
            };

            // Safe cleanup for imports
            setTimeout(() => {
                oldUrls.forEach(url => URL.revokeObjectURL(url));
                URL.revokeObjectURL(bootstrapUrl);
            }, 1000);

            this.log(`Started: ${entryPath}`, "#4ec9b0");
        } catch (err) {
            this.log(`Build Error: ${err.message}`, "#f44747");
        }
    }

    async refresh() {
        const buildTree = async (dirPath, depth = 0) => {
            let html = "";
            const children = await fs.getChildren(dirPath);
            // Folders first, then Alphabetical
            children.sort((a, b) => (b.type === "folder") - (a.type === "folder") || a.path.localeCompare(b.path));

            for (const item of children) {
                const isFolder = item.type === "folder";
                const name = item.path.split("/").pop();
                const active = item.path === this.path ? "active" : "";
                
                html += `<div class="file-item ${active}" data-path="${item.path}" data-type="${item.type}" style="padding-left: ${depth * 12 + 10}px">
                    ${isFolder ? "📁" : "📄"} ${name}
                </div>`;
                
                if (isFolder) {
                    html += await buildTree(item.path, depth + 1);
                }
            }
            return html;
        };

        // Added back the Root folder item and the Recursive call
        this.els.sidebar.innerHTML = `<div class="file-item" data-path="/" style="font-weight:bold">📦 Project Root</div>` + await buildTree("/");
        
        this.els.sidebar.querySelectorAll('.file-item[data-type="file"]').forEach(el => {
            el.onclick = () => this.open(el.dataset.path);
        });
    }

    async open(path) {
        this.path = path;
        const content = await fs.readText(path);
        this.setEditorValue(content);
        this.els.pathLab.textContent = path;
        this.refresh();
    }

    log(msg, color = "white") {
        const line = document.createElement("div");
        line.style.color = color;
        line.style.marginBottom = "2px";
        line.textContent = `> ${msg}`;
        this.els.console.appendChild(line);
        this.els.console.scrollTop = this.els.console.scrollHeight;
    }
}

new App();