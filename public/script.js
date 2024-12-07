const socket = io();
let localStream;
let peers = {};

// Mikrofon erişimi al ve debug logları ekle
navigator.mediaDevices.getUserMedia({ audio: true })
  .then((stream) => {
    console.log("Mikrofon erişimi verildi:", stream);
    localStream = stream;

    stream.getTracks().forEach((track) => {
      console.log("Track tipi:", track.kind, "Durum:", track.readyState);
    });
  })
  .catch((err) => console.error("Mikrofon erişimi reddedildi:", err));

// Mevcut kullanıcıları al
socket.on("users", (users) => {
  console.log("Mevcut kullanıcılar:", users);

  // Her bir kullanıcıyla bağlantı kur
  users.forEach((userId) => {
    if (!peers[userId]) {
      const peer = initPeer(userId, true);
      
      // Local stream'i gönder
      if (localStream) {
        localStream.getTracks().forEach((track) => peer.addTrack(track, localStream));
      }
    }
  });
});

// Yeni bir kullanıcı bağlandığında
socket.on("new-user", (userId) => {
  console.log("Yeni kullanıcı bağlandı:", userId);
  
  // Yeni kullanıcı için PeerConnection oluştur
  const peer = initPeer(userId, true); 

  // Yeni kullanıcının ses verisini karşı tarafa gönder
  if (localStream) {
    localStream.getTracks().forEach((track) => peer.addTrack(track, localStream));
  }
});

// Signal alımı
socket.on("signal", async (data) => {
  try {
    console.log("Signal alındı:", data);
    const { from, signal } = data;

    let peer;
    // Eğer PeerConnection yoksa yeni bir tane oluştur.
    if (!peers[from]) {
      peer = initPeer(from, false);
    } else {
      peer = peers[from];
    }

    // PeerConnection kontrolü
    if (!peer) {
      console.error("PeerConnection bulunamadı:", from);
      return;
    }

    // SDP kontrolü
    if (signal.type === "offer" || signal.type === "answer") {
      if (!signal.sdp) {
        console.error("SDP eksik:", signal);
        return;
      }
    }

    // Signal tipi "offer" ise
    if (signal.type === "offer") {
      console.log("Offer sinyali alındı, işlem başlatılıyor.");
      await peer.setRemoteDescription(new RTCSessionDescription(signal));
      const answer = await peer.createAnswer();
      await peer.setLocalDescription(answer);
      console.log("Answer oluşturuldu ve gönderildi.");
      socket.emit("signal", { to: from, signal: peer.localDescription });

    // Signal tipi "answer" ise
    } else if (signal.type === "answer") {
      console.log("Answer sinyali alındı, remote description ayarlanıyor.");
      await peer.setRemoteDescription(new RTCSessionDescription(signal));

    // Signal bir ICE Candidate ise
    } else if (signal.candidate) {
      console.log("ICE Candidate alındı:", signal.candidate);
      // Remote description mevcutsa ICE Candidate ekle.
      if (peer.remoteDescription) {
        await peer.addIceCandidate(new RTCIceCandidate(signal));
        console.log("ICE Candidate başarıyla eklendi.");
      } else {
        console.warn("Remote description ayarlanmamış, ICE Candidate bekletiliyor.");
      }
    }
  } catch (error) {
    console.error("Signal işlenirken hata oluştu:", error);
  }
});

// Peer oluşturma fonksiyonu
function initPeer(userId, isInitiator) {
  const peer = new RTCPeerConnection({
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
      {
        urls: "turn:31.223.49.197:3478", 
        username: "webrtc_user",
        credential: "StrongP@ssw0rd123",
      },
    ],
  });

  peers[userId] = peer;

  if (localStream) {
    localStream.getTracks().forEach((track) => peer.addTrack(track, localStream));
}

  // ICE Candidate süreci
  peer.onicecandidate = (event) => {
    if (event.candidate) {
      console.log("Yeni ICE Candidate oluşturuldu:", event.candidate);
      socket.emit("signal", { to: userId, signal: event.candidate });
    } else {
      console.log("ICE Candidate süreci tamamlandı.");
    }
  };  

  // ICE bağlantı durumu değişiklikleri
  peer.oniceconnectionstatechange = () => {
    console.log("ICE bağlantı durumu:", peer.iceConnectionState);
    if (peer.iceConnectionState === 'failed') {
      console.error('ICE bağlantısı başarısız oldu!');
    }
  };

  // Peer bağlantı durumu değişiklikleri
  peer.onconnectionstatechange = () => {
    console.log("Peer bağlantı durumu:", peer.connectionState);
  };

  // Remote stream alındığında
  peer.ontrack = (event) => {
    console.log("Remote stream alındı:", event.streams[0]);

    if (event.streams[0]) {
        const audio = new Audio();
        audio.srcObject = event.streams[0];

        // Otomatik çalma (modern tarayıcılarda kullanıcı etkileşimi gerekebilir)
        audio.autoplay = true;

        // Opsiyonel: Ses kontrolü için DOM'a ekle
        document.body.appendChild(audio);

        console.log("Remote stream bağlı ve ses çalmaya başladı.");
    } else {
        console.error("Remote stream alınamadı.");
    }
};

  // Eğer bağlantıyı başlatan kişi ise offer oluştur
  if (isInitiator) {
    createOffer(peer, userId);
  }

  return peer;
}

// Offer oluşturma fonksiyonu
async function createOffer(peer, userId) {
  try {
    const offer = await peer.createOffer();
    await peer.setLocalDescription(offer);
    console.log("Offer oluşturuldu ve gönderildi:", offer);
    socket.emit("signal", { to: userId, signal: peer.localDescription });
  } catch (error) {
    console.error("Offer oluşturulurken hata oluştu:", error);
  }
}

// WebSocket bağlantı durumu
socket.on("connect", () => {
  console.log("WebSocket bağlantısı kuruldu. Kullanıcı ID:", socket.id);
});

socket.on("disconnect", () => {
  console.log("WebSocket bağlantısı kesildi.");
});

// Debug için bağlantı kontrol logları
setInterval(() => {
  console.log("Mevcut PeerConnection'lar:", peers);
}, 10000);
