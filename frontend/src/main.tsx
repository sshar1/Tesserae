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
  console.log("C++ Add(2, 3) =", moduleInstance.add(2, 3));
  
  moduleInstance.init_renderer();
  
  function renderFrame() {
    moduleInstance.render_frame();
    requestAnimationFrame(renderFrame);
  }
  requestAnimationFrame(renderFrame);
}

initEngine().catch(console.error);

render(<App />, document.getElementById('app')!)
