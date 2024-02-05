const { Duplex } = require('streamx')
const b4a = require('b4a')

module.exports = class WebStream extends Duplex {
  constructor (isInitiator, dc, opts = {}) {
    super({ mapWritable: toBuffer })

    this._dc = dc

    this.noiseStream = this
    this.rawStream = this

    this.isInitiator = isInitiator
    this.handshakeHash = opts.handshakeHash || null

    this._opening = null
    this._openedDone = null

    this.opened = new Promise(resolve => { this._openedDone = resolve })
    this.userData = null

    this._onopen = onopen.bind(this)
    this._onmessage = onmessage.bind(this)
    this._onerror = onerror.bind(this)
    this._onclose = onclose.bind(this)

    this._dc.addEventListener('open', this._onopen)
    this._dc.addEventListener('message', this._onmessage)
    this._dc.addEventListener('error', this._onerror)
    this._dc.addEventListener('close', this._onclose)

    this.resume().pause() // Open immediately
  }

  _open (cb) {
    if (this._dc.readyState === 'closed' || this._dc.readyState === 'closing') {
      cb(new Error('Stream is closed'))
      return
    }

    if (this._dc.readyState === 'connecting') {
      this._opening = cb
      return
    }

    this._resolveOpened(true)
    cb(null)
  }

  _continueOpen (err) {
    if (err) this.destroy(err)

    if (this._opening === null) return

    const cb = this._opening
    this._opening = null
    this._open(cb)
  }

  _resolveOpened (opened) {
    const cb = this._openedDone

    if (cb) {
      this._openedDone = null
      cb(opened)

      if (opened) this.emit('connect')
    }
  }

  _write (data, cb) {
    this._dc.send(data)
    cb(null)
  }

  _predestroy () {
    this._continueOpen(new Error('Stream was destroyed'))
  }

  _destroy (cb) {
    this._dc.close()
    this._resolveOpened(false)
    cb(null)
  }

  setKeepAlive () {} // TODO
}

function onopen () {
  this._continueOpen()
}

function onmessage (event) {
  this.push(b4a.from(event.data))
}

function onerror (err) {
  this.destroy(err)
}

function onclose () {
  this._dc.removeEventListener('open', this._onopen)
  this._dc.removeEventListener('message', this._onmessage)
  this._dc.removeEventListener('error', this._onerror)
  this._dc.removeEventListener('close', this._onclose)

  this.destroy()
}

function toBuffer (data) {
  return typeof data === 'string' ? b4a.from(data) : data
}
