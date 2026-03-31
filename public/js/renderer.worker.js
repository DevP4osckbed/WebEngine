import { Engine } from './Engine.js';

class WorkerRenderer {
    constructor(canvas) {
        this.canvas = canvas;
        this.gl = canvas.getContext('webgl2');
        if (!this.gl) throw new Error("WebGL2 not supported");
        
        // Initialize the engine inside the worker
        this.engine = new Engine(this.gl);
        this.engine.init();
    }

    renderLoop() {
        // 1. Run logic
        this.engine.update();

        // 2. Draw to the offscreen canvas
        this.engine.render();

        // 3. Extract the frame
        const bitmap = this.canvas.transferToImageBitmap();
        
        // 4. Send to main thread
        postMessage({ type: 'FRAME', bitmap }, [bitmap]);

        // 5. Repeat
        requestAnimationFrame(() => this.renderLoop());
    }
}

onmessage = (e) => {
    console.log("Render Module Init")
    if (e.data.type === 'INIT') {
        const renderer = new WorkerRenderer(e.data.canvas);
        renderer.renderLoop();
    }
};
