export class Material {
    constructor(shader) {
        this.shader = shader;
    }

    apply(gl, projection, view, model) {
        this.shader.use();
        const pLoc = gl.getUniformLocation(this.shader.program, "uProjection");
        const vLoc = gl.getUniformLocation(this.shader.program, "uView");
        const mLoc = gl.getUniformLocation(this.shader.program, "uModel");
        
        gl.uniformMatrix4fv(pLoc, false, projection);
        gl.uniformMatrix4fv(vLoc, false, view);
        gl.uniformMatrix4fv(mLoc, false, model);
    }
}
