const test = require('brittle')
const WebRTC = require('./index2.js')

test('basic', async function (t) {
  const a = new WebRTC()
  const b = new WebRTC()

  a.onice = function (e) {
    b.addIceCandidate(e.candidate)
  }

  b.onice = function (e) {
    a.addIceCandidate(e.candidate)
  }

  const channel1 = a.createChannel('rohil-is-he-knows')
  b.peer.ondatachannel = function (e) {
    const channel2 = e.channel

    channel2.onopen = () => {
      console.log('Data channel opened');
    };

    channel2.onclose = () => {
      console.log('data channel closed')
    }

    channel2.onerror = (err) => console.error(err)

    channel2.onmessage = (event) => {
      console.log('Received message:', event.data);
    };
  }

  const offer = await a.createOffer()
  const answer = await b.receiveOffer(offer)
  await a.receiveAnswer(answer)


})
