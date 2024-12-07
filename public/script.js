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
    initPeer(userId, false);
  });
});

// Yeni bir kullanıcı bağlandığında
socket.on("new-user", (userId) => {
  console.log("Yeni kullanıcı bağlandı:", userId);
  initPeer(userId, true);
});

// Signal alımı
socket.on("signal", async (data) => {
  console.log("Signal alındı:", data);
  const { from, signal } = data;

  let peer;
  if (!peers[from]) {
    peer = initPeer(from, false);
  } else {
    peer = peers[from];
  }

  try {
    if (signal.type === "offer") {
      await peer.setRemoteDescription(new RTCSessionDescription(signal));
      const answer = await peer.createAnswer();
      await peer.setLocalDescription(answer);
      console.log("Bağlantıya cevap verildi:", answer);
      socket.emit("signal", { to: from, signal: peer.localDescription });
    } else if (signal.type === "answer") {
      await peer.setRemoteDescription(new RTCSessionDescription(signal));
    } else if (signal.candidate) {
      await peer.addIceCandidate(new RTCIceCandidate(signal));
      console.log("ICE Candidate eklendi:", signal);
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
        urls: "turn:31.223.49.197:3478", // TURN sunucunuzun IP'sini buraya ekleyin
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
      console.log("Yeni ICE Candidate oluşturuldu:", event.candidate);
      socket.emit("signal", { to: userId, signal: event.candidate });
    } else {
      console.log("ICE Candidate süreci tamamlandı.");
    }
  };

  peer.oniceconnectionstatechange = () => {
    console.log("ICE bağlantı durumu:", peer.iceConnectionState);
  };

  peer.onconnectionstatechange = () => {
    console.log("PeerConnection durumu:", peer.connectionState);
  };

  peer.ontrack = (event) => {
    console.log("Remote stream alındı:", event.streams[0]);
    const audio = new Audio();
    audio.srcObject = event.streams[0];

    const playButton = document.getElementById('startCall');
    playButton.addEventListener('click', () => {
      audio.play().catch((err) => console.error("Ses oynatılamadı:", err));
    });

    console.log("Remote stream bağlı, sesi başlatmak için butona tıklayın.");
  };

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

socket.on("connect", () => {
  console.log("WebSocket bağlantısı kuruldu. Kullanıcı ID:", socket.id);
});

socket.on("disconnect", () => {
  console.log("WebSocket bağlantısı kesildi.");
});

setInterval(() => {
  console.log("Mevcut PeerConnection'lar:", peers);
}, 10000);
