const b4a = require('b4a')
const { Duplex } = require('streamx')

module.exports = class WebStream extends Duplex {
  constructor (rtc) {
    super({ mapWritable: toBuffer })

    this.rtc = rtc
    this.noiseStream = this
    this.rawStream = this

    this._openedDone = null

    this.opened = new Promise(resolve => this._openedDone = resolve)

    this._setup()

    this.resume().pause() // Open immediately
  }

  _setup () {
    this.rtc.on('data', data => {
      this.push(new Uint8Array(data))
    })

    this.rtc.on('close', () => {
      this.push(null)
      this.emit('close')
    })

    this.rtc.on('error', (err) => {
      this.emit('error', err)
    })

    this._openedDone(true) // TODO
  }

  _open (cb) {
    cb(null)
  }

  _read (cb) {
    cb(null)
  }

  _write (chunk, cb) {
    this.rtc.send(chunk)
    cb(null)
  }

  _destroy () {
    this.rtc.close()
  }

  setKeepAlive () {} // TODO
}

function toBuffer (data) {
  return typeof data === 'string' ? b4a.from(data) : data
}
