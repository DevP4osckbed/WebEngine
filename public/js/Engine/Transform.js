export class Transform {
    constructor() {
        this.position = { x: 0, y: 0, z: 0 };
        this.rotation = { x: 0, y: 0, z: 0 };
    }

    getMatrix() {
        // Simple Y-rotation matrix for now
        const s = Math.sin(this.rotation.y);
        const c = Math.cos(this.rotation.y);
        return new Float32Array([
            c, 0, -s, 0,
            0, 1, 0, 0,
            s, 0, c, 0,
            this.position.x, this.position.y, this.position.z, 1
        ]);
    }
}
