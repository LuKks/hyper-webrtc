const { RTCPeerConnection, RTCIceCandidate } = require('werift')
const Protomux = require('protomux')
const c = require('compact-encoding')
const safetyCatch = require('safety-catch')
const ReadyResource = require('ready-resource')
const WebStream = require('./lib/web-stream.js')

const iceServers = [
  { urls: 'stun:stun.l.google.com:19302' }
]

// TODO: This could be a Duplex but don't know about that, for now emitting an event is good enough
module.exports = class WebPeer extends ReadyResource {
  constructor (stream) {
    super()

    this.peer = new RTCPeerConnection({ iceServers })
    this.stream = stream
    this.mux = null // new Protomux(stream)
    this.channel = null
    this.remote = null

    this.peer.onicecandidate = onicecandidate.bind(this)

    this.ready().catch(safetyCatch)
  }

  async _open () {
    this.mux = new Protomux(this.stream)

    this.channel = this.mux.createChannel({
      protocol: 'hyper-webrtc/signaling',
      id: null,
      handshake: c.json, // TODO: Make strict messages
      onopen: this._onmuxopen.bind(this),
      onerror: this._onmuxerror.bind(this),
      onclose: this._onmuxclose.bind(this),
      messages: [
        { encoding: c.json, onmessage: this._onwireice.bind(this) },
        { encoding: c.json, onmessage: this._onwireoffer.bind(this) },
        { encoding: c.json, onmessage: this._onwireanswer.bind(this) }
      ]
    })

    this.channel.userData = this

    this.channel.open({
      // isInitiator: this.mux.stream.isInitiator,
    })

    // TODO: Maximize speed at connecting, e.g. don't wait until open
  }

  _close () {
    console.log('_closed')
    this.peer.close()
    this.stream.destroy()
  }

  async _onmuxopen (handshake) {
    console.log('_onmuxopen', handshake)

    // const rawStream = this.peer.createDataChannel('wire', { negotiated: true, id: 0 })

    const done = (rawStream) => {
      this.remote = new WebStream(this.mux.stream.isInitiator, rawStream, {
        handshakeHash: this.mux.stream.handshakeHash
      }) // new SecretStream(false, rawStream)

      this.remote.on('close', () => {
        console.log('remote closed')
        this.close().catch(safetyCatch)
      })

      this.emit('continue', this.remote) // TODO: It should be a Duplex to avoid this event
    }

    if (this.mux.stream.isInitiator) {
      const rawStream = this.peer.createDataChannel('wire')
      done(rawStream)

      const offer = await this.peer.createOffer()
      await this.peer.setLocalDescription(offer)

      this.channel.messages[1].send({ offer: this.peer.localDescription })
    } else {
      this.peer.ondatachannel = (e) => {
        const rawStream = e.channel
        done(rawStream)
      }
    }
  }

  async _onwireice ({ ice }) {
    await this.peer.addIceCandidate(new RTCIceCandidate(ice))
  }

  async _onwireoffer ({ offer }) {
    await this.peer.setRemoteDescription(offer)

    const answer = await this.peer.createAnswer()
    await this.peer.setLocalDescription(answer)

    this.channel.messages[2].send({ answer: this.peer.localDescription })
  }

  async _onwireanswer ({ answer }) {
    await this.peer.setRemoteDescription(answer)
  }

  _onmuxerror (err) {
    console.error('_onmuxerror', err)
  }

  _onmuxclose (isRemote) {
    console.log('_onmuxclose', { isRemote }, 'Stream created?', !!this.remote)

    if (!this.remote) this.peer.close()

    this.stream.destroy()
  }
}

function onicecandidate (e) {
  if (e.candidate) this.channel.messages[0].send({ ice: e.candidate })
}
