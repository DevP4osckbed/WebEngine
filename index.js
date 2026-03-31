const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const path = require("path");
const fs = require("fs");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const hostname = '0.0.0.0';
const PORT = 3000;

app.use(express.static(path.join(__dirname, "public")));

const rooms = new Map(); // roomKey -> Set(ws)

wss.on("connection", (ws) => {
    console.log("Client connected");

    ws.send(JSON.stringify({
        type: "status",
        message: "Connected"
    }));
    
    ws.on("message", (msg) => {
        let data;

        try {
            data = JSON.parse(msg.toString());
        } catch {
            ws.send(JSON.stringify({
                type: "error",
                message: "Invalid JSON"
            }));
            return;
        }

        // 🔹 JOIN ROOM
        if (data.type === "join") {
            const { gameId, roomId } = data;

            if (!gameId || !roomId) {
                ws.send(JSON.stringify({
                    type: "error",
                    message: "Missing gameId or roomId"
                }));
                return;
            }

            const roomKey = gameId + ":" + roomId;

            // leave old
            if (ws.roomKey && rooms.has(ws.roomKey)) {
                rooms.get(ws.roomKey).delete(ws);
            }

            // create if not exists
            if (!rooms.has(roomKey)) {
                rooms.set(roomKey, new Set());
            }

            rooms.get(roomKey).add(ws);
            ws.roomKey = roomKey;

            ws.send(JSON.stringify({
                type: "joined",
                room: roomKey
            }));

            return;
        }

        // 🔹 PING → BROADCAST TO ROOM
        if (data.type === "ping") {
            if (!ws.roomKey) return;

            const room = rooms.get(ws.roomKey);
            if (!room) return;

            const message = JSON.stringify({
                type: "pong",
                message: "TIME: " + new Date().toISOString()
            });

            room.forEach(client => {
                if (client.readyState === WebSocket.OPEN) {
                    client.send(message);
                }
            });

            return;
        }

        ws.send(JSON.stringify({
            type: "error",
            message: "Unknown message type"
        }));
    });

    ws.on("close", () => {
        if (ws.roomKey && rooms.has(ws.roomKey)) {
            rooms.get(ws.roomKey).delete(ws);
        }
        console.log("Client disconnected");
    });
});

server.listen(PORT, hostname, () => {
  console.log(`Server running at http://${hostname}:${PORT}/`);
}); 