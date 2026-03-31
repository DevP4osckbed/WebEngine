export class Shader {
    constructor(gl, vsSource, fsSource) {
        this.gl = gl;
        const vs = this.compile(gl.VERTEX_SHADER, vsSource);
        const fs = this.compile(gl.FRAGMENT_SHADER, fsSource);
        this.program = gl.createProgram();
        gl.attachShader(this.program, vs);
        gl.attachShader(this.program, fs);
        gl.linkProgram(this.program);
    }

    compile(type, source) {
        const s = this.gl.createShader(type);
        this.gl.shaderSource(s, source);
        this.gl.compileShader(s);
        return s;
    }

    use() { this.gl.useProgram(this.program); }
}
