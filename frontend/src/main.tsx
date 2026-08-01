import { render } from 'preact'
import './index.css'
import { App } from './app.tsx'

declare global {
  interface Window {
    Module: any;
  }
}

async function initEngine() {
  if (!navigator.gpu) {
    console.error("WebGPU is not supported by this browser.");
    return;
  }

  // Emscripten exposes window.Module function to initialize WASM
  if (typeof window.Module !== 'function') {
    console.error("engine.js not loaded.");
    return;
  }

  const moduleInstance = await window.Module();

  // Call our embind functions
  const canvas = document.getElementById('gpuCanvas') as HTMLCanvasElement;
  if (!canvas) return;
  
  const dpr = window.devicePixelRatio || 1;
  const width = Math.floor(window.innerWidth * dpr);
  const height = Math.floor(window.innerHeight * dpr);
  
  canvas.width = width;
  canvas.height = height;
  moduleInstance.init_renderer(width, height);
  
  window.addEventListener('resize', () => {
    const w = Math.floor(window.innerWidth * dpr);
    const h = Math.floor(window.innerHeight * dpr);
    canvas.width = w;
    canvas.height = h;
    moduleInstance.resize_renderer(w, h);
  });
  if (canvas) {
    let isDragging = false;
    let lastX = 0;
    let lastY = 0;

    let lastDownX = 0;
    let lastDownY = 0;
    let selectedAxis = -1;

    canvas.addEventListener('mousedown', (e) => {
      isDragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
      lastDownX = e.clientX;
      lastDownY = e.clientY;

      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      selectedAxis = moduleInstance.select_axis_at(x, y, rect.width, rect.height);
    });

    window.addEventListener('mouseup', (e) => {
      isDragging = false;
      selectedAxis = -1;
    });

    canvas.addEventListener('click', (e) => {
      if (Math.abs(e.clientX - lastDownX) < 5 && Math.abs(e.clientY - lastDownY) < 5 && selectedAxis === -1) {
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        moduleInstance.select_object_at(x, y, rect.width, rect.height);
      }
    });

    window.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;

      if (selectedAxis !== -1) {
          moduleInstance.drag_selected(dx, dy, selectedAxis);
      } else {
          // Middle click or Shift+Click for panning
          if (e.buttons === 4 || (e.buttons === 1 && e.shiftKey)) {
              moduleInstance.pan_camera(dx * 0.01, dy * 0.01);
          } else if (e.buttons === 1) {
              moduleInstance.orbit_camera(dx * 0.01, dy * 0.01);
          }
      }
    });

    canvas.addEventListener('wheel', (e) => {
        moduleInstance.zoom_camera(e.deltaY * 0.01);
        e.preventDefault(); // Prevent page scroll
    });
  }

  function renderFrame() {
    moduleInstance.render_frame();
    requestAnimationFrame(renderFrame);
  }
  requestAnimationFrame(renderFrame);
}

initEngine().catch(console.error);

render(<App />, document.getElementById('app')!)
