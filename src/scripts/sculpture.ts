// A small, dependency-free WebGL study. Replace this component with a future 3DLAW model.
type V3 = [number, number, number];
const normalize = (v: V3): V3 => {
  const n = Math.hypot(...v) || 1;
  return [v[0] / n, v[1] / n, v[2] / n];
};
const cross = (a: V3, b: V3): V3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
function center(t: number): V3 {
  const r = 0.81 + 0.29 * Math.cos(3 * t);
  return [r * Math.cos(2 * t), r * Math.sin(2 * t), 0.38 * Math.sin(3 * t)];
}
function mesh() {
  const vertices: number[] = [], indices: number[] = [];
  const segments = 256, sides = 40, radius = 0.185;
  for (let i = 0; i <= segments; i++) {
    const t = i / segments * Math.PI * 2;
    const p = center(t), q = center(t + 0.001);
    const tangent = normalize([q[0] - p[0], q[1] - p[1], q[2] - p[2]]);
    const normal = normalize(cross(tangent, [0, 0, 1]));
    const binormal = normalize(cross(tangent, normal));
    for (let j = 0; j <= sides; j++) {
      const s = j / sides * Math.PI * 2;
      const n = normal.map((x, k) => Math.cos(s) * x + Math.sin(s) * binormal[k]) as V3;
      vertices.push(p[0] + radius * n[0], p[1] + radius * n[1], p[2] + radius * n[2], ...n, i / segments, j / sides);
      if (i < segments && j < sides) {
        const a = i * (sides + 1) + j, b = a + sides + 1;
        indices.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
  }
  return { vertices: new Float32Array(vertices), indices: new Uint16Array(indices) };
}
const vertexSource = `
attribute vec3 aPosition;
attribute vec3 aNormal;
attribute vec2 aUv;
uniform vec3 uRotation;
uniform mat4 uProjection;
varying vec3 vNormal;
varying vec3 vPosition;
varying vec2 vUv;
vec3 rotate(vec3 p) {
  float cx = cos(uRotation.x), sx = sin(uRotation.x);
  float cy = cos(uRotation.y), sy = sin(uRotation.y);
  float cz = cos(uRotation.z), sz = sin(uRotation.z);
  p = vec3(p.x, p.y*cx-p.z*sx, p.y*sx+p.z*cx);
  p = vec3(p.x*cy+p.z*sy, p.y, -p.x*sy+p.z*cy);
  return vec3(p.x*cz-p.y*sz, p.x*sz+p.y*cz, p.z);
}
void main() {
  vec3 p = rotate(aPosition);
  vNormal = rotate(aNormal);
  vPosition = p;
  vUv = aUv;
  gl_Position = uProjection * vec4(p + vec3(0.0, 0.03, -4.1), 1.0);
}
`;
const fragmentSource = `
precision mediump float;
varying vec3 vNormal;
varying vec3 vPosition;
varying vec2 vUv;
void main() {
  vec3 n = normalize(vNormal);
  vec3 view = normalize(vec3(0.0, 0.0, 4.1) - vPosition);
  vec3 light = normalize(vec3(-2.8, 3.3, 3.5));
  vec3 fill = normalize(vec3(3.0, -0.3, 1.5));
  float diffuse = max(dot(n, light), 0.0);
  float fillLight = max(dot(n, fill), 0.0);
  float spec = pow(max(dot(n, normalize(light + view)), 0.0), 58.0);
  float broadSpec = pow(max(dot(n, normalize(light + view)), 0.0), 9.0);
  float edge = pow(1.0 - max(dot(n, view), 0.0), 2.3);
  float groove = 0.88 + 0.12 * smoothstep(-0.4, 0.65, cos(vUv.x * 6.283185 * 220.0));
  vec3 base = vec3(0.34, 0.235, 0.43);
  vec3 color = base * (0.28 + 0.95 * diffuse) + vec3(0.22, 0.13, 0.29) * fillLight;
  color += vec3(0.82, 0.72, 0.88) * spec * 0.85;
  color += vec3(0.23, 0.17, 0.26) * broadSpec;
  color += vec3(0.34, 0.25, 0.4) * edge * (0.25 + diffuse * 0.65);
  color *= groove;
  color = pow(color, vec3(0.86));
  gl_FragColor = vec4(color, 1.0);
}
`;
function initialize(figure: HTMLElement) {
  const canvas = figure.querySelector<HTMLCanvasElement>('canvas')!;
  const toggle = figure.querySelector<HTMLButtonElement>('.motion-toggle')!;
  const gl = canvas.getContext('webgl', { alpha: true, antialias: true, powerPreference: 'low-power' });
  if (!gl) return;
  const shader = (type: number, source: string) => {
    const s = gl.createShader(type);
    if (!s) throw new Error('Shader unavailable');
    gl.shaderSource(s, source);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      gl.deleteShader(s);
      throw new Error('Shader could not compile');
    }
    return s;
  };
  const program = gl.createProgram();
  if (!program) return;
  const vs = shader(gl.VERTEX_SHADER, vertexSource), fs = shader(gl.FRAGMENT_SHADER, fragmentSource);
  gl.attachShader(program, vs); gl.attachShader(program, fs); gl.linkProgram(program);
  gl.deleteShader(vs); gl.deleteShader(fs);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) { gl.deleteProgram(program); return; }
  gl.useProgram(program);
  const data = mesh();
  const vertexBuffer = gl.createBuffer(), indexBuffer = gl.createBuffer();
  if (!vertexBuffer || !indexBuffer) return;
  gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, data.vertices, gl.STATIC_DRAW);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, data.indices, gl.STATIC_DRAW);
  for (const [name, size, offset] of [['aPosition', 3, 0], ['aNormal', 3, 12], ['aUv', 2, 24]] as const) {
    const loc = gl.getAttribLocation(program, name);
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 32, offset);
  }
  const rotationLoc = gl.getUniformLocation(program, 'uRotation');
  const projectionLoc = gl.getUniformLocation(program, 'uProjection');
  gl.enable(gl.DEPTH_TEST);
  gl.clearColor(0, 0, 0, 0);
  // Low motion by default; honor system preferences and stop rendering off screen.
  const preference = matchMedia('(prefers-reduced-motion: reduce)');
  let playing = !preference.matches, visible = true, lost = false;
  let x = 0.53, y = -0.33, z = -0.24, spin = 0;
  let frame = 0, last = 0, dragging = false, px = 0, py = 0;
  const render = () => {
    if (lost) return;
    gl.uniform3f(rotationLoc, x, y + spin, z);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.drawElements(gl.TRIANGLES, data.indices.length, gl.UNSIGNED_SHORT, 0);
  };
  const resize = () => {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height || lost) return;
    const dpr = Math.min(devicePixelRatio || 1, 1.6);
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    gl.viewport(0, 0, canvas.width, canvas.height);
    const f = 1 / Math.tan(39 * Math.PI / 360), aspect = rect.width / rect.height;
    const near = 0.1, far = 20, nf = 1 / (near - far);
    gl.uniformMatrix4fv(projectionLoc, false, new Float32Array([f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0]));
    render();
  };
  const animate = (time: number) => {
    frame = 0;
    if (!playing || !visible || document.hidden || lost) return;
    if (last && !dragging) spin += Math.min(time - last, 50) * 0.000095;
    last = time;
    render();
    frame = requestAnimationFrame(animate);
  };
  const sync = () => {
    cancelAnimationFrame(frame); frame = 0; last = 0;
    if (playing && visible && !document.hidden && !lost) frame = requestAnimationFrame(animate);
  };
  const updateButton = () => {
    toggle.setAttribute('aria-label', playing ? 'Pause sculpture animation' : 'Play sculpture animation');
    toggle.querySelector('span')!.textContent = playing ? 'Pause motion' : 'Play motion';
    toggle.querySelector('path')!.setAttribute('d', playing ? 'M5 3v10M11 3v10' : 'M5 3l7 5-7 5Z');
  };
  toggle.addEventListener('click', () => { playing = !playing; updateButton(); sync(); });
  preference.addEventListener('change', () => { playing = !preference.matches; updateButton(); sync(); });
  canvas.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    dragging = true; px = e.clientX; py = e.clientY;
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    y += (e.clientX - px) * 0.008;
    x += (e.clientY - py) * 0.008;
    px = e.clientX; py = e.clientY; render();
  });
  const release = () => { dragging = false; };
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);
  canvas.addEventListener('lostpointercapture', release);
  canvas.addEventListener('keydown', (e) => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
    e.preventDefault();
    if (e.key === 'ArrowLeft') y -= 0.15;
    if (e.key === 'ArrowRight') y += 0.15;
    if (e.key === 'ArrowUp') x -= 0.15;
    if (e.key === 'ArrowDown') x += 0.15;
    render();
  });
  const observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; sync(); });
  observer.observe(figure);
  const sizes = new ResizeObserver(resize);
  sizes.observe(canvas);
  document.addEventListener('visibilitychange', sync);
  canvas.addEventListener('webglcontextlost', () => {
    lost = true; sync(); sizes.disconnect(); observer.disconnect();
    figure.classList.remove('is-ready'); toggle.hidden = true;
    canvas.removeAttribute('tabindex');
  });
  resize();
  figure.classList.add('is-ready');
  toggle.hidden = false;
  updateButton(); sync();
}
export function initSculptures() {
  document.querySelectorAll<HTMLElement>('.sculpture').forEach((figure) => {
    try { initialize(figure); }
    catch { /* The static artwork remains visible when WebGL is unavailable. */ }
  });
}
