import { useState } from 'preact/hooks'
import preactLogo from './assets/preact.svg'
import viteLogo from './assets/vite.svg'
import heroImg from './assets/hero.png'
import './app.css'

export function App() {
  return (
    <div style={{ textAlign: 'center', marginTop: '20px' }}>
      <h1>Tesserae - Phase 0</h1>
      <p>WebGPU Renderer (WASM)</p>
    </div>
  )
}
