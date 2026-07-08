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
  moduleInstance.init_renderer();
  
  const canvas = document.getElementById('gpuCanvas') as HTMLCanvasElement;
  if (canvas) {
    let isDragging = false;
    let lastX = 0;
    let lastY = 0;

    canvas.addEventListener('mousedown', (e) => {
      isDragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
    });

    window.addEventListener('mouseup', () => {
      isDragging = false;
    });

    window.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;

      // Middle click or Shift+Click for panning
      if (e.buttons === 4 || (e.buttons === 1 && e.shiftKey)) {
          moduleInstance.pan_camera(dx * 0.01, dy * 0.01);
      } else if (e.buttons === 1) {
          moduleInstance.orbit_camera(dx * 0.01, dy * 0.01);
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
