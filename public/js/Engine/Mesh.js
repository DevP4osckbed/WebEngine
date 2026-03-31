import { Transform } from './Transform.js';

export class Mesh {
    constructor(gl, vertices, material) {
        this.gl = gl;
        this.material = material;
        this.transform = new Transform();
        this.count = vertices.length / 6;

        this.vao = gl.createVertexArray();
        gl.bindVertexArray(this.vao);

        const vbo = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW);

        // Position attribute (0)
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 24, 0);
        
        // Color attribute (1)
        gl.enableVertexAttribArray(1);
        gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 24, 12);
        
        gl.bindVertexArray(null);
    }

    /**
     * Renders the mesh using a Camera object
     * @param {Camera} camera 
     */
    draw(camera) {
        const gl = this.gl;
        
        // Get matrices from the Camera and our own Transform
        const projection = camera.getProjection();
        const view = camera.getView();
        const model = this.transform.getMatrix();

        // Apply shader, uniforms, and model-specific data
        this.material.apply(gl, projection, view, model);

        // Bind VAO and execute draw call
        gl.bindVertexArray(this.vao);
        gl.drawArrays(gl.TRIANGLES, 0, this.count);
        
        // Cleanup binding
        gl.bindVertexArray(null);
    }
}
