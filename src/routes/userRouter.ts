import {Router, Request, Response} from "express"

import { userService } from "../services/userService"

import { authenticationService } from "../services/authenticationService";

import { TokenData } from "../types/auth";

import { autenticarToken } from "../middleware/authMiddleware";

interface CreateUserBody {
  firstName: string,
  lastName: string,
  username: string,
  password: string,
}

const UserService = new userService();

export const userRouter = Router()

userRouter.post("/signin", async (req: Request, res: Response) => {
    const { username, password } = req.body;

    try {
        const user = await UserService.verifyUser(username, password);

        const tokenData: TokenData = {
            userId: user.idUser,
            username: user.username
        };

        const token = authenticationService.createToken(tokenData);

         res.cookie('token', token, {
                httpOnly: true,
                secure: process.env.NODE_ENV === "production",
                sameSite: 'strict',
                maxAge: 60 * 60 * 1000, // 1 hora
            })
            .status(200)
            .send({ user, token }); 

    } catch (error) {
        const message = error instanceof Error ? error.message : 'Error inesperado al iniciar sesión';
        res.status(401).send({ error: message });
    }
});

userRouter.get("/signout", async (req: Request, res: Response) => {
    try {
        const token = req.cookies?.token;

        if (!token) throw new Error('No hay ninguna sesión iniciada')

        res.clearCookie('token', { 
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: 'strict',
        })
        res.status(200).send({ message: 'Sesion cerrada exitosamente' });

    } catch (error) {
        const message = error instanceof Error ? error.message : 'Error inesperado al iniciar sesión';
        res.status(401).send({ error: message });
    }
})

userRouter.post("/signup", async (req: Request, res: Response) => {
    const { firstName, lastName, username, password } = req.body

    const userBody: CreateUserBody = {
        firstName,
        lastName,
        username,
        password
    }

    try {
        const user = await UserService.createUser(userBody)
        res.status(201).send({ user })
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Error inesperado al crear el usuario';
        res.status(400).send({ error: message });
    }
})

userRouter.get("/me", autenticarToken, async (req, res) => {
    const token = req.user!;
    
    try {
        const user = await UserService.getUser((token.userId));
        res.send({ user }); 
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Error inesperado al obtener el usuario';


        if (message === "Usuario no encontrado") {
            res.status(404).json({ error: message });
            return;
        }

        res.status(500).json({ error: message });
    }
});

userRouter.get("/meInFamily/:familyId", autenticarToken, async (req, res) => {
    const token = req.user!;
    const { familyId } = req.params;

    try {
        const familyUser = await UserService.getUserPointsInFamily(token, familyId);
        res.send({ familyUser });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Error inesperado al obtener los puntos del usuario en la familia';

        if (message === "El usuario no pertenece a la familia") {
            res.status(404).json({ error: message });
            return;
        }

        res.status(500).json({ error: message });
    }
});
