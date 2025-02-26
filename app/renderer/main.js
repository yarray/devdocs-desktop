const os = require('os')
const fs = require('fs')
const { ipcRenderer: ipc, remote, shell } = require('electron')
const mkdirp = require('mkdirp')
const contextMenu = require('electron-context-menu')
const { configDir } = require('../utils')
const config = require('../config')
const Searcher = require('./searcher')

const win = remote.getCurrentWindow()
let webview // eslint-disable-line prefer-const

function ensureCustomFiles() {
  mkdirp.sync(configDir())
  const css = configDir('custom.css')
  const js = configDir('custom.js')
  if (!fs.existsSync(css)) {
    fs.writeFileSync(css, '', 'utf8')
  }

  if (!fs.existsSync(js)) {
    fs.writeFileSync(js, '', 'utf8')
  }
}

function createHeader() {
  const header = document.createElement('header')
  header.className = 'header'
  header.innerHTML = `
  <h1 id="title" class="app-title">Loading DevDocs...</h1>
  <span id="pin" class="pin">
    <svg width="24" height="24">
    <path d="M8.946,12.595L12.407,8.662L12.026,8.282L13.029,6.733L17.267,10.971L15.77,12.026L15.338,11.593L11.454,15.102L12.032,15.68L11.196,16.517L9.759,15.08L7.223,17.267L6.733,16.777L8.872,14.192L7.579,12.9L8.416,12.064L8.946,12.595Z" />
    </g>
    </svg>
  </span>
  `
  header.addEventListener('dblclick', () => {
    win.maximize()
  })
  header.addEventListener('click', () => {
    webview.focus()
  })

  const pin = header.querySelector('.pin')
  if (config.get('floating')) {
    pin.classList.add('pinned')
  }
  pin.addEventListener('click', () => {
    const app = remote.app
    config.set('floating', !config.get('floating'))
    app.relaunch()
    app.exit()
  })

  document.body.append(header)
}

function createWebView() {
  // Create webview
  const webview = document.createElement('webview')
  webview.className = 'webview'
  webview.src = 'https://devdocs.io'
  webview.preload = 'preload.js'
  document.body.append(webview)

  // Initialize in-page searcher
  const searcher = new Searcher(webview)

  searcher.on('close', () => {
    webview.focus()
  })

  ipc.on('open-search', () => {
    searcher.open()
  })

  ipc.on('zoom-in', () => {
    webview.send('zoom-in')
  })

  ipc.on('zoom-out', () => {
    webview.send('zoom-out')
  })

  ipc.on('zoom-reset', () => {
    webview.send('zoom-reset')
  })

  ipc.on('focus-webview', () => {
    webview.focus()
  })

  ipc.on('link', (e, url) => {
    const route = url.replace('devdocs://', '')
    const SEACH_RE = /^search\/(.+)$/
    if (SEACH_RE.test(route)) {
      const keyword = SEACH_RE.exec(route)[1]
      webview.src = `https://devdocs.io/#q=${keyword}`
    }
  })

  webview.addEventListener('ipc-message', e => {
    if (e.channel === 'switch-mode') {
      const [mode] = e.args
      config.set('mode', mode)
      if (mode === 'dark') {
        document.body.classList.add('is-dark-mode')
      } else {
        document.body.classList.remove('is-dark-mode')
      }
    }
  })

  webview.addEventListener('dom-ready', () => {
    // Insert custom css
    const css = `
    ._app button:focus {
      outline: none;
    }
    ._app button._search-clear {
      top: .5rem;
    }
    `
    webview.insertCSS(css + fs.readFileSync(configDir('custom.css'), 'utf8'))
    webview.executeJavaScript(fs.readFileSync(configDir('custom.js'), 'utf8'))
    webview.focus()
    // Add context menus
    contextMenu({
      window: webview,
      showInspectElement: true,
      append(props) {
        const hasText =
          props.selectionText && props.selectionText.trim().length > 0
        return [
          {
            id: 'searchGoogle',
            label: 'Search in Google',
            enabled: hasText,
            visible: hasText,
            click() {
              shell.openExternal(
                `https://www.google.com/search?q=${props.selectionText}`
              )
            }
          },
          {
            id: 'searchDuck',
            label: 'Search in DuckDuckGo',
            enabled: hasText,
            visible: hasText,
            click() {
              shell.openExternal(
                `https://duckduckgo.com/?q=${props.selectionText}`
              )
            }
          }
        ]
      }
    })
  })

  // Update app title
  webview.addEventListener('did-stop-loading', () => {
    const title = webview.getTitle()
    win.setTitle(title)
    document.querySelector('#title').textContent = title
  })

  webview.addEventListener('new-window', e => {
    e.preventDefault()
    shell.openExternal(e.url)
  })

  return webview
}

ensureCustomFiles()
createHeader()
webview = createWebView()

document.body.classList.add(`is-${os.platform()}`)

if (config.get('mode') === 'dark') {
  document.body.classList.add('is-dark-mode')
}
