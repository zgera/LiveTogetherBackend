import { Server } from "socket.io"
import { authenticationService } from "../services/authenticationService"
import { FamilyService } from "../services/familyService"
import http from "http"

let familyService: FamilyService

export class webSocketService{
    private static io : Server

    static init(httpServer: http.Server){

        if (this.io) {
            return;
        }

        this.io = new Server(httpServer, {
            cors: {
                origin: "*",
            }
        })

        console.log("WebSocket iniciado")

        this.io.use((socket, next) => {
            console.log("Verificando Token...")
            const token = socket.handshake.auth.token
            if (!token) {
                console.log("No hay token")
                return next(new Error("Usuario no autenticado"))
            }
            try {
                const payload = authenticationService.validateToken(token);
                (socket as any).user = payload
                console.log("TOKEN DE: " + payload.username);
                next();
            } catch (err) {
                console.log("Token invalido")
                next(new Error("Token invalido"))
            }
        })

        this.io.on("connection", async (socket) => {
            const user = (socket as any).user
            console.log(`Usuario conectado: ${user.userId}`)

            socket.join(`user:${user.userId}`)

            familyService = new FamilyService()

            const familiesIDs = await familyService.getFamiliesByUser(user)

            familiesIDs.forEach( family => {
                socket.join(`family:${family.idFamily}`)
            });

            socket.on("disconnect", () => {
                console.log(`Usuario desconectado: ${user.userId}`)
            })
        })
    }

    static getIO(){
        if (this.io === null){
            throw new Error("No se inicio el webSocket Server")
        }
        return this.io
    }

    static addUserToFamiliesRoom(idUser: string, idFamily: string){
        this.getIO();
        this.io.in(`user:${idUser}`).socketsJoin(`family:${idFamily}`);
    }

    static emitPrivateMessage(idUser: string, payload: Record<string, any>){
        this.getIO()
        this.io.to(`user:${idUser}`).emit("notification", payload);
    }

    static emitFamilyMessage(idFamily: string, payload: Record<string, any>){
        this.getIO()
        
        const sockets = this.io.sockets.adapter.rooms.get(`family:${idFamily}`)

        if (!sockets) return;

        sockets.forEach(socketId => {
            console.log(socketId)
        })

        this.io.to(`family:${idFamily}`).emit("notification", payload);
    }

}