const socket = io();
let device;
let rtpCapabilities;
let sendTransport;
let recvTransport;
let localStream;

document.getElementById('joinBtn').addEventListener('click', async () => {
  socket.emit('joinRoom');
});

socket.on('routerRtpCapabilities', async (caps) => {
  rtpCapabilities = caps;
  device = new mediasoupClient.Device();
  await device.load({ routerRtpCapabilities: rtpCapabilities });
  console.log('Device yüklendi');
});

document.getElementById('startAudio').addEventListener('click', async () => {
  localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const track = localStream.getAudioTracks()[0];

  sendTransport = await createTransport('send');
  const producer = await produce(sendTransport, track);
  console.log('Producer oluşturuldu:', producer);
});

socket.on('newProducer', async ({ producerId }) => {
  console.log('Yeni Producer:', producerId);
  recvTransport = await createTransport('recv');
  const consumerData = await consume(recvTransport, producerId);
  console.log('Consumer oluşturuldu:', consumerData);

  const { track } = consumerData;
  const audio = new Audio();
  audio.srcObject = new MediaStream([track]);
  audio.play();
});

async function createTransport(direction) {
  return new Promise((resolve, reject) => {
    socket.emit('createTransport', (res) => {
      if (res.error) {
        return reject(res.error);
      }
      const transport = device.createTransport({
        direction,
        ...res
      });

      socket.emit('connectTransport', { transportId: transport.id, dtlsParameters: transport.dtlsParameters }, (connRes) => {
        if (connRes.error) {
          return reject(connRes.error);
        }
        resolve(transport);
      });
    });
  });
}

async function produce(transport, track) {
  return new Promise((resolve, reject) => {
    const params = {
      transportId: transport.id,
      kind: track.kind,
      rtpParameters: device.rtpCapabilities
    };

    const senderRtpParams = {
      ...transport.rtpCapabilities,
      encodings: [{ maxBitrate: 128000 }] // Basit ayar
    };

    // Gerçek uygulamada, rtpParameters track'ten alınmaz, "getRtpParameters" gerekebilir
    // Basitlik için şu an direkt device.rtpCapabilities kullanılıyor.
    transport.produce({ track })
      .then(producer => {
        resolve(producer);
      })
      .catch(e => reject(e));
  });
}

async function consume(transport, producerId) {
  return new Promise((resolve, reject) => {
    socket.emit('consume', {
      transportId: transport.id,
      producerId: producerId,
      rtpCapabilities: device.rtpCapabilities
    }, (res) => {
      if (res.error) {
        return reject(res.error);
      }
      const consumer = transport.consume({
        id: res.id,
        producerId: res.producerId,
        kind: res.kind,
        rtpParameters: res.rtpParameters
      });
      consumer.then(c => {
        resolve({ consumer: c, track: c.track });
      }).catch(e => reject(e));
    });
  });
}

// Mediasoup Client eklenmeli (CDN veya npm ile)
