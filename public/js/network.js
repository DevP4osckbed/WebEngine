export class NetworkManager {
    constructor(outputElement) {
        this.output = outputElement;
        const protocol = location.protocol === "https:" ? "wss://" : "ws://";
        this.ws = new WebSocket(protocol + location.host);
        this.init();
    }

    init() {
        this.ws.onopen = () => {
            this.output.textContent = "Connected";
            
            // 🔹 START HEARTBEAT
            this.heartbeat = setInterval(() => {
                this.send({ type: "ping" });
            }, 30000); // Send every 30 seconds
            
            this.send({ type: "join", gameId: "myGame", roomId: "room1" });
        }
        this.ws.onclose = () => {
            clearInterval(this.heartbeat); // Stop pinging when closed
            this.output.textContent = "Disconnected";
        };
        this.ws.onerror = () => this.output.textContent = "Error";
        this.ws.onmessage = (e) => this.handleMessage(e.data);
    }

    // Inside NetworkManager class
    handleMessage(data) {
        try {
            const msg = JSON.parse(data);

            if (msg.type === "pong") {
                const endTime = Date.now();
                const latency = endTime - msg.startTime; // Calculate the round-trip
                this.output.innerHTML = `Ping: ${latency}ms | Server Time: ${msg.serverTime}`;
                return;
            }

            if (msg.type === "error") {
                this.output.innerHTML = `Error: ${msg.message}`;
                return;
            }

            this.output.textContent = `${msg.type} : ${msg.message || msg.room || "Received"}`;
        } catch (e) {
            this.output.textContent = "Bad response";
        }
    }

    // Ensure send is used correctly
    sendPing() {
        this.send({
            type: "ping",
            startTime: Date.now() // Record exactly when we sent it
        });
    }


    send(payload) {
        if (this.ws.readyState === WebSocket.OPEN) {
            // Stringify here ONLY
            this.ws.send(JSON.stringify(payload));
        } else {
            this.output.textContent = "Socket not connected";
        }
    }
}
