const express = require("express");
const app = express();
const http = require("http").createServer(app);
const io = require("socket.io")(http);

app.use(express.static("public"));

const POKEMON_DATA = require("./public/pokemon.js");

const rooms = {};

const normalize = (str) =>
  str.normalize("NFKC")
    .replace(/[ぁ-ん]/g, s => String.fromCharCode(s.charCodeAt(0) + 0x60))
    .replace(/♀/g, "メス")
    .replace(/♂/g, "オス")
    .replace(/\s/g, "")
    .trim();

function createRoom(roomId, hostId) {
  rooms[roomId] = {
    hostId,
    players: {},
    game: {
  isPlaying: false,
  time: 900,
  answered: [],
  currentData: POKEMON_DATA.kanto.map(p => ({
    ...p,
    owner: null
  }))
}
  };
}

io.on("connection", (socket) => {




  socket.on("joinRoom", ({ roomId, name }) => {
    if (!rooms[roomId]) {
      createRoom(roomId, socket.id);
    }

    const room = rooms[roomId];

    socket.join(roomId);
    socket.roomId = roomId;

    room.players[socket.id] = {
  name,
  score: 0,
  ready: false
};

    io.to(roomId).emit("roomInfo", {
      hostId: room.hostId
    });

    io.to(roomId).emit("updatePlayers", room.players);


 

    // 🔥 途中参加者に現在の状態送る
    socket.emit("sync", {
      answered: room.game.answered,
      currentData: room.game.currentData,
      isPlaying: room.game.isPlaying,
      time: room.game.time
    });

    const allReady = Object.values(room.players).every(p => p.ready);

io.to(roomId).emit("readyStatus", {
    allReady
});
  });

socket.on("changeRegion", ({ gen }) => {
  const room = rooms[socket.roomId];
  if (!room) return;

  // ホスト以外は変更できない
  if (socket.id !== room.hostId) return;

  room.game.currentData = POKEMON_DATA[gen].map(p => ({
    ...p,
    owner: null
  }));

  room.game.answered = [];
  room.game.time = 900;
room.game.isPlaying = false;

Object.values(room.players).forEach(p=>{
    p.score = 0;
    p.ready = false;
});

io.to(socket.roomId).emit("updatePlayers",room.players);
const allReady = Object.values(room.players).every(p => p.ready);

io.to(socket.roomId).emit("readyStatus", {
    allReady
});


io.to(socket.roomId).emit("regionChanged", {
  currentData: room.game.currentData,
  answered: room.game.answered,
  time: room.game.time,
  isPlaying: room.game.isPlaying
});
  io.to(socket.roomId).emit("time", room.game.time);
});

  socket.on("start", ({ gen }) => {
    const room = rooms[socket.roomId];
    if (!room) return;
    if (socket.id !== room.hostId) return;

    const allReady = Object.values(room.players).every(p => p.ready);

if (!allReady) {
    socket.emit("systemMessage", {
        text: "⚠ 全員が準備OKになるまで開始できません"
    });
    return;
}

    room.game.currentData = POKEMON_DATA[gen].map(p => ({
  ...p,
  owner: null
}));
    room.game.answered = [];
    room.game.time = 900;
    room.game.isPlaying = false;

    Object.values(room.players).forEach(p => {
    p.score = 0;
    p.ready = false;
});

    io.to(socket.roomId).emit("start", {
      ...room.game,
      hostId: room.hostId
      
    });
io.to(socket.roomId).emit("updatePlayers", room.players);

io.to(socket.roomId).emit("readyStatus", {
    allReady: false
});
  });

  socket.on("beginGame", () => {
    const room = rooms[socket.roomId];
    if (!room) return;
    if (socket.id !== room.hostId) return;

    room.game.isPlaying = true;

    io.to(socket.roomId).emit("begin");
    
    io.to(socket.roomId).emit("time", room.game.time);
    io.to(socket.roomId).emit("updatePlayers", room.players);
  });

socket.on("ready", () => {

    const room = rooms[socket.roomId];
    if (!room) return;

    room.players[socket.id].ready =
        !room.players[socket.id].ready;

    io.to(socket.roomId).emit(
        "updatePlayers",
        room.players
    );
    const allReady = Object.values(room.players)
    .every(p => p.ready);

io.to(socket.roomId).emit("readyStatus", {
    allReady
});

});

socket.on("giveUp", () => {
    const room = rooms[socket.roomId];
    if (!room) return;
    if (socket.id !== room.hostId) return;

    room.game.isPlaying = false;
    room.game.time = 900;
Object.values(room.players).forEach(p=>{
    p.ready = false;
});
io.to(socket.roomId).emit("updatePlayers", room.players);

io.to(socket.roomId).emit("readyStatus",{
    allReady:false
});
    io.to(socket.roomId).emit("time", room.game.time);
    io.to(socket.roomId).emit("end");
});

socket.on("answer", ({ text }) => {
    const room = rooms[socket.roomId];
    if (!room) return;
    if (!room.game.isPlaying) return;

    const found = room.game.currentData.find(
        p => normalize(p.name) === normalize(text)
    );

    if (!found) {
        socket.emit("wrong");
        return;
    }

    if (room.game.answered.includes(found.id)) return;

    room.game.answered.push(found.id);
    room.players[socket.id].score++;
    found.owner = socket.id;

    io.to(socket.roomId).emit("correct", {
        pokemon: found,
        player: room.players[socket.id]
    });

    io.to(socket.roomId).emit("updatePlayers", room.players);
    const allReady = Object.values(room.players)
    .every(p => p.ready);

io.to(socket.roomId).emit("readyStatus", {
    allReady
});

    if (room.game.answered.length === room.game.currentData.length) {

    room.game.isPlaying = false;

    const winner = Object.values(room.players)
        .sort((a, b) => b.score - a.score)[0];

    io.to(socket.roomId).emit("systemMessage", {
        text: `🏆 ${winner.name} の勝ち！ (${winner.score}匹)`
    });

    io.to(socket.roomId).emit("systemMessage", {
        text: "🎉 コンプリート！！"
    });

    io.to(socket.roomId).emit("end");
}
});



  socket.on("disconnect", () => {
    const room = rooms[socket.roomId];
    if (!room) return;

    delete room.players[socket.id];

    if(Object.keys(room.players).length===0){
    delete rooms[socket.roomId];
    return;
}

    if (socket.id === room.hostId) {
      const ids = Object.keys(room.players);
      room.hostId = ids[0] || null;

      io.to(socket.roomId).emit("roomInfo", {
        hostId: room.hostId
      });
      if (room.hostId) {
  io.to(socket.roomId).emit("systemMessage", {
    text: `${room.players[room.hostId].name} が新しいホストになりました！`
  });
}
    }

    io.to(socket.roomId).emit("updatePlayers", room.players);
  });
});



setInterval(() => {
  Object.entries(rooms).forEach(([roomId, room]) => {
    if (!room.game.isPlaying) return;

  room.game.time--;

if (room.game.time < 0) {
    room.game.time = 0;
}

io.to(roomId).emit("time", room.game.time);

if (room.game.time === 0) {
    room.game.isPlaying = false;
    io.to(roomId).emit("end");
}
  });
}, 1000);

const PORT = process.env.PORT || 3001;

http.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});