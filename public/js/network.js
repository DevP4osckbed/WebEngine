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
            this.send(JSON.stringify({
                type: "join",
                gameId: "myGame",
                roomId: "room1"
            }));
        }
        this.ws.onclose = () => this.output.textContent = "Disconnected";
        this.ws.onerror = () => this.output.textContent = "Error";
        this.ws.onmessage = (e) => this.handleMessage(e.data);
    }

    handleMessage(data) {
        try {
            const msg = JSON.parse(data);
            this.output.innerHTML = msg.message || "Received";
        } catch {
            this.output.textContent = "Bad server response";
        }
    }

    send(payload) {
        if (this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(payload));
        } else {
            this.output.textContent = "Socket not connected";
        }
    }
}
