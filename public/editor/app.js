import { EditorFS } from "./EditorFS.js";
import { EditorView, basicSetup } from 'https://esm.sh/codemirror';
import { javascript } from 'https://esm.sh/@codemirror/lang-javascript';
import { oneDark } from 'https://esm.sh/@codemirror/theme-one-dark';
import { keymap } from 'https://esm.sh/@codemirror/view';
import { indentWithTab } from 'https://esm.sh/@codemirror/commands';
import { indentUnit } from 'https://esm.sh/@codemirror/language';

// --- CHANGE THIS LINE ---
import { autocompletion } from 'https://esm.sh/@codemirror/autocomplete';
// Define the snippets and properties for IsoAPI
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
        
        // Running State
        this.isRunning = false;
        this.fps = 0;
        this.lastTime = performance.now();
        this.frameCount = 0;
        this.displayedFps = 0;

        this.els = {
            sidebar: document.getElementById("sidebar"),
            container: document.getElementById("editor-container"),
            player: document.getElementById("player-container"),
            console: document.getElementById("console"),
            pathLab: document.getElementById("path-label"),
            ctx: document.getElementById("ctx"),
            canvas: document.getElementById("game-canvas"),
            runBtn: document.getElementById("run-btn-main"),
            stopBtn: document.getElementById("stop-btn-main")
        };
        this.ctx = this.els.canvas.getContext('2d');
        this.init();
    }

    async init() {
        this.editor = new EditorView({
            doc: "// WebEngine Ready\n// Write your code and click 'Play'",
            extensions: [
                basicSetup, javascript(), oneDark,
                EditorView.lineWrapping,
                keymap.of([indentWithTab]),
                indentUnit.of("    "),
                javascript().language.data.of({
                    autocomplete: isoAPICompletions
                })
            ],
            parent: this.els.container
        });

        this.bindEvents();
        this.refresh();
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
            // Only forward if the project is actually running
            if (!this.isRunning || !this.activeWorker) return;

            // Don't trigger game inputs if the user is typing in the editor
            if (document.activeElement.closest('.cm-editor')) return;

            this.activeWorker.postMessage({
                type: 'INPUT',
                event: {
                    type: e.type,
                    key: e.key,
                    code: e.code,       // e.g., "KeyW"
                    button: e.button,   // e.g., 0 for Left Click
                    movementX: e.movementX || 0,
                    movementY: e.movementY || 0
                }
            });

            // Optional: Prevent space/arrows from scrolling the page while playing
            if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) {
                e.preventDefault();
            }
        };

        // Keyboard (Global)
        window.addEventListener('keydown', proxyEvent);
        window.addEventListener('keyup', proxyEvent);

        // Mouse (Canvas specific)
        canvas.addEventListener('mousedown', proxyEvent);
        canvas.addEventListener('mouseup', proxyEvent);
        canvas.addEventListener('mousemove', proxyEvent);
    }

    switchTab(tabId) {
        document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
        document.querySelectorAll(".tab-content").forEach(c => c.style.display = "none");
        
        document.querySelector(`.tab-btn[data-tab="${tabId}"]`).classList.add("active");
        const target = document.getElementById(`${tabId}-container`);
        if(target) target.style.display = (tabId === 'player' ? 'flex' : 'block');
    }

    async handleAction(action) {
        switch (action) {
            case "new-file":
                const name = prompt("File name:");
                if (name) {
                    const parent = this.ctxPath || "/";
                    const fullPath = (parent.endsWith('/') ? parent + name : parent + '/' + name).replace(/\/+/g, '/');
                    await fs.createFile(fullPath);
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
                    if (this.path === this.ctxPath) { this.path = null; this.setEditorValue(""); }
                    this.refresh();
                }
                break;
            case "run-project": await this.runProject(); break;
            case "stop-project": this.stopProject(); break;
            case "refresh": this.refresh(); break;
            case "upload-files": await fs.upload(); this.refresh(); break;
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
        if (this.isRunning) this.stopProject();
        this.isRunning = true;
        this.log("Initializing hybrid renderer...", "#9cdcfe");
        this.switchTab('player');
        
        this.els.runBtn.style.display = "none";
        this.els.stopBtn.style.display = "inline-block";

        try {
            const allFiles = await fs.getAllFiles();
            const sourceMap = {};
            for (const file of allFiles) sourceMap[file.path] = await fs.readText(file.path);

            this.blobUrls.forEach(url => URL.revokeObjectURL(url));
            this.blobUrls.clear();

            // Link modules
            for (const path in sourceMap) {
                let code = sourceMap[path];
                code = code.replace(/from\s+['"](\.\/[^'"]+)(['"])/g, (match, relPath) => {
                    const fileName = relPath.replace('./', '');
                    const currentDir = path.substring(0, path.lastIndexOf('/') + 1);
                    const targetPath = (currentDir + fileName).replace(/\/+/g, '/');
                    return `from "${URL.createObjectURL(new Blob([sourceMap[targetPath]], {type:'application/javascript'}))}"`;
                });
                this.blobUrls.set(path, URL.createObjectURL(new Blob([code], { type: 'application/javascript' })));
            }

            let entryPath = this.path || "/main.js";
            const entryUrl = this.blobUrls.get(entryPath);
            const apiPath = `${window.location.href.split('index.html')[0]}IsoAPI.js`;

            // THE HYBRID BOOTSTRAPPER
            // Inside your runProject() method in app.js
            const bootstrapCode = `
                import { IsoAPI } from "${apiPath}";

                self.onmessage = async (e) => {
                    if (e.data.type === 'start') {
                        // Pass the numbers 854 and 480 here
                        self.IsoAPI = new IsoAPI(self, 854, 480);
                        
                        await import("${entryUrl}");
                        renderLoop();
                    }
                };

                function renderLoop() {
                    if(self.IsoAPI.update) self.IsoAPI.update();
                    self.IsoAPI.ctx.clearRect(0, 0, 854, 480);
                    if(self.IsoAPI.render) self.IsoAPI.render();

                    // Use the built-in helper you wrote to get the final image
                    const bitmap = self.IsoAPI.getCombinedFrame();
                    self.postMessage({ type: 'FRAME', bitmap }, [bitmap]);
                    
                    requestAnimationFrame(renderLoop);
                }
            `;

            this.activeWorker = new Worker(URL.createObjectURL(new Blob([bootstrapCode], { type: 'application/javascript' })), { type: 'module' });
            
            this.activeWorker.onmessage = (e) => {
                if (e.data.type === 'FRAME') {
                    this.updateFps();
                    this.drawFrame(e.data.bitmap);
                } else if (e.data.type === 'log') {
                    this.log(e.data.data, e.data.color);
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
        this.ctx.drawImage(bitmap, 0, 0); // 3D Layer

        // 2D UI Overlay Layer
        this.ctx.fillStyle = 'lime';
        this.ctx.font = '14px monospace';
        this.ctx.fillText(`FPS: ${this.displayedFps}`, 15, 25);
        this.ctx.fillStyle = 'white';
        this.ctx.fillText('HYBRID RENDERER ACTIVE', 15, 45);

        bitmap.close();
    }

    async refresh() {
        const buildTree = async (dirPath, depth = 0) => {
            let html = "";
            const children = await fs.getChildren(dirPath);
            children.sort((a, b) => (b.type === "folder") - (a.type === "folder") || a.path.localeCompare(b.path));
            for (const item of children) {
                const isFolder = item.type === "folder";
                const name = item.path.split("/").pop();
                const active = item.path === this.path ? "active" : "";
                html += `<div class="file-item ${active}" data-path="${item.path}" data-type="${item.type}" style="padding-left: ${depth * 15 + 10}px">
                    <span>${isFolder ? "📁" : "📄"}</span> ${name}
                </div>`;
                if (isFolder) html += await buildTree(item.path, depth + 1);
            }
            return html;
        };
        this.els.sidebar.innerHTML = `<div class="file-item" style="font-weight:bold; color: #aaa;">PROJECT</div>` + await buildTree("/");
        this.els.sidebar.querySelectorAll('.file-item[data-type="file"]').forEach(el => {
            el.onclick = () => this.open(el.dataset.path);
        });
    }

    async open(path) {
        this.path = path;
        const content = await fs.readText(path);
        this.setEditorValue(content || "");
        this.els.pathLab.textContent = path;
        this.refresh();
    }

    setEditorValue(text) {
        this.editor.dispatch({ changes: { from: 0, to: this.editor.state.doc.length, insert: text } });
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