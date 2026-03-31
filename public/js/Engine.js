import { Shader } from './Engine/Shader.js';
import { Material } from './Engine/Material.js';
import { Mesh } from './Engine/Mesh.js';
import { Camera } from './Engine/Camera.js';

export class Engine {
    constructor(gl) {
        this.gl = gl;
        this.meshes = [];

        console.log("Loading Engine")
    }

    init() {
        this.gl.enable(this.gl.DEPTH_TEST);
        this.camera = new Camera(45, 854 / 480);

        const vs = `#version 300 es
            layout(location = 0) in vec3 aPosition;
            layout(location = 1) in vec3 aColor;
            uniform mat4 uProjection, uView, uModel;
            out vec3 vColor;
            void main() { vColor = aColor; gl_Position = uProjection * uView * uModel * vec4(aPosition, 1.0); }`;
        
        const fs = `#version 300 es
            precision highp float;
            in vec3 vColor; out vec4 fragColor;
            void main() { fragColor = vec4(vColor, 1.0); }`;

        const shader = new Shader(this.gl, vs, fs);
        const mat = new Material(shader);
        
        const triangleData = [0, 0.5, 0, 1, 0, 0, -0.5, -0.5, 0, 0, 1, 0, 0.5, -0.5, 0, 0, 0, 1];
        this.meshes.push(new Mesh(this.gl, triangleData, mat));
    }

    update() {
        this.meshes.forEach(m => m.transform.rotation.y += 0.02);
    }

    render() {
        this.gl.clearColor(0.1, 0.2, 0.3, 1.0);
        this.gl.clear(this.gl.COLOR_BUFFER_BIT | this.gl.DEPTH_BUFFER_BIT);

        // No need to calculate p and v here anymore
        this.meshes.forEach(mesh => {
            mesh.draw(this.camera);
        });
    }

}
