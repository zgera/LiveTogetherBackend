import { Task } from "@prisma/client";
import { NotificationType } from "@prisma/client";
import { FamilyUserRepository } from "../repositories/familyUserRepository";
import { TaskRepository } from "../repositories/taskRepository";
import { DifficultyRepository } from "../repositories/difficultyRepository";
import { TokenData } from "../types/auth";
import { AuthorizationService } from "./authorizationService";
import { FamilyService } from "./familyService";
import { notificationService } from "./notificationService";
import { taskWithCreatorAndUserAssigned, taskWithCreator } from "../types/taskTypes";
import { webSocketService } from "../ws/webSocketService";


export class TaskService {

    // Servicios
    protected familyService = new FamilyService();
    protected authorizationService = new AuthorizationService();
    protected NotificationService = new notificationService();

    async createTask(name: string, description: string, familyId: string, difficulty: number, deadline: Date, token: TokenData): Promise<Task> {
        if (!name || !description || !familyId || !difficulty || !token) {
            throw new Error("Todos los campos son obligatorios");
        }

        if (difficulty !== 1 && difficulty !== 2 && difficulty !== 3) {
            throw new Error("Dificultad inválida")
        }

        await this.authorizationService.assertUserInFamily(token, familyId)

        //deadline.setHours(23, 59, 59, 999);

        const task = await TaskRepository.createTask(name, description, familyId, token.userId, difficulty, deadline);

        await this.NotificationService.createNotification(familyId, token.userId, NotificationType.TASK_CREATED, task.idTask)

        return task;
    }

    async getTask(idTask: string): Promise<Task> {
        if (!idTask){
            throw new Error("El id de la tarea es obligatorio");
        }
        const task = await TaskRepository.getTask(idTask);
        if (!task) {
            throw new Error("Tarea inexistente");
        }
        return task
    }

    async getTasksUnassigned(familyId: string, token: TokenData): Promise<taskWithCreator[]> {
        if (!familyId || !token) {
            throw new Error("Todos los campos son obligatorios");
        }

        await this.authorizationService.assertUserInFamily(token, familyId)

        const tasks = await TaskRepository.getTaskUnassigned(familyId);

        return tasks;
    }

    async getTasksAssignedUncompletedByUser(familyId: string, token: TokenData): Promise<taskWithCreator[]> {
        if (!familyId || !token) {
            throw new Error("Todos los campos son obligatorios");
        }

        await this.authorizationService.assertUserInFamily(token, familyId)

        const tasks = await TaskRepository.getTaskAssignedUncompletedByUser(familyId, token.userId);

        return tasks;
    }

    async getTasksUnderReviewByUser(familyId: string, token: TokenData): Promise<taskWithCreator[]> {
        if (!familyId || !token) {
            throw new Error("Todos los campos son obligatorios");
        }

        await this.authorizationService.assertUserInFamily(token, familyId)

        const tasks = await TaskRepository.getTaskUnderReviewByUser(familyId, token.userId);

        return tasks;
    }

    async getTasksAssignedUncompleted(familyId: string, token: TokenData): Promise<taskWithCreatorAndUserAssigned[]> {
        if (!familyId || !token) {
            throw new Error("Todos los campos son obligatorios");
        }

        await this.authorizationService.assertUserIsAdmin(token, familyId)

        const tasks = await TaskRepository.getTaskAssignedUncompleted(familyId);

        return tasks;
    }

    async getTasksUnderReview(familyId: string, token: TokenData): Promise<taskWithCreatorAndUserAssigned[]> {
        if (!familyId || !token) {
            throw new Error("Todos los campos son obligatorios");
        }
        
        await this.authorizationService.assertUserIsAdmin(token, familyId)

        const tasks = await TaskRepository.getTasksUnderReview(familyId);
        
        return tasks;
    }

    // Obtener el historial de tareas completadas o penalizadas por un usuario
    async getUserHistoryTasks(familyId: string, token: TokenData): Promise<Task[]> {
        if (!familyId || !token) {
            throw new Error("Todos los campos son obligatorios");
        }

        await this.authorizationService.assertUserInFamily(token, familyId)

        const tasks = await TaskRepository.getUserHistoryTasks(familyId, token.userId);

        return tasks;
    }

    async getProgressOfUserTasks(familyId: string, token: TokenData): Promise<{ completedTasks: number; totalTasks: number }> {
        if (!familyId || !token) {
            throw new Error("Todos los campos son obligatorios");
        }

        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);

        const endOfDay = new Date();
        endOfDay.setHours(23, 59, 59, 999);

        await this.authorizationService.assertUserInFamily(token, familyId)

        const completedTasks = await TaskRepository.getTaskCountCompletedTodayByUser(familyId, token.userId, startOfDay, endOfDay);
        const totalTasks = await TaskRepository.getTaskCountTodayByUser(familyId, token.userId, startOfDay, endOfDay);

        return { completedTasks, totalTasks };
    }

    async getProgressOfFamilyTasks(familyId: string, token: TokenData): Promise<{ completedTasks: number; totalTasks: number }> {
        if (!familyId || !token) {
            throw new Error("Todos los campos son obligatorios");
        }

        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);

        const endOfDay = new Date();
        endOfDay.setHours(23, 59, 59, 999);

        await this.authorizationService.assertUserInFamily(token, familyId)

        const completedTasks = await TaskRepository.getTaskCountCompletedTodayByFamily(familyId, startOfDay, endOfDay);
        const totalTasks = await TaskRepository.getTaskCountTodayByFamily(familyId, startOfDay, endOfDay);

        return { completedTasks, totalTasks };
    }
}

export class TaskCompletionService extends TaskService {

    async completeTaskAsUser(idTask: string, token: TokenData): Promise<Task> {
        if (!idTask || !token) {
            throw new Error("Todos los campos son obligatorios");
        }

        const taskAssigned = await this.getTask(idTask);

        await this.authorizationService.assertUserInFamily(token, taskAssigned.familyId)

        if (taskAssigned.assignedId !== token.userId) {
            throw new Error("El usuario no es el encargado de la tarea");
        }

        if (taskAssigned.completedByUser) {
            throw new Error("La tarea ya ha sido completada por el usuario");
        }

        if (taskAssigned.penalized === true) {
            throw new Error("La tarea ya ha perdido su validez por estar fuera de tiempo");
        }

        if (await this.authorizationService.isAdmin(token, taskAssigned.familyId)) {

            await TaskRepository.markTaskAsCompletedByUser(idTask);

            const taskCompleted = await TaskRepository.markTaskAsCompletedByAdmin(idTask);

            await this.consumeTaskPoints(taskCompleted);

            webSocketService.emitPrivateMessage(token.userId, {type: "Notification", idFamily: `${taskCompleted.familyId}`, title: `Tarea completada, puntos agregados`});

            return taskCompleted;
        }

        const taskCompleted = await TaskRepository.markTaskAsCompletedByUser(idTask);

        await this.NotificationService.createNotification(taskAssigned.familyId, token.userId, NotificationType.TASK_TO_REVIEW, taskCompleted.idTask);

        return taskCompleted;
    }

    private async getDifficultyPoints(difficultyId: number): Promise<number> {
        if (!difficultyId) {
            throw new Error("El id de dificultad es obligatorio");
        }

        const difficulty = await DifficultyRepository.getDifficultyById(difficultyId);

        if (!difficulty) {
            throw new Error("Dificultad no encontrada");
        }

        return difficulty.points;
    }

    private async consumeTaskPoints(task: Task): Promise<void> {
        const difficultyPoints = await this.getDifficultyPoints(task.idDifficulty);

        if (task.assignedId === null) {
            throw new Error("La tarea no está asignada a ningún usuario");
        }
        await this.familyService.addPointsToMemberInFamily(task.familyId, task.assignedId, difficultyPoints);

    }

    async completeTaskAsAdmin(idTask: string, token: TokenData): Promise<Task> {
        if (!idTask || !token) {
            throw new Error("Todos los campos son obligatorios");
        }

        const taskAssigned = await this.getTask(idTask);

        await this.authorizationService.assertUserIsAdmin(token, taskAssigned.familyId)

        if (taskAssigned.completedByAdmin) {
            throw new Error("La tarea ya ha sido completada por el administrador");
        }

        const taskCompleted = await TaskRepository.markTaskAsCompletedByAdmin(idTask);

        await this.consumeTaskPoints(taskCompleted);

        await this.NotificationService.createNotification(taskAssigned.familyId, taskAssigned.assignedId!, NotificationType.TASK_COMPLETED, taskCompleted.idTask);

        return taskCompleted;
    }

    async rejectTaskCompletion(idTask: string, token: TokenData): Promise<Task> {
        if (!idTask || !token) {
            throw new Error("Todos los campos son obligatorios");
        }
        const taskAssigned = await this.getTask(idTask);

        await this.authorizationService.assertUserIsAdmin(token, taskAssigned.familyId);

        if (!taskAssigned.completedByUser) {
            throw new Error("La tarea no ha sido completada por el usuario");
        }

        if (taskAssigned.completedByAdmin) {
            throw new Error("La tarea ya ha sido completada por el admin");
        }

        const taskReverted = await TaskRepository.markTaskAsUncompletedByUser(idTask);

        await this.NotificationService.createNotification(taskAssigned.familyId, taskAssigned.assignedId!, NotificationType.TASK_REJECTED, taskReverted.idTask);

        return taskReverted;
    }
}

export class TaskAssignmentService extends TaskService {

    async externAssign(idTask: string, idUser: string, token: TokenData): Promise<Task> {
        const task = await TaskRepository.assignTaskToUser(idTask, idUser)
        if (token.userId !== idUser){
            await this.NotificationService.createNotification(task.familyId, idUser, NotificationType.TASK_ASSIGNED, task.idTask)
        }
        return task
    }    

    async autoAssignTask(idTask: string, token: TokenData): Promise<Task> {
        if (!idTask || !token){
            throw new Error("Todos los campos son obligatorios")
        }

        const taskUnassigned = await this.getTask(idTask);

        if (taskUnassigned.assignedId !== null) {
            throw new Error("La tarea ya está asignada a otro usuario");
        }

        await this.authorizationService.assertUserInFamily(token, taskUnassigned.familyId)

        const taskAssigned = await TaskRepository.assignTaskToUser(idTask, token.userId);

        return taskAssigned;
    }

    async unassignTask(idTask: string, token: TokenData): Promise<Task> {
        if (!idTask || !token){
            throw new Error("Todos los campos son obligatorios")
        }

        const taskAssigned = await this.getTask(idTask)

        if (taskAssigned.assignedId === null) {
            throw new Error("La tarea no está asignada a ningún usuario");
        }

        if (taskAssigned.completedByUser ) {
            throw new Error("La tarea ya ha sido completada por el usuario");
        }

        await this.authorizationService.assertUserIsAdmin(token, taskAssigned.familyId)

        const taskUnassigned = await TaskRepository.unassignTaskFromUser(idTask)

        await this.NotificationService.createNotification(taskAssigned.familyId, taskAssigned.assignedId!, NotificationType.TASK_UNASSIGNED, taskUnassigned.idTask)

        return taskUnassigned
    }

    async assingTaskToUser(idTask: string, idUser: string, token: TokenData): Promise<Task> {
        if (!idTask || !idUser || !token) {
            throw new Error("Todos los campos son obligatorios");
        }

        const taskUnassigned = await this.getTask(idTask);

        if (taskUnassigned.assignedId !== null) {
            throw new Error("La tarea ya está asignada a otro usuario");
        }

        await this.authorizationService.assertUserIsAdmin(token, taskUnassigned.familyId)

        const taskAssigned = await this.externAssign(idTask, idUser, token);

        return taskAssigned;
    }

    extraTaskPerUser(user: {assigned: boolean, idFamilyUser: string, idUser: string, idFamily: string, idRole: number, points: number}, membersRound: {assigned: boolean, idFamilyUser: string, idUser: string, idFamily: string, idRole: number, points: number}[]): number{

        const userMVP = membersRound[membersRound.length - 1]

        if (user.idUser === userMVP.idUser){
            return 0
        }

        if (user.assigned === true){
            return 0
        }

        const extraTasks: number = 1
        const doubleUsersPoints: number = user.points * 2

        if (user.points === 0 && userMVP.points > 0) {
            user.assigned = true;
            return extraTasks;
        }

        if (doubleUsersPoints < userMVP.points){
            user.assigned = true
            return extraTasks
        }
        return 0
    }

    async automaticallyAsignTasks(token: TokenData, idFamily: string){

        await this.familyService.getFamily(idFamily) //Verifica que exista la familia
        await this.authorizationService.assertUserIsAdmin(token, idFamily)

        const members = await FamilyUserRepository.getFamilyMembers(idFamily)
        const membersRound = members.map(member => ({
            ...member,
            assigned: false
            }));
        const tasks = await TaskRepository.getTaskUnassigned(idFamily)

        if (tasks.length === 0){
            throw new Error("No hay tareas sin asignar")
        }

        let index: number = 0

        while(tasks.length > 0){
            const user = membersRound[index]

            const taskCounter = 1 + this.extraTaskPerUser(user, membersRound)

            for(let i = 0; i < taskCounter; i++){
                const task = tasks.shift()
                
                if (!task){
                    break
                }

                await this.externAssign(task.idTask, user.idUser, token)
            }

            index = (index + 1) % members.length
        }
    }
}