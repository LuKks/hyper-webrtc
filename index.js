const { RTCPeerConnection, RTCIceCandidate } = require('get-webrtc')
const Protomux = require('protomux')
const c = require('compact-encoding')
const safetyCatch = require('safety-catch')
const WebStream = require('./lib/web-stream.js')

// TODO: Investigate how to deploy STUN servers
const iceServers = [
  { urls: 'stun:stun.l.google.com:19302' }
]

module.exports = class WebPeer {
  constructor (relay) {
    this._rtc = new RTCPeerConnection({ iceServers })
    this._relay = relay
    this._mux = Protomux.from(relay)

    this._channel = this._mux.createChannel({ protocol: 'hyper-webrtc/signal' })

    if (this._channel === null) throw new Error('Channel duplicated')

    this._ice = this._channel.addMessage({ encoding: c.json, onmessage: this._onice.bind(this) })
    this._offer = this._channel.addMessage({ encoding: c.json, onmessage: this._onoffer.bind(this) })
    this._answer = this._channel.addMessage({ encoding: c.json, onmessage: this._onanswer.bind(this) })

    this._channel.open()

    this._rtc.onicecandidate = onicecandidate.bind(this)
  }

  static from (relay) {
    const peer = new this(relay)

    const rawStream = peer._rtc.createDataChannel('wire', { negotiated: true, id: 0 })

    const stream = new WebStream(relay.isInitiator, rawStream, {
      publicKey: relay.publicKey,
      remotePublicKey: relay.remotePublicKey,
      handshakeHash: relay.handshakeHash
    })

    relay.on('close', () => {
      peer._rtc.close()
      rawStream.close()
    })

    stream.on('close', () => {
      peer._rtc.close()
      relay.destroy()
    })

    peer.negotiate().catch(safetyCatch)

    return stream
  }

  async negotiate () {
    if (!this._relay.isInitiator) return

    const offer = await this._rtc.createOffer()
    await this._rtc.setLocalDescription(offer)

    this._offer.send({ offer: this._rtc.localDescription })
  }

  async _onice ({ ice }) {
    await this._rtc.addIceCandidate(new RTCIceCandidate(ice))
  }

  async _onoffer ({ offer }) {
    await this._rtc.setRemoteDescription(offer)

    const answer = await this._rtc.createAnswer()
    await this._rtc.setLocalDescription(answer)

    this._answer.send({ answer: this._rtc.localDescription })
  }

  async _onanswer ({ answer }) {
    await this._rtc.setRemoteDescription(answer)
  }
}

function onicecandidate (e) {
  if (e.candidate) this._ice.send({ ice: e.candidate })
}
