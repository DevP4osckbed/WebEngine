export class IsoAPI {
    constructor(workerContext) {
        this.ctx = workerContext;
        this.VERSION = "1.0.0"; 
        this.TestVar = 1;
    }

    log(...args) {
        const message = args.map(arg => 
            typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
        ).join(' ');
        
        this.ctx.postMessage({ type: 'log', data: message });
    }

    error(msg) {
        this.ctx.postMessage({ type: 'log', data: `Error: ${msg}`, color: '#f44747' });
    }
}

export const iso = new IsoAPI(self);