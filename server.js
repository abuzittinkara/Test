const http = require("http");
const express = require("express");
const socketIO = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

const users = new Set();
let groups = []; // { name: 'Grup Adı', owner: 'socketid' }

app.use(express.static("public"));

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
    if (groupName && !groups.find(g => g.name === groupName)) {
      const newGroup = { name: groupName, owner: socket.id };
      groups.push(newGroup);
      io.emit("groups", groups);
      console.log(`Grup oluşturuldu: ${groupName}, owner: ${socket.id}`);
    }
  });

  // Grup silme
  socket.on("delete-group", (groupName) => {
    const index = groups.findIndex(g => g.name === groupName);
    if (index !== -1) {
      const group = groups[index];
      // Sadece owner ise silebilir
      if (group.owner === socket.id) {
        groups.splice(index, 1);
        io.emit("groups", groups);
        console.log(`Grup silindi: ${groupName}`);
      } else {
        console.log(`Yetkisiz silme denemesi: ${groupName}`);
      }
    }
  });

  socket.on("signal", (data) => {
    if (data.to) {
      if (users.has(data.to)) {
        io.to(data.to).emit("signal", {
          from: socket.id,
          signal: data.signal,
        });
      }
    }
  });

  socket.on("disconnect", () => {
    users.delete(socket.id);
    console.log("Kullanıcı ayrıldı:", socket.id);
  });
});

setInterval(() => {
  console.log("Bağlı kullanıcılar:", Array.from(users));
}, 10000);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Sunucu çalışıyor: http://localhost:${PORT}`);
});
