const express = require("express");
const app = express();
const path = require("path");
const http = require("http");
const socketIo = require("socket.io");

const server = http.createServer(app);
let io = socketIo(server);

app.set("view engine", "ejs");
app.use(express.static(path.join(__dirname, "public")));

let waitingUser = [];
let rooms = {};

io.on("connection", (socket) => {
    // When a user tries to join a room
    socket.on("joinRoom", () => {
        if (waitingUser.length > 0) {
            // If there's a user waiting, create a room for them
            let partner = waitingUser.shift();
            const roomName = `${socket.id}-${partner.id}`;
            socket.join(roomName);
            partner.join(roomName);
            
            // Store the room in rooms object
            rooms[socket.id] = roomName;
            rooms[partner.id] = roomName;
            
            console.log(`Room created: ${roomName}`);
            io.to(roomName).emit("joined", roomName);
        } else {
            // If no one is waiting, add this user to the waiting list
            waitingUser.push(socket);
            console.log(`User ${socket.id} is waiting for a partner`);
        }
    });

    // Handling signaling messages for WebRTC
    socket.on("signalingMessage", (data) => {
        // Broadcast the signaling message to the other participant in the room
        socket.broadcast.to(data.room).emit("signalingMessage", data.message);
    });

    // When a user initiates a video call
    socket.on("startvc", ({ room }) => {
        socket.broadcast.to(room).emit("incomingcall");
    });

    // Handle text or chat messages
    socket.on("message", (data) => {
        socket.broadcast.to(data.room).emit("message", data.message);
        console.log(`Message sent to room ${data.room}: ${data.message}`);
    });

    // Handling mic toggle event
    socket.on("toggleMic", ({ room, isMuted }) => {
        socket.broadcast.to(room).emit("micToggled", { isMuted });
    });

    // Handling camera toggle event
    socket.on("toggleCamera", ({ room, isCameraOff }) => {
        socket.broadcast.to(room).emit("cameraToggled", { isCameraOff });
    });

    // Handle ending the call
    socket.on("endCall", ({ room }) => {
        io.to(room).emit("callEnded");
        // Close the room and disconnect users
        leaveRoom(socket, room);
        console.log(`Call ended in room: ${room}`);
    });

    // Handle disconnection
    socket.on("disconnect", () => {
        // Remove user from the waiting list if present
        let index = waitingUser.findIndex(waiting => waiting.id === socket.id);
        if (index !== -1) {
            waitingUser.splice(index, 1);
        }

        // Leave the room and notify the other participant
        let roomName = rooms[socket.id];
        if (roomName) {
            socket.leave(roomName);
            socket.broadcast.to(roomName).emit("userDisconnected");
            delete rooms[socket.id];
        }

        console.log(`User ${socket.id} disconnected`);
    });

    // Helper function to leave the room
    function leaveRoom(socket, roomName) {
        socket.leave(roomName);
        delete rooms[socket.id];
    }
});

// Serve the main page
app.get("/", (req, res) => {
    res.render("index");
});

// Serve the video page
app.get("/video", (req, res) => {
    res.render("video");
});

// Start the server
server.listen(process.env.PORT||3000)
