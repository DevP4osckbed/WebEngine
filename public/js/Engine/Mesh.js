import { Transform } from './Transform.js';

export class Mesh {
    constructor(gl, vertices, indices, material) { // 1. Added indices parameter
        this.gl = gl;
        this.material = material;
        this.transform = new Transform();
        this.indexCount = indices.length; // 2. Store index count instead of vertex count

        this.vao = gl.createVertexArray();
        gl.bindVertexArray(this.vao);

        // Vertex Buffer (VBO)
        const vbo = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW);

        // Index Buffer (EBO/IBO) - 3. Added this block
        const ebo = gl.createBuffer();
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ebo);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indices), gl.STATIC_DRAW);

        // Attributes (unchanged)
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 24, 0);
        gl.enableVertexAttribArray(1);
        gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 24, 12);
        
        // 4. Important: VAO stores the EBO binding, but NOT the VBO binding
        gl.bindVertexArray(null);
    }

    draw(camera) {
        const gl = this.gl;
        const projection = camera.getProjection();
        const view = camera.getView();
        const model = this.transform.getMatrix();

        this.material.apply(gl, projection, view, model);

        gl.bindVertexArray(this.vao);
        // 5. Changed to drawElements
        gl.drawElements(gl.TRIANGLES, this.indexCount, gl.UNSIGNED_SHORT, 0);
        gl.bindVertexArray(null);
    }
}
