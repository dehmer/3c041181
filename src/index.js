import React from 'react'
import { createRoot } from 'react-dom/client'
import RowVirtualizerDynamic from './App'

const container = document.getElementById("app")
const root = createRoot(container)
root.render(<RowVirtualizerDynamic/>)
