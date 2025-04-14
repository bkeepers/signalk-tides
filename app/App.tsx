import { StrictMode } from 'react'
import './App.css'
import { TidesView } from './views/TidesView'
import { Footer } from './components/Footer'

function App() {
  return (
    <StrictMode>
      <TidesView />
      <Footer />
    </StrictMode>
  )
}

export default App
