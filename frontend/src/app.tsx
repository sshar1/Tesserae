import './app.css'

export function App() {
  return (
    <>
      <canvas id="gpuCanvas" style={{ 
        display: 'block', 
        width: '100vw', 
        height: '100vh',
        position: 'absolute',
        top: 0,
        left: 0,
        outline: 'none',
      }}></canvas>
    </>
  )
}
