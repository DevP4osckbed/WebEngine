import { NetworkManager } from './js/network.js';

class App {
    constructor() {
        this.viewport = document.getElementById('viewport');
        this.ctx = this.viewport.getContext('2d');
        
        this.viewport.width = 854;
        this.viewport.height = 480;

        // FPS Tracking
        this.fps = 0;
        this.lastTime = performance.now();
        this.frameCount = 0;
        this.displayedFps = 0;

        this.network = new NetworkManager(document.getElementById('output'));
        this.setupWorker();
    }

    setupWorker() {
        // Create a hidden canvas for the worker to draw on
        const offscreen = new OffscreenCanvas(854, 480);
        console.log("Loading Workers")
        this.worker = new Worker('js/renderer.worker.js', { type: 'module' });
        this.worker.onerror = (error) => {
            console.error("Worker Error:", error.message, "at", error.filename, ":", error.lineno);
        };
        
        // Transfer the offscreen canvas to the worker
        this.worker.postMessage({ type: 'INIT', canvas: offscreen }, [offscreen]);

        this.worker.onmessage = (e) => {
            if (e.data.type === 'FRAME') {
                this.updateFps(); // Calculate timing
                this.drawFrame(e.data.bitmap);
            }
        };
    }

    updateFps() {
        const now = performance.now();
        this.frameCount++;

        // Update the FPS counter every 1 second (1000ms)
        if (now - this.lastTime >= 1000) {
            this.displayedFps = this.frameCount;
            this.frameCount = 0;
            this.lastTime = now;
        }
    }

    drawFrame(bitmap) {
        this.ctx.clearRect(0, 0, 854, 480);

        // Render the WebGL layer
        this.ctx.drawImage(bitmap, 0, 0);

        // Render the 2D UI layer
        this.ctx.fillStyle = 'lime';
        this.ctx.font = '20px monospace';
        this.ctx.fillText(`FPS: ${this.displayedFps}`, 20, 40);
        this.ctx.fillText('UI OVERLAY (2D)', 20, 70);

        // Memory Management: Transfer ownership back/free GPU memory
        bitmap.close();
    }
}

window.app = new App();
