import http from "http";
import next from "next";
import { Server } from "socket.io";
import { parse } from "url";
import { setupSocket } from "./server/socket.js";
import { scheduleExistingRounds } from "./server/roundScheduler.js";

const dev = process.env.NODE_ENV !== "production";
const hostname = process.env.HOST ?? "0.0.0.0";
const port = process.env.PORT ? Number(process.env.PORT) : 5000;

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const server = http.createServer((req, res) => {
    const parsedUrl = parse(req.url, true);
    handle(req, res, parsedUrl);
  });

  const io = new Server(server, {
    path: "/socket.io",
    cors: {
      origin: "*",
      credentials: true
    }
  });

  setupSocket(io);
  scheduleExistingRounds().catch((error) => console.error("Round scheduler boot failed", error));

  server.listen(port, hostname, () => {
    console.log(`> Ready on http://${hostname}:${port}`);
  });
});
