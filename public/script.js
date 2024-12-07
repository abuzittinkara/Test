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
    const { from, signal } = data;

    // Eğer PeerConnection mevcut değilse oluştur
    if (!peers[from]) {
      peers[from] = initPeer(from, false);
    }

    const peer = peers[from];

    // Offer işleme
    if (signal.type === "offer") {
      console.log("Offer sinyali alındı, işlem başlatılıyor.");
      await peer.setRemoteDescription(new RTCSessionDescription(signal));
      const answer = await peer.createAnswer();
      await peer.setLocalDescription(answer);
      console.log("Answer oluşturuldu ve gönderildi.");
      socket.emit("signal", { to: from, signal: peer.localDescription });
    } 
    // Answer işleme
    else if (signal.type === "answer") {
      console.log("Answer sinyali alındı, remote description ayarlanıyor.");
      await peer.setRemoteDescription(new RTCSessionDescription(signal));
    } 
    // ICE Candidate işleme
    else if (signal.candidate) {
      console.log("ICE Candidate alındı:", signal.candidate);
      if (peer.remoteDescription) {
        await peer.addIceCandidate(new RTCIceCandidate(signal));
        console.log("ICE Candidate başarıyla eklendi.");
      } else {
        console.warn("Remote description ayarlanmadan ICE Candidate geldi.");
      }
    }
  } catch (error) {
    console.error("Signal işlenirken hata oluştu:", error);

    // Hata durumunda PeerConnection kapatılır ve temizlenir
    if (peers[from]) {
      peers[from].close();
      delete peers[from];
    }
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

  // Eğer peer daha önce oluşturulmuşsa tekrar ekleme yapma
  if (!peers[userId]) {
    peers[userId] = peer;

    if (localStream) {
      localStream.getTracks().forEach((track) => {
        const senders = peer.getSenders();
        const alreadyAdded = senders.some(sender => sender.track === track);
        if (!alreadyAdded) {
          peer.addTrack(track, localStream);
        }
      });
    }
  }

  peer.onicecandidate = (event) => {
    if (event.candidate) {
      socket.emit("signal", { to: userId, signal: event.candidate });
    } else {
      console.log("ICE Candidate süreci tamamlandı.");
    }
  };

  peer.ontrack = (event) => {
    console.log("Remote stream alındı:", event.streams[0]);
    
    if (event.streams[0]) {
      const audio = new Audio();
      audio.srcObject = event.streams[0];
  
      // Mevcut buton olan "startCall" için olay bağlama işlemi
      const playButton = document.getElementById("startCall");
      playButton.addEventListener("click", () => {
        audio.play().catch(err => console.error("Ses oynatılamadı:", err));
      });
  
      console.log("Ses için 'Sesi Başlat' butonunu kullanın.");
    } else {
      console.error("Remote stream alınamadı.");
    }
  };  

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
  Object.keys(peers).forEach((peerId) => {
    peers[peerId].close();
    delete peers[peerId];
  });
});

// Debug için bağlantı kontrol logları
setInterval(() => {
  console.log("Mevcut PeerConnection'lar:", peers);
}, 10000);
