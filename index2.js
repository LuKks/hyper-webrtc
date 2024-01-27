const iceServers = [
  { urls: 'stun:stun.l.google.com:19302' }
]

let $id = 0

module.exports = class LikeWebRTC {
  constructor () {
    this._id = $id++

    this.peer = new RTCPeerConnection({ iceServers })

    this._setup()
  }

  _setup () {
    this.peer.onicecandidate = (event) => {
      if (event.candidate) {
        console.log(this._id, 'onicecandidate', event)
        this.onice(event)
      }
    }
  }

  addIceCandidate (candidate) {
    this.peer.addIceCandidate(new RTCIceCandidate(candidate))
  }

  onice (event) {}

  //

  // connect () {}

  //

  createChannel (name) {
    const channel = this.peer.createDataChannel(name)
    // const channel = this.peer.createDataChannel(name, { negotiated: true, id: 0 }) // ondatachannel will not fire

    channel.onopen = () => {
      console.log('Data channel opened');
      channel.send('Hello, peer!');
    };

    channel.onclose = () => {
      console.log('data channel closed')
    }

    channel.onerror = (err) => console.error(err)

    channel.onmessage = (event) => {
      console.log('Received message:', event.data);
    };

    return channel
  }
  
  async createOffer () {
    const offer = await this.peer.createOffer()

    await this.peer.setLocalDescription(offer)

    return this.peer.localDescription // => offer
  }

  async receiveOffer (offer) {
    this.peer.setRemoteDescription(new RTCSessionDescription(offer))

    const answer = await this.peer.createAnswer()

    await this.peer.setLocalDescription(answer)

    return this.peer.localDescription // => answer
  }

  async receiveAnswer (answer) {
    this.peer.setRemoteDescription(new RTCSessionDescription(answer))
  }
}
