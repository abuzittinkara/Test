const http = require("http");
const express = require("express");
const socketIO = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

const users = new Set();
let groups = []; // Gruplar burada tutuluyor örnek olarak

app.use(express.static("public")); // Static files (frontend)

io.on("connection", (socket) => {
  console.log("Kullanıcı bağlandı:", socket.id);
  users.add(socket.id);

  // Mevcut kullanıcılar
  socket.emit("users", Array.from(users).filter((id) => id !== socket.id));

  // Mevcut grupları gönder
  socket.emit("groups", groups);

  // Diğer kullanıcılara yeni kullanıcının bağlandığını bildir
  socket.broadcast.emit("new-user", socket.id);

  // Grup oluşturma
  socket.on("create-group", (groupName) => {
    if (groupName && !groups.includes(groupName)) {
      groups.push(groupName);
      io.emit("groups", groups); // Tüm kullanıcılara güncellenmiş grup listesini gönder
      console.log(`Grup oluşturuldu: ${groupName}`);
    }
  });

  // Grup silme
  socket.on("delete-group", (groupName) => {
    const index = groups.indexOf(groupName);
    if (index !== -1) {
      groups.splice(index, 1);
      io.emit("groups", groups);
      console.log(`Grup silindi: ${groupName}`);
    }
  });

  socket.on("signal", (data) => {
    console.log("Signal alındı:", data);
    if (data.to) {
      if (users.has(data.to)) {
        io.to(data.to).emit("signal", {
          from: socket.id,
          signal: data.signal,
        });
        console.log("Signal iletildi:", data);
      } else {
        console.log(`Hedef kullanıcı (${data.to}) mevcut değil.`);
      }
    } else {
      console.log("Hedef kullanıcı yok:", data.to);
    }
  });

  socket.on("disconnect", () => {
    users.delete(socket.id);
    console.log("Kullanıcı ayrıldı:", socket.id);
  });
});

// Her 10 sn'de bir kullanıcıları logla
setInterval(() => {
  console.log("Bağlı kullanıcılar:", Array.from(users));
}, 10000);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Sunucu çalışıyor: http://localhost:${PORT}`);
});
