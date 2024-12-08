const socket = io();
let localStream;
let peers = {};

// Mikrofon izni al
navigator.mediaDevices.getUserMedia({ audio: true })
  .then((stream) => {
    console.log("Mikrofon erişimi verildi:", stream);
    localStream = stream;
    stream.getTracks().forEach((track) => {
      console.log("Track tipi:", track.kind, "Durum:", track.readyState);
    });
  })
  .catch((err) => console.error("Mikrofon erişimi reddedildi:", err));

// Sunucudan mevcut kullanıcılar geldiğinde
socket.on("users", (users) => {
  console.log("Mevcut kullanıcılar:", users);
  // Yeni gelen kullanıcı (biz), mevcut kullanıcılara offer gönderiyoruz.
  users.forEach((userId) => {
    initPeer(userId, true); // Bağlantıyı başlatan taraf
  });
});

// Yeni bir kullanıcı bağlandığında (biz mevcut bir kullanıcıysak)
socket.on("new-user", (userId) => {
  console.log("Yeni kullanıcı bağlandı:", userId);
  // Bu durumda biz önceden oradaydık, yeni gelen kullanıcı offer oluşturacak.
  // Biz answer bekleyen taraf oluyoruz.
  initPeer(userId, false);
});

// Bir kullanıcı ayrıldığında
socket.on("user-disconnected", (userId) => {
  console.log("Kullanıcı ayrıldı:", userId);
  if (peers[userId]) {
    peers[userId].close();
    delete peers[userId];
  }
});

socket.on("signal", async (data) => {
  try {
    console.log("Signal alındı:", data);
    const { from, signal } = data;

    let peer;
    if (!peers[from]) {
      // Mevcut olmayan bir peer için yeni peer oluştur
      // Offer alıyorsak isInitiator=false, answer alıyorsak yine false ama zaten peer var.
      // Bu aşamada peer yoksa karşı taraf offer göndermiştir, biz answer üreteceğiz.
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

  peer.onicecandidate = (event) => {
    if (event.candidate) {
      console.log("Yeni ICE Candidate:", event.candidate);
      socket.emit("signal", { to: userId, signal: event.candidate });
    } else {
      console.log("ICE Candidate süreci tamamlandı.");
    }
  };

  peer.oniceconnectionstatechange = () => {
    console.log("ICE Bağlantı Durumu:", peer.iceConnectionState);
    if (peer.iceConnectionState === 'failed') {
      console.error('ICE bağlantısı başarısız oldu!');
    }
  };

  peer.onconnectionstatechange = () => {
    console.log("Peer Bağlantı Durumu:", peer.connectionState);
  };

  peer.ontrack = (event) => {
    console.log("Remote stream alındı:", event.streams[0]);
    if (event.streams[0]) {
      const audio = new Audio();
      audio.srcObject = event.streams[0];
      // Otomatik oynatmayı deneyelim
      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise.catch((error) => {
          console.warn("Otomatik oynatma engellendi, butona basılması gerekebilir:", error);
        });
      }
    } else {
      console.error("Remote stream alınamadı.");
    }
  };

  // Offer oluştur ve gönder (eğer initiator bizsek)
  if (isInitiator) {
    createOffer(peer, userId);
  }

  return peer;
}

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

// WebSocket durum logları
socket.on("connect", () => {
  console.log("WebSocket bağlantısı kuruldu. Kullanıcı ID:", socket.id);
});

socket.on("disconnect", () => {
  console.log("WebSocket bağlantısı kesildi.");
});

// Debug amaçlı periyodik log
setInterval(() => {
  console.log("Mevcut PeerConnection'lar:", peers);
}, 10000);
