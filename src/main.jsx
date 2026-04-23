import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import { installGlobalUiSounds } from './lib/sounds.js'
import './styles.css'

installGlobalUiSounds()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
