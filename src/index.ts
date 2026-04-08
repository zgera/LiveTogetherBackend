import "dotenv/config"
import cookieParser from 'cookie-parser';
import http from "http";

import { userRouter } from "./routes/userRouter";
import { familyRouter } from "./routes/familyRouter";
import { invitationRouter } from "./routes/invitationRouter";
import { taskRouter } from "./routes/taskRouter";
import { notificationRouter } from "./routes/notificationRouter";
import { noteRouter } from "./routes/noteRouter";
import { webSocketService } from "./ws/webSocketService";
import { TaskSchedulerService } from "./services/taskSchedulerService";


import express from 'express';
import cors from 'cors';

const app = express();
const port = 8080;
const web_port = 3000

app.use(cors({
    origin: `http://localhost:${web_port}`, // permite las request desde estas direcciones en especifico
    credentials: true // por si se usan cookies
}));


const taskScheduler = new TaskSchedulerService()

app.use(express.json())
app.use(cookieParser());

app.use('/user', userRouter)
app.use('/family', familyRouter)
app.use('/invitation', invitationRouter)
app.use('/task', taskRouter)
app.use("/notification", notificationRouter)
app.use("/note", noteRouter)

const server = http.createServer(app)
webSocketService.init(server)

server.listen(port, () => {
  console.log(`App listening on http://localhost:${port}`)
})