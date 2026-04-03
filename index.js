const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const path = require("path");

class Debug {
    static log(message) {
        const time = new Date().toLocaleTimeString();
        const output = typeof message === "object" ? JSON.stringify(message) : message;
        console.log(`[${time}] ${output}`);
    }
}

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const hostname = '0.0.0.0';
const PORT = 3000;

app.use(express.static(path.join(__dirname, "public")));

const rooms = new Map();

wss.on("connection", (ws) => {
    Debug.log("Client connected");

    ws.send(JSON.stringify({
        type: "status",
        message: "Connected"
    }));
    
    ws.on("message", (msg) => {
        let data;
        try {
            data = JSON.parse(msg.toString());
            if (typeof data === 'string') data = JSON.parse(data);
        } catch {
            ws.send(JSON.stringify({ type: "error", message: "Invalid JSON" }));
            return;
        }

        // 🔹 JOIN ROOM
        if (data.type === "join") {
            const { gameId, roomId } = data;
            if (!gameId || !roomId) {
                ws.send(JSON.stringify({ type: "error", message: "Missing gameId or roomId" }));
                return;
            }

            const roomKey = gameId + ":" + roomId;
            if (ws.roomKey && rooms.has(ws.roomKey)) {
                rooms.get(ws.roomKey).delete(ws);
            }

            if (!rooms.has(roomKey)) rooms.set(roomKey, new Set());
            rooms.get(roomKey).add(ws);
            ws.roomKey = roomKey;

            ws.send(JSON.stringify({ type: "joined", room: roomKey }));
            return;
        }

        // 🔹 PING → BROADCAST
        // Inside ws.on("message") -> if (data.type === "ping")
        if (data.type === "ping") {
            if (!ws.roomKey) {
                ws.send(JSON.stringify({ type: "error", message: "Join room first" }));
                return;
            }

            const room = rooms.get(ws.roomKey);
            if (!room) return;

            const message = JSON.stringify({
                type: "pong",
                startTime: data.startTime, // Pass back the client's start time
                serverTime: new Date().toLocaleTimeString() // The server's current time
            });

            room.forEach(client => {
                if (client.readyState === WebSocket.OPEN) client.send(message);
            });
            return;
        }


        // 🔹 FALLBACK
        Debug.log({ warning: "Unknown message type", data: data });
        ws.send(JSON.stringify({
            type: "error",
            message: "Unknown message type",
            receivedData: data 
        }));
    });

    ws.on("close", () => {
        if (ws.roomKey && rooms.has(ws.roomKey)) {
            const room = rooms.get(ws.roomKey);
            room.delete(ws);
            if (room.size === 0) rooms.delete(ws.roomKey);
        }
        Debug.log("Client disconnected");
    });
});

server.listen(PORT, hostname, () => {
    Debug.log(`Server running at http://${hostname}:${PORT}/`);
});


