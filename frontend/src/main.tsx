import { render } from 'preact'
import './index.css'
import { App } from './app.tsx'

declare global {
  interface Window {
    Module: any;
  }
}

render(<App />, document.getElementById('app')!)
