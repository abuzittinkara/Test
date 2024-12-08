const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const mediasoup = require('mediasoup');

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

app.use(express.static('public'));

let worker;
let router;
let audioLevelObserver;

let transports = [];
let producers = [];
let consumers = [];

(async () => {
  // Mediasoup worker başlat
  worker = await mediasoup.createWorker({
    rtcMinPort: 40000,
    rtcMaxPort: 49999
  });

  worker.on('died', () => {
    console.error('Mediasoup Worker öldü, yeniden başlatılması gerek!');
    process.exit(1);
  });

  // Router oluştur (codec'ler basit tutuyoruz, opus - audio)
  router = await worker.createRouter({
    mediaCodecs: [
      {
        kind: 'audio',
        mimeType: 'audio/opus',
        clockRate: 48000,
        channels: 2
      }
    ]
  });

  // Audio level observer (isteğe bağlı)
  audioLevelObserver = await router.createAudioLevelObserver();

})();

io.on('connection', socket => {
  console.log('Yeni bağlantı:', socket.id);

  socket.on('joinRoom', async () => {
    // Kullanıcı "defaultRoom"a katılıyor
    socket.join('defaultRoom');

    socket.emit('routerRtpCapabilities', router.rtpCapabilities);
  });

  socket.on('createTransport', async (callback) => {
    try {
      const transport = await router.createWebRtcTransport({
        listenIps: [{ ip: '0.0.0.0', announcedIp: null }], // Render ip ayarlayabilirsiniz
        enableUdp: true,
        enableTcp: true,
        preferUdp: true
      });

      transports.push(transport);

      callback({
        id: transport.id,
        iceParameters: transport.iceParameters,
        iceCandidates: transport.iceCandidates,
        dtlsParameters: transport.dtlsParameters
      });
    } catch (error) {
      console.error('createTransport hatası:', error);
      callback({ error: error.message });
    }
  });

  socket.on('connectTransport', async ({ transportId, dtlsParameters }, callback) => {
    const transport = transports.find(t => t.id === transportId);
    if (!transport) {
      callback({ error: 'Transport bulunamadı' });
      return;
    }

    await transport.connect({ dtlsParameters });
    callback({ connected: true });
  });

  socket.on('produce', async ({ transportId, kind, rtpParameters }, callback) => {
    const transport = transports.find(t => t.id === transportId);
    if (!transport) {
      callback({ error: 'Transport yok' });
      return;
    }

    const producer = await transport.produce({ kind, rtpParameters });
    producers.push(producer);

    // Tüm odadaki diğer kullanıcılara yeni producer var bilgisini gönder
    socket.to('defaultRoom').emit('newProducer', { producerId: producer.id });

    callback({ id: producer.id });
  });

  socket.on('consume', async ({ transportId, producerId, rtpCapabilities }, callback) => {
    const transport = transports.find(t => t.id === transportId);
    if (!transport) {
      callback({ error: 'Transport bulunamadı' });
      return;
    }

    if (!router.canConsume({
      producerId: producerId,
      rtpCapabilities
    })) {
      callback({ error: 'Tüketilemez' });
      return;
    }

    const consumer = await transport.consume({
      producerId,
      rtpCapabilities,
      paused: false
    });

    consumers.push(consumer);

    callback({
      id: consumer.id,
      producerId: producerId,
      kind: consumer.kind,
      rtpParameters: consumer.rtpParameters
    });
  });

  socket.on('disconnect', () => {
    console.log('Kullanıcı ayrıldı:', socket.id);
    // İlgili transport, producer, consumer'ları temizleme işlemleri burada yapılmalı
    // Geliştirilebilir
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Sunucu çalışıyor: http://localhost:${PORT}`);
});
