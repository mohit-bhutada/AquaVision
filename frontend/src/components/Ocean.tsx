import { useEffect, useRef, useState } from 'react';
import { reducedMotion } from '../lib/motion';

// Procedural "underwater footage": caustics + god-rays + drifting motes. Plain WebGL, no library.
const VERT = `attribute vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }`;
const FRAG = `
precision mediump float;
uniform vec2 r; uniform float t; uniform float depth; uniform float intensity;
float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
float caustic(vec2 uv){
  vec2 p = uv*5.0; float c = 0.0; float a = 1.0;
  for(int i=0;i<3;i++){ p += vec2(sin(p.y*1.3+t*0.35), cos(p.x*1.1-t*0.3)); c += a*abs(sin(p.x+p.y)); a*=0.55; p*=1.7; }
  return pow(1.0 - clamp(c*0.45, 0.0, 1.0), 3.0);
}
void main(){
  vec2 uv = gl_FragCoord.xy / r; vec2 a = vec2(uv.x * r.x / r.y, uv.y);
  vec3 top = mix(vec3(0.10,0.42,0.52), vec3(0.03,0.16,0.24), depth);
  vec3 bot = mix(vec3(0.02,0.08,0.13), vec3(0.01,0.03,0.06), depth);
  vec3 col = mix(bot, top, pow(uv.y, 1.4));
  // god-rays: slanted bands, flickering, strongest near the surface
  float x = a.x + (1.0-uv.y)*0.35;
  float rays = 0.0;
  rays += smoothstep(0.55, 1.0, n(vec2(x*6.0, t*0.15))) * 0.9;
  rays += smoothstep(0.6, 1.0, n(vec2(x*13.0 + 7.0, t*0.22))) * 0.6;
  rays *= smoothstep(0.05, 1.0, uv.y) * (1.0 - depth*0.6);
  col += vec3(0.35,0.85,0.95) * rays * 0.35 * intensity;
  // caustics on the upper water
  col += vec3(0.45,0.9,1.0) * caustic(a + vec2(0.0, t*0.02)) * 0.18 * smoothstep(0.2, 1.0, uv.y) * intensity;
  // drifting motes
  vec2 g = a*vec2(38.0, 22.0) + vec2(0.0, -t*0.6); vec2 id = floor(g); vec2 f = fract(g) - 0.5;
  float m = step(0.965, h(id)) * smoothstep(0.12, 0.0, length(f + vec2(sin(t+id.x)*0.2, 0.0)));
  col += vec3(0.75,0.97,1.0) * m * 0.55 * intensity;
  gl_FragColor = vec4(col, 1.0);
}`;

export function Ocean({ depth = 0.2, intensity = 1, className = '', video }: { depth?: number; intensity?: number; className?: string; video?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const gl = c.getContext('webgl', { antialias: false, premultipliedAlpha: false });
    if (!gl) return setFailed(true);
    const sh = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      return s;
    };
    const prog = gl.createProgram()!;
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return setFailed(true);
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'p');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const uR = gl.getUniformLocation(prog, 'r'), uT = gl.getUniformLocation(prog, 't');
    gl.uniform1f(gl.getUniformLocation(prog, 'depth'), depth);
    gl.uniform1f(gl.getUniformLocation(prog, 'intensity'), intensity);

    const dpr = Math.min(devicePixelRatio, 1.5) * (innerWidth < 768 ? 0.6 : 0.75);
    const resize = () => {
      c.width = Math.max(1, Math.round(c.clientWidth * dpr));
      c.height = Math.max(1, Math.round(c.clientHeight * dpr));
      gl.viewport(0, 0, c.width, c.height);
      gl.uniform2f(uR, c.width, c.height);
    };
    resize();
    const still = reducedMotion();
    let raf = 0, visible = true;
    const start = performance.now() - Math.random() * 20000;
    const frame = (now: number) => {
      gl.uniform1f(uT, (now - start) / 1000);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      if (!still && visible && !document.hidden) raf = requestAnimationFrame(frame);
    };
    frame(performance.now());
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      cancelAnimationFrame(raf);
      if (visible && !still) raf = requestAnimationFrame(frame);
    });
    io.observe(c);
    const onVis = () => {
      cancelAnimationFrame(raf);
      if (!document.hidden && visible && !still) raf = requestAnimationFrame(frame);
    };
    document.addEventListener('visibilitychange', onVis);
    const ro = new ResizeObserver(() => {
      resize();
      if (still) frame(performance.now());
    });
    ro.observe(c);
    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      ro.disconnect();
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [depth, intensity]);

  return (
    <div className={`absolute inset-0 overflow-hidden ${className}`} aria-hidden="true" style={{ background: 'linear-gradient(180deg,#0f4c5c,#06101a)' }}>
      {!failed && <canvas ref={ref} data-ocean className="absolute inset-0 h-full w-full" />}
      {video && <video className="absolute inset-0 h-full w-full object-cover opacity-60 mix-blend-screen" src={video} autoPlay muted loop playsInline />}
    </div>
  );
}
