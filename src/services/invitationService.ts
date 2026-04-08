import { InvitationRepository } from "../repositories/invitationRepository";
import { TokenData } from "../types/auth";
import { AuthorizationService } from "./authorizationService";
import { userService } from "./userService";
import { FamilyService } from "./familyService";
import { Invitation } from "@prisma/client";
import { webSocketService } from "../ws/webSocketService";
import { invitationWithFamily } from "../types/invitationWithFamily";
import { invitationWithUser } from "../types/invitationWithUser";

export class InvitationService {

    // Servicios
    private authorizationService = new AuthorizationService();
    private userService = new userService();
    private familyService = new FamilyService();

    async existsInvitation(idUser: string, idFamily: string): Promise<boolean> {
        const invitation = await InvitationRepository.getInvitationByUserFamily(idUser, idFamily);
        if (!invitation) {
            return false
        }
        return true
    }

    async createInvitation(idFamily: string, usernameInvited: string, token: TokenData): Promise<Invitation> {
        if (!idFamily || !usernameInvited || !token) {
            throw new Error("Todos los campos son obligatorios");
        }

        await this.authorizationService.assertUserIsAdmin(token, idFamily);

        if (usernameInvited === token.username) throw new Error("No te puedes invitar a tu propia familia")

        const user = await this.userService.getUserByUsername(usernameInvited); // Verifica si el usuario existe

        const family = await this.familyService.getFamily(idFamily); // Verifica si la familia existe

        if (await this.existsInvitation(user.idUser, idFamily)) {
            const invitation = await InvitationRepository.getInvitationByUserFamily(user.idUser, idFamily)
            if (invitation && invitation.accepted === true) {
                throw new Error("El usuario ya es miembro de la familia");
            }
            else if (invitation && invitation.accepted === null) {
                throw new Error("Ya existe una invitación pendiente para este usuario en la familia");
            }
        }

        const invitation = await InvitationRepository.createInvitation(idFamily, user.idUser, token.userId);

        webSocketService.emitPrivateMessage(user.idUser, 
            {
                type: "Invitation",
                familyName: family.name,
            }
        )

        return invitation;
    }


    async getInvitation(idInvitation: string): Promise<Invitation> {
        if (!idInvitation) {
            throw new Error("Todos los campos son obligatorios");
        }

        const invitation = await InvitationRepository.getInvitation(idInvitation);

        if (!invitation) {
            throw new Error("Invitación inexistente");
        }

        return invitation;
    }

    async getInvitationsSentToUser(token: TokenData): Promise<invitationWithFamily[]> {
        if (!token) {
            throw new Error("El token es obligatorio");
        }

        const invitations = await InvitationRepository.getInvitationsSentToUserByUserId(token.userId);

        await InvitationRepository.markInvitationsAsSeen(token.userId);

        return invitations;
    }

    async getUnseenInvitationsCount(token: TokenData): Promise<number> {
        if (!token) {
            throw new Error("El token es obligatorio");
        }

        const count = await InvitationRepository.getUnseenInvitationsCount(token.userId);
        
        return count;
    }

    async getInvitationsSentFromFamily(idFamily: string, token: TokenData): Promise<invitationWithUser[]> {
        if (!idFamily || !token) {
            throw new Error("Todos los campos son obligatorios");
        }

        await this.authorizationService.assertUserIsAdmin(token, idFamily)

        const invitations = await InvitationRepository.getInvitationsSentFromFamily(idFamily);

        return invitations;
    }


    async acceptInvitation(idInvitation: string, token: TokenData) {
        if (!idInvitation || !token) {
            throw new Error("Todos los campos son obligatorios");
        }

        const invitation = await this.getInvitation(idInvitation);

        if (invitation.idUserInvited !== token.userId) {
            throw new Error("El usuario no es el destinatario de la invitación");
        }

        if (invitation.accepted) {
            throw new Error("La invitación ya ha sido aceptada o rechazada");
        }

        const updatedInvitation = await InvitationRepository.acceptInvitation(idInvitation);

        await this.familyService.joinFamily(token.userId, invitation.idFamily, 1); // El rol 1 es de miembro

        webSocketService.addUserToFamiliesRoom(token.userId, invitation.idFamily)

        return updatedInvitation;
    }

    async rejectInvitation(idInvitation: string, token: TokenData): Promise<Invitation> {
        if (!idInvitation || !token) {
            throw new Error("Todos los campos son obligatorios");
        }

        const invitation = await this.getInvitation(idInvitation);

        if (invitation.idUserInvited !== token.userId) {
            throw new Error("El usuario no es el destinatario de la invitación");
        }

        if (invitation.accepted) {
            throw new Error("La invitación ya ha sido aceptada o rechazada");
        }

        const rejectedInvitation = await InvitationRepository.rejectInvitation(idInvitation);
        
        return rejectedInvitation;
    }
}