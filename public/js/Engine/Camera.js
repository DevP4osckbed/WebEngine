export class Camera {
    constructor(fov, aspect) {
        this.fov = fov * Math.PI / 180;
        this.aspect = aspect;
        this.z = -2;
    }

    getProjection() {
        const f = 1.0 / Math.tan(this.fov / 2);
        const rangeInv = 1.0 / (0.1 - 100.0);
        return new Float32Array([
            f / this.aspect, 0, 0, 0,
            0, f, 0, 0,
            0, 0, (0.1 + 100.0) * rangeInv, -1,
            0, 0, 0.1 * 100.0 * rangeInv * 2, 0
        ]);
    }

    getView() {
        return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, this.z, 1]);
    }
}
