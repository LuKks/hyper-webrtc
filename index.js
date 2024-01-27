const { Peer } = require('peerjs') // => STUN/TURN + RTCPeerConnection
const Protomux = require('protomux')
const c = require('compact-encoding')
const safetyCatch = require('safety-catch')
const ReadyResource = require('ready-resource')
const sodium = require('sodium-universal')
const b4a = require('b4a')
const WebStream = require('./lib/web-stream.js')

// TODO: This could be a Duplex but don't know about that, for now emitting an event is good enough
module.exports = class WebPeer extends ReadyResource {
  constructor (stream) {
    super()

    const id = b4a.toString(randomBytes(8), 'hex')

    // this.peer = new Peer(id)
    this.peer = new Peer()
    this.stream = stream
    // this.mux = new Protomux(stream)
    this.channel = null

    this.handshake = null
    this.token = b4a.toString(randomBytes(8), 'hex') // TODO: Think another solution for validating connections
    this.remote = null

    this.ready().catch(safetyCatch)
  }

  async _open () {
    // TODO: Investigate about reusing the relayed handshake to create new SecretStream instances
    /* const onhandshake = () => this.handshake = getHandshake(this.stream)
    if (this.stream.handshakeHash) onhandshake() // Or this.stream._encrypt
    else this.stream.once('handshake', onhandshake) */

    this.peer.on('connection', rawStream => {
      console.log('peerjs incoming', rawStream)

      // TODO: Check metadata.token before accepting the connection

      rawStream.on('open', () => {
        console.log('rawStream open')

        // if (!this.handshake) throw new Error('No handshake')

        const duplex = new WebStream(rawStream)

        this.remote = duplex // new SecretStream(false, duplex)
        // this.remote.on('data', (data) => console.log(data))
        // this.remote.on('close', () => console.log('remote closed'))
        this.remote.on('error', console.error)

        // const done = () => this.mux.destroy()
        // waitForRemote(this.remote).then(done, done)

        this.emit('continue', this.remote)
      })

      rawStream.on('error', function (err) {
        console.log('rawStream error', err)
      })

      rawStream.on('close', function () {
        console.log('rawStream close')
      })
    })

    try {
      await waitForPeer(this.peer)
    } catch (err) {
      console.error(err)
      this.stream.destroy()
      throw err
    }

    this.mux = new Protomux(this.stream)

    this._attachChannel()

    console.log('peer.id', this.peer.id)

    this.channel.open({
      // isInitiator: this.mux.stream.isInitiator,
      id: this.peer.id,
      token: this.token
    })
  }

  _close () {
    // this.peer.destroy()
    // if (this.mux) this.mux.destroy()
    this.stream.destroy()
  }

  _attachChannel () {
    const channel = this.mux.createChannel({
      protocol: 'hyperconnection',
      id: null,
      handshake: c.json, // TODO: Make strict messages
      onopen: this._onmuxopen.bind(this),
      onerror: this._onmuxerror.bind(this),
      onclose: this._onmuxclose.bind(this),
      messages: [
        // { encoding: c.json, onmessage: this._onmuxmessage }
      ]
    })

    if (channel === null) return

    this.channel = channel
  }

  _onmuxopen (handshake) {
    console.log('_onmuxopen', handshake)

    if (this.mux.stream.isInitiator) {
      console.log('Connecting to', handshake.id)

      // TODO: Investigate if metadata is kept truly private between both peers (E2E encrypted, not publicly stored in the middle server, etc)
      const rawStream = this.peer.connect(handshake.id, {
        reliable: true,
        /* metadata: {
          token: this.token
        } */
      })

      rawStream.on('open', () => {
        console.log('rawStream open')

        // if (!this.handshake) throw new Error('No handshake')

        const duplex = new WebStream(rawStream)

        this.remote = duplex // new SecretStream(true, duplex)

        /* this.remote.on('connect', () => {
          console.log('remote connected')
        })

        this.remote.on('open', () => {
          console.log('remote opened')
        }) */

        this.remote.on('error', console.error)

        // TODO: Can destroy it right away?
        // const done = () => this.mux.destroy()
        // waitForRemote(this.remote).then(done, done)

        this.emit('continue', this.remote)
      })

      rawStream.on('error', function (err) {
        console.log('rawStream error', err)
      })

      rawStream.on('close', function () {
        console.log('rawStream close')
      })
    }
  }

  _onmuxerror (err) {
    console.error('_onmuxerror', err)
  }

  _onmuxclose (isRemote) {
    console.log('_onmuxclose', { isRemote }, 'Stream created?', !!this.remote)

    // if (!this.remote) this.peer.destroy()
    // this.mux.destroy()
  }
}

/* function getHandshake (stream) {
  return {
    publicKey: stream.publicKey,
    remotePublicKey: stream.remotePublicKey,
    hash: stream.handshakeHash,
    tx: stream.tx || stream._encrypt?.key || null,
    rx: stream.rx || stream._decrypt?.key || null
  }
} */

function waitForRemote (remote) {
  return new Promise(resolve => {
    this.remote.on('open', done)
    this.remote.on('open', done)
    this.remote.on('error', done)
    this.remote.on('close', done)

    function done () {
      this.remote.off('open', done)
      this.remote.off('error', done)
      this.remote.off('close', done)

      resolve()
    }
  })
}

// TODO: Simplify a bit
function waitForPeer (peer) {
  return new Promise((resolve, reject) => {
    if (peer.disconnected === true) {
      reject(new Error('Peer is disconnected'))
      return
    }

    if (peer.destroyed) {
      reject(new Error('Peer is destroyed'))
      return
    }

    peer.on('open', onopen)
    peer.on('error', onclose)
    peer.on('close', onclose)

    function onopen (id) {
      cleanup()
      resolve()
    }

    function onclose (err) {
      cleanup()

      if (err) reject(err)
      else reject(new Error('Could not create peer'))
    }

    function cleanup () {
      peer.off('open', onopen)
      peer.off('error', onclose)
      peer.off('close', onclose)
    }
  })
}

function randomBytes (n) {
  const buf = b4a.allocUnsafe(n)
  sodium.randombytes_buf(buf)
  return buf
}
