import { Notification } from "@prisma/client"
import { TokenData } from "../types/auth"
import { notificationRepository } from "../repositories/notificationRepository"
import { FamilyUserRepository } from "../repositories/familyUserRepository";
import { webSocketService } from "../ws/webSocketService"
import { NotificationType } from "@prisma/client";
import { unseenNotificationsPerFamily } from "../types/unseenNotificationsPerFamily";

enum NotificationTypesTitle {
    TASK_CREATED = "Nueva tarea creada",
    TASK_ASSIGNED = "Tarea asignada",
    TASK_EXPIRE_SOON = "Tarea próxima a vencer",
    TASK_EXPIRED = "Tarea vencida",
    TASK_UNASSIGNED = "Tarea desasignada",
    TASK_REJECTED = "Tarea rechazada. Completar de nuevo.",
    TASK_TO_REVIEW = "Nueva tarea para revisar",
    TASK_COMPLETED = "Tarea revisada por el admin, puntos agregados"
}


interface createNotificationStrategy{
    send(idFamily: string, idUser: string, type: NotificationType, title: string, idTask: string): Promise<void>;
}

class createNewTaskStrategy implements createNotificationStrategy{
    async send(idFamily: string, idUser: string, type: NotificationType, title: string, idTask: string): Promise<void> {

        const familyMembers = await FamilyUserRepository.getFamilyMembers(idFamily)

        familyMembers.forEach(member => {
            if (member.idUser === idUser) return; // No se notifica al creador de la tarea
            notificationRepository.createNotification(idFamily, member.idUser, type, title, idTask)
        })

        webSocketService.emitFamilyMessage(idFamily, {type: "Notification", idFamily: `${idFamily}`, title: title})
    }
}

class createAssignedTaskStrategy implements createNotificationStrategy{
    async send(idFamily: string, idUser: string, type: NotificationType, title: string, idTask: string): Promise<void> {

        notificationRepository.createNotification(idFamily, idUser, type, title, idTask)

        webSocketService.emitPrivateMessage(idUser, {type: "Notification", idFamily: `${idFamily}`, title: title})
    }
}

class createExpireSoonTaskStrategy implements createNotificationStrategy{
    async send(idFamily: string, idUser: string, type: NotificationType, title: string, idTask: string): Promise<void> {
        notificationRepository.createNotification(idFamily, idUser, type, title, idTask)
        webSocketService.emitPrivateMessage(idUser, 
            {
                type: "Notification", 
                idFamily: `${idFamily}`, title: title}
        )
    }
}

class createExpiredTaskStrategy implements createNotificationStrategy{
    async send(idFamily: string, idUser: string, type: NotificationType, title: string, idTask: string): Promise<void> {
        const admin = await FamilyUserRepository.getFamilyAdmin(idFamily)
        if (!admin) {
            throw new Error("La familia no tiene un administrador");
        }
        notificationRepository.createNotification(idFamily, idUser, type, title, idTask)
        webSocketService.emitPrivateMessage(idUser, {type: "Notification", idFamily: `${idFamily}`, title: title})
        notificationRepository.createNotification(idFamily, admin.idUser, type, `Tarea ha expirado`, idTask)
        webSocketService.emitPrivateMessage(admin.idUser, {type: "Notification", idFamily: `${idFamily}`, title: `Tarea ha expirado`})
    }
}

class createUnassignedTaskStrategy implements createNotificationStrategy{
    async send(idFamily: string, idUser: string, type: NotificationType, title: string, idTask: string): Promise<void> {
        notificationRepository.createNotification(idFamily, idUser, type, title, idTask)
        webSocketService.emitPrivateMessage(idUser, {type: "Notification", idFamily: `${idFamily}`, title: title})
    }
}

class createRejectedTaskStrategy implements createNotificationStrategy{
    async send(idFamily: string, idUser: string, type: NotificationType, title: string, idTask: string): Promise<void> {
        notificationRepository.createNotification(idFamily, idUser, type, title, idTask)
        webSocketService.emitPrivateMessage(idUser, {type: "Notification", idFamily: `${idFamily}`, title: title})
    }
}

class createTaskToReviewStrategy implements createNotificationStrategy{
    async send(idFamily: string, idUser: string, type: NotificationType, title: string, idTask: string): Promise<void> {
        const admin = await FamilyUserRepository.getFamilyAdmin(idFamily)
        if (!admin) {
            throw new Error("La familia no tiene un administrador");
        }
        notificationRepository.createNotification(idFamily, admin.idUser, type, title, idTask)
        webSocketService.emitPrivateMessage(admin.idUser, {type: "Notification", idFamily: `${idFamily}`, title: title})
    }
}

class createTaskCompletedStrategy implements createNotificationStrategy{
    async send(idFamily: string, idUser: string, type: NotificationType, title: string, idTask: string): Promise<void> {
        notificationRepository.createNotification(idFamily, idUser, type, title, idTask)
        webSocketService.emitPrivateMessage(idUser, {type: "Notification", idFamily: `${idFamily}`, title: title})
    }
}

export class notificationService{

    private pickStrategy(type: NotificationType): createNotificationStrategy {
        switch(type){
            case NotificationType.TASK_CREATED:
                return new createNewTaskStrategy();
            case NotificationType.TASK_ASSIGNED:
                return new createAssignedTaskStrategy();
            case NotificationType.TASK_EXPIRE_SOON:
                return new createExpireSoonTaskStrategy();
            case NotificationType.TASK_EXPIRED:
                return new createExpiredTaskStrategy();
            case NotificationType.TASK_UNASSIGNED:
                return new createUnassignedTaskStrategy();
            case NotificationType.TASK_REJECTED:
                return new createRejectedTaskStrategy();
            case NotificationType.TASK_TO_REVIEW:
                return new createTaskToReviewStrategy();
            case NotificationType.TASK_COMPLETED:
                return new createTaskCompletedStrategy();
            default:
                throw new Error("Tipo de notificación no soportado");
        }
    }

    async  createNotification(idFamily: string, idUser: string, type: NotificationType, idTask: string): Promise<void> {

        const strategy : createNotificationStrategy = this.pickStrategy(type);

        await strategy.send(idFamily, idUser, type, NotificationTypesTitle[type], idTask)
    }

    async getNotifications(token: TokenData, idFamily: string): Promise<Notification[]>{

        if(!token){
            throw new Error("El token es obligatorio");
        }

        const notifications = await notificationRepository.getNotificationsByFamilyID(token.userId, idFamily);

        await notificationRepository.markNotificationsAsSeenByFamilyID(token.userId, idFamily)

        return notifications;
    }

    async getUnseenNotificationsCountPerFamily(token: TokenData): Promise<unseenNotificationsPerFamily>{
        if(!token){
            throw new Error("El token es obligatorio");
        }

        const families = await FamilyUserRepository.getFamiliesByUser(token.userId)
        
        const results = await Promise.all(
            families.map(async (family) => {
            let unseenNotifications = await notificationRepository.getUnseenNotificationsCountByFamilyID(token.userId, family.idFamily)
            return {idFamily: family.idFamily, unseenNotifications}
            })
        )
        
        return results;
    }
}   