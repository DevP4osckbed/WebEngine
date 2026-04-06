export class IsoAPI {
    constructor(workerContext, width = 854, height = 480) {
        this.WIDTH = width;
        this.HEIGHT = height;
        this.VERISON = '1.5.0';
        this._worker = workerContext;

        // Internal Input State
        this._keys = new Set();
        this._mouseButtons = new Set();
        this._mouseDelta = { x: 0, y: 0 };
        this._isMouseLocked = false; // New tracked state

        // Graphics Layers
        this.canvas3d = new OffscreenCanvas(this.WIDTH, this.HEIGHT);
        this.gl = this.canvas3d.getContext('webgl2');

        this.canvas2d = new OffscreenCanvas(this.WIDTH, this.HEIGHT);
        this.ctx = this.canvas2d.getContext('2d');

        this.render = null; 
        this.update = null;
    }

    // --- Public API Methods ---

    isKeyDown(code) {
        return this._keys.has(code);
    }

    isMouseDown(button = 0) {
        return this._mouseButtons.has(button);
    }

    getMouseDelta() {
        return { ...this._mouseDelta };
    }

    // NEW: Check if mouse is locked
    isMouseLocked() {
        return this._isMouseLocked;
    }

    setMouseLock(locked) {
        this._worker.postMessage({ type: 'LOCK_MOUSE', value: locked });
    }

    // --- System Methods (Not for users) ---

    _handleInput(e) {
        if (e.type === 'keydown') this._keys.add(e.code);
        if (e.type === 'keyup') this._keys.delete(e.code);
        if (e.type === 'mousedown') this._mouseButtons.add(e.button);
        if (e.type === 'mouseup') this._mouseButtons.delete(e.button);
        if (e.type === 'mousemove') {
            this._mouseDelta.x += e.movementX;
            this._mouseDelta.y += e.movementY;
        }
        // Sync the lock state from the main thread
        if (e.type === 'LOCK_STATE_CHANGE') {
            this._isMouseLocked = e.value;
        }
    }

    _clearInputDelta() {
        this._mouseDelta.x = 0;
        this._mouseDelta.y = 0;
    }

    getCombinedFrame() {
        const master = new OffscreenCanvas(this.WIDTH, this.HEIGHT);
        const mCtx = master.getContext('2d');
        mCtx.drawImage(this.canvas3d, 0, 0);
        mCtx.drawImage(this.canvas2d, 0, 0);
        return master.transferToImageBitmap();
    }

    log(...args) {
        const message = args.map(arg => 
            typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
        ).join(' ');
        this._worker.postMessage({ type: 'log', data: message });
    }

    error(msg) {
        this._worker.postMessage({ type: 'log', data: `Error: ${msg}`, color: '#f44747' });
    }
}