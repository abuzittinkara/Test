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
  users.forEach((userId) => {
    initPeer(userId, false); // Yeni peer oluştur ve offer gönder
  });
});

// Yeni bir kullanıcı bağlandığında
socket.on("new-user", (userId) => {
  console.log("Yeni kullanıcı bağlandı:", userId);
  initPeer(userId, true); // Yeni peer oluştur ve answer bekle
});

// Signal alımı
socket.on("signal", async (data) => {
  try {
    console.log("Signal alındı:", data);
    const { from, signal } = data;

    let peer;
    if (!peers[from]) {
      peer = initPeer(from, false);
    } else {
      peer = peers[from];
    }

    if (signal.type === "offer") {
      await peer.setRemoteDescription(new RTCSessionDescription(signal));
      const answer = await peer.createAnswer();
      await peer.setLocalDescription(answer);
      socket.emit("signal", { to: from, signal: peer.localDescription });
    } else if (signal.type === "answer") {
      await peer.setRemoteDescription(new RTCSessionDescription(signal));
    } else if (signal.candidate) {
      await peer.addIceCandidate(new RTCIceCandidate(signal));
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

  // Peer'i peers listesine ekle
  peers[userId] = peer;

  // Eğer localStream varsa, aynı track'in eklenmesini önle
  if (localStream) {
    localStream.getTracks().forEach((track) => {
      const senders = peer.getSenders();
      const alreadyAdded = senders.some(sender => sender.track === track);
      if (!alreadyAdded) {
        peer.addTrack(track, localStream);
      }
    });
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
    if (peer.iceConnectionState === "failed") {
      console.error("ICE bağlantısı başarısız oldu!");
    }
  };

  // Peer bağlantı durumu değişiklikleri
  peer.onconnectionstatechange = () => {
    console.log("Peer bağlantı durumu:", peer.connectionState);
    if (peer.connectionState === "failed") {
      console.error("Peer bağlantısı başarısız oldu!");
    }
  };

  // Remote stream alındığında
  peer.ontrack = (event) => {
    console.log("Remote stream alındı:", event.streams[0]);
    if (event.streams[0]) {
      const audio = new Audio();
      audio.srcObject = event.streams[0];

      const playButton = document.getElementById("startCall");
      playButton.addEventListener("click", () => {
        audio.play().catch((err) => console.error("Ses oynatılamadı:", err));
      });
      console.log("Remote stream bağlı, sesi başlatmak için butona tıklayın.");
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
